const { v4: uuid } = require('uuid');
const agentService = require('./agent');
const scheduleService = require('./scheduleService');
const metricsStore = require('./metricsStore');
const { DateTime } = require('luxon');
let Queue;
let Worker;
let Redis;
const normalizeRedisUrl = (value) => {
  if (!value) return null;
  return value.startsWith('redis://') || value.startsWith('rediss://')
    ? value
    : `redis://${value}`;
};
const redisUrl = normalizeRedisUrl(process.env.REDIS_URL);
const useRedis = Boolean(redisUrl);

const reminderTimers = new Map();
let completedJobs = 0;
let failedJobs = 0;
let reminderQueue = null;
let reminderWorker = null;

async function runReminderJob(job) {
  const { user, task, type } = job;
  if (!type) {
    throw new Error('Reminder job missing type');
  }

  if (!user) {
    throw new Error('Reminder job missing user payload');
  }

  if (type === 'morning-summary') {
    await agentService.sendMorningSummary(user);
    await scheduleScheduleBlockReminders(user);
  } else if (type === 'task-reminder') {
    await agentService.sendReminder(user, task, task?.reminderType || '30_min');
  } else if (type === 'end-of-day') {
    await agentService.sendEODSummary(user);
  } else {
    throw new Error(`Unsupported reminder type: ${type}`);
  }

  console.log(`✅ Processed ${type} for user ${user.id}`);
}

async function scheduleScheduleBlockReminders(user) {
  if (!user?.id) return [];
  const timezone = user.timezone || 'UTC';
  const blocks = await scheduleService.buildScheduleBlockInstances(user.id, new Date(), timezone);
  if (!blocks.length) return [];
  const nowUtc = DateTime.now().toUTC();
  const scheduled = [];

  for (const block of blocks) {
    if (!block.start_time_utc) continue;
    const start = DateTime.fromISO(block.start_time_utc, { zone: 'utc' });
    if (!start.isValid || start <= nowUtc) continue;
    let durationMinutes = 30;
    if (block.end_time_utc) {
      const end = DateTime.fromISO(block.end_time_utc, { zone: 'utc' });
      const diff = (end.toMillis() - start.toMillis()) / 60000;
      if (Number.isFinite(diff) && diff > 0) {
        durationMinutes = Math.min(Math.round(diff), 180);
      }
    }
    const pseudoTask = {
      id: `schedule-${block.id}-${block.start_time_utc}`,
      title: block.title,
      category: block.category || 'Schedule',
      start_time: block.start_time_utc,
      end_time: block.end_time_utc,
      duration_minutes: durationMinutes,
      status: 'todo',
      metadata: {
        schedule_block_id: block.id,
        location: block.location || null,
        source: 'timetable'
      }
    };
    const reminders = await QueueService.scheduleTaskReminders(user, pseudoTask);
    scheduled.push(...reminders);
  }

  return scheduled;
}

function ensureRedisQueue() {
  if (!useRedis || reminderQueue) return;
  ({ Queue, Worker } = require('bullmq'));
  Redis = require('ioredis');
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

  reminderQueue = new Queue('tenax-reminders', { connection });
  reminderWorker = new Worker(
    'tenax-reminders',
    async (job) => {
      await runReminderJob(job.data);
      completedJobs += 1;
    },
    { connection }
  );

  reminderWorker.on('failed', (job, err) => {
    failedJobs += 1;
    console.error('[Queue] Redis reminder job failed:', err.message || err);
  });
}

function scheduleInMemoryJob(job, delayMs) {
  const scheduledDelay = Math.max(0, delayMs);
  const runAt = new Date(Date.now() + scheduledDelay);
  const id = uuid();

  const timer = setTimeout(async () => {
    reminderTimers.delete(id);
    try {
      await runReminderJob(job);
      completedJobs += 1;
    } catch (error) {
      failedJobs += 1;
      console.error(`[Queue] ${job.type} failed:`, error.message || error);
    }
  }, scheduledDelay);

  reminderTimers.set(id, timer);
  return { id, runAt: runAt.toISOString(), type: job.type };
}

class QueueService {
  static resolveReminderType(task) {
    const requested = task?.reminderType || task?.reminder_type || '30_min';
    if (requested === 'on_time') return 'on_time';
    if (requested === 'post_start') return 'post_start';
    return '30_min';
  }

  static resolveTaskDuration(task) {
    if (!task) return 30;
    const parsed = Number(task.duration_minutes);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, 180);
    }
    if (task.reminderType === 'on_time') return 45;
    return 30;
  }

  static async scheduleReminder(user, task, type, delay, extra = {}) {
    const payload = { user, task: task ? { ...task, ...extra } : null, type };
    if (useRedis) {
      ensureRedisQueue();
      const job = await reminderQueue.add(
        type,
        payload,
        { delay: Math.max(delay || 0, 0), removeOnComplete: true, removeOnFail: false }
      );
      return { id: job.id, runAt: new Date(Date.now() + Math.max(delay || 0, 0)).toISOString(), type };
    }
    return scheduleInMemoryJob(payload, Math.max(delay || 0, 0));
  }

  static async scheduleMorningSummary(user, tasks, startTime) {
    const now = new Date();
    const [hours, minutes] = startTime.split(':');
    const scheduledTime = new Date();
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const delay = scheduledTime.getTime() - now.getTime();
    return this.scheduleReminder(user, null, 'morning-summary', delay);
  }

  static async scheduleTaskReminder(user, task, reminderTime, reminderTypeOverride = null) {
    const now = new Date();
    const targetTime = new Date(reminderTime);
    if (Number.isNaN(targetTime.getTime())) {
      return null;
    }

    let adjustedTime = targetTime;
    const durationMinutes = this.resolveTaskDuration(task);
    let conflictBlock = null;

    try {
      const adjustment = await scheduleService.findAdjustedReminderTime(user.id, targetTime, durationMinutes);
      adjustedTime = adjustment?.adjustedTime || targetTime;
      conflictBlock = adjustment?.conflictBlock || null;

      if (conflictBlock && adjustedTime.getTime() !== targetTime.getTime()) {
        await scheduleService.recordReminderShift({
          userId: user.id,
          taskId: task?.id,
          originalTime: targetTime.toISOString(),
          shiftedTime: adjustedTime.toISOString(),
          reason: 'busy_block_conflict'
        });

        await scheduleService.recordScheduleConflict({
          userId: user.id,
          taskId: task?.id,
          conflictType: 'reminder_vs_schedule',
          conflictWindow: conflictBlock,
          resolution: 'reminder_shifted',
          metadata: {
            reminder_type: task?.reminderType || '30_min',
            original_time: targetTime.toISOString(),
            shifted_time: adjustedTime.toISOString()
          }
        });

        await scheduleService.logTrace('reminder_conflict_avoided', {
          user_id: user.id,
          task_id: task?.id,
          original_time: targetTime.toISOString(),
          shifted_time: adjustedTime.toISOString(),
          duration_minutes: durationMinutes,
          conflict_source: conflictBlock?.source || 'schedule_block'
        });
      }
    } catch (error) {
      console.warn('[Queue] Failed to adjust reminder time:', error.message);
    }

    let finalDelay = adjustedTime.getTime() - now.getTime();
    if (finalDelay <= 0) {
      finalDelay = 1000;
    }
    const reminderType = reminderTypeOverride || this.resolveReminderType(task);
    const scheduledFor = adjustedTime.toISOString();

    if (!metricsStore.registerReminderSchedule({
      userId: user.id,
      taskId: task?.id,
      reminderType,
      scheduledFor
    })) {
      return null;
    }

    return this.scheduleReminder(user, task, 'task-reminder', finalDelay, {
      reminderType,
      scheduled_for: scheduledFor
    });
  }

  static async scheduleTaskReminders(user, task) {
    if (!task?.start_time) return [];
    const start = new Date(task.start_time);
    if (Number.isNaN(start.getTime())) return [];

    const reminders = [];
    const thirtyBefore = new Date(start);
    thirtyBefore.setMinutes(thirtyBefore.getMinutes() - 30);
    if (thirtyBefore.getTime() > Date.now()) {
      const scheduled = await this.scheduleTaskReminder(user, task, thirtyBefore.toISOString(), '30_min');
      if (scheduled) reminders.push(scheduled);
    }

    const onTime = await this.scheduleTaskReminder(user, task, start.toISOString(), 'on_time');
    if (onTime) reminders.push(onTime);

    const postStart = new Date(start);
    postStart.setMinutes(postStart.getMinutes() + 10);
    if (postStart.getTime() > Date.now()) {
      const scheduled = await this.scheduleTaskReminder(user, task, postStart.toISOString(), 'post_start');
      if (scheduled) reminders.push(scheduled);
    }

    return reminders;
  }

  static async getQueueStats() {
    if (useRedis && reminderQueue) {
      const counts = await reminderQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      return {
        waiting: counts.waiting + counts.delayed,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed
      };
    }
    return {
      waiting: reminderTimers.size,
      active: 0,
      completed: completedJobs,
      failed: failedJobs
    };
  }

  static async scheduleScheduleBlockReminders(user) {
    return scheduleScheduleBlockReminders(user);
  }
}

module.exports = QueueService;
