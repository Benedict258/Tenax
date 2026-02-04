const Task = require('../models/Task');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const UserChannel = require('../models/UserChannel');
const agentService = require('./agent');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('./metricsStore');
const ruleStateService = require('./ruleState');
const nluService = require('./nluService');
const conversationContext = require('./conversationContext');
const reminderPreferences = require('./reminderPreferences');
const resolutionBuilderService = require('./resolutionBuilderAgent');
const scheduleService = require('./scheduleService');
const { parseCoursesFromText, buildConfirmationSummary } = require('./timetableParser');
const { DateTime } = require('luxon');
const QueueService = require('./queue');
const notificationService = require('./notificationService');
const toneController = require('./toneController');
const { composeMessage } = require('./messageComposer');
const conversationAgent = require('./conversationAgent');
const scheduleService = require('./scheduleService');
const opikAgentTracer = require('../instrumentation/opikTracer');



const GUARD_ALLOWED_INTENTS = new Set([
  'mark_complete',
  'status',
  'help',
  'progress_review',
  'plan_overview',
  'daily_start',
  'daily_end',
  'reminder_snooze',
  'reminder_pause',
  'greeting',
  'time_now',
  'schedule_query'
]);

const P1_KEYWORDS = ['p1', 'deep work', 'priority 1', 'critical focus'];

const normalizeTitle = (value = '') => value.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        const substitution = matrix[j - 1][i - 1] + 1;
        const insertion = matrix[j][i - 1] + 1;
        const deletion = matrix[j - 1][i] + 1;
        matrix[j][i] = Math.min(substitution, insertion, deletion);
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return 0;
  const distance = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length) || 1;
  return Math.max(0, 1 - distance / maxLen);
}

function formatTimeForUser(iso, timezone = 'UTC') {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone || 'UTC');
  if (!dt.isValid) return null;
  return dt.toFormat('hh:mm a');
}

function inferSeverity(taskTitle = '') {
  return P1_KEYWORDS.some((keyword) => taskTitle.toLowerCase().includes(keyword)) ? 'p1' : 'p2';
}

function resolveTaskCandidate(tasks, slots = {}) {
  if (!tasks?.length) {
    return { match: null, options: [] };
  }

  if (slots.taskId) {
    const match = tasks.find((task) => task.id === slots.taskId);
    return { match: match || null, options: [] };
  }

  const query = slots.taskName || '';
  if (!query) {
    if (tasks.length === 1) {
      return { match: tasks[0], options: [] };
    }
    return { match: null, options: tasks.slice(0, 5) };
  }

  const scored = tasks
    .map((task) => ({ task, score: similarity(task.title, query) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.35) {
    return { match: null, options: [] };
  }

  const closeMatches = scored.filter((entry) => Math.abs(entry.score - best.score) < 0.05 && entry.score >= 0.35);
  if (closeMatches.length > 1) {
    return { match: null, options: closeMatches.map((entry) => entry.task).slice(0, 5) };
  }

  return { match: best.task, options: [] };
}

function buildSession({ user, channel, transport, conversation }) {
  const replies = [];
  const send = async (message, metadata = {}) => {
    if (transport?.send) {
      await transport.send(message, metadata);
    }
    replies.push({ text: message, metadata });
    conversationContext.appendTurn(user.id, 'agent', message, metadata);
    await Message.create({
      conversation_id: conversation.id,
      user_id: user.id,
      channel,
      role: 'assistant',
      text: message,
      metadata
    });
  };

  return {
    user,
    channel,
    conversation,
    send,
    replies
  };
}

function requestTaskClarification(session, intent, tasks, prompt, slots = {}) {
  const options = tasks.slice(0, 5).map((task, index) => ({
    id: task.id,
    title: task.title,
    index: index + 1
  }));

  conversationContext.setPendingAction(session.user.id, {
    type: 'task_disambiguation',
    intent,
    options,
    slots
  });

  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const timezone = session.user?.timezone || 'UTC';
  const taskList = options.map((option) => {
    const task = taskMap.get(option.id);
    const timeLabel = task?.start_time ? formatTimeForUser(task.start_time, timezone) : null;
    return `${option.index}. ${option.title}${timeLabel ? ` (${timeLabel})` : ''}`;
  }).join('\n');
  return {
    action: intent,
    requires_selection: true,
    prompt,
    options,
    optionsList: taskList
  };
}

function complainAboutMissingTask() {
  return {
    action: 'task_not_found',
    message: "I couldn't find that one. Can you give me a bit more detail? You can also say \"status\" to see the active list."
  };
}

async function handleMarkComplete(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  if (!tasks.length) {
    return { action: 'mark_complete', status: 'no_tasks' };
  }
  const recentTaskId = !slots?.taskName ? metricsStore.getRecentReminderTask(session.user.id) : null;
  const recentTask = recentTaskId ? tasks.find((task) => task.id === recentTaskId) : null;
  const resolution = recentTask ? { match: recentTask, options: [] } : resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    const tone = toneController.buildToneContext(session.user).tone;
    const prompt = composeMessage('clarify', tone, { name: session.user?.name || 'there' }) || 'Which task should I check off?';
    return requestTaskClarification(session, 'mark_complete', resolution.options, prompt, slots);
  }

  if (!resolution.match) {
    return complainAboutMissingTask();
  }

  const matchedTask = resolution.match;
  const reminderInfo = metricsStore.getReminderForTask(session.user.id, matchedTask.id);
  await Task.updateStatus(matchedTask.id, 'done');
  await agentService.trackTaskCompletion(
    session.user,
    matchedTask,
    session.channel,
    !!reminderInfo,
    reminderInfo?.sentAt || null
  );
  await notificationService.createNotification(session.user.id, {
    type: 'execution',
    title: 'Task completed',
    message: matchedTask.title,
    metadata: { task_id: matchedTask.id, channel: session.channel }
  });

  return {
    action: 'mark_complete',
    status: 'completed',
    task: matchedTask
  };
}

async function handleStatus(session, p1Tasks = []) {
  const timezone = session.user?.timezone || 'UTC';
  const [todoTasks, doneTasks, stats, scheduleBlocks] = await Promise.all([
    Task.findByUserId(session.user.id, 'todo'),
    Task.findByUserId(session.user.id, 'done'),
    agentService.calculateCompletionStats(session.user),
    scheduleService.buildScheduleBlockInstances(session.user.id, new Date(), timezone)
  ]);

  const streak = metricsStore.getStreak(session.user.id);
  const goal = session.user?.goal || session.user?.primary_goal;
  const role = session.user?.role;
  const focusLine = goal ? `Focus: ${goal}${role ? ` (${role})` : ''}` : role ? `Role: ${role}` : '';

  const todayBlocks = (scheduleBlocks || [])
    .filter((block) => block.start_time_utc)
    .map((block) => ({
      id: block.id,
      title: block.title,
      location: block.location,
      category: block.category,
      start_time: block.start_time_utc,
      end_time: block.end_time_utc,
      timeLabel: formatTimeForUser(block.start_time_utc, timezone),
      endLabel: formatTimeForUser(block.end_time_utc, timezone)
    }));

  if (todayBlocks.length) {
    await QueueService.scheduleScheduleBlockReminders(session.user);
  }

  return {
    action: 'status',
    todoTasks,
    doneTasks,
    stats,
    streak,
    p1Tasks,
    focusLine,
    scheduleBlocks: todayBlocks
  };
}

async function handleAddTask(session, slots) {
  if (slots?.rawText && (nluService.isScheduleQueryText(slots.rawText) || nluService.isStatusQueryText(slots.rawText) || nluService.isTimeQueryText(slots.rawText))) {
    return { action: 'chat', ignored: true };
  }
  if (slots?.rawText && nluService.isQuestionLike(slots.rawText) && !nluService.isAddTaskText(slots.rawText)) {
    return { action: 'chat', ignored: true };
  }
  let title = slots.taskName?.trim();
  if (!title) {
    const deterministic = nluService.extractTaskTitleDeterministic(slots.rawText || '', session.user.timezone || 'UTC');
    title = deterministic?.trim();
  }
  if (!title) {
    const extracted = await nluService.extractTaskTitleWithLLM(slots.rawText || '', session.user.id);
    title = extracted?.trim();
  }
  if (!title) {
    return { action: 'add_task', requires_title: true };
  }
  if (nluService.isScheduleQueryText(title) || nluService.isStatusQueryText(title) || nluService.isTimeQueryText(title)) {
    return { action: 'chat', ignored: true };
  }

  if (!slots.targetTime && !slots.noFixedTime) {
    conversationContext.setPendingAction(session.user.id, {
      type: 'time_confirmation',
      intent: 'add_task',
      slots: {
        taskName: title,
        recurrence: slots.recurrence || null
      }
    });
    return { action: 'add_task', requires_time: true };
  }

  const severity = inferSeverity(title);
  let startTime = slots.targetTime || null;
  const metadata = {};
  if (startTime && scheduleService.scheduleFeatureFlag()) {
    try {
      const durationMinutes = Number(slots.durationMinutes) || 30;
      const adjustment = await scheduleService.findAdjustedReminderTime(
        session.user.id,
        startTime,
        durationMinutes
      );
      if (adjustment?.conflictBlock) {
        metadata.schedule_conflict = adjustment.conflictBlock;
        const originalTime = new Date(startTime).toISOString();
        const adjustedIso = adjustment.adjustedTime ? new Date(adjustment.adjustedTime).toISOString() : originalTime;
        if (adjustedIso !== originalTime) {
          metadata.schedule_shifted_from = originalTime;
          metadata.schedule_shifted = true;
          startTime = adjustedIso;
          await scheduleService.recordScheduleConflict({
            userId: session.user.id,
            conflictType: 'task_vs_schedule',
            conflictWindow: adjustment.conflictBlock,
            resolution: 'task_shifted',
            metadata: { original_time: originalTime, shifted_time: adjustedIso }
          });
        } else {
          await scheduleService.recordScheduleConflict({
            userId: session.user.id,
            conflictType: 'task_vs_schedule',
            conflictWindow: adjustment.conflictBlock,
            resolution: 'conflict_detected',
            metadata: { original_time: originalTime }
          });
        }
      }
    } catch (error) {
      console.warn('[AgentPipeline] Schedule conflict check failed:', error.message);
    }
  }

  const task = await Task.create({
    user_id: session.user.id,
    title: nluService.cleanTaskTitle(title) || title,
    category: severity === 'p1' ? 'P1' : 'Other',
    start_time: startTime,
    recurrence: slots.recurrence || null,
    created_via: session.channel,
    severity,
    metadata
  });
  await notificationService.createNotification(session.user.id, {
    type: 'task',
    title: 'Task added',
    message: task.title,
    metadata: { task_id: task.id, channel: session.channel }
  });

  if (severity === 'p1') {
    await ruleStateService.refreshUserState(session.user.id);
  }

  if (task.start_time) {
    await QueueService.scheduleTaskReminders(session.user, task);
  }

  const timingText = startTime
    ? ` for ${formatTimeForUser(startTime, session.user?.timezone || 'UTC')}`
    : '';
  const recurrenceText = slots.recurrence ? ` (${slots.recurrence})` : '';
  return {
    action: 'add_task',
    status: 'created',
    task,
    timingText,
    recurrenceText,
    severity
  };
}

async function handleRemoveTask(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  if (Array.isArray(slots?.taskIds) && slots.taskIds.length) {
    const toRemove = tasks.filter((task) => slots.taskIds.includes(task.id));
    if (!toRemove.length) {
      return complainAboutMissingTask();
    }
    await Promise.all(toRemove.map((task) => Task.updateStatus(task.id, 'archived')));
    return { action: 'remove_task', status: 'removed', tasks: toRemove };
  }
  if (Array.isArray(slots?.taskIndexes) && slots.taskIndexes.length) {
    const indexMatches = slots.taskIndexes
      .map((index) => tasks[index - 1])
      .filter(Boolean);
    if (indexMatches.length) {
      await Promise.all(indexMatches.map((task) => Task.updateStatus(task.id, 'archived')));
      return { action: 'remove_task', status: 'removed', tasks: indexMatches };
    }
  }
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    return requestTaskClarification(session, 'remove_task', resolution.options, 'Which task should I cancel?', slots);
  }

  if (!resolution.match) {
    return complainAboutMissingTask();
  }

  await Task.updateStatus(resolution.match.id, 'archived');
  return { action: 'remove_task', status: 'removed', task: resolution.match };
}

async function handleRescheduleTask(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    return requestTaskClarification(session, 'reschedule_task', resolution.options, 'Which task should I move?', slots);
  }

  if (!resolution.match) {
    return complainAboutMissingTask();
  }

  if (!slots.targetTime && !slots.deferDays) {
    conversationContext.setPendingAction(session.user.id, {
      type: 'time_confirmation',
      intent: 'reschedule_task',
      slots: { taskId: resolution.match.id, taskName: resolution.match.title }
    });
    return { action: 'reschedule_task', requires_time: true, task: resolution.match };
  }

  const nextStart = slots.targetTime ? new Date(slots.targetTime) : new Date(resolution.match.start_time || Date.now());
  if (slots.deferDays) {
    nextStart.setDate(nextStart.getDate() + slots.deferDays);
  }

  const updatedTask = await Task.updateFields(resolution.match.id, {
    start_time: nextStart.toISOString()
  });
  await QueueService.scheduleTaskReminders(session.user, updatedTask);

  return {
    action: 'reschedule_task',
    status: 'rescheduled',
    task: updatedTask,
    newTime: nextStart.toISOString()
  };
}

async function handleTaskDelay(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    return requestTaskClarification(session, 'task_delay', resolution.options, 'Which task needs a rain check?', slots);
  }

  if (!resolution.match) {
    return complainAboutMissingTask();
  }

  const newDate = new Date(resolution.match.start_time || Date.now());
  newDate.setDate(newDate.getDate() + 1);
  await Task.updateFields(resolution.match.id, { start_time: newDate.toISOString(), status: 'todo' });
  return {
    action: 'task_delay',
    status: 'deferred',
    task: resolution.match,
    newTime: newDate.toISOString()
  };
}

async function handleProgressReview(session) {
  const stats = await agentService.calculateCompletionStats(session.user);
  const reminderStats = metricsStore.getReminderStats(session.user.id);
  const streak = metricsStore.getStreak(session.user.id);
  return {
    action: 'progress_review',
    stats,
    reminderStats,
    streak
  };
}

async function handlePlanOverview(session, p1Tasks) {
  const todoTasks = await Task.findByUserId(session.user.id, 'todo');
  return {
    action: 'plan_overview',
    todoTasks,
    p1Tasks
  };
}

async function handleDailyStart(session) {
  const tasks = await Task.getTodaysTasks(session.user.id, session.user?.timezone || 'UTC');
  const p1Tasks = tasks.filter((task) => task.severity === 'p1');
  const timezone = session.user?.timezone || 'UTC';
  const scheduleBlocks = await scheduleService.buildScheduleBlockInstances(session.user.id, new Date(), timezone);
  const todayBlocks = (scheduleBlocks || [])
    .filter((block) => block.start_time_utc)
    .map((block) => ({
      id: block.id,
      title: block.title,
      location: block.location,
      category: block.category,
      start_time: block.start_time_utc,
      end_time: block.end_time_utc,
      timeLabel: formatTimeForUser(block.start_time_utc, timezone),
      endLabel: formatTimeForUser(block.end_time_utc, timezone)
    }));
  if (todayBlocks.length) {
    await QueueService.scheduleScheduleBlockReminders(session.user);
  }
  return {
    action: 'daily_start',
    tasks,
    p1Tasks,
    scheduleBlocks: todayBlocks
  };
}

async function handleDailyEnd(session) {
  const stats = await agentService.calculateCompletionStats(session.user);
  const summary = await agentService.generateEODSummary(session.user, stats);
  return { action: 'daily_end', summary };
}

async function handleReminderSnooze(session, slots) {
  const minutes = slots.minutes || 30;
  const until = reminderPreferences.snooze(session.user.id, minutes);
  const resumeTime = formatTimeForUser(new Date(until).toISOString(), session.user?.timezone || 'UTC');
  return { action: 'reminder_snooze', minutes, resumeTime };
}

async function handleReminderPause(session) {
  reminderPreferences.pauseForToday(session.user.id);
  return { action: 'reminder_pause' };
}

async function handleHelp(session) {
  return {
    action: 'help',
    tips: [
      'Add tasks (e.g., "remind me to read 9pm")',
      'Mark completions (e.g., "done with deep work")',
      'Show your plan ("status" or "what\'s next")',
      'Move tasks ("move study to 8pm")',
      'Snooze reminders ("snooze 30")',
      'Start the Resolution Builder'
    ]
  };
}

async function handleGreeting(session) {
  return { action: 'greeting' };
}

async function handleTimeNow(session) {
  const timezone = session.user?.timezone || 'UTC';
  const now = DateTime.now().setZone(timezone);
  return {
    action: 'time_now',
    currentTime: now.toFormat('hh:mm a'),
    timezone
  };
}
async function handleScheduleNote(session, slots) {
  const timeLabel = slots?.targetTime
    ? formatTimeForUser(slots.targetTime, session.user?.timezone || 'UTC')
    : null;
  return { action: 'schedule_note', timeLabel };
}

async function handleScheduleQuery(session, slots) {
  const timezone = session.user?.timezone || 'UTC';
  if (slots?.needsDate) {
    conversationContext.setPendingAction(session.user.id, {
      type: 'schedule_query',
      intent: 'schedule_query',
      slots: {}
    });
    return {
      action: 'schedule_query',
      requires_date: true
    };
  }
  const baseDate = slots?.targetDate ? new Date(slots.targetDate) : new Date();
  if (slots?.dayOffset) {
    baseDate.setDate(baseDate.getDate() + slots.dayOffset);
  }
  const rangeDays = slots?.rangeDays || 0;
  const datesToCheck = rangeDays > 0
    ? Array.from({ length: rangeDays }).map((_, idx) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + idx);
      return d;
    })
    : [baseDate];

  const scheduleBlocks = [];
  for (const date of datesToCheck) {
    const blocksForDay = await scheduleService.buildScheduleBlockInstances(session.user.id, date, timezone);
    const dateLabel = DateTime.fromJSDate(date).setZone(timezone).toFormat('cccc');
    const dayStart = DateTime.fromJSDate(date).setZone(timezone).startOf('day').toUTC();
    const dayEnd = dayStart.plus({ days: 1 });
    const tasksForDay = await Task.listByDateRange(session.user.id, dayStart.toISO(), dayEnd.toISO());
    blocksForDay
      .filter((block) => block.start_time_utc)
      .forEach((block) => {
        scheduleBlocks.push({
          id: block.id,
          title: block.title,
          location: block.location,
          category: block.category,
          start_time: block.start_time_utc,
          end_time: block.end_time_utc,
          timeLabel: formatTimeForUser(block.start_time_utc, timezone),
          endLabel: formatTimeForUser(block.end_time_utc, timezone),
          dayLabel: dateLabel
        });
      });
    tasksForDay
      .filter((task) => task.start_time)
      .forEach((task) => {
        scheduleBlocks.push({
          id: task.id,
          title: task.title,
          location: null,
          category: task.category || 'Task',
          start_time: task.start_time,
          end_time: task.end_time || null,
          timeLabel: formatTimeForUser(task.start_time, timezone),
          endLabel: task.end_time ? formatTimeForUser(task.end_time, timezone) : null,
          dayLabel: dateLabel,
          source: 'task'
        });
      });
  }

  const summaryLines = [];
  const grouped = scheduleBlocks.reduce((acc, block) => {
    const key = block.dayLabel || 'Upcoming';
    if (!acc[key]) acc[key] = [];
    acc[key].push(block);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([dayLabel, blocks]) => {
    const items = blocks
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
      .map((block) => {
        const timeRange = block.endLabel ? `${block.timeLabel} - ${block.endLabel}` : block.timeLabel || 'anytime';
        return `- ${block.title} (${timeRange})`;
      });
    summaryLines.push(`${dayLabel}:`);
    summaryLines.push(...items);
  });

  return {
    action: 'schedule_query',
    scheduleBlocks,
    targetDate: baseDate.toISOString(),
    rangeDays,
    summary: summaryLines.length ? summaryLines.join('\n') : ''
  };
}


function getNextOccurrenceISO(dayOfWeek, time, timezone = 'UTC') {
  const now = DateTime.now().setZone(timezone);
  let candidate = now;
  const normalizedDay = ((dayOfWeek % 7) + 7) % 7;
  while (candidate.weekday % 7 !== normalizedDay) {
    candidate = candidate.plus({ days: 1 });
  }
  let withTime = candidate.set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });
  if (withTime <= now) {
    withTime = withTime.plus({ days: 7 });
  }
  return withTime.toUTC().toISO();
}

async function handleTimetableUpload(session, rawText) {
  const entries = parseCoursesFromText(rawText);
  if (!entries.length) {
    return { action: 'timetable_none' };
  }

  conversationContext.setPendingAction(session.user.id, {
    type: 'timetable_confirmation',
    intent: 'import_timetable_confirm',
    entries
  });

  const summary = buildConfirmationSummary(entries);
  return { action: 'timetable_confirm', entries, summary };
}

async function handleTimetableConfirmation(session, slots) {
  const entries = slots.entries || [];
  if (!entries.length) {
    return { action: 'timetable_cancelled' };
  }

  const priority = slots.priority || 'P1';
  const timezone = session.user.timezone || 'UTC';
  const tasksToCreate = entries.map((entry) => ({
    user_id: session.user.id,
    title: entry.title,
    category: 'Academic',
    start_time: getNextOccurrenceISO(entry.dayOfWeek, entry.start, timezone),
    duration_minutes: (entry.end.hour * 60 + entry.end.minute) - (entry.start.hour * 60 + entry.start.minute),
    recurrence: {
      pattern: 'weekly',
      day_of_week: entry.dayOfWeek
    },
    severity: priority?.toLowerCase() === 'p1' ? 'p1' : 'p2',
    priority,
    created_via: session.channel,
    metadata: {
      source: 'timetable_import',
      day_of_week: entry.dayOfWeek
    }
  }));

  await Task.createMany(tasksToCreate);
  if (tasksToCreate.some((task) => task.severity === 'p1')) {
    await ruleStateService.refreshUserState(session.user.id);
  }
  return { action: 'timetable_imported', entries: entries.length };
}

async function routeIntent(session, parsed, extras) {
  const p1Tasks = await ruleStateService.getActiveP1Tasks(session.user.id);

  switch (parsed.intent) {
    case 'mark_complete':
      return handleMarkComplete(session, parsed.slots);
    case 'status':
      return handleStatus(session, p1Tasks);
    case 'add_task':
      return handleAddTask(session, { ...(parsed.slots || {}), rawText: extras.rawText || '' });
    case 'remove_task':
      return handleRemoveTask(session, parsed.slots);
    case 'reschedule_task':
      return handleRescheduleTask(session, parsed.slots);
    case 'task_delay':
      return handleTaskDelay(session, parsed.slots);
    case 'plan_overview':
      return handlePlanOverview(session, p1Tasks);
    case 'progress_review':
      return handleProgressReview(session);
    case 'daily_start':
      return handleDailyStart(session);
    case 'daily_end':
      return handleDailyEnd(session);
    case 'reminder_snooze':
      return handleReminderSnooze(session, parsed.slots);
    case 'reminder_pause':
      return handleReminderPause(session);
    case 'help':
      return handleHelp(session);
    case 'greeting':
      return handleGreeting(session);
    case 'time_now':
      return handleTimeNow(session);
    case 'schedule_note':
      return handleScheduleNote(session, parsed.slots);
    case 'schedule_query':
      return handleScheduleQuery(session, parsed.slots);
    case 'upload_timetable':
      return handleTimetableUpload(session, extras.rawText || '');
    case 'import_timetable_confirm':
      return handleTimetableConfirmation(session, parsed.slots);
    case 'timetable_cancel':
      return { action: 'timetable_cancelled' };
    default:
      return { action: 'chat' };
  }
}

async function resolveUser({ user, userId, channel, externalId }) {
  if (user) return user;
  if (userId) {
    return User.findById(userId);
  }
  if (channel === 'whatsapp' && externalId) {
    return UserChannel.findUserByChannel(channel, externalId);
  }
  return null;
}

async function handleMessage({
  user,
  userId,
  channel,
  text,
  transport,
  externalId,
  metadata = {},
  raw
}) {
  const resolvedUser = await resolveUser({ user, userId, channel, externalId });
  if (!resolvedUser) {
    throw new Error('User not found for message ingestion');
  }

  let parsed = nluService.parseResolutionBuilderIntent(text);
  const resolutionActive = await resolutionBuilderService.isActive(resolvedUser.id);

  if (parsed?.intent === 'unknown') {
    const completionFallback = await nluService.inferCompletionWithLLM(text, resolvedUser.id);
    if (completionFallback) {
      parsed = completionFallback;
    }
  }

  if (parsed?.intent === 'start_resolution_builder' || resolutionActive) {
    const isStart = parsed?.intent === 'start_resolution_builder';
    const response = isStart
      ? await resolutionBuilderService.startSession(resolvedUser)
      : await resolutionBuilderService.handleMessage(resolvedUser, text);

    const metadataPayload = {
      intent: isStart ? 'resolution_builder_start' : 'resolution_builder_step',
      step: response?.state?.step,
      state: response?.state,
      created_tasks: response?.created_tasks || null
    };
    const replyText = response?.reply || '';
    if (replyText && transport?.send) {
      await transport.send(replyText, metadataPayload);
    }
    const replies = replyText ? [{ text: replyText, metadata: metadataPayload }] : [];
    return {
      replies,
      conversationId: null,
      intent: isStart ? 'resolution_builder_start' : 'resolution_builder_step'
    };
  }

  const conversation = await Conversation.ensureActive(resolvedUser.id);
  metricsStore.recordUserMessage(resolvedUser.id);

  await Message.create({
    conversation_id: conversation.id,
    user_id: resolvedUser.id,
    channel,
    role: 'user',
    text,
    metadata: { ...metadata, direction: 'inbound' }
  });

  conversationContext.appendTurn(resolvedUser.id, 'user', text, {
    channel,
    ...metadata
  });

  const pendingAction = conversationContext.getPendingAction(resolvedUser.id);

  if (pendingAction) {
    parsed = nluService.resolvePendingAction(text, pendingAction, { timezone: resolvedUser.timezone || 'UTC' });
    if (parsed) {
      conversationContext.consumePendingAction(resolvedUser.id);
      if (pendingAction.type === 'timetable_confirmation') {
        parsed.slots = {
          ...(parsed.slots || {}),
          entries: pendingAction.entries
        };
      }
    }
  }

  const deterministic = nluService.parseMessage(text, { allowPlanFallback: true, timezone: resolvedUser.timezone || 'UTC' });
  if (!parsed) {
    parsed = deterministic;
  }

  if (!scheduleQuery && !statusQuery && !timeQuery && (parsed?.intent === 'unknown' || (parsed?.confidence || 0) < 0.5)) {
    const llmIntent = await nluService.inferIntentWithLLM(text, resolvedUser.timezone || 'UTC', resolvedUser.id);
    if (llmIntent) {
      parsed = llmIntent;
    }
  }

  const scheduleQuery = nluService.isScheduleQueryText(text);
  const statusQuery = nluService.isStatusQueryText(text);
  const timeQuery = nluService.isTimeQueryText(text);
  const addTaskSignal = nluService.isAddTaskText(text);
  const isQuestion = nluService.isQuestionLike(text);

  if (scheduleQuery) {
    parsed = nluService.parseMessage(text, { timezone: resolvedUser.timezone || 'UTC' });
  } else if (statusQuery) {
    parsed = nluService.parseMessage(text, { timezone: resolvedUser.timezone || 'UTC' });
  } else if (timeQuery) {
    parsed = nluService.parseMessage(text, { timezone: resolvedUser.timezone || 'UTC' });
  } else if ((scheduleQuery || statusQuery || timeQuery) && deterministic?.intent && deterministic.intent !== 'unknown') {
    parsed = deterministic;
  }

  if (parsed?.intent === 'add_task' && (!addTaskSignal || scheduleQuery || statusQuery || timeQuery) &&
      deterministic?.intent && deterministic.intent !== 'unknown') {
    parsed = deterministic;
  }
  if (parsed?.intent === 'add_task' && isQuestion && !addTaskSignal) {
    parsed = deterministic?.intent && deterministic.intent !== 'unknown'
      ? deterministic
      : { intent: 'chat', confidence: 0.5, slots: {} };
  }

  if (parsed?.intent === 'unknown') {
    const completionFallback = await nluService.inferCompletionWithLLM(text, resolvedUser.id);
    if (completionFallback) {
      parsed = completionFallback;
    }
  }

  const session = buildSession({ user: resolvedUser, channel, transport, conversation });
  const ruleState = await ruleStateService.getUserState(resolvedUser.id);
  const guardActive = ruleStateService.shouldBlockNonCompletion(ruleState);
  const p1Tasks = await ruleStateService.getActiveP1Tasks(resolvedUser.id);

  if (guardActive && !GUARD_ALLOWED_INTENTS.has(parsed.intent)) {
    const guardMessage = ruleStateService.buildGuardrailMessage(p1Tasks);
    const memoryTurns = conversationContext.getTurns(resolvedUser.id);
    const reply = await conversationAgent.generateAssistantReply({
      user: resolvedUser,
      message: text,
      intent: 'p1_guard',
      toolResult: { action: 'p1_guard', message: guardMessage, tasks: p1Tasks },
      memoryTurns,
      context: { tasks: await Task.getTodaysTasks(resolvedUser.id, resolvedUser.timezone || 'UTC') }
    });
    await session.send(reply, { intent: 'p1_guard' });
    await ruleStateService.recordSurface({
      userId: resolvedUser.id,
      tasks: p1Tasks,
      surfaceType: 'inbound_guard',
      channel,
      metadata: { blocked_intent: parsed.intent }
    });
    await ruleStateService.recordBlockedAction({
      userId: resolvedUser.id,
      action: parsed.intent,
      channel,
      metadata: { body: text }
    });
    return { replies: session.replies, conversationId: conversation.id, intent: parsed.intent };
  }

  await opikLogger.log('log_intent_parsing', {
    user_id: resolvedUser.id,
    message: text,
    intent: parsed.intent,
    confidence: parsed.confidence || 0,
    slots: parsed.slots || {},
    channel
  });

  const lowFrictionIntents = new Set(['status', 'mark_complete', 'add_task', 'reschedule_task', 'remove_task', 'time_now', 'schedule_note', 'schedule_query']);
  const actionableIntent = parsed?.intent !== 'unknown'
    && ((parsed?.confidence || 0) >= 0.45 || lowFrictionIntents.has(parsed.intent));
  const intentToUse = actionableIntent ? parsed.intent : 'chat';
  const toolResult = intentToUse === 'chat'
    ? { action: 'chat' }
    : await routeIntent(session, parsed, { rawText: text });
  const finalIntent = toolResult?.action === 'chat' && intentToUse === 'add_task'
    ? 'chat'
    : intentToUse;

  const memoryTurns = conversationContext.getTurns(resolvedUser.id);
  const [todaysTasks, stats] = await Promise.all([
    Task.getTodaysTasks(resolvedUser.id, resolvedUser.timezone || 'UTC'),
    agentService.calculateCompletionStats(resolvedUser)
  ]);
  const userTimezone = resolvedUser.timezone || 'UTC';
  const currentTime = intentToUse === 'time_now'
    ? DateTime.now().setZone(userTimezone).toFormat('hh:mm a')
    : '';

  const reply = await conversationAgent.generateAssistantReply({
    user: resolvedUser,
    message: text,
    intent: finalIntent,
    toolResult,
    memoryTurns,
    context: {
      tasks: todaysTasks,
      stats,
      reminderStats: metricsStore.getReminderStats(resolvedUser.id),
      currentTime,
      timezone: userTimezone
    }
  });

  await session.send(reply, { intent: finalIntent });
  try {
    await opikAgentTracer.traceAgentOutput({
      messageType: 'conversation',
      userId: resolvedUser.id,
      userGoal: resolvedUser?.goal || resolvedUser?.primary_goal,
      userSchedule: todaysTasks || [],
      taskMetadata: {
        intent: finalIntent,
        schedule_blocks: toolResult?.scheduleBlocks?.length || 0
      },
      generatedText: reply,
      promptVersion: 'conversation_agent_v2',
      experimentId: resolvedUser?.experiment_id
    });
  } catch (traceError) {
    console.warn('[Opik] Failed to trace conversation:', traceError.message);
  }
  await Conversation.touch(conversation.id);

  return {
    replies: session.replies,
    conversationId: conversation.id,
    intent: finalIntent
  };
}

async function getRecentMessages(userId, limit = 40) {
  const conversation = await Conversation.ensureActive(userId);
  const messages = await Message.findRecentByConversation(conversation.id, limit);
  return { conversation, messages };
}

module.exports = {
  handleMessage,
  getRecentMessages
};
