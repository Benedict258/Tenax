const whatsappService = require('./whatsapp');
const Task = require('../models/Task');
const llmService = require('./llm');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('./metricsStore');
const opikAgentTracer = require('../instrumentation/opikTracer');
const variantConfig = require('../config/experiment');
const ruleStateService = require('./ruleState');
const taskPrioritizer = require('./taskPrioritizer');
const reminderPreferences = require('./reminderPreferences');
const notificationService = require('./notificationService');
const scheduleService = require('./scheduleService');
const ruleEngine = require('./ruleEngine');
const experimentService = require('./experimentService');
const { DateTime } = require('luxon');

const forceRegressionFailure = process.env.FORCE_REGRESSION_FAILURE === 'true';
const forcedReminderMessage = 'Remember to work on your tasks today.';

const getUserGoal = (user) => user?.goal || user?.primary_goal || 'Improve daily execution habits';
const getExperimentId = (user) => {
  if (user?.experiment_id) return user.experiment_id;
  const assigned = experimentService.assignVariant(user?.id);
  return assigned.experimentId || variantConfig.experimentId || 'control';
};

const mapTasksToMetadata = (tasks = []) => tasks.map((task) => ({
  id: task.id,
  title: task.title,
  category: task.category,
  status: task.status,
  start_time: task.start_time || null,
  due_time: task.due_time || null,
  recommended_start: task.recommended_start || null,
  recommended_end: task.recommended_end || null
}));

const REMINDER_TIME_FORMAT = 'hh:mm a';
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const reminderOpeners = {
  '30_min': [
    'Quick heads-up',
    'Just a nudge',
    'Tiny heads-up',
    'Psst'
  ],
  on_time: [
    'It is time',
    'You are up',
    'Starting now',
    'Right on time'
  ],
  post_start: [
    'Quick check-in',
    'Just checking',
    'Gentle nudge',
    'Still with it'
  ],
  default: [
    'Friendly ping',
    'Gentle nudge'
  ]
};

const reminderEmojiPool = [':)', ':D', '^^'];

const reminderClosings = [
  "Ping me when you wrap it.",
  "Let me know when it's off your plate.",
  "Shoot me a quick note once it's done.",
  "Tell me when you close it out."
];

const buildEODSummaryMessage = (tone, stats, user, streak = 0) => {
  const ratio = `${stats.completed}/${stats.total}`;
  const percent = `${stats.completion_rate}%`;
  const role = user?.role ? ` ${user.role}` : '';
  const streakNote = streak > 0 ? ` Your streak was at ${streak} day${streak === 1 ? '' : 's'} yesterday.` : '';

  if (tone === 'congratulatory') {
    return `Clinic today, ${user.name}! ${ratio} tasks wrapped (${percent}). Keep that${role} momentum. Log anything lingering and tell me how you want to open tomorrow.`;
  }

  if (tone === 'encouraging') {
    return `Solid push — ${ratio} done (${percent}).${streakNote} Jot down what blocked the rest and we’ll adjust tomorrow. Ping me if you want help sequencing.`;
  }

  return `You closed ${ratio} (${percent}).${streakNote} Not perfect, but you showed up. Let’s reset and hit harder tomorrow — tell me what tripped you up and I’ll adjust the plan.`;
};

const toTimeLabel = (value, timezone = 'UTC') => {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: 'utc' }).setZone(timezone || 'UTC');
  if (!dt.isValid) return null;
  return dt.toFormat(REMINDER_TIME_FORMAT);
};

const addMinutesLabel = (value, minutes, timezone = 'UTC') => {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: 'utc' }).setZone(timezone || 'UTC');
  if (!dt.isValid) return null;
  return dt.plus({ minutes }).toFormat(REMINDER_TIME_FORMAT);
};

const sanitizeTaskTitle = (title) => {
  if (!title) return '';
  let text = String(title).trim();
  text = text.replace(/^[\"'“”]+|[\"'“”]+$/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

const resolveDurationMinutes = (task, reminderType) => {
  const parsed = Number(task?.duration_minutes);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  if (reminderType === '30_min') return 30;
  if (reminderType === 'on_time') return 45;
  if (reminderType === 'post_start') return 20;
  return 25;
};

const describeWindowText = (task, reminderType, durationMinutes, timezone = 'UTC') => {
  const startLabel = toTimeLabel(task?.start_time, timezone);
  if (reminderType === 'on_time') {
    const endLabel = addMinutesLabel(task?.start_time, durationMinutes, timezone);
    if (startLabel && endLabel) {
      return `now until ${endLabel}`;
    }
    return 'right now';
  }
  if (reminderType === 'post_start') {
    return startLabel ? `just after ${startLabel}` : 'right now';
  }
  if (reminderType === '30_min') {
    return startLabel ? `starting at ${startLabel}` : 'in about 30 minutes';
  }
  return startLabel ? `today at ${startLabel}` : 'today';
};

const buildResolutionDetails = (task) => {
  const resources = task?.metadata?.resources || [];
  const objective = task?.metadata?.objective || task?.objective || '';
  const description = task?.description || '';
  const links = Array.isArray(resources)
    ? resources
        .filter((res) => res?.url)
        .slice(0, 2)
        .map((res) => `- ${res.title || 'Resource'}: ${res.url}`)
        .join('\n')
    : '';

  const detailLines = [];
  if (objective) detailLines.push(`Objective: ${objective}`);
  if (description) detailLines.push(`Focus: ${description}`);
  if (links) detailLines.push(`Resources:\n${links}`);
  return detailLines.length ? `\n\n${detailLines.join('\n')}` : '';
};

const buildSpecificReminderMessage = (task, reminderType, timezone = 'UTC') => {
  const taskTitle = sanitizeTaskTitle(task?.title) || 'your next task';
  const durationMinutes = resolveDurationMinutes(task, reminderType);
  const windowText = describeWindowText(task, reminderType, durationMinutes, timezone);
  const openerPool = reminderOpeners[reminderType] || reminderOpeners.default;
  const opener = pickRandom(openerPool);
  const emoji = pickRandom(reminderEmojiPool);
  const closing = pickRandom(reminderClosings);

  let actionPhrase;
  if (reminderType === 'on_time') {
    actionPhrase = `Start ${taskTitle} ${windowText}`;
  } else if (reminderType === 'post_start') {
    actionPhrase = `Quick check-in on ${taskTitle} ${windowText}`;
  } else if (reminderType === '30_min') {
    actionPhrase = `Get set for ${taskTitle} ${windowText}`;
  } else {
    actionPhrase = `Carve out time for ${taskTitle} ${windowText}`;
  }

  const resolutionDetails =
    task?.category?.toLowerCase() === 'resolution' || task?.metadata?.resolution_task_id
      ? buildResolutionDetails(task)
      : '';

  return `${opener}. ${actionPhrase}. Aim for about ${durationMinutes} minutes and keep me posted ${emoji} ${closing}${resolutionDetails}`;
};

class AgentService {
  constructor() {
    this.agentVersion = 'v1.0';
  }

  async generateMorningSummary(user, tasks) {
    try {
      const taskList = tasks
        .map((t, idx) => {
          const categoryLabel = t.category ? ` (${t.category})` : '';
          const startLabel = toTimeLabel(t.recommended_start || t.start_time, user?.timezone || 'UTC');
          const endLabel = toTimeLabel(t.recommended_end, user?.timezone || 'UTC')
            || addMinutesLabel(t.recommended_start, resolveDurationMinutes(t, '30_min'), user?.timezone || 'UTC');
          const recommendation = startLabel && endLabel ? ` — best window ${startLabel} - ${endLabel}` : startLabel ? ` — best window ${startLabel}` : '';
          return `${idx + 1}. ${t.title}${categoryLabel}${recommendation}`;
        })
        .join('\n');
      const streak = metricsStore.getStreak(user.id);
      const role = user?.role ? `User role: ${user.role}.` : '';
      const prompt = [
        'You are Tenax, an execution companion—not a robotic assistant.',
        `Help ${user.name} start the day with clarity, energy, and motivation while the north star goal is "${getUserGoal(user)}".`,
        role,
        streak ? `Current streak: ${streak} day${streak === 1 ? '' : 's'}.` : '',
        'Agent identity & tone rules:',
        '- Speak conversationally with light emoji warmth (optional).',
        '- Vary sentence structure every day; never recycle the same opening.',
        '- Avoid command-style phrasing or stiff office-assistant wording.',
        '- Sound alive and personal—like a supportive accountability partner.',
        'Morning summary requirements:',
        '- Highlight the key tasks in sequence or grouped by priority (max 3 sentences).',
        '- Present tasks clearly but weave them into a natural narrative (no bullet dump unless necessary).',
        '- Close with an invitation such as "Let me know when you finish anything today 😊" (never say "Reply \'done [task]\'").',
        '- You may acknowledge prior wins to keep momentum.',
        'If the user later reports completion without specifying the task, you will politely ask which task they meant (mention this expectation briefly).',
        'Tasks for today:',
        taskList || 'No tasks scheduled yet.'
      ].join('\n');

      const response = await llmService.generate(prompt, {
        maxTokens: 100,
        temperature: 0.7,
        opikMeta: {
          action: 'generate_morning_summary',
          user_id: user.id,
          task_count: tasks.length
        }
      });

      await opikLogger.log('log_morning_summary', {
        user_id: user.id,
        task_count: tasks.length,
        summary: response.text,
        tokens_used: response.tokens
      });

      try {
        await opikAgentTracer.traceAgentOutput({
          messageType: 'daily_plan',
          userId: user.id,
          userGoal: getUserGoal(user),
          userSchedule: mapTasksToMetadata(tasks),
          taskMetadata: mapTasksToMetadata(tasks),
          generatedText: response.text,
          promptVersion: 'morning_summary_v1',
          experimentId: getExperimentId(user)
        });
      } catch (traceError) {
        console.error('[Opik] Failed to trace daily plan:', traceError.message);
      }

      return response.text;
    } catch (error) {
      console.error('[Agent] Morning summary error:', error.message);
      return `Good morning ${user.name}! You have ${tasks.length} tasks today.`;
    }
  }

  async sendMorningSummary(user) {
    try {
      await ruleEngine.verifyDailyRules(user, new Date());
      const todaysTasks = await Task.getTodaysTasks(user.id, user?.timezone || 'UTC');
      const prioritizedTasks = await taskPrioritizer.rankTasksWithAvailability(user.id, todaysTasks);
      const hasTasks = prioritizedTasks.length > 0;
      const p1Tasks = await ruleStateService.getActiveP1Tasks(user.id);

      const summary = hasTasks
        ? await this.generateMorningSummary(user, prioritizedTasks)
        : `Morning ${user.name}! No tasks scheduled yet. Want to add something so we can lock in a win today?`;
      let guardrailBanner = '';
      if (p1Tasks.length) {
        guardrailBanner = `${ruleStateService.buildBanner(p1Tasks)}\n\n`;
        await ruleStateService.recordSurface({
          userId: user.id,
          tasks: p1Tasks,
          surfaceType: 'morning_summary',
          channel: 'whatsapp',
          metadata: { task_count: prioritizedTasks.length }
        });
      }

      const fullMessage = `${guardrailBanner}${summary}\n\nLet me know when you finish anything today 😊`;
      
      await whatsappService.sendMessage(user.phone_number, fullMessage);
      await notificationService.createNotification(user.id, {
        type: 'motivation',
        title: 'Morning check-in',
        message: summary,
        metadata: { surface: 'morning_summary' }
      });
      await opikLogger.log('log_morning_summary_dispatch', {
        user_id: user.id,
        task_count: prioritizedTasks.length,
        message_preview: fullMessage.slice(0, 200)
      });
      return { summary, tasks: prioritizedTasks };
    } catch (error) {
      console.error('[Agent] Send morning summary error:', error);
      throw error;
    }
  }

  async generateReminder(user, task, reminderType = '30_min') {
    let message;

    if (forceRegressionFailure) {
      // Demo/testing flag: intentionally degrade reminder quality to trigger regression failures.
      message = forcedReminderMessage;
    } else {
      message = buildSpecificReminderMessage(task, reminderType, user?.timezone || 'UTC');
    }

    await opikLogger.log('log_reminder_generated', {
      user_id: user.id,
      task_id: task.id,
      task_title: task.title,
      reminder_type: reminderType,
      message_preview: message.slice(0, 160)
    });

    try {
      await opikAgentTracer.traceAgentOutput({
        messageType: 'reminder',
        userId: user.id,
        userGoal: getUserGoal(user),
        userSchedule: [{
          task_id: task.id,
          scheduled_start: task.start_time || null,
          reminder_type: reminderType
        }],
        taskMetadata: {
          id: task.id,
          title: task.title,
          category: task.category,
          status: task.status,
          reminder_type: reminderType
        },
        generatedText: message,
        promptVersion: `reminder_${reminderType}_v1`,
        experimentId: getExperimentId(user)
      });
    } catch (traceError) {
      console.error('[Opik] Failed to trace reminder:', traceError.message);
    }

    return message;
  }

  async sendReminder(user, task, reminderType = '30_min') {
    try {
      const resolvedReminderType = reminderType === 'on_time'
        ? 'on_time'
        : reminderType === 'post_start'
          ? 'post_start'
          : '30_min';
      let enrichedTask = task;
      if (enrichedTask?.id) {
        const latest = await Task.findById(enrichedTask.id).catch(() => null);
        if (latest) {
          enrichedTask = latest;
        }
      }

      if (reminderPreferences.isPaused(user.id)) {
        console.log('[Agent] Reminder blocked: user paused reminders for the day.');
        return { message: 'Reminders are paused for today.', blocked: true };
      }

      if (reminderPreferences.isSnoozed(user.id)) {
        console.log('[Agent] Reminder blocked: user snoozed reminders.');
        return { message: 'Reminder snooze still active.', blocked: true };
      }

      const [ruleState, p1Tasks] = await Promise.all([
        ruleStateService.getUserState(user.id),
        ruleStateService.getActiveP1Tasks(user.id)
      ]);

      const guardActive = ruleStateService.shouldBlockNonCompletion(ruleState);
      if (guardActive && enrichedTask?.severity !== 'p1' && p1Tasks.length) {
        const guardMessage = ruleStateService.buildGuardrailMessage(p1Tasks);
        await whatsappService.sendMessage(user.phone_number, guardMessage);
        await ruleStateService.recordSurface({
          userId: user.id,
          tasks: p1Tasks,
          surfaceType: 'reminder_guard',
          channel: 'whatsapp',
          metadata: { reminder_type: reminderType, requested_task_id: enrichedTask?.id }
        });
        await ruleStateService.recordBlockedAction({
          userId: user.id,
          action: 'non_p1_reminder',
          channel: 'automation',
          metadata: { requested_task_id: enrichedTask?.id }
        });
        return { message: guardMessage, blocked: true };
      }

      if (!enrichedTask) {
        console.warn('[Agent] Reminder requested without task context.');
        return null;
      }
      if (['done', 'archived'].includes(enrichedTask.status)) {
        console.log('[Agent] Reminder skipped: task already completed.');
        return { message: 'Task already completed.', blocked: true };
      }

      const scheduledFor = enrichedTask?.scheduled_for || enrichedTask?.metadata?.scheduled_for || enrichedTask?.start_time || null;
      if (!metricsStore.shouldSendReminder({
        userId: user.id,
        taskId: enrichedTask.id,
        reminderType: resolvedReminderType,
        scheduledFor
      })) {
        console.log('[Agent] Reminder deduped:', {
          userId: user.id,
          taskId: enrichedTask.id,
          reminderType: resolvedReminderType,
          scheduledFor
        });
        return { message: 'Reminder already sent.', blocked: true };
      }

      const message = await this.generateReminder(user, enrichedTask, resolvedReminderType);
      metricsStore.recordReminder({
        userId: user.id,
        taskId: enrichedTask.id,
        reminderType: resolvedReminderType,
        sentAt: new Date()
      });
      await whatsappService.sendMessage(user.phone_number, message);
      await notificationService.createNotification(user.id, {
        type: 'reminder',
        title: `Reminder: ${enrichedTask.title}`,
        message,
        metadata: { task_id: enrichedTask.id, reminder_type: reminderType }
      });

      await opikLogger.log('log_reminder_sent', {
        user_id: user.id,
        task_id: enrichedTask.id,
        task_title: enrichedTask.title,
        reminder_type: resolvedReminderType,
        message: message
      });

      if (enrichedTask?.severity === 'p1') {
        await ruleStateService.recordSurface({
          userId: user.id,
          tasks: [enrichedTask],
          surfaceType: 'reminder',
          channel: 'whatsapp',
          metadata: { reminder_type: resolvedReminderType }
        });
      }

      return { message, sent_at: new Date() };
    } catch (error) {
      console.error('[Agent] Send reminder error:', error);
      throw error;
    }
  }

  async calculateCompletionStats(user) {
    try {
      const timezone = user?.timezone || 'UTC';
      const allTasks = await Task.getTodaysTasks(user.id, timezone);
      let scheduleBlocks = [];
      try {
        const blocks = await scheduleService.buildScheduleBlockInstances(user.id, new Date(), timezone);
        scheduleBlocks = (blocks || [])
          .filter((block) => block.start_time_utc)
          .map((block) => ({
            id: `schedule-${block.id}`,
            title: block.title,
            status: 'todo',
            category: block.category || 'Schedule',
            start_time: block.start_time_utc,
            is_schedule_block: true
          }));
      } catch (err) {
        console.warn('[Agent] Schedule blocks unavailable for completion stats:', err?.message || err);
      }
      const combined = [...allTasks, ...scheduleBlocks];
      const completed = combined.filter(t => t.status === 'done');
      const pending = combined.filter(t => t.status === 'todo' || t.status === 'scheduled');
      
      const completionRate = combined.length > 0 
        ? Math.round((completed.length / combined.length) * 100)
        : 0;

      const stats = {
        total: combined.length,
        completed: completed.length,
        pending: pending.length,
        completion_rate: completionRate
      };

      await opikLogger.log('log_completion_stats', {
        user_id: user.id,
        total: stats.total,
        completed: stats.completed,
        pending: stats.pending,
        completion_rate: stats.completion_rate
      });

      return stats;
    } catch (error) {
      console.error('[Agent] Calculate stats error:', error);
      throw error;
    }
  }

  determineTone(completionRate) {
    if (completionRate === 100) return 'congratulatory';
    if (completionRate >= 60) return 'encouraging';
    return 'corrective';
  }

  async generateEODSummary(user, stats) {
    const tone = this.determineTone(stats.completion_rate);
    const streak = metricsStore.getStreak(user.id);
    const message = buildEODSummaryMessage(tone, stats, user, streak);

    await opikLogger.log('log_eod_summary_draft', {
      user_id: user.id,
      tone,
      completion_rate: stats.completion_rate,
      message_preview: message.slice(0, 200)
    });

    try {
      await opikAgentTracer.traceAgentOutput({
        messageType: 'eod_summary',
        userId: user.id,
        userGoal: getUserGoal(user),
        userSchedule: [{
          streak_days: metricsStore.getEngagementScore(user.id),
          completion_rate: stats.completion_rate
        }],
        taskMetadata: stats,
        generatedText: message,
        promptVersion: `eod_summary_${tone}_v1`,
        experimentId: getExperimentId(user)
      });
    } catch (traceError) {
      console.error('[Opik] Failed to trace EOD summary:', traceError.message);
    }

    return { message, tone };
  }

  async sendEODSummary(user) {
    try {
      const stats = await this.calculateCompletionStats(user);
      const [p1Tasks, summary] = await Promise.all([
        ruleStateService.getActiveP1Tasks(user.id),
        this.generateEODSummary(user, stats)
      ]);
      const { message, tone } = summary;
      const guardrailBanner = p1Tasks.length ? `${ruleStateService.buildBanner(p1Tasks)}\n\n` : '';
      if (p1Tasks.length) {
        await ruleStateService.recordSurface({
          userId: user.id,
          tasks: p1Tasks,
          surfaceType: 'eod_summary',
          channel: 'whatsapp',
          metadata: { completion_rate: stats.completion_rate }
        });
      }
      const finalMessage = `${guardrailBanner}${message}`;
      
      await whatsappService.sendMessage(user.phone_number, finalMessage);
      await notificationService.createNotification(user.id, {
        type: 'summary',
        title: 'End of day recap',
        message: finalMessage,
        metadata: { completion_rate: stats.completion_rate }
      });

      await opikLogger.log('log_eod_summary', {
        user_id: user.id,
        completed: stats.completed,
        total: stats.total,
        completion_rate: stats.completion_rate,
        tone: tone,
        message: finalMessage
      });

      return { stats, tone, message: finalMessage };
    } catch (error) {
      console.error('[Agent] EOD summary error:', error);
      throw error;
    }
  }

  async trackTaskCompletion(user, task, completedVia, reminderWasSent = false, reminderSentAt = null) {
    try {
      const reminderInfo = reminderSentAt
        ? { sentAt: reminderSentAt }
        : metricsStore.getReminderForTask(user.id, task.id);

      const effectiveReminderSent = reminderWasSent || !!reminderInfo;
      const reminderTimestamp = reminderInfo?.sentAt ? new Date(reminderInfo.sentAt) : null;
      let latencyMinutes = null;
      
      if (effectiveReminderSent && reminderTimestamp) {
        const completedAt = new Date();
        latencyMinutes = Math.round((completedAt - reminderTimestamp) / 60000);
        metricsStore.markReminderCompletion({
          userId: user.id,
          taskId: task.id,
          latencyMinutes
        });
      }

      await opikLogger.log('log_task_completion', {
        user_id: user.id,
        task_id: task.id,
        task_title: task.title,
        completed_via: completedVia,
        reminder_was_sent: effectiveReminderSent,
        latency_minutes: latencyMinutes
      });

      if (task?.severity === 'p1') {
        await ruleStateService.recordAcknowledgement({
          userId: user.id,
          task,
          ackVia: completedVia
        });
      }

      return { latencyMinutes };
    } catch (error) {
      console.error('[Agent] Track completion error:', error);
      throw error;
    }
  }

  async calculateAgentEffectiveness(user, period = 'daily') {
    try {
      const stats = await this.calculateCompletionStats(user);
      const reminderStats = metricsStore.getReminderStats(user.id);
      const reminderEffectivenessResponse = await opikLogger.log('calculate_reminder_effectiveness', {
        reminders_sent: reminderStats.sent,
        tasks_completed_after_reminder: reminderStats.completed
      });

      const reminderEffectiveness = reminderEffectivenessResponse?.value ?? 0;
      const avgLatency = reminderStats.avgLatency ?? 0;
      const engagementScore = metricsStore.getEngagementScore(user.id);
      const streakDays = metricsStore.updateStreak(user.id, stats.completion_rate);

      const metrics = {
        completion_rate: stats.completion_rate,
        reminder_effectiveness: reminderEffectiveness,
        avg_latency_minutes: avgLatency,
        engagement_score: engagementScore,
        streak_days: streakDays
      };

      await opikLogger.log('log_agent_effectiveness', {
        user_id: user.id,
        period: period,
        metrics: metrics
      });

      return metrics;
    } catch (error) {
      console.error('[Agent] Calculate effectiveness error:', error);
      throw error;
    }
  }
}

module.exports = new AgentService();



