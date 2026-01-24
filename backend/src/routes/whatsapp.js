const express = require('express');
const User = require('../models/User');
const Task = require('../models/Task');
const whatsappService = require('../services/whatsapp');
const agentService = require('../services/agent');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('../services/metricsStore');
const ruleStateService = require('../services/ruleState');
const nluService = require('../services/nluService');
const conversationContext = require('../services/conversationContext');
const reminderPreferences = require('../services/reminderPreferences');

const router = express.Router();

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

async function sendAgentMessage(userId, phoneNumber, message, metadata = {}) {
  await whatsappService.sendMessage(phoneNumber, message);
  conversationContext.appendTurn(userId, 'agent', message, metadata);
}

async function requestTaskClarification(user, phoneNumber, intent, tasks, prompt, slots = {}) {
  const options = tasks.slice(0, 5).map((task, index) => ({
    id: task.id,
    title: task.title,
    index: index + 1
  }));

  conversationContext.setPendingAction(user.id, {
    type: 'task_disambiguation',
    intent,
    options,
    slots
  });

  const taskList = options.map((option) => `${option.index}. ${option.title}`).join('\n');
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `${prompt}\n\n${taskList}\n\nReply with the number or the task name.`,
    { intent: 'clarify_task', options: options.map((option) => option.id) }
  );
}

async function complainAboutMissingTask(user, phoneNumber) {
  await sendAgentMessage(
    user.id,
    phoneNumber,
    "I couldn't find that task. Give me a bit more detail or try 'status' to see the active list.",
    { intent: 'task_not_found' }
  );
}

async function handleMarkComplete(user, slots, phoneNumber) {
  const tasks = await Task.findByUserId(user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(user, phoneNumber, 'mark_complete', resolution.options, 'Which task should I check off?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(user, phoneNumber);
    return;
  }

  const matchedTask = resolution.match;
  const reminderInfo = metricsStore.getReminderForTask(user.id, matchedTask.id);
  await Task.updateStatus(matchedTask.id, 'done');
  await agentService.trackTaskCompletion(
    user,
    matchedTask,
    'whatsapp',
    !!reminderInfo,
    reminderInfo?.sentAt || null
  );

  const completionLine = matchedTask.severity === 'p1'
    ? `🔥 P1 locked in: "${matchedTask.title}"`
    : `✅ Marked "${matchedTask.title}" complete.`;

  await sendAgentMessage(
    user.id,
    phoneNumber,
    `${completionLine}\nPing me when you wrap the next one.`,
    { intent: 'mark_complete' }
  );
}

async function handleStatus(user, phoneNumber, p1Tasks = []) {
  const [todoTasks, doneTasks, stats] = await Promise.all([
    Task.findByUserId(user.id, 'todo'),
    Task.findByUserId(user.id, 'done'),
    agentService.calculateCompletionStats(user)
  ]);

  const streak = metricsStore.getStreak(user.id);
  const banner = p1Tasks.length ? `${ruleStateService.buildBanner(p1Tasks)}\n\n` : '';

  if (!todoTasks.length) {
    await sendAgentMessage(
      user.id,
      phoneNumber,
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
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `${banner}${pinnedText}Still on deck (${todoTasks.length}):\n\n${taskList}${remainder}\n\n${stats.completed}/${stats.total} done • ${stats.completion_rate}% complete • Streak ${streak}d`,
    { intent: 'status' }
  );
}

async function handleAddTask(user, slots, phoneNumber) {
  const title = slots.taskName?.trim();
  if (!title) {
    await sendAgentMessage(user.id, phoneNumber, 'Tell me what to add. Example: "add workout 6am"', { intent: 'add_task_missing_title' });
    return;
  }

  const severity = inferSeverity(title);
  const task = await Task.create({
    user_id: user.id,
    title,
    category: severity === 'p1' ? 'P1' : 'Other',
    start_time: slots.targetTime || null,
    recurrence: slots.recurrence || null,
    created_via: 'whatsapp',
    severity
  });

  if (severity === 'p1') {
    await ruleStateService.refreshUserState(user.id);
  }

  const timingText = slots.targetTime
    ? ` for ${new Date(slots.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
  const recurrenceText = slots.recurrence ? ` (${slots.recurrence})` : '';

  await sendAgentMessage(
    user.id,
    phoneNumber,
    `Added "${task.title}"${timingText}${recurrenceText}. Let me know when you knock it out.`,
    { intent: 'add_task', severity }
  );
}

async function handleRemoveTask(user, slots, phoneNumber) {
  const tasks = await Task.findByUserId(user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(user, phoneNumber, 'remove_task', resolution.options, 'Which task should I cancel?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(user, phoneNumber);
    return;
  }

  await Task.updateStatus(resolution.match.id, 'archived');
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `Removed "${resolution.match.title}" from today.`,
    { intent: 'remove_task' }
  );
}

async function handleRescheduleTask(user, slots, phoneNumber) {
  const tasks = await Task.findByUserId(user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(user, phoneNumber, 'reschedule_task', resolution.options, 'Which task should I move?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(user, phoneNumber);
    return;
  }

  if (!slots.targetTime && !slots.deferDays) {
    conversationContext.setPendingAction(user.id, {
      type: 'time_confirmation',
      intent: 'reschedule_task',
      slots: { taskId: resolution.match.id, taskName: resolution.match.title }
    });
    await sendAgentMessage(user.id, phoneNumber, `What time should I move "${resolution.match.title}" to?`, { intent: 'await_time' });
    return;
  }

  const nextStart = slots.targetTime ? new Date(slots.targetTime) : new Date(resolution.match.start_time || Date.now());
  if (slots.deferDays) {
    nextStart.setDate(nextStart.getDate() + slots.deferDays);
  }

  await Task.updateFields(resolution.match.id, {
    start_time: nextStart.toISOString()
  });

  await sendAgentMessage(
    user.id,
    phoneNumber,
    `Moved "${resolution.match.title}" to ${nextStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    { intent: 'reschedule_task' }
  );
}

async function handleTaskDelay(user, slots, phoneNumber) {
  const tasks = await Task.findByUserId(user.id, 'todo');
  const resolution = resolveTaskCandidate(tasks, slots);

  if (resolution.options.length) {
    await requestTaskClarification(user, phoneNumber, 'task_delay', resolution.options, 'Which task needs a rain check?', slots);
    return;
  }

  if (!resolution.match) {
    await complainAboutMissingTask(user, phoneNumber);
    return;
  }

  const newDate = new Date(resolution.match.start_time || Date.now());
  newDate.setDate(newDate.getDate() + 1);
  await Task.updateFields(resolution.match.id, { start_time: newDate.toISOString(), status: 'todo' });
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `Noted. "${resolution.match.title}" slides to tomorrow. Shake it off and get ready to hit it then.`,
    { intent: 'task_delay' }
  );
}

async function handleProgressReview(user, phoneNumber) {
  const stats = await agentService.calculateCompletionStats(user);
  const reminderStats = metricsStore.getReminderStats(user.id);
  const streak = metricsStore.getStreak(user.id);
  const latency = reminderStats.avgLatency ? `${reminderStats.avgLatency}m` : 'n/a';
  const message = [
    `Today: ${stats.completed}/${stats.total} complete (${stats.completion_rate}%).`,
    `Reminder follow-through: ${reminderStats.completed}/${reminderStats.sent} • Latency ${latency}.`,
    `Streak: ${streak} day${streak === 1 ? '' : 's'}. Keep the reps going.`
  ].join('\n');
  await sendAgentMessage(user.id, phoneNumber, message, { intent: 'progress_review' });
}

async function handlePlanOverview(user, phoneNumber, p1Tasks) {
  const todoTasks = await Task.findByUserId(user.id, 'todo');
  const pinned = p1Tasks.map((task) => task.title).slice(0, 3).join(', ');
  const pinnedText = pinned ? `P1 up front: ${pinned}.` : 'P1 is clear right now.';
  const windows = todoTasks.slice(0, 5).map((task) => {
    const timeText = task.start_time
      ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'anytime';
    return `• ${task.title} → ${timeText}`;
  }).join('\n');
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `${pinnedText}\n${windows}\n\nTell me when something is done or if we need to reshuffle.`,
    { intent: 'plan_overview' }
  );
}

async function handleDailyStart(user, phoneNumber) {
  const tasks = await Task.getTodaysTasks(user.id);
  const p1Tasks = tasks.filter((task) => task.severity === 'p1');
  const opener = p1Tasks.length
    ? `Morning! Priority is ${p1Tasks.map((task) => `"${task.title}"`).join(', ')}.`
    : 'Morning! No P1 blockers, so let’s stack a clean run.';
  const nextTask = tasks[0]?.title ? `First up: ${tasks[0].title}.` : 'You are clear to plan your first move.';
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `${opener}\n${nextTask}\nPing me when you wrap the first block.`,
    { intent: 'daily_start' }
  );
}

async function handleDailyEnd(user, phoneNumber) {
  const stats = await agentService.calculateCompletionStats(user);
  const summary = await agentService.generateEODSummary(user, stats);
  await sendAgentMessage(user.id, phoneNumber, summary.message, { intent: 'daily_end', tone: summary.tone });
}

async function handleReminderSnooze(user, phoneNumber, slots) {
  const minutes = slots.minutes || 30;
  const until = reminderPreferences.snooze(user.id, minutes);
  const resumeTime = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await sendAgentMessage(
    user.id,
    phoneNumber,
    `Okay, nudges sleep for ${minutes} min. I’ll ping you again around ${resumeTime}.`,
    { intent: 'reminder_snooze' }
  );
}

async function handleReminderPause(user, phoneNumber) {
  reminderPreferences.pauseForToday(user.id);
  await sendAgentMessage(
    user.id,
    phoneNumber,
    'Reminders paused for today. Tap me when you want the accountability back.',
    { intent: 'reminder_pause' }
  );
}

async function handleHelp(phoneNumber, userId) {
  const helpText = [
    'Tenax quick actions:',
    '• "done deep work"',
    '• "add workout 6am daily"',
    '• "move AI paper to 9pm"',
    '• "status" or "what’s my plan"',
    '• "snooze 30" or "stop reminders"'
  ].join('\n');
  await sendAgentMessage(userId, phoneNumber, helpText, { intent: 'help' });
}

router.post('/webhook', async (req, res) => {
  try {
    const { From, Body } = req.body;
    if (!From || !Body) {
      return res.status(400).send('Missing required fields');
    }

    const phoneNumber = From.replace('whatsapp:', '');
    const user = await User.findByPhone(phoneNumber);
    if (!user) {
      return res.status(200).send('User not found');
    }

    if (!user.phone_verified) {
      await whatsappService.sendMessage(phoneNumber, 'Please verify your phone number first through the app.');
      return res.status(200).send('Phone not verified');
    }

    metricsStore.recordUserMessage(user.id);
    const pendingAction = conversationContext.getPendingAction(user.id);
    let parsed = null;

    if (pendingAction) {
      parsed = nluService.resolvePendingAction(Body, pendingAction);
      if (parsed) {
        conversationContext.consumePendingAction(user.id);
      }
    }

    if (!parsed) {
      parsed = nluService.parseMessage(Body, { allowPlanFallback: true });
    }

    const [p1Tasks, ruleState] = await Promise.all([
      ruleStateService.getActiveP1Tasks(user.id),
      ruleStateService.getUserState(user.id)
    ]);

    const guardActive = ruleStateService.shouldBlockNonCompletion(ruleState);
    if (guardActive && !GUARD_ALLOWED_INTENTS.has(parsed.intent)) {
      const guardMessage = ruleStateService.buildGuardrailMessage(p1Tasks);
      await sendAgentMessage(user.id, phoneNumber, guardMessage, { intent: 'p1_guard' });
      await ruleStateService.recordSurface({
        userId: user.id,
        tasks: p1Tasks,
        surfaceType: 'inbound_guard',
        channel: 'whatsapp',
        metadata: { blocked_intent: parsed.intent }
      });
      await ruleStateService.recordBlockedAction({
        userId: user.id,
        action: parsed.intent,
        channel: 'whatsapp',
        metadata: { body: Body }
      });
      return res.status(200).send('Guard enforced');
    }

    await opikLogger.log('log_intent_parsing', {
      user_id: user.id,
      message: Body,
      intent: parsed.intent,
      confidence: parsed.confidence || 0,
      slots: parsed.slots || {}
    });

    conversationContext.appendTurn(user.id, 'user', Body, {
      intent: parsed.intent,
      confidence: parsed.confidence
    });

    switch (parsed.intent) {
      case 'mark_complete':
        await handleMarkComplete(user, parsed.slots, phoneNumber);
        break;
      case 'status':
        await handleStatus(user, phoneNumber, p1Tasks);
        break;
      case 'add_task':
        await handleAddTask(user, parsed.slots, phoneNumber);
        break;
      case 'remove_task':
        await handleRemoveTask(user, parsed.slots, phoneNumber);
        break;
      case 'reschedule_task':
        await handleRescheduleTask(user, parsed.slots, phoneNumber);
        break;
      case 'task_delay':
        await handleTaskDelay(user, parsed.slots, phoneNumber);
        break;
      case 'plan_overview':
        await handlePlanOverview(user, phoneNumber, p1Tasks);
        break;
      case 'progress_review':
        await handleProgressReview(user, phoneNumber);
        break;
      case 'daily_start':
        await handleDailyStart(user, phoneNumber);
        break;
      case 'daily_end':
        await handleDailyEnd(user, phoneNumber);
        break;
      case 'reminder_snooze':
        await handleReminderSnooze(user, phoneNumber, parsed.slots);
        break;
      case 'reminder_pause':
        await handleReminderPause(user, phoneNumber);
        break;
      case 'help':
        await handleHelp(phoneNumber, user.id);
        break;
      default:
        await sendAgentMessage(
          user.id,
          phoneNumber,
          'I can log completions, add tasks, move things, pause reminders, or give you a plan snapshot. Try "status" or "add workout 6am".',
          { intent: 'unknown' }
        );
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).send('Error processing message');
  }
});

router.get('/webhook', (req, res) => {
  res.send('Tenax WhatsApp webhook is running!');
});

module.exports = router;
