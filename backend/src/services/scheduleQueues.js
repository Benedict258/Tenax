const scheduleService = require('./scheduleService');
const features = require('../config/features');
const ocrService = require('./ocrService');
const INLINE_MODE = true;

function logQueueMessage(message, payload = {}) {
  console.log(`[ScheduleQueue] ${message}`, payload);
}

function initProcessors() {
  if (!features.scheduleIntelEnabled) {
    logQueueMessage('Schedule intel disabled; queues idle');
    return;
  }

  if (INLINE_MODE) {
    logQueueMessage('Running schedule jobs inline (Redis disabled)');
  }
}

async function processUploadInline(payload) {
  logQueueMessage('Processing upload inline (queue disabled)', payload);
  await ocrService.processUpload(payload.uploadId);
  return { status: 'ok', inline: true };
}

async function enqueueUploadJob(payload) {
  return processUploadInline(payload);
}

async function enqueueCalendarSync(payload) {
  logQueueMessage('Calendar queue unavailable; skipping job', payload);
  return { status: 'skipped', reason: 'queue_disabled' };
}

module.exports = {
  initProcessors,
  enqueueUploadJob,
  enqueueCalendarSync
};
