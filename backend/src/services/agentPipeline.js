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
const { parseCoursesFromText, buildConfirmationSummary } = require('./timetableParser');
const { DateTime } = require('luxon');

const GUARD_ALLOWED_INTENTS = new Set([
  'mark_complete',
  'status',
  'help',
  'progress_review',
  'plan_overview',
  'daily_start',
  'daily_end',
  'reminder_snooze',
  'reminder_pause'
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
      }
    }
  }
  return matrix[b.length][a.length];
}
// ...existing code...

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

  const taskList = options.map((option) => `${option.index}. ${option.title}`).join('\n');
  await session.send(
    `${prompt}\n\n${taskList}\n\nReply with the number or the task name.`,
    { intent: 'clarify_task', options: options.map((option) => option.id) }
  );
}

async function complainAboutMissingTask(session) {
  await session.send(
    "I couldn't find that task. Give me a bit more detail or try 'status' to see the active list.",
    { intent: 'task_not_found' }
  );
}

async function handleMarkComplete(session, slots) {
  const tasks = await Task.findByUserId(session.user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(session, 'mark_complete', resolution.options, 'Which task should I check off?', slots);
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

  const completionLine = matchedTask.severity === 'p1'
    ? `🔥 P1 locked in: "${matchedTask.title}"`
    : `✅ Marked "${matchedTask.title}" complete.`;

  await session.send(
    `${completionLine}\nPing me when you wrap the next one.`,
    { intent: 'mark_complete' }
  );
}

async function handleStatus(session, p1Tasks = []) {
  const [todoTasks, doneTasks, stats] = await Promise.all([
    Task.findByUserId(session.user.id, 'todo'),
    Task.findByUserId(session.user.id, 'done'),
    agentService.calculateCompletionStats(session.user)
  ]);

  const streak = metricsStore.getStreak(session.user.id);
  const banner = p1Tasks.length ? `${ruleStateService.buildBanner(p1Tasks)}\n\n` : '';

  if (!todoTasks.length) {
    await session.send(
      `${banner}Everything's wrapped for today. ${doneTasks.length} tasks ✅\nCompletion rate: ${stats.completion_rate}%\nCurrent streak: ${streak} day${streak === 1 ? '' : 's'}.`,
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
    `${banner}${pinnedText}Still on deck (${todoTasks.length}):\n\n${taskList}${remainder}\n\n${stats.completed}/${stats.total} done • ${stats.completion_rate}% complete • Streak ${streak}d`,
    { intent: 'status' }
  );
}

async function handleAddTask(session, slots) {
  const title = slots.taskName?.trim();
  if (!title) {
    await session.send('Tell me what to add. Example: "add workout 6am"', { intent: 'add_task_missing_title' });
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

  if (severity === 'p1') {
    await ruleStateService.refreshUserState(session.user.id);
  }

  const timingText = slots.targetTime
    ? ` for ${new Date(slots.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
  const recurrenceText = slots.recurrence ? ` (${slots.recurrence})` : '';

  await session.send(
    `Added "${task.title}"${timingText}${recurrenceText}. Let me know when you knock it out.`,
    { intent: 'add_task', severity }
  );
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

  await Task.updateFields(resolution.match.id, {
    start_time: nextStart.toISOString()
  });

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
  const message = [
    `Today: ${stats.completed}/${stats.total} complete (${stats.completion_rate}%).`,
    `Reminder follow-through: ${reminderStats.completed}/${reminderStats.sent} • Latency ${latency}.`,
    `Streak: ${streak} day${streak === 1 ? '' : 's'}. Keep the reps going.`
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
    'Tenax quick actions:',
    '• "done deep work"',
    '• "add workout 6am daily"',
    '• "move AI paper to 9pm"',
    '• "status" or "what’s my plan"',
    '• "snooze 30" or "stop reminders"'
  ].join('\n');
  await session.send(helpText, { intent: 'help' });
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
    case 'start_resolution_builder':
      // Start Resolution Builder guided flow
      const ResolutionBuilderAgent = require('./resolutionBuilderAgent');
      if (!session.user) {
        await session.send('User profile not found. Please sign up first.', { intent: 'resolution_builder_error' });
        break;
      }
      session.user.resolutionBuilder = new ResolutionBuilderAgent(session.user);
      await session.send('Welcome to Tenax Resolution Builder! What is your New Year resolution or big goal for 2026?', { intent: 'resolution_builder_start' });
      break;
    default:
      await session.send(
        'I can log completions, add tasks, move things, pause reminders, or give you a plan snapshot. Try "status" or "add workout 6am".',
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
  let parsed = null;

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
    parsed = nluService.parseResolutionBuilderIntent(text);
    if (!parsed) {
      parsed = nluService.parseMessage(text, { allowPlanFallback: true });
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

// Resolution Builder handlers
const ResolutionBuilderAgent = require('./resolutionBuilderAgent');

async function handleResolutionBuilder(session, slots) {
  // Start guided flow
  if (!session.user.resolutionAgent) {
    session.user.resolutionAgent = new ResolutionBuilderAgent(session.user);
  }
  const agent = session.user.resolutionAgent;
  let reply = '';
  switch (agent.state.step) {
    case 1:
      reply = agent.captureResolution(slots.resolution_goal);
      break;
    case 2:
      reply = agent.clarifyOutcome(slots.target_outcome);
      break;
    case 3:
      reply = agent.setTimeReality(slots.time_commitment, slots.days_free, slots.preferred_blocks);
      break;
    case 4:
      reply = agent.generateRoadmap(slots.phases);
      break;
    case 5:
      reply = agent.addResources(slots.resources);
      break;
    case 6:
      reply = agent.previewSchedule(slots.schedule_preview);
      break;
    case 7:
      reply = agent.setPermission(slots.permission);
      break;
    case 8:
      reply = 'Resolution Builder complete.';
      break;
    default:
      reply = 'Resolution Builder flow not started.';
  }
  await session.send(reply, { intent: 'resolution_builder_step', step: agent.state.step });
}

async function handleResolutionPermission(session, slots) {
  // Explicit permission gate
  if (slots.permission) {
    await session.send('Adding roadmap to your daily schedule...', { intent: 'resolution_permission_granted' });
    // Handoff to execution agent
    if (session.user.resolutionAgent) {
      session.user.resolutionAgent.setPermission(true);
    }
  } else {
    await session.send('No changes made. You can restart anytime.', { intent: 'resolution_permission_denied' });
  }
}

module.exports = {
  handleMessage,
  getRecentMessages
};
