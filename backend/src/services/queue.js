const Queue = require('bull');
const redis = require('redis');
const agentService = require('./agent');
const scheduleService = require('./scheduleService');

// Create Redis client
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

// Create job queues
const reminderQueue = new Queue('reminder queue', process.env.REDIS_URL);
const messageQueue = new Queue('message queue', process.env.REDIS_URL);

// Process reminder jobs
reminderQueue.process('send-reminder', async (job) => {
  const { user, task, type } = job.data;
  
  try {
    if (type === 'morning-summary') {
      await agentService.sendMorningSummary(user);
    } else if (type === 'task-reminder') {
      await agentService.sendReminder(user, task, task?.reminderType || '30_min');
    } else if (type === 'end-of-day') {
      await agentService.sendEODSummary(user);
    }
    
    console.log(`✅ Processed ${type} for user ${user.id}`);
  } catch (error) {
    console.error(`❌ Failed to process ${type}:`, error);
    throw error;
  }
});

class QueueService {
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
    return reminderQueue.add('send-reminder', { user, task: task ? { ...task, ...extra } : null, type }, { 
      delay,
      attempts: 3,
      backoff: 'exponential'
    });
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

  static async scheduleTaskReminder(user, task, reminderTime) {
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
    return this.scheduleReminder(user, task, 'task-reminder', finalDelay, {
      reminderType: task.reminderType || '30_min',
      scheduled_for: adjustedTime.toISOString()
    });
  }

  static async getQueueStats() {
    const waiting = await reminderQueue.getWaiting();
    const active = await reminderQueue.getActive();
    const completed = await reminderQueue.getCompleted();
    const failed = await reminderQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }
}

module.exports = QueueService;