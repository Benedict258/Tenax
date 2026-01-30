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
const { parseCoursesFromText, buildConfirmationSummary } = require('./timetableParser');
const { DateTime } = require('luxon');
const QueueService = require('./queue');
const notificationService = require('./notificationService');
const toneController = require('./toneController');
const { composeMessage } = require('./messageComposer');

const UNKNOWN_REPLY_POOL = [
  'Got it. Want me to add a task, mark something complete, or show your plan? You can also start the Resolution Builder or upload a timetable.',
  'I am here. Tell me what you want next — add a task, check off a task, or pull today’s plan.',
  'Okay. If this was about your schedule, try “add class 11am weekly” or upload a timetable. Otherwise say “status” or tell me what to add.'
];

const pickRandomReply = (messages) => messages[Math.floor(Math.random() * messages.length)];

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
  'greeting'
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

async function requestTaskClarification(session, intent, tasks, prompt, slots = {}) {
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
  const taskList = options.map((option) => {
    const task = taskMap.get(option.id);
    const timeLabel = task?.start_time
      ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;
    return `${option.index}. ${option.title}${timeLabel ? ` (${timeLabel})` : ''}`;
  }).join('\n');
  await session.send(
    `${prompt}\n\n${taskList}\n\nReply with the number or the task name.`,
    { intent: 'clarify_task', options: options.map((option) => option.id) }
  );
}

async function complainAboutMissingTask(session) {
  await session.send(
    "I couldn't find that one. Can you give me a bit more detail? You can also say \"status\" to see the active list.",
    { intent: 'task_not_found' }
  );
}

async function handleMarkComplete(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  if (!tasks.length) {
    await session.send('You have no active tasks right now. Want me to add something?', { intent: 'mark_complete' });
    return;
  }
  const recentTaskId = !slots?.taskName ? metricsStore.getRecentReminderTask(session.user.id) : null;
  const recentTask = recentTaskId ? tasks.find((task) => task.id === recentTaskId) : null;
  const resolution = recentTask ? { match: recentTask, options: [] } : resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    const tone = toneController.buildToneContext(session.user).tone;
    const prompt = composeMessage('clarify', tone, { name: session.user?.name || 'there' }) || 'Which task should I check off?';
    await requestTaskClarification(session, 'mark_complete', resolution.options, prompt, slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(session);
    return;
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

  const toneContext = toneController.buildToneContext(session.user);
  const completionTone = toneContext.tone;
  const completionLine = composeMessage('complete', completionTone, {
    title: matchedTask.title,
    name: session.user?.name || 'there'
  }) || `✅ Marked "${matchedTask.title}" complete.`;

  await session.send(completionLine, { intent: 'mark_complete' });
}

async function handleStatus(session, p1Tasks = []) {
  const [todoTasks, doneTasks, stats] = await Promise.all([
    Task.findByUserId(session.user.id, 'todo'),
    Task.findByUserId(session.user.id, 'done'),
    agentService.calculateCompletionStats(session.user)
  ]);

  const streak = metricsStore.getStreak(session.user.id);
  const banner = p1Tasks.length ? `${ruleStateService.buildBanner(p1Tasks)}\n\n` : '';
  const toneContext = toneController.buildToneContext(session.user, stats);
  const statusIntro = composeMessage('status', toneContext.tone, { name: session.user?.name || 'there' }) || 'Here is the lineup:';
  const goal = session.user?.goal || session.user?.primary_goal;
  const role = session.user?.role;
  const focusLine = goal ? `Focus: ${goal}${role ? ` (${role})` : ''}` : role ? `Role: ${role}` : '';

  if (!todoTasks.length) {
    await session.send(
      `${banner}Everything's wrapped for today. ${doneTasks.length} tasks ✅\nCompletion rate: ${stats.completion_rate}%\nCurrent streak: ${streak} day${streak === 1 ? '' : 's'}.${focusLine ? `\n${focusLine}` : ''}`,
      { intent: 'status_clear' }
    );
    return;
  }

  const pinned = todoTasks.filter((task) => task.severity === 'p1');
  const pinnedText = pinned.length ? `P1 focus: ${pinned.map((task) => `"${task.title}"`).join(', ')}\n\n` : '';

  const taskList = todoTasks
    .slice(0, 6)
    .map((task) => {
      const timeLabel = task.start_time
        ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'anytime';
      return `• ${task.title} (${timeLabel})`;
    })
    .join('\n');

  const remainder = todoTasks.length > 6 ? `\n...and ${todoTasks.length - 6} more` : '';
  await session.send(
    `${banner}${statusIntro}\n\n${pinnedText}${taskList}${remainder}\n\n${stats.completed}/${stats.total} done • ${stats.completion_rate}% complete • Streak ${streak}d${focusLine ? `\n${focusLine}` : ''}`,
    { intent: 'status' }
  );
}

async function handleAddTask(session, slots) {
  const title = slots.taskName?.trim();
  if (!title) {
    await session.send('What should I add? Example: "add workout 6am" or "remind me to read 9pm".', { intent: 'add_task_missing_title' });
    return;
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
    await session.send('When should I set it? You can reply with a time or say "no fixed time".', { intent: 'add_task_missing_time' });
    return;
  }

  const severity = inferSeverity(title);
  const task = await Task.create({
    user_id: session.user.id,
    title,
    category: severity === 'p1' ? 'P1' : 'Other',
    start_time: slots.targetTime || null,
    recurrence: slots.recurrence || null,
    created_via: session.channel,
    severity
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
    const reminderTime = new Date(task.start_time);
    reminderTime.setMinutes(reminderTime.getMinutes() - 30);
    await QueueService.scheduleTaskReminder(session.user, task, reminderTime.toISOString());
  }

  const timingText = slots.targetTime
    ? ` for ${new Date(slots.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
  const recurrenceText = slots.recurrence ? ` (${slots.recurrence})` : '';
  const toneContext = toneController.buildToneContext(session.user);
  const responseText = composeMessage('add_task', toneContext.tone, {
    title: task.title,
    timeText: timingText,
    recurrenceText
  }) || `Added "${task.title}"${timingText}${recurrenceText}. Let me know when you knock it out.`;
  await session.send(responseText, { intent: 'add_task', severity });
}

async function handleRemoveTask(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(session, 'remove_task', resolution.options, 'Which task should I cancel?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(session);
    return;
  }

  await Task.updateStatus(resolution.match.id, 'archived');
  await session.send(
    `Removed "${resolution.match.title}" from today.`,
    { intent: 'remove_task' }
  );
}

async function handleRescheduleTask(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(session, 'reschedule_task', resolution.options, 'Which task should I move?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(session);
    return;
  }

  if (!slots.targetTime && !slots.deferDays) {
    conversationContext.setPendingAction(session.user.id, {
      type: 'time_confirmation',
      intent: 'reschedule_task',
      slots: { taskId: resolution.match.id, taskName: resolution.match.title }
    });
    await session.send(`What time should I move "${resolution.match.title}" to?`, { intent: 'await_time' });
    return;
  }

  const nextStart = slots.targetTime ? new Date(slots.targetTime) : new Date(resolution.match.start_time || Date.now());
  if (slots.deferDays) {
    nextStart.setDate(nextStart.getDate() + slots.deferDays);
  }

  const updatedTask = await Task.updateFields(resolution.match.id, {
    start_time: nextStart.toISOString()
  });
  await QueueService.scheduleTaskReminder(session.user, updatedTask, nextStart.toISOString());

  await session.send(
    `Moved "${resolution.match.title}" to ${nextStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    { intent: 'reschedule_task' }
  );
}

async function handleTaskDelay(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(session, 'task_delay', resolution.options, 'Which task needs a rain check?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(session);
    return;
  }

  const newDate = new Date(resolution.match.start_time || Date.now());
  newDate.setDate(newDate.getDate() + 1);
  await Task.updateFields(resolution.match.id, { start_time: newDate.toISOString(), status: 'todo' });
  await session.send(
    `Noted. "${resolution.match.title}" slides to tomorrow. Shake it off and get ready to hit it then.`,
    { intent: 'task_delay' }
  );
}

async function handleProgressReview(session) {
  const stats = await agentService.calculateCompletionStats(session.user);
  const reminderStats = metricsStore.getReminderStats(session.user.id);
  const streak = metricsStore.getStreak(session.user.id);
  const latency = reminderStats.avgLatency ? `${reminderStats.avgLatency}m` : 'n/a';
  const toneContext = toneController.buildToneContext(session.user, stats, reminderStats);
  const toneLine = toneContext.tone === 'playful_duolingo'
    ? 'Keep the streak alive — short reps still count.'
    : toneContext.tone === 'strict_but_supportive'
      ? 'We can tighten this up. Want me to reshuffle the plan?'
      : 'Keep the momentum going.';
  const message = [
    `Today: ${stats.completed}/${stats.total} complete (${stats.completion_rate}%).`,
    `Reminder follow-through: ${reminderStats.completed}/${reminderStats.sent} • Latency ${latency}.`,
    `Streak: ${streak} day${streak === 1 ? '' : 's'}. ${toneLine}`
  ].join('\n');
  await session.send(message, { intent: 'progress_review' });
}

async function handlePlanOverview(session, p1Tasks) {
  const todoTasks = await Task.findByUserId(session.user.id, 'todo');
  const pinned = p1Tasks.map((task) => task.title).slice(0, 3).join(', ');
  const pinnedText = pinned ? `P1 up front: ${pinned}.` : 'P1 is clear right now.';
  const windows = todoTasks.slice(0, 5).map((task) => {
    const timeText = task.start_time
      ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'anytime';
    return `• ${task.title} → ${timeText}`;
  }).join('\n');
  await session.send(
    `${pinnedText}\n${windows}\n\nTell me when something is done or if we need to reshuffle.`,
    { intent: 'plan_overview' }
  );
}

async function handleDailyStart(session) {
  const tasks = await Task.getTodaysTasks(session.user.id);
  const p1Tasks = tasks.filter((task) => task.severity === 'p1');
  const opener = p1Tasks.length
    ? `Morning! Priority is ${p1Tasks.map((task) => `"${task.title}"`).join(', ')}.`
    : 'Morning! No P1 blockers, so let’s stack a clean run.';
  const nextTask = tasks[0]?.title ? `First up: ${tasks[0].title}.` : 'You are clear to plan your first move.';
  await session.send(
    `${opener}\n${nextTask}\nPing me when you wrap the first block.`,
    { intent: 'daily_start' }
  );
}

async function handleDailyEnd(session) {
  const stats = await agentService.calculateCompletionStats(session.user);
  const summary = await agentService.generateEODSummary(session.user, stats);
  await session.send(summary.message, { intent: 'daily_end', tone: summary.tone });
}

async function handleReminderSnooze(session, slots) {
  const minutes = slots.minutes || 30;
  const until = reminderPreferences.snooze(session.user.id, minutes);
  const resumeTime = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await session.send(
    `Okay, nudges sleep for ${minutes} min. I’ll ping you again around ${resumeTime}.`,
    { intent: 'reminder_snooze' }
  );
}

async function handleReminderPause(session) {
  reminderPreferences.pauseForToday(session.user.id);
  await session.send(
    'Reminders paused for today. Tap me when you want the accountability back.',
    { intent: 'reminder_pause' }
  );
}

async function handleHelp(session) {
  const helpText = [
    'Here are a few things I can do for you:',
    '• Add tasks ("remind me to read 9pm")',
    '• Mark completions ("done with deep work")',
    '• Show your plan ("status" or "what\'s next")',
    '• Move tasks ("move study to 8pm")',
    '• Snooze reminders ("snooze 30")',
    '• Start the Resolution Builder'
  ].join('\n');
  await session.send(helpText, { intent: 'help' });
}

async function handleGreeting(session) {
  const name = session.user?.preferred_name || session.user?.name || 'there';
  const toneContext = toneController.buildToneContext(session.user);
  const reply = composeMessage('greeting', toneContext.tone, { name }) ||
    `Hey ${name}! Want a status update, to add a task, or to start the Resolution Builder?`;
  await session.send(reply, { intent: 'greeting' });
}

async function handleScheduleNote(session, slots) {
  const timeLabel = slots?.targetTime
    ? new Date(slots.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const timeText = timeLabel ? ` at ${timeLabel}` : '';
  await session.send(
    `Got it${timeText}. Want me to block that on your schedule? You can say "add class${timeText} weekly" or upload a timetable.`,
    { intent: 'schedule_note' }
  );
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
    await session.send('I did not detect any class patterns yet. Share lines like "MCE 312 Tue 9am-11am".', {
      intent: 'timetable_none'
    });
    return;
  }

  conversationContext.setPendingAction(session.user.id, {
    type: 'timetable_confirmation',
    intent: 'import_timetable_confirm',
    entries
  });

  const summary = buildConfirmationSummary(entries);
  await session.send(
    `I found ${entries.length} recurring classes:\n${summary}\n\nAdd them to your schedule? Reply "yes" to add all or "add only <course>".`,
    { intent: 'timetable_confirm' }
  );
}

async function handleTimetableConfirmation(session, slots) {
  const entries = slots.entries || [];
  if (!entries.length) {
    await session.send('No classes selected. We can retry when you send the timetable again.', { intent: 'timetable_cancelled' });
    return;
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
  await session.send(
    `${entries.length} academic blocks added. Timed reminders kick in ahead of each class.`,
    { intent: 'timetable_imported', entries: entries.length }
  );
}

async function routeIntent(session, parsed, extras) {
  const p1Tasks = await ruleStateService.getActiveP1Tasks(session.user.id);

  switch (parsed.intent) {
    case 'mark_complete':
      await handleMarkComplete(session, parsed.slots);
      break;
    case 'status':
      await handleStatus(session, p1Tasks);
      break;
    case 'add_task':
      await handleAddTask(session, parsed.slots);
      break;
    case 'remove_task':
      await handleRemoveTask(session, parsed.slots);
      break;
    case 'reschedule_task':
      await handleRescheduleTask(session, parsed.slots);
      break;
    case 'task_delay':
      await handleTaskDelay(session, parsed.slots);
      break;
    case 'plan_overview':
      await handlePlanOverview(session, p1Tasks);
      break;
    case 'progress_review':
      await handleProgressReview(session);
      break;
    case 'daily_start':
      await handleDailyStart(session);
      break;
    case 'daily_end':
      await handleDailyEnd(session);
      break;
    case 'reminder_snooze':
      await handleReminderSnooze(session, parsed.slots);
      break;
    case 'reminder_pause':
      await handleReminderPause(session);
      break;
    case 'help':
      await handleHelp(session);
      break;
    case 'greeting':
      await handleGreeting(session);
      break;
    case 'schedule_note':
      await handleScheduleNote(session, parsed.slots);
      break;
    case 'upload_timetable':
      await handleTimetableUpload(session, extras.rawText || '');
      break;
    case 'import_timetable_confirm':
      await handleTimetableConfirmation(session, parsed.slots);
      break;
    case 'timetable_cancel':
      await session.send('No changes made. Share the timetable again when you want me to import it.', {
        intent: 'timetable_cancelled'
      });
      break;
    default:
      await session.send(
        pickRandomReply(UNKNOWN_REPLY_POOL),
        { intent: 'unknown' }
      );
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
    parsed = nluService.resolvePendingAction(text, pendingAction);
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

  if (!parsed) {
    parsed = nluService.parseMessage(text, { allowPlanFallback: true });
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
    await session.send(guardMessage, { intent: 'p1_guard' });
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

  await routeIntent(session, parsed, { rawText: text });
  await Conversation.touch(conversation.id);

  return {
    replies: session.replies,
    conversationId: conversation.id,
    intent: parsed.intent
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
