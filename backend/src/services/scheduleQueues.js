const Queue = require('bull');
const scheduleService = require('./scheduleService');
const features = require('../config/features');
const ocrService = require('./ocrService');

const redisUrl = process.env.REDIS_URL;

let scheduleOcrQueue = null;
let calendarSyncQueue = null;

if (redisUrl) {
  try {
    scheduleOcrQueue = new Queue('schedule-ocr', redisUrl);
    calendarSyncQueue = new Queue('calendar-sync', redisUrl);
  } catch (error) {
    console.warn('[ScheduleQueue] Failed to initialize Redis queues, falling back to inline mode:', error.message);
    scheduleOcrQueue = null;
    calendarSyncQueue = null;
  }
} else {
  console.warn('[ScheduleQueue] REDIS_URL not configured; schedule queues disabled');
}

function logQueueMessage(message, payload = {}) {
  console.log(`[ScheduleQueue] ${message}`, payload);
}

function initProcessors() {
  if (!features.scheduleIntelEnabled || !scheduleOcrQueue || !calendarSyncQueue) {
    logQueueMessage('Schedule intel disabled; queues idle');
    return;
  }

  scheduleOcrQueue.process(async (job) => {
    logQueueMessage('Processing timetable upload', { jobId: job.id, uploadId: job.data.uploadId });
    await ocrService.processUpload(job.data.uploadId);
    return { status: 'ok' };
  });

  calendarSyncQueue.process(async (job) => {
    logQueueMessage('Processing calendar sync job', { jobId: job.id });
    // Placeholder: actual Google sync to be implemented later
    await scheduleService.logTrace('calendar_sync_stub', job.data);
    return { status: 'ok' };
  });
}

async function processUploadInline(payload) {
  logQueueMessage('Processing upload inline (queue disabled)', payload);
  await ocrService.processUpload(payload.uploadId);
  return { status: 'ok', inline: true };
}

async function enqueueUploadJob(payload) {
  if (!scheduleOcrQueue) {
    return processUploadInline(payload);
  }
  try {
    return await scheduleOcrQueue.add(payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });
  } catch (error) {
    logQueueMessage('Upload queue add failed; falling back inline', { error: error.message });
    return processUploadInline(payload);
  }
}

async function enqueueCalendarSync(payload) {
  if (!calendarSyncQueue) {
    logQueueMessage('Calendar queue unavailable; skipping job', payload);
    return { status: 'skipped', reason: 'queue_disabled' };
  }
  try {
    return await calendarSyncQueue.add(payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });
  } catch (error) {
    logQueueMessage('Calendar queue add failed; skipping job', { error: error.message });
    return { status: 'skipped', reason: 'queue_error', error: error.message };
  }
}

module.exports = {
  initProcessors,
  enqueueUploadJob,
  enqueueCalendarSync
};
