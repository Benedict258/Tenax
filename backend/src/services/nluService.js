const chrono = require('chrono-node');
const { DateTime } = require('luxon');
const llmService = require('./llm');

const COMPLETION_PREFIXES = ['done', 'finished', 'completed'];
const STATUS_TRIGGERS = [
  'status',
  "what do i have left",
  'what is left',
  'anything left',
  'left for today',
  'left today',
  'show my tasks',
  "what's my plan",
  'show my plan',
  'what is my plan',
  'plan',
  'have you added',
  'did you add',
  'is it added',
  'is the task added',
  'have you set it'
];
const PROGRESS_TRIGGERS = [
  'how did i do',
  "what's my progress",
  'how am i doing',
  'progress'
];
const START_TRIGGERS = ['start my day', 'good morning', "i'm ready", 'i am ready', "let's start"];
const END_TRIGGERS = ['end my day', 'wrap up', 'good night'];
const REMINDER_SNOOZE_TRIGGERS = ['snooze', 'remind me later'];
const REMINDER_PAUSE_TRIGGERS = ['stop reminders', 'pause reminders', "don't remind me", 'no reminders'];
const REMOVE_TRIGGERS = ['remove', 'delete', 'cancel'];
const RESCHEDULE_TRIGGERS = ['move', 'shift', 'reschedule'];
const GREETING_TRIGGERS = ['hello', 'hi', 'hey', 'yo', 'good evening', 'good afternoon'];
const TIME_TRIGGERS = [
  'what time is it',
  'time now',
  'current time',
  "what's the time",
  "what's the time now",
  'what time now',
  'time right now',
  'time please'
];
const GENERIC_TASK_NAMES = new Set(['task', 'a task', 'the task', 'my task', 'it', 'this', 'that']);
const ACK_WORDS = new Set(['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright', 'cool']);
const ADD_TRIGGERS = ['add', 'create', 'schedule', 'remind me', 'set a reminder', 'set reminder', 'set', 'book'];
const DAILY_KEYWORDS = ['daily', 'every day', 'each day'];
const WEEKLY_KEYWORDS = ['weekly', 'every week'];
const WEEKDAY_KEYWORDS = ['weekdays', 'every weekday'];
const WEEKEND_KEYWORDS = ['weekends', 'weekend'];
const WEEKDAY_NAMES = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const TIMETABLE_TRIGGERS = ['timetable', 'course list', 'class schedule', 'courses i am taking', 'class timetable'];
const SCHEDULE_NOTE_TRIGGERS = ['lecture', 'class', 'meeting', 'seminar', 'workshop', 'busy', 'unavailable'];
const SCHEDULE_QUERY_TRIGGERS = [
  'what classes',
  'what class',
  'classes tomorrow',
  'class tomorrow',
  'schedule tomorrow',
  'schedule for',
  'my schedule tomorrow',
  'tomorrow schedule',
  'tmrw schedule',
  'schedule tmrw',
  'what do i have tomorrow',
  'what do i have tmrw',
  'what do i have next',
  'what do i have on',
  'what do i have for',
  'what are my schedules',
  'what is my schedule',
  'what are my schedule',
  'what about my schedule',
  'what about my schedules',
  'what is on my schedule',
  "what's on my schedule",
  'check my schedule',
  'what about my schedule',
  'what about my weekly schedule',
  'what about from my weekly schedule',
  'weekly schedule',
  'my weekly schedule',
  'what is on my weekly schedule',
  'what about my weekly schedule'
];

const normalize = (text) => text.toLowerCase().trim();
const safeText = (text) => normalize(text || '');

function isScheduleQueryText(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (SCHEDULE_QUERY_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return true;
  }
  if ((normalized.includes('schedule') || normalized.includes('schedules') || normalized.includes('classes')) &&
      WEEKDAY_NAMES.some((day) => normalized.includes(day))) {
    return true;
  }
  if ((normalized.includes('schedule') || normalized.includes('classes')) &&
      (normalized.startsWith('what') || normalized.startsWith('which') || normalized.startsWith('do i') || normalized.startsWith('whats'))) {
    return true;
  }
  if (normalized.includes('schedule') && /\?$/.test(normalized)) {
    return true;
  }
  if (normalized.includes('weekly schedule') || normalized.includes('my weekly')) {
    return true;
  }
  if (/tomorrow|tmrw|next\s+week|today/.test(normalized) && normalized.includes('schedule')) {
    return true;
  }
  return false;
}

function isQuestionLike(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (normalized.endsWith('?')) return true;
  if (/^(what|when|where|why|how|which|who|do i|did i|am i|is|are|can|should)\b/.test(normalized)) {
    return true;
  }
  return /^(hi|hey|hello|yo)[,\s]+(what|when|where|why|how|which|who|do i|did i|am i|is|are|can|should)\b/.test(normalized);
}

function isExplicitIntent(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (isScheduleQueryText(normalized) || isStatusQueryText(normalized) || isTimeQueryText(normalized)) {
    return true;
  }
  if (COMPLETION_PREFIXES.some((prefix) => normalized.startsWith(prefix)) || /i\s*(?:have|just)?\s*(completed|finished|done)/i.test(normalized)) {
    return true;
  }
  if (REMOVE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return true;
  }
  if (RESCHEDULE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return true;
  }
  if (REMINDER_SNOOZE_TRIGGERS.some((phrase) => normalized.startsWith(phrase))) {
    return true;
  }
  if (REMINDER_PAUSE_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return true;
  }
  if (TIMETABLE_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return true;
  }
  if (GREETING_TRIGGERS.some((phrase) => normalized.startsWith(phrase))) {
    return true;
  }
  if (normalized === 'help') {
    return true;
  }
  if (ADD_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return true;
  }
  return false;
}

function isStatusQueryText(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (STATUS_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return true;
  }
  if (normalized.includes('?') && (normalized.includes('task') || normalized.includes('plan'))) {
    return true;
  }
  return false;
}

function isTimeQueryText(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (isQuestionLike(normalized) && normalized.includes('time')) {
    return true;
  }
  return TIME_TRIGGERS.some((phrase) => normalized.includes(phrase));
}

function isAddTaskText(text = '') {
  const normalized = safeText(text);
  if (!normalized) return false;
  if (isScheduleQueryText(normalized) || isStatusQueryText(normalized) || isTimeQueryText(normalized)) {
    return false;
  }
  if (isQuestionLike(normalized) && !ADD_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return false;
  }
  if (normalized.startsWith('add') || normalized.startsWith('create') || normalized.startsWith('schedule')) {
    return true;
  }
  if (ADD_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return true;
  }
  return /\bby\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(normalized)
    || /\b\d{1,2}(:\d{2})\s*(am|pm)?\b/.test(normalized);
}

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

function extractTimeData(text, timezone = 'UTC') {
  if (!text) return null;
  const zone = timezone || 'UTC';
  const now = DateTime.now().setZone(zone);
  const byMatch = text.match(/\bby\s+(\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i);
  if (byMatch) {
    const quick = chrono.parse(byMatch[1], now.toJSDate(), { forwardDate: true });
    if (quick.length && quick[0]?.start?.date?.()) {
      const result = quick[0].start;
      const year = result.get('year') || now.year;
      const month = result.get('month') || now.month;
      const day = result.get('day') || now.day;
      const hour = result.get('hour') || 0;
      const minute = result.get('minute') || 0;
      const dt = DateTime.fromObject(
        { year, month, day, hour, minute, second: 0, millisecond: 0 },
        { zone }
      );
      const date = dt.toJSDate();
      return {
        iso: dt.toUTC().toISO(),
        matchedText: byMatch[0],
        date,
        timezone: zone
      };
    }
  }
  const results = chrono.parse(text, now.toJSDate(), { forwardDate: true });
  if (!results.length) {
    return null;
  }
  const hasExplicitTime = (result) => {
    const lowered = String(result.text || '').toLowerCase();
    if (/(am|pm)\b/.test(lowered)) return true;
    if (/\d{1,2}:\d{2}/.test(lowered)) return true;
    return result.start?.isCertain?.('hour') || false;
  };

  const preferred = results.find(hasExplicitTime) || results[0];
  const start = preferred.start;
  if (!start) {
    return null;
  }
  const year = start.get('year') || now.year;
  const month = start.get('month') || now.month;
  const day = start.get('day') || now.day;
  const hour = start.get('hour') || 0;
  const minute = start.get('minute') || 0;
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone }
  );
  const date = dt.toJSDate();
  return {
    iso: dt.toUTC().toISO(),
    matchedText: preferred.text,
    date,
    timezone: zone
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
  if (isScheduleQueryText(raw) || isStatusQueryText(raw) || isTimeQueryText(raw)) {
    return '';
  }
  if (isQuestionLike(raw)) {
    return '';
  }
  let text = raw;
  const prefixes = [
    /^just\s+/i,
    /^hey\s+/i,
    /^hey,\s+/i,
    /^can\s+you\s+/i,
    /^hey\s+can\s+you\s+/i,
    /^please\s+/i,
    /^add\s+/i,
    /^create\s+/i,
    /^schedule\s+/i,
    /^add\s+this\s+task\s+to\s+my\s+schedule\s+/i,
    /^add\s+this\s+to\s+my\s+schedule\s+/i,
    /^add\s+this\s+task\s+/i,
    /^add\s+this\s+/i,
    /^remind\s+me\s+to\s+/i,
    /^remind\s+me\s+/i,
    /^make\s+sure\s+to\s+remind\s+me\s+/i,
    /^set\s+a\s+reminder\s+for\s+/i,
    /^set\s+a\s+reminder\s+/i,
    /^set\s+reminder\s+for\s+/i,
    /^set\s+reminder\s+/i,
    /^set\s+/i
  ];
  prefixes.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  text = text.replace(/\"/g, '');
  text = text.replace(/\'/g, '');
  text = text.replace(/\bfor\s+me\s+to\b/gi, '');
  text = text.replace(/\bfor\s+me\b/gi, '');
  text = text.replace(/\bto\s+my\s+schedule\b/gi, '');
  text = text.replace(/\bon\s+my\s+schedule\b/gi, '');
  text = text.replace(/\bto\s+the\s+schedule\b/gi, '');
  text = text.replace(/\bon\s+the\s+schedule\b/gi, '');
  text = text.replace(/\bon\s+time\b/gi, '');
  text = text.replace(/\bremind\s+me\b/gi, '');
  text = text.replace(/^\s*to\s+/i, '');
  text = text.replace(/^\s*build\s+my\s+/i, 'build ');
  text = text.replace(/^(the\s+)?task\s+/i, '');
  text = text.replace(/\b(please|pls)\b/gi, '');
  text = text.replace(/\b(today|tomorrow|tonight)\b/gi, '');
  text = text.replace(/\b(by|for|at)\b\s*$/i, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (ACK_WORDS.has(text.toLowerCase())) return '';
  return text;
}

function extractTaskTitleDeterministic(text, timezone = 'UTC') {
  if (!text) return '';
  if (isScheduleQueryText(text) || isStatusQueryText(text) || isTimeQueryText(text)) {
    return '';
  }
  if (isQuestionLike(text) && !isAddTaskText(text)) {
    return '';
  }
  const recurrence = detectRecurrence(text);
  const timeData = extractTimeData(text, timezone);
  let taskName = text;
  if (timeData?.matchedText) {
    taskName = removeMatchedText(taskName, [timeData.matchedText]);
  }
  if (recurrence?.matchedText) {
    taskName = removeMatchedText(taskName, [recurrence.matchedText]);
  }
  return cleanTaskTitle(taskName);
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

function extractNumberList(text = '') {
  const matches = text.match(/\b\d{1,3}\b/g) || [];
  const numbers = matches.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
  const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  Object.keys(wordMap).forEach((word) => {
    if (text.includes(word)) {
      numbers.push(wordMap[word]);
    }
  });
  return Array.from(new Set(numbers));
}

function buildIntentResponse(intent, confidence, slots = {}, metadata = {}) {
  return { intent, confidence, slots, metadata };
}

async function inferIntentWithLLM(text, timezone = 'UTC', userId = null) {
  if (!text || text.trim().length < 2) return null;
  const prompt = [
    'You are a strict JSON intent classifier for Tenax.',
    'Return JSON only. No prose.',
    'Allowed intents:',
    'add_task, mark_complete, reschedule_task, remove_task, status, schedule_query, time_now, reminder_snooze, reminder_pause, task_delay, greeting, chat',
    'Return format:',
    '{"intent":"", "confidence":0-1, "slots":{}}',
    'Slots guidelines:',
    '- add_task: { taskName?, targetTimeText?, recurrence? }',
    '- reschedule_task: { taskName?, targetTimeText?, deferDays? }',
    '- remove_task: { taskName? }',
    '- schedule_query: { dateText?, rangeDays? }',
    '- reminder_snooze: { minutes? }',
    'Message: ' + text.trim()
  ].join('\n');

  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 120,
      temperature: 0,
      opikMeta: {
        action: 'intent_fallback_llm',
        user_id: userId || undefined
      }
    });
    const raw = response?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const intent = String(parsed?.intent || '').trim();
    const confidence = Number(parsed?.confidence || 0);
    if (!intent || Number.isNaN(confidence)) return null;

    switch (intent) {
      case 'add_task':
        return buildIntentResponse('add_task', Math.max(confidence, 0.6), parseTaskAddition(text, timezone).slots, { llm_fallback: true });
      case 'mark_complete':
        return buildIntentResponse('mark_complete', Math.max(confidence, 0.6), parseCompletion(text).slots, { llm_fallback: true });
      case 'reschedule_task':
        return buildIntentResponse('reschedule_task', Math.max(confidence, 0.6), parseTaskReschedule(text, timezone).slots, { llm_fallback: true });
      case 'remove_task':
        return buildIntentResponse('remove_task', Math.max(confidence, 0.6), parseTaskRemoval(text).slots, { llm_fallback: true });
      case 'status':
        return buildIntentResponse('status', Math.max(confidence, 0.6), {}, { llm_fallback: true });
      case 'schedule_query':
        return buildIntentResponse('schedule_query', Math.max(confidence, 0.6), parseScheduleQuery(text, timezone).slots, { llm_fallback: true });
      case 'time_now':
        return buildIntentResponse('time_now', Math.max(confidence, 0.6), {}, { llm_fallback: true });
      case 'reminder_snooze':
        return buildIntentResponse('reminder_snooze', Math.max(confidence, 0.6), parseReminderSnooze(text).slots, { llm_fallback: true });
      case 'reminder_pause':
        return buildIntentResponse('reminder_pause', Math.max(confidence, 0.6), {}, { llm_fallback: true });
      case 'task_delay':
        return buildIntentResponse('task_delay', Math.max(confidence, 0.6), parseCantFinish(text).slots, { llm_fallback: true });
      case 'greeting':
        return buildIntentResponse('greeting', Math.max(confidence, 0.6), parseGreeting(text).slots, { llm_fallback: true });
      case 'chat':
        return buildIntentResponse('chat', Math.max(confidence, 0.6), {}, { llm_fallback: true });
      default:
        return null;
    }
  } catch (error) {
    console.warn('[NLU] LLM intent fallback failed:', error.message);
    return null;
  }
}

function parseTaskAddition(text, timezone) {
  const normalized = text.trim();
  const recurrence = detectRecurrence(normalized);
  const timeData = extractTimeData(normalized, timezone);
  let taskName = normalized;
  if (timeData?.matchedText) {
    taskName = removeMatchedText(taskName, [timeData.matchedText]);
  }
  if (recurrence?.matchedText) {
    taskName = removeMatchedText(taskName, [recurrence.matchedText]);
  }
  const cleaned = cleanTaskTitle(taskName);
  const normalizedClean = normalize(cleaned);
  if (!cleaned || GENERIC_TASK_NAMES.has(normalizedClean) || cleaned.length < 3) {
    return buildIntentResponse('add_task', 0.7, {
      taskName: '',
      title: '',
      recurrence: recurrence?.value || null,
      targetTime: timeData?.iso || null,
      datetime: timeData?.iso || null
    });
  }
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
  const indexes = extractNumberList(raw);
  const taskName = cleanTaskTitle(raw);
  return buildIntentResponse('remove_task', 0.9, {
    taskName,
    title: taskName,
    taskIndexes: indexes.length ? indexes : undefined
  });
}

function parseTaskReschedule(text, timezone) {
  const deferMatch = text.match(/tomorrow|next day|push/i);
  const deferDays = deferMatch ? 1 : 0;
  const timeData = extractTimeData(text, timezone);
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

function parseTimeNow() {
  return buildIntentResponse('time_now', 0.9, {});
}

function parseScheduleNote(text, timezone) {
  const timeData = extractTimeData(text, timezone);
  return buildIntentResponse('schedule_note', 0.7, {
    note: text.trim(),
    targetTime: timeData?.iso || null,
    matchedText: timeData?.matchedText || null
  });
}

function parseScheduleQuery(text, timezone) {
  const timeData = extractTimeData(text, timezone);
  const normalized = normalize(text);
  const weekdayIndex = WEEKDAY_NAMES.findIndex((day) => normalized.includes(day));
  const dayOffset = /tomorrow|tmrw/i.test(normalized) ? 1 : /next\s+week/i.test(normalized) ? 7 : 0;
  const rangeDays = /weekly schedule|my weekly schedule|week\b/i.test(normalized) ? 7 : 0;
  let targetDate = timeData?.date ? timeData.date.toISOString() : null;
  if (weekdayIndex >= 0 && !targetDate) {
    const now = DateTime.now().setZone(timezone || 'UTC');
    const targetWeekday = weekdayIndex + 1; // luxon: 1=Monday
    let candidate = now.set({ weekday: targetWeekday });
    if (candidate < now) {
      candidate = candidate.plus({ weeks: 1 });
    }
    targetDate = candidate.toISO();
  }
  const needsDate = !targetDate && !dayOffset && !rangeDays;
  return buildIntentResponse('schedule_query', 0.88, {
    targetDate,
    dayOffset,
    rangeDays,
    needsDate
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
  const timezone = options.timezone || 'UTC';

  if (COMPLETION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return parseCompletion(text);
  }

  if (/i\s*(?:have|just)?\s*(completed|finished|done)/i.test(text)) {
    return parseCompletion(text);
  }

  if (/i\s*(couldn't|could not|cant|can't)\s*finish/i.test(normalized)) {
    return parseCantFinish(text);
  }

  if (isScheduleQueryText(text)) {
    return parseScheduleQuery(text, timezone);
  }

  if (isStatusQueryText(text)) {
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
    return parseTaskAddition(text, timezone);
  }

  if (ADD_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    const parsed = parseTaskAddition(text, timezone);
    return buildIntentResponse(parsed.intent, 0.8, parsed.slots);
  }

  if (TIMETABLE_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return buildIntentResponse('upload_timetable', 0.93, {});
  }

  if (REMOVE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return parseTaskRemoval(text);
  }

  if (RESCHEDULE_TRIGGERS.some((trigger) => normalized.startsWith(trigger))) {
    return parseTaskReschedule(text, timezone);
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

  if (TIME_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseTimeNow();
  }

  if (SCHEDULE_NOTE_TRIGGERS.some((phrase) => normalized.includes(phrase))) {
    return parseScheduleNote(text, timezone);
  }

  if (options.allowPlanFallback && normalized.includes('plan')) {
    return parsePlanIntent();
  }

  return parseUnknown(text);
}

function resolvePendingAction(rawText, pendingAction, options = {}) {
  if (!pendingAction || !rawText) {
    return null;
  }
  const normalized = normalize(rawText);
  const timezone = options.timezone || 'UTC';

  if (pendingAction.type === 'task_disambiguation') {
    const numbers = extractNumberList(normalized);
    if (numbers.length) {
      const selected = pendingAction.options.filter((option) => numbers.includes(option.index));
      if (selected.length) {
        return buildIntentResponse(pendingAction.intent, 0.99, {
          ...(pendingAction.slots || {}),
          taskIds: selected.map((option) => option.id),
          taskNames: selected.map((option) => option.title),
          taskId: selected[0]?.id,
          taskName: selected[0]?.title
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
    const timeData = extractTimeData(rawText, timezone);
    if (timeData) {
      return buildIntentResponse(pendingAction.intent, 0.92, {
        ...(pendingAction.slots || {}),
        targetTime: timeData.iso
      }, { clarified: true });
    }
    return null;
  }

  if (pendingAction.type === 'schedule_query') {
    const parsed = parseScheduleQuery(rawText, timezone);
    if (parsed?.slots?.needsDate) {
      return null;
    }
    return buildIntentResponse('schedule_query', 0.9, parsed.slots, { clarified: true });
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

function shouldBypassPendingAction(rawText, pendingAction, options = {}) {
  if (!pendingAction || !rawText) return false;
  const normalized = normalize(rawText);
  const timezone = options.timezone || 'UTC';

  if (!isExplicitIntent(normalized) && !isQuestionLike(normalized)) {
    return false;
  }

  if (pendingAction.type === 'task_disambiguation') {
    const numbers = extractNumberList(normalized);
    if (numbers.length) return false;
  }

  if (pendingAction.type === 'time_confirmation') {
    if (/no fixed time|no time|anytime|flexible/i.test(normalized)) return false;
    if (extractTimeData(rawText, timezone)) return false;
  }

  if (pendingAction.type === 'schedule_query') {
    const parsed = parseScheduleQuery(rawText, timezone);
    if (parsed?.slots && !parsed.slots.needsDate) return false;
  }

  if (pendingAction.type === 'timetable_confirmation') {
    if (/^(yes|yep|sure|go ahead|add all|no|cancel|not now)/i.test(rawText.trim())) {
      return false;
    }
    if (normalized.startsWith('add only')) return false;
  }

  return true;
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

async function extractTaskTitleWithLLM(text, userId) {
  if (!text || text.trim().length < 3) return '';
  if (isScheduleQueryText(text) || isStatusQueryText(text) || isTimeQueryText(text)) {
    return '';
  }
  const prompt = [
    'You are a strict JSON extractor.',
    'Extract the task title the user wants to add.',
    'Return JSON only in the format:',
    '{"title":"<task title or empty>"}',
    'Rules:',
    '- Remove filler like "add", "set a reminder", "please", "today", "by 6pm".',
    '- Keep it short and concrete.',
    '- If no task is present, return empty.',
    'Message: ' + text.trim()
  ].join('\n');

  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 60,
      temperature: 0,
      opikMeta: {
        action: 'extract_task_title',
        user_id: userId
      }
    });
    const raw = response?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return '';
    const parsed = JSON.parse(match[0]);
    const title = String(parsed?.title || '').trim();
    return title;
  } catch (error) {
    console.warn('[NLU] Task title extractor failed:', error.message);
    return '';
  }
}

module.exports = {
  parseMessage,
  resolvePendingAction,
  detectRecurrence,
  extractTimeData,
  isQuestionLike,
  cleanTaskTitle,
  isScheduleQueryText,
  isStatusQueryText,
  isTimeQueryText,
  isAddTaskText,
  parseResolutionBuilderIntent,
  inferCompletionWithLLM,
  inferIntentWithLLM,
  extractTaskTitleWithLLM,
  extractTaskTitleDeterministic,
  extractNumberList,
  isExplicitIntent,
  shouldBypassPendingAction
};
