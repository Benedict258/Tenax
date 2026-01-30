const chrono = require('chrono-node');
const llmService = require('./llm');

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
const GREETING_TRIGGERS = ['hello', 'hi', 'hey', 'yo', 'good evening', 'good afternoon'];
const GENERIC_TASK_NAMES = new Set(['task', 'a task', 'the task', 'my task', 'it', 'this', 'that']);
const ADD_TRIGGERS = ['add', 'create', 'schedule', 'remind me', 'set a reminder', 'set reminder', 'set', 'book'];
const DAILY_KEYWORDS = ['daily', 'every day', 'each day'];
const WEEKLY_KEYWORDS = ['weekly', 'every week'];
const WEEKDAY_KEYWORDS = ['weekdays', 'every weekday'];
const WEEKEND_KEYWORDS = ['weekends', 'weekend'];
const TIMETABLE_TRIGGERS = ['timetable', 'course list', 'class schedule', 'courses i am taking', 'class timetable'];
const SCHEDULE_NOTE_TRIGGERS = ['lecture', 'class', 'meeting', 'seminar', 'workshop', 'busy', 'unavailable'];

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

function cleanTaskTitle(raw) {
  if (!raw) return '';
  let text = raw;
  const prefixes = [
    /^add\s+/i,
    /^create\s+/i,
    /^schedule\s+/i,
    /^remind\s+me\s+to\s+/i,
    /^remind\s+me\s+/i,
    /^set\s+a\s+reminder\s+for\s+/i,
    /^set\s+a\s+reminder\s+/i,
    /^set\s+reminder\s+for\s+/i,
    /^set\s+reminder\s+/i,
    /^set\s+/i
  ];
  prefixes.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  text = text.replace(/^(the\s+)?task\s+/i, '');
  text = text.replace(/\b(please|pls)\b/gi, '');
  text = text.replace(/\b(today|tomorrow|tonight)\b/gi, '');
  text = text.replace(/\b(for|at)\b\s*$/i, '');
  return text.replace(/\s+/g, ' ').trim();
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
  const cleaned = cleanTaskTitle(taskName);
  return buildIntentResponse('add_task', 0.94, {
    taskName: cleaned,
    title: cleaned,
    recurrence: recurrence?.value || null,
    targetTime: timeData?.iso || null,
    datetime: timeData?.iso || null
  });
}

function parseTaskRemoval(text) {
  const raw = text.replace(/^(remove|delete|cancel)\s+/i, '').trim();
  const taskName = cleanTaskTitle(raw);
  return buildIntentResponse('remove_task', 0.9, { taskName, title: taskName });
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
  taskName = cleanTaskTitle(taskName);
  return buildIntentResponse('reschedule_task', 0.87, {
    taskName,
    title: taskName,
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
  const collapsed = text
    .replace(/^(i\s*(have|just)?\s*)?(completed|finished|done)\s*/i, '')
    .replace(/^(the\s+)?task\s*/i, '')
    .trim();
  const normalized = normalize(collapsed);
  if (collapsed.length === 0 || GENERIC_TASK_NAMES.has(normalized)) {
    return buildIntentResponse('mark_complete', 0.92, { taskName: '', title: '', explicitTask: false });
  }
  return buildIntentResponse('mark_complete', 0.95, { taskName: collapsed, title: collapsed, explicitTask: true });
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

function parseGreeting(text) {
  return buildIntentResponse('greeting', 0.86, { text });
}

function parseScheduleNote(text) {
  const timeData = extractTimeData(text);
  return buildIntentResponse('schedule_note', 0.7, {
    note: text.trim(),
    targetTime: timeData?.iso || null,
    matchedText: timeData?.matchedText || null
  });
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

  if (ADD_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    const parsed = parseTaskAddition(text);
    return buildIntentResponse(parsed.intent, 0.8, parsed.slots);
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

  if (GREETING_TRIGGERS.some((phrase) => normalized.startsWith(phrase))) {
    return parseGreeting(text);
  }

  if (SCHEDULE_NOTE_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseScheduleNote(text);
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
    const numericMatch = normalized.match(/(\d+)/);
    const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const mappedWord = Object.keys(wordMap).find((word) => normalized.includes(word));
    const numeric = numericMatch ? Number(numericMatch[1]) : mappedWord ? wordMap[mappedWord] : Number(normalized);
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
    if (/no fixed time|no time|anytime|flexible/i.test(rawText)) {
      return buildIntentResponse(pendingAction.intent, 0.92, {
        ...(pendingAction.slots || {}),
        targetTime: null,
        noFixedTime: true
      }, { clarified: true });
    }
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


async function inferCompletionWithLLM(text, userId) {
  if (!text || text.trim().length < 2) return null;
  const prompt = [
    'You are a strict JSON classifier.',
    'Determine if the user message indicates they completed a task.',
    'Return JSON only in the format:',
    '{"is_completion": true|false, "task_name": "<task name or empty>"}',
    'Message: ' + text.trim()
  ].join('\n');

  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 60,
      temperature: 0,
      opikMeta: {
        action: 'intent_fallback_completion',
        user_id: userId
      }
    });
    const raw = response?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const taskName = parsed?.task_name ? String(parsed.task_name).trim() : '';
    const normalizedTask = normalize(taskName);
    if (parsed?.is_completion) {
      return buildIntentResponse('mark_complete', 0.6, {
        taskName: taskName && !GENERIC_TASK_NAMES.has(normalizedTask) ? taskName : ''
      }, { llm_fallback: true });
    }
    return null;
  } catch (error) {
    console.warn('[NLU] LLM completion fallback failed:', error.message);
    return null;
  }
}

module.exports = {
  parseMessage,
  resolvePendingAction,
  detectRecurrence,
  extractTimeData,
  parseResolutionBuilderIntent,
  inferCompletionWithLLM
};
