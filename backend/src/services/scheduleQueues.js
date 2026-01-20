const Queue = require('bull');
const scheduleService = require('./scheduleService');
const features = require('../config/features');
const ocrService = require('./ocrService');

const redisUrl = process.env.REDIS_URL;

let scheduleOcrQueue = null;
let calendarSyncQueue = null;

if (redisUrl) {
  scheduleOcrQueue = new Queue('schedule-ocr', redisUrl);
  calendarSyncQueue = new Queue('calendar-sync', redisUrl);
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

function enqueueUploadJob(payload) {
  if (!scheduleOcrQueue) {
    logQueueMessage('Upload queue unavailable; skipping job', payload);
    return null;
  }
  return scheduleOcrQueue.add(payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  });
}

function enqueueCalendarSync(payload) {
  if (!calendarSyncQueue) {
    logQueueMessage('Calendar queue unavailable; skipping job', payload);
    return null;
  }
  return calendarSyncQueue.add(payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });
}

module.exports = {
  initProcessors,
  enqueueUploadJob,
  enqueueCalendarSync
};
