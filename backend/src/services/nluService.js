const chrono = require('chrono-node');

const COMPLETION_PREFIXES = ['done', 'finished', 'completed'];
const STATUS_TRIGGERS = [
  'status',
  "what do i have left",
  'what is left',
  'show my tasks',
  "what's my plan",
  'show my plan',
  'what is my plan',
  'plan'
];
const PROGRESS_TRIGGERS = [
  'how did i do',
  "what's my progress",
  'how am i doing',
  'progress'
];
const START_TRIGGERS = ['start my day', 'good morning', "i'm ready", "i’m ready", "i am ready", "let's start"];
const END_TRIGGERS = ['end my day', 'wrap up', 'good night'];
const REMINDER_SNOOZE_TRIGGERS = ['snooze', 'remind me later'];
const REMINDER_PAUSE_TRIGGERS = ['stop reminders', 'pause reminders', "don't remind me", 'no reminders'];
const REMOVE_TRIGGERS = ['remove', 'delete', 'cancel'];
const RESCHEDULE_TRIGGERS = ['move', 'shift', 'reschedule'];
const DAILY_KEYWORDS = ['daily', 'every day', 'each day'];
const WEEKLY_KEYWORDS = ['weekly', 'every week'];
const WEEKDAY_KEYWORDS = ['weekdays', 'every weekday'];
const WEEKEND_KEYWORDS = ['weekends', 'weekend'];
const TIMETABLE_TRIGGERS = ['timetable', 'course list', 'class schedule', 'courses i am taking', 'class timetable'];

const normalize = (text) => text.toLowerCase().trim();

function detectRecurrence(text) {
  const normalized = normalize(text);
  if (DAILY_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return { value: 'daily', matchedText: DAILY_KEYWORDS.find((kw) => normalized.includes(kw)) };
  }
  if (WEEKLY_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return { value: 'weekly', matchedText: WEEKLY_KEYWORDS.find((kw) => normalized.includes(kw)) };
  }
  if (WEEKDAY_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return { value: 'weekdays', matchedText: WEEKDAY_KEYWORDS.find((kw) => normalized.includes(kw)) };
  }
  if (WEEKEND_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return { value: 'weekend', matchedText: WEEKEND_KEYWORDS.find((kw) => normalized.includes(kw)) };
  }
  return null;
}

function extractTimeData(text) {
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (!results.length) {
    return null;
  }
  const primary = results[0];
  const date = primary.start?.date?.();
  if (!date) {
    return null;
  }
  return {
    iso: date.toISOString(),
    matchedText: primary.text,
    date
  };
}

function removeMatchedText(source, matches = []) {
  let output = source;
  matches
    .filter(Boolean)
    .forEach((match) => {
      const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp(escaped, 'i'), '');
    });
  return output.trim();
}

function extractNumber(text) {
  const numberMatch = text.match(/(\d{1,3})/);
  if (numberMatch) {
    return Number(numberMatch[1]);
  }
  if (text.includes('half')) return 30;
  if (text.includes('hour')) return 60;
  return null;
}

function buildIntentResponse(intent, confidence, slots = {}, metadata = {}) {
  return { intent, confidence, slots, metadata };
}

function parseTaskAddition(text) {
  const normalized = text.trim();
  const recurrence = detectRecurrence(normalized);
  const timeData = extractTimeData(normalized);
  let taskName = normalized;
  if (timeData?.matchedText) {
    taskName = removeMatchedText(taskName, [timeData.matchedText]);
  }
  if (recurrence?.matchedText) {
    taskName = removeMatchedText(taskName, [recurrence.matchedText]);
  }
  return buildIntentResponse('add_task', 0.94, {
    taskName: taskName.replace(/^(add|create|schedule)\s+/i, '').trim(),
    recurrence: recurrence?.value || null,
    targetTime: timeData?.iso || null
  });
}

function parseTaskRemoval(text) {
  const taskName = text.replace(/^(remove|delete|cancel)\s+/i, '').trim();
  return buildIntentResponse('remove_task', 0.9, { taskName });
}

function parseTaskReschedule(text) {
  const deferMatch = text.match(/tomorrow|next day|push/i);
  const deferDays = deferMatch ? 1 : 0;
  const timeData = extractTimeData(text);
  const recurrence = detectRecurrence(text);
  let taskName = text.replace(/^(move|shift|reschedule)\s+/i, '').trim();
  if (timeData?.matchedText) {
    taskName = removeMatchedText(taskName, [timeData.matchedText]);
  }
  if (recurrence?.matchedText) {
    taskName = removeMatchedText(taskName, [recurrence.matchedText]);
  }
  return buildIntentResponse('reschedule_task', 0.87, {
    taskName,
    targetTime: timeData?.iso || null,
    deferDays,
    recurrence: recurrence?.value || null
  });
}

function parseReminderSnooze(text) {
  const minutes = extractNumber(text) || 30;
  return buildIntentResponse('reminder_snooze', 0.9, { minutes });
}

function parseReminderPause() {
  return buildIntentResponse('reminder_pause', 0.92, {});
}

function parseCompletion(text) {
  const collapsed = text.replace(/^(done|finished|completed)\s*/i, '').trim();
  if (collapsed.length === 0) {
    return buildIntentResponse('mark_complete', 0.92, { taskName: '' });
  }
  return buildIntentResponse('mark_complete', 0.95, { taskName: collapsed });
}

function parseCantFinish(text) {
  const taskName = text.replace(/i\s*(couldn't|could not|cant|can't)\s*finish/i, '').trim();
  return buildIntentResponse('task_delay', 0.82, { taskName, reason: 'user_unfinished' });
}

function parseStatusIntent() {
  return buildIntentResponse('status', 0.9, {});
}

function parsePlanIntent() {
  return buildIntentResponse('plan_overview', 0.88, {});
}

function parseProgressIntent() {
  return buildIntentResponse('progress_review', 0.9, {});
}

function parseDailyStart() {
  return buildIntentResponse('daily_start', 0.93, {});
}

function parseDailyEnd() {
  return buildIntentResponse('daily_end', 0.9, {});
}

function parseUnknown(text) {
  return buildIntentResponse('unknown', 0.2, { originalText: text });
}

function parseMessage(rawText, options = {}) {
  if (!rawText) {
    return parseUnknown('');
  }
  const text = rawText.trim();
  const normalized = normalize(text);

  if (COMPLETION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return parseCompletion(text);
  }

  if (/i\s*(?:have|just)?\s*(completed|finished|done)/i.test(text)) {
    return parseCompletion(text);
  }

  if (/i\s*(couldn't|could not|cant|can't)\s*finish/i.test(normalized)) {
    return parseCantFinish(text);
  }

  if (STATUS_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseStatusIntent();
  }

  if (PROGRESS_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseProgressIntent();
  }

  if (START_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseDailyStart();
  }

  if (END_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseDailyEnd();
  }

  if (normalized.startsWith('add') || normalized.startsWith('create') || normalized.startsWith('schedule')) {
    return parseTaskAddition(text);
  }

  if (TIMETABLE_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return buildIntentResponse('upload_timetable', 0.93, {});
  }

  if (REMOVE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return parseTaskRemoval(text);
  }

  if (RESCHEDULE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return parseTaskReschedule(text);
  }

  if (REMINDER_SNOOZE_TRIGGERS.some((phrase) => normalized.startsWith(phrase))) {
    return parseReminderSnooze(text);
  }

  if (REMINDER_PAUSE_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseReminderPause();
  }

  if (normalized === 'help') {
    return buildIntentResponse('help', 0.8, {});
  }

  if (options.allowPlanFallback && normalized.includes('plan')) {
    return parsePlanIntent();
  }

  return parseUnknown(text);
}

function resolvePendingAction(rawText, pendingAction) {
  if (!pendingAction || !rawText) {
    return null;
  }
  const normalized = normalize(rawText);

  if (pendingAction.type === 'task_disambiguation') {
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
      const selected = pendingAction.options.find((option) => option.index === numeric);
      if (selected) {
        return buildIntentResponse(pendingAction.intent, 0.99, {
          ...(pendingAction.slots || {}),
          taskId: selected.id,
          taskName: selected.title
        }, { clarified: true });
      }
    }

    const textMatch = pendingAction.options.find((option) => option.title.toLowerCase().includes(normalized));
    if (textMatch) {
      return buildIntentResponse(pendingAction.intent, 0.95, {
        ...(pendingAction.slots || {}),
        taskId: textMatch.id,
        taskName: textMatch.title
      }, { clarified: true });
    }
    return null;
  }

  if (pendingAction.type === 'time_confirmation') {
    const timeData = extractTimeData(rawText);
    if (timeData) {
      return buildIntentResponse(pendingAction.intent, 0.92, {
        ...(pendingAction.slots || {}),
        targetTime: timeData.iso
      }, { clarified: true });
    }
    return null;
  }

  if (pendingAction.type === 'timetable_confirmation') {
    if (/^(yes|yep|sure|go ahead|add all)/i.test(rawText.trim())) {
      return buildIntentResponse('import_timetable_confirm', 0.94, {
        entries: pendingAction.entries
      }, { clarified: true });
    }

    if (/^(no|cancel|not now)/i.test(rawText.trim())) {
      return buildIntentResponse('timetable_cancel', 0.8, {}, { clarified: true });
    }

    if (normalized.startsWith('add only')) {
      const requested = rawText.replace(/add only/i, '').split(/,|and/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const selected = pendingAction.entries.filter((entry) =>
        requested.some((target) => entry.title.toLowerCase().includes(target))
      );
      if (selected.length) {
        return buildIntentResponse('import_timetable_confirm', 0.9, { entries: selected }, { clarified: true });
      }
    }

    return null;
  }

  return null;
}

function parseResolutionBuilderIntent(text) {
  const normalized = normalize(text);
  if (/resolution builder|new year resolution|plan my goal|create resolution plan|start resolution builder|plan my 2026 goal/i.test(normalized)) {
    return buildIntentResponse('start_resolution_builder', 0.99, {});
  }
  return null;
}

module.exports = {
  parseMessage,
  resolvePendingAction,
  detectRecurrence,
  extractTimeData,
  parseResolutionBuilderIntent
};
