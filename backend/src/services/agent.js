const whatsappService = require('./whatsapp');
const Task = require('../models/Task');
const llmService = require('./llm');
const opikLogger = require('../utils/opikBridge');
const metricsStore = require('./metricsStore');
const opikAgentTracer = require('../instrumentation/opikTracer');
const variantConfig = require('../config/experiment');

const forceRegressionFailure = process.env.FORCE_REGRESSION_FAILURE === 'true';
const forcedReminderMessage = 'Remember to work on your tasks today.';

const getUserGoal = (user) => user?.goal || user?.primary_goal || 'Improve daily execution habits';
const getExperimentId = (user) => user?.experiment_id || variantConfig.experimentId || 'control';

const mapTasksToMetadata = (tasks = []) => tasks.map((task) => ({
  id: task.id,
  title: task.title,
  category: task.category,
  status: task.status,
  start_time: task.start_time || null,
  due_time: task.due_time || null
}));

const REMINDER_TIME_FORMAT = { hour: 'numeric', minute: '2-digit' };

const toTimeLabel = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', REMINDER_TIME_FORMAT);
};

const addMinutesLabel = (value, minutes) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() + minutes);
  return date.toLocaleTimeString('en-US', REMINDER_TIME_FORMAT);
};

const resolveDurationMinutes = (task, reminderType) => {
  const parsed = Number(task?.duration_minutes);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  if (reminderType === '30_min') return 30;
  if (reminderType === 'on_time') return 45;
  return 25;
};

const describeWindowText = (task, reminderType, durationMinutes) => {
  const startLabel = toTimeLabel(task?.start_time);
  if (reminderType === 'on_time') {
    const endLabel = addMinutesLabel(task?.start_time, durationMinutes);
    if (startLabel && endLabel) {
      return `now until ${endLabel}`;
    }
    return 'right now';
  }
  if (reminderType === '30_min') {
    return startLabel ? `starting at ${startLabel}` : 'in about 30 minutes';
  }
  return startLabel ? `today at ${startLabel}` : 'today';
};

const buildSpecificReminderMessage = (task, reminderType) => {
  const taskTitle = task?.title || 'your next task';
  const durationMinutes = resolveDurationMinutes(task, reminderType);
  const windowText = describeWindowText(task, reminderType, durationMinutes);
  const actionVerb = reminderType === 'on_time' ? 'Start'
    : reminderType === '30_min' ? 'Prep for' : 'Focus on';

  return `${actionVerb} "${taskTitle}" ${windowText}. Stay focused for ${durationMinutes} minutes. Reply 'done' when complete.`;
};

class AgentService {
  constructor() {
    this.agentVersion = 'v1.0';
  }

  async generateMorningSummary(user, tasks) {
    try {
      const taskList = tasks.map(t => `• ${t.title}`).join('\n');
      const prompt = `Generate a motivating morning summary for ${user.name}.\n\nTasks: ${taskList}\n\nBe brief and supportive (max 2 sentences).`;

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
      const tasks = await Task.getTodaysTasks(user.id);
      if (tasks.length === 0) return null;

      const summary = await this.generateMorningSummary(user, tasks);
      const fullMessage = `${summary}\n\nReply 'done [task]' when finished.`;
      
      await whatsappService.sendMessage(user.phone_number, fullMessage);
      await opikLogger.log('log_morning_summary_dispatch', {
        user_id: user.id,
        task_count: tasks.length,
        message_preview: fullMessage.slice(0, 200)
      });
      return { summary, tasks };
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
      message = buildSpecificReminderMessage(task, reminderType);
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
      const message = await this.generateReminder(user, task, reminderType);
      metricsStore.recordReminder({
        userId: user.id,
        taskId: task.id,
        reminderType,
        sentAt: new Date()
      });
      await whatsappService.sendMessage(user.phone_number, message);

      await opikLogger.log('log_reminder_sent', {
        user_id: user.id,
        task_id: task.id,
        task_title: task.title,
        reminder_type: reminderType,
        message: message
      });

      return { message, sent_at: new Date() };
    } catch (error) {
      console.error('[Agent] Send reminder error:', error);
      throw error;
    }
  }

  async calculateCompletionStats(user) {
    try {
      const allTasks = await Task.getTodaysTasks(user.id);
      const completed = allTasks.filter(t => t.status === 'done');
      const pending = allTasks.filter(t => t.status === 'todo');
      
      const completionRate = allTasks.length > 0 
        ? Math.round((completed.length / allTasks.length) * 100)
        : 0;

      const stats = {
        total: allTasks.length,
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
    let message;
    
    if (tone === 'congratulatory') {
      message = `Perfect day! You completed all ${stats.total} tasks. Outstanding work, ${user.name}!`;
    } else if (tone === 'encouraging') {
      message = `Good progress! You finished ${stats.completed}/${stats.total} tasks (${stats.completion_rate}%). Keep the momentum going!`;
    } else {
      message = `You completed ${stats.completed}/${stats.total} tasks (${stats.completion_rate}%). Tomorrow is a fresh start. You've got this!`;
    }

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
      const { message, tone } = await this.generateEODSummary(user, stats);
      
      await whatsappService.sendMessage(user.phone_number, message);

      await opikLogger.log('log_eod_summary', {
        user_id: user.id,
        completed: stats.completed,
        total: stats.total,
        completion_rate: stats.completion_rate,
        tone: tone,
        message: message
      });

      return { stats, tone, message };
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
