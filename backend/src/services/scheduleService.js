const supabase = require('../config/supabase');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('./metricsStore');

const DAY_START = { hour: 5, minute: 0 };
const DAY_END = { hour: 23, minute: 0 };
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

const scheduleIntelEnabled = () => process.env.SCHEDULE_INTEL_V1 === 'true';

const MS_IN_MINUTE = 60 * 1000;
const MINUTES_IN_HOUR = 60;

const isNotFoundError = (error) => error?.code === 'PGRST116';

const toDate = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

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

async function getLatestUploadForUser(userId) {
  const { data, error } = await supabase
    .from('timetable_uploads')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
  return data || null;
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

function normalizeTimeString(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(11, 19);
  }
  const stringValue = value.toString().trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue;
  }
  if (/^\d{1,2}:\d{2}$/.test(stringValue)) {
    const [hour, minute] = stringValue.split(':');
    const hh = hour.padStart(2, '0');
    return `${hh}:${minute}:00`;
  }
  if (/^\d{1,2}$/.test(stringValue)) {
    return `${stringValue.padStart(2, '0')}:00:00`;
  }
  return null;
}

function normalizeDayOfWeek(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0 || numeric > 6) {
    return null;
  }
  return numeric;
}

function toMinutesFromTimeString(timeValue) {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const [hoursRaw, minutesRaw = '0', secondsRaw = '0'] = timeValue.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return null;
  }
  return hours * MINUTES_IN_HOUR + minutes + seconds / MINUTES_IN_HOUR;
}

function minutesBetweenTimes(startTime, endTime) {
  const startMinutes = toMinutesFromTimeString(startTime);
  const endMinutes = toMinutesFromTimeString(endTime);
  if (startMinutes === null || endMinutes === null) {
    return 0;
  }
  const diff = endMinutes - startMinutes;
  return diff > 0 ? diff : 0;
}

function getDayBounds(dateInput) {
  const base = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(base.getTime())) {
    const error = new Error('Invalid date provided');
    error.statusCode = 400;
    throw error;
  }
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start,
    end,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    dayOfWeek: start.getDay()
  };
}

function diffIsoMinutes(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff = (end - start) / MS_IN_MINUTE;
  if (!Number.isFinite(diff) || diff <= 0) {
    return 0;
  }
  return diff;
}

function resolveTaskDurationMinutes(task = {}) {
  if (!task || typeof task !== 'object') return 0;
  if (typeof task.duration_minutes === 'number' && task.duration_minutes > 0) {
    return task.duration_minutes;
  }
  const metadata = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const metadataMinutes = Number(
    metadata.duration_minutes ?? metadata.estimated_minutes ?? metadata.block_minutes
  );
  if (!Number.isNaN(metadataMinutes) && metadataMinutes > 0) {
    return metadataMinutes;
  }
  const windowMinutes = diffIsoMinutes(task.start_time, task.end_time);
  if (windowMinutes > 0) {
    return windowMinutes;
  }
  return 0;
}

function sanitizeExtractionPayload(input = {}) {
  const dayOfWeek = normalizeDayOfWeek(input.day_of_week ?? input.dayOfWeek);
  const startTime = normalizeTimeString(input.start_time ?? input.startTime);
  const endTime = normalizeTimeString(input.end_time ?? input.endTime);

  if (!input.title || !startTime || !endTime || dayOfWeek === null) {
    const error = new Error('Invalid timetable row payload');
    error.statusCode = 400;
    throw error;
  }

  return {
    title: input.title.trim(),
    location: input.location || null,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    category: input.category || 'class',
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    metadata: typeof input.metadata === 'object' && input.metadata !== null ? input.metadata : {}
  };
}

async function listExtractionRows(userId) {
  const { data, error } = await supabase
    .from('timetable_extractions')
    .select('*')
    .eq('user_id', userId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getScheduleCoverage(userId, dateInput) {
  if (!userId) {
    const error = new Error('userId is required');
    error.statusCode = 400;
    throw error;
  }

  const { dayOfWeek, start, end, startISO, endISO } = getDayBounds(dateInput);

  const { data: rows, error: extractionError } = await supabase
    .from('timetable_extractions')
    .select('id, start_time, end_time, day_of_week')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek);

  if (extractionError) throw extractionError;

  const { data: completedTasks, error: completionError } = await supabase
    .from('tasks')
    .select('id, start_time, end_time, duration_minutes, metadata, status, updated_at')
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('updated_at', startISO)
    .lt('updated_at', endISO);

  if (completionError) throw completionError;

  const scheduleMinutes = (rows || []).reduce(
    (total, row) => total + minutesBetweenTimes(row.start_time, row.end_time),
    0
  );
  const completionMinutes = (completedTasks || []).reduce(
    (total, task) => total + resolveTaskDurationMinutes(task),
    0
  );

  return {
    date: start.toISOString(),
    day_of_week: dayOfWeek,
    schedule: {
      total_minutes: Math.round(scheduleMinutes),
      block_count: rows?.length || 0
    },
    completion: {
      total_minutes: Math.round(completionMinutes),
      task_count: completedTasks?.length || 0
    },
    coverage_percent:
      scheduleMinutes > 0
        ? Math.min(100, Math.round((completionMinutes / scheduleMinutes) * 100))
        : 0,
    pending_minutes: Math.max(Math.round(scheduleMinutes - completionMinutes), 0),
    generated_at: new Date().toISOString()
  };
}

async function createManualExtractionRow(userId, payload) {
  const sanitized = sanitizeExtractionPayload(payload);
  const insertPayload = {
    ...sanitized,
    user_id: userId,
    upload_id: payload.upload_id || null,
    metadata: {
      ...sanitized.metadata,
      source: payload.source || 'manual_editor'
    }
  };

  const { data, error } = await supabase
    .from('timetable_extractions')
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  await logTrace('schedule_row_manual_created', { user_id: userId, row_id: data.id });
  return data;
}

async function updateExtractionRow(rowId, updates) {
  const { data: existing, error: fetchError } = await supabase
    .from('timetable_extractions')
    .select('*')
    .eq('id', rowId)
    .single();

  if (fetchError) {
    if (isNotFoundError(fetchError)) {
      const notFound = new Error('Timetable row not found');
      notFound.statusCode = 404;
      throw notFound;
    }
    throw fetchError;
  }
  if (!existing) {
    const notFound = new Error('Timetable row not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  const sanitized = sanitizeExtractionPayload({
    ...existing,
    ...updates,
    day_of_week: updates.day_of_week ?? updates.dayOfWeek ?? existing.day_of_week,
    start_time: updates.start_time ?? updates.startTime ?? existing.start_time,
    end_time: updates.end_time ?? updates.endTime ?? existing.end_time
  });

  const { data, error } = await supabase
    .from('timetable_extractions')
    .update(sanitized)
    .eq('id', rowId)
    .select()
    .single();

  if (error) throw error;
  await logTrace('schedule_row_manual_updated', { row_id: rowId });
  return data;
}

async function deleteExtractionRow(rowId) {
  const { data, error } = await supabase
    .from('timetable_extractions')
    .delete()
    .eq('id', rowId)
    .select()
    .single();

  if (error) {
    if (isNotFoundError(error)) {
      const notFound = new Error('Timetable row not found');
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
  await logTrace('schedule_row_manual_deleted', { row_id: rowId });
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

function normalizeBusyBlock(block) {
  if (!block) return null;
  const startDate = toDate(block.start_time);
  const endDate = toDate(block.end_time);
  return {
    ...block,
    startDate,
    endDate
  };
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

async function findAdjustedReminderTime(userId, targetTime, durationMinutes = 30) {
  const targetStart = toDate(targetTime);
  if (!userId || !targetStart) {
    return { adjustedTime: targetStart, conflictBlock: null };
  }

  const durationMs = Math.max(durationMinutes, 5) * MS_IN_MINUTE;
  const targetEnd = new Date(targetStart.getTime() + durationMs);

  const { busyBlocks, freeWindows } = await getAvailability(userId, targetStart);
  const normalizedBlocks = (busyBlocks || []).map(normalizeBusyBlock).filter((block) => block?.startDate && block?.endDate);
  const conflictBlock = normalizedBlocks.find((block) => overlap(targetStart, targetEnd, block.startDate, block.endDate));

  if (!conflictBlock) {
    return { adjustedTime: targetStart, conflictBlock: null };
  }

  const candidateWindows = (freeWindows || [])
    .map((window) => ({ start: toDate(window.start), end: toDate(window.end) }))
    .filter((window) => window.start && window.end && window.end > window.start && (window.end - window.start) >= durationMs);

  const afterWindows = candidateWindows
    .filter((window) => window.start >= targetStart)
    .sort((a, b) => a.start - b.start);

  if (afterWindows.length) {
    return { adjustedTime: new Date(afterWindows[0].start), conflictBlock };
  }

  const beforeWindows = candidateWindows
    .filter((window) => window.end <= targetStart)
    .sort((a, b) => b.end - a.end);

  if (beforeWindows.length) {
    const candidate = beforeWindows[0];
    const startMs = Math.max(candidate.start.getTime(), candidate.end.getTime() - durationMs);
    return { adjustedTime: new Date(startMs), conflictBlock };
  }

  return { adjustedTime: targetStart, conflictBlock, exhausted: true };
}

async function recordScheduleConflict({
  userId,
  taskId,
  conflictType,
  conflictWindow,
  resolution = null,
  resolvedAt = null,
  metadata = {}
}) {
  const windowPayload = conflictWindow
    ? {
        ...conflictWindow,
        start_time: conflictWindow.start_time || conflictWindow.startDate?.toISOString() || conflictWindow.start?.toISOString?.(),
        end_time: conflictWindow.end_time || conflictWindow.endDate?.toISOString() || conflictWindow.end?.toISOString?.()
      }
    : null;

  const { data, error } = await supabase
    .from('task_schedule_conflicts')
    .insert([
      {
        user_id: userId,
        task_id: taskId,
        conflict_type: conflictType,
        conflict_window: windowPayload,
        resolution,
        resolved_at: resolvedAt,
        metadata
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
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
  findAdjustedReminderTime,
  recordScheduleConflict,
  saveOcrPayload,
  getLatestUploadForUser,
  logTrace,
  listExtractionRows,
  getScheduleCoverage,
  createManualExtractionRow,
  updateExtractionRow,
  deleteExtractionRow,
  scheduleFeatureFlag: () => scheduleIntelEnabled(),
  guardScheduleFeature(req, res, next) {
    if (!scheduleIntelEnabled()) {
      return res.status(503).json({ message: 'Schedule intelligence feature disabled' });
    }
    return next();
  }
};
