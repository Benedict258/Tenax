const scheduleService = require('./scheduleService');
const features = require('../config/features');
const ocrService = require('./ocrService');
const whatsappService = require('./whatsapp');
const User = require('../models/User');
const conversationContext = require('./conversationContext');
const { buildConfirmationSummary } = require('./timetableParser');
const INLINE_MODE = true;
const normalizeRedisUrl = (value) => {
  if (!value) return null;
  return value.startsWith('redis://') || value.startsWith('rediss://')
    ? value
    : `redis://${value}`;
};
const redisUrl = normalizeRedisUrl(process.env.REDIS_URL);
const useRedis = Boolean(redisUrl);
let Queue;
let Worker;
let Redis;
let uploadQueue = null;
let uploadWorker = null;

function logQueueMessage(message, payload = {}) {
  console.log(`[ScheduleQueue] ${message}`, payload);
}

function initProcessors() {
  if (!features.scheduleIntelEnabled) {
    logQueueMessage('Schedule intel disabled; queues idle');
    return;
  }

  if (useRedis) {
    initRedisQueue();
    return;
  }

  if (INLINE_MODE) {
    logQueueMessage('Running schedule jobs inline (Redis disabled)');
  }
}

async function processUploadInline(payload) {
  logQueueMessage('Processing upload inline (queue disabled)', payload);
  await ocrService.processUpload(payload.uploadId);
  try {
    const upload = await scheduleService.getUploadById(payload.uploadId);
    const rows = await scheduleService.listExtractionRowsByUpload(payload.uploadId);
    if (upload?.user_id && rows.length) {
      const user = await User.findById(upload.user_id);
      if (user?.phone_number) {
        const entries = rows.map((row) => ({
          title: row.title,
          dayOfWeek: row.day_of_week,
          start: toTimeParts(row.start_time),
          end: toTimeParts(row.end_time)
        }));

        conversationContext.setPendingAction(user.id, {
          type: 'timetable_confirmation',
          intent: 'import_timetable_confirm',
          entries
        });

        const summary = buildConfirmationSummary(entries);
        await whatsappService.sendMessage(
          user.phone_number,
          `I extracted ${entries.length} timetable blocks:\n${summary}\n\nAdd them to your schedule? Reply "yes" to add all or "add only <course>".`
        );
      }
    }
  } catch (error) {
    console.warn('[ScheduleQueue] Failed to push timetable confirmation:', error.message);
  }
  return { status: 'ok', inline: true };
}

function toTimeParts(value) {
  if (!value) return { hour: 0, minute: 0 };
  const [h, m] = value.split(':');
  return {
    hour: Number(h) || 0,
    minute: Number(m) || 0
  };
}

async function enqueueUploadJob(payload) {
  if (useRedis) {
    initRedisQueue();
    const job = await uploadQueue.add('timetable-upload', payload, { removeOnComplete: true, removeOnFail: false });
    return { status: 'queued', jobId: job.id };
  }
  return processUploadInline(payload);
}

async function enqueueCalendarSync(payload) {
  if (!useRedis) {
    logQueueMessage('Calendar queue unavailable; skipping job', payload);
    return { status: 'skipped', reason: 'queue_disabled' };
  }
  initRedisQueue();
  const job = await uploadQueue.add('calendar-sync', payload, { removeOnComplete: true, removeOnFail: false });
  return { status: 'queued', jobId: job.id };
}

function initRedisQueue() {
  if (uploadQueue) return;
  ({ Queue, Worker } = require('bullmq'));
  Redis = require('ioredis');
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

  uploadQueue = new Queue('tenax-schedule', { connection });
  uploadWorker = new Worker(
    'tenax-schedule',
    async (job) => {
      if (job.name === 'timetable-upload') {
        await processUploadInline(job.data);
      }
      if (job.name === 'calendar-sync') {
        logQueueMessage('Calendar sync job received', job.data);
      }
      return true;
    },
    { connection }
  );

  uploadWorker.on('failed', (job, err) => {
    console.error('[ScheduleQueue] Redis job failed:', err.message || err);
  });
}

module.exports = {
  initProcessors,
  enqueueUploadJob,
  enqueueCalendarSync
};
