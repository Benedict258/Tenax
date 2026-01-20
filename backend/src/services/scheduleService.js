const supabase = require('../config/supabase');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('./metricsStore');

const DAY_START = { hour: 5, minute: 0 };
const DAY_END = { hour: 23, minute: 0 };
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

const scheduleIntelEnabled = () => process.env.SCHEDULE_INTEL_V1 === 'true';

const buildIsoRange = (date) => {
  const target = date instanceof Date ? date : new Date(date);
  const start = new Date(target);
  start.setHours(DAY_START.hour, DAY_START.minute, 0, 0);
  const end = new Date(target);
  end.setHours(DAY_END.hour, DAY_END.minute, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

async function logTrace(event, payload) {
  await opikLogger.log(event, payload);
}

async function createUploadRecord({ userId, source, filename, storagePath }) {
  const { data, error } = await supabase
    .from('timetable_uploads')
    .insert([{ user_id: userId, source, storage_path: storagePath, original_filename: filename }])
    .select()
    .single();

  if (error) throw error;

  await logTrace('schedule_upload_received', {
    user_id: userId,
    upload_id: data.id,
    source,
    filename
  });
  return data;
}

function sanitizeFilename(filename = '') {
  return filename.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
}

async function uploadToStorage(userId, file) {
  if (!storageBucket) {
    throw new Error('Supabase storage bucket not configured');
  }
  if (!file?.buffer) {
    throw new Error('File buffer missing');
  }

  const safeName = sanitizeFilename(file.originalname || `timetable-${Date.now()}.pdf`);
  const objectPath = `timetables/${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(storageBucket)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false
    });

  if (error) throw error;
  return objectPath;
}

async function ingestUpload({ userId, source, file }) {
  const storagePath = await uploadToStorage(userId, file);
  return createUploadRecord({
    userId,
    source,
    filename: file.originalname,
    storagePath
  });
}

async function getSignedUploadUrl(storagePath, expiresIn = 3600) {
  if (!storageBucket) {
    throw new Error('Supabase storage bucket not configured');
  }

  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data?.signedUrl;
}

async function updateUploadStatus(id, status, failureReason = null) {
  const fields = { status, processed_at: status === 'done' ? new Date().toISOString() : null };
  if (failureReason) fields.failure_reason = failureReason;

  const { data, error } = await supabase
    .from('timetable_uploads')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getUploadById(id) {
  const { data, error } = await supabase
    .from('timetable_uploads')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

async function recordExtractionRows(rows = []) {
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from('timetable_extractions')
    .insert(rows)
    .select();

  if (error) throw error;
  await logTrace('schedule_rows_inserted', { row_count: rows.length });
  return data;
}

async function getBusyBlocks(userId, date) {
  const { startISO, endISO } = buildIsoRange(date || new Date());
  const { data, error } = await supabase
    .from('schedule_blocks_v')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', startISO)
    .lte('end_time', endISO)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

function mergeBlocks(blocks) {
  if (!blocks.length) return [];
  const sorted = blocks.slice().sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (new Date(current.start_time) <= new Date(last.end_time)) {
      last.end_time = new Date(Math.max(new Date(last.end_time), new Date(current.end_time)));
    } else {
      merged.push(current);
    }
  }
  return merged.map((block) => ({
    ...block,
    start_time: new Date(block.start_time),
    end_time: new Date(block.end_time)
  }));
}

function computeFreeWindows(blocks, date) {
  const day = date instanceof Date ? date : new Date(date);
  const dayStart = new Date(day);
  dayStart.setHours(DAY_START.hour, DAY_START.minute, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(DAY_END.hour, DAY_END.minute, 0, 0);

  if (!blocks.length) return [{ start: dayStart, end: dayEnd }];

  const merged = mergeBlocks(blocks);
  const windows = [];
  let cursor = dayStart;

  merged.forEach((block) => {
    const blockStart = new Date(block.start_time);
    if (blockStart > cursor) {
      windows.push({ start: new Date(cursor), end: new Date(blockStart) });
    }
    const blockEnd = new Date(block.end_time);
    cursor = blockEnd > cursor ? blockEnd : cursor;
  });

  if (cursor < dayEnd) {
    windows.push({ start: new Date(cursor), end: dayEnd });
  }

  return windows;
}

async function getAvailability(userId, date) {
  const busyBlocks = await getBusyBlocks(userId, date);
  const freeWindows = computeFreeWindows(busyBlocks, date);

  await logTrace('schedule_availability_computed', {
    user_id: userId,
    busy_count: busyBlocks.length,
    free_windows: freeWindows.length
  });

  return { busyBlocks, freeWindows };
}

async function saveOcrPayload(uploadId, payload) {
  const { error } = await supabase
    .from('timetable_uploads')
    .update({ ocr_payload: payload })
    .eq('id', uploadId);

  if (error) throw error;
  return true;
}

async function recordReminderShift({ userId, taskId, originalTime, shiftedTime, reason }) {
  metricsStore.recordReminder({
    userId,
    taskId,
    reminderType: 'schedule_shift',
    sentAt: new Date()
  });

  await logTrace('schedule_reminder_shift', {
    user_id: userId,
    task_id: taskId,
    original_time: originalTime,
    shifted_time: shiftedTime,
    reason
  });
}

module.exports = {
  scheduleIntelEnabled,
  ingestUpload,
  createUploadRecord,
  updateUploadStatus,
  getUploadById,
  getSignedUploadUrl,
  recordExtractionRows,
  getBusyBlocks,
  computeFreeWindows,
  getAvailability,
  recordReminderShift,
  saveOcrPayload,
  logTrace,
  scheduleFeatureFlag: () => scheduleIntelEnabled(),
  guardScheduleFeature(req, res, next) {
    if (!scheduleIntelEnabled()) {
      return res.status(503).json({ message: 'Schedule intelligence feature disabled' });
    }
    return next();
  }
};
