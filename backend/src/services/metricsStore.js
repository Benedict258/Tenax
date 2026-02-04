const datasetExporter = require('./datasetExporter');

const DAY_MS = 24 * 60 * 60 * 1000;

class MetricsStore {
  constructor() {
    this.reminders = [];
    this.reminderSchedules = new Map();
    this.reminderSends = new Map();
    this.userMessages = new Map();
    this.userStreaks = new Map();
  }

  recordReminder({ userId, taskId, reminderType, sentAt }) {
    this.reminders.push({
      userId,
      taskId,
      reminderType,
      sentAt,
      completed: false,
      completedAt: null,
      latencyMinutes: null
    });

    datasetExporter.recordReminderEvent('reminder_sent', {
      user_id: userId,
      task_id: taskId,
      reminder_type: reminderType,
      sent_at: sentAt?.toISOString?.() || new Date().toISOString()
    });
  }

  buildReminderKey({ userId, taskId, reminderType, scheduledFor }) {
    const safeTime = scheduledFor instanceof Date ? scheduledFor : scheduledFor ? new Date(scheduledFor) : null;
    const timeBucket = safeTime && !Number.isNaN(safeTime.getTime())
      ? new Date(safeTime.getTime() - (safeTime.getTime() % 60000)).toISOString()
      : 'unknown';
    return `${userId || 'u'}:${taskId || 't'}:${reminderType || 'type'}:${timeBucket}`;
  }

  pruneReminderMaps(horizonMs = DAY_MS * 3) {
    const cutoff = Date.now() - horizonMs;
    for (const [key, value] of this.reminderSchedules.entries()) {
      if (value < cutoff) this.reminderSchedules.delete(key);
    }
    for (const [key, value] of this.reminderSends.entries()) {
      if (value < cutoff) this.reminderSends.delete(key);
    }
  }

  registerReminderSchedule({ userId, taskId, reminderType, scheduledFor }) {
    this.pruneReminderMaps();
    const key = this.buildReminderKey({ userId, taskId, reminderType, scheduledFor });
    if (this.reminderSchedules.has(key)) {
      return false;
    }
    this.reminderSchedules.set(key, Date.now());
    return true;
  }

  shouldSendReminder({ userId, taskId, reminderType, scheduledFor }) {
    this.pruneReminderMaps();
    const key = this.buildReminderKey({ userId, taskId, reminderType, scheduledFor });
    if (this.reminderSends.has(key)) {
      return false;
    }
    this.reminderSends.set(key, Date.now());
    return true;
  }

  getRecentReminderTask(userId, horizonMs = 4 * 60 * 60 * 1000) {
    const cutoff = Date.now() - horizonMs;
    const match = this.reminders
      .slice()
      .reverse()
      .find((item) => item.userId === userId && item.sentAt?.getTime?.() >= cutoff);
    return match?.taskId || null;
  }

  markReminderCompletion({ userId, taskId, latencyMinutes }) {
    const reminder = this.reminders.find(
      (item) => item.userId === userId && item.taskId === taskId && !item.completed
    );

    if (reminder) {
      reminder.completed = true;
      reminder.completedAt = new Date();
      reminder.latencyMinutes = latencyMinutes;

      datasetExporter.recordReminderEvent('reminder_completed', {
        user_id: userId,
        task_id: taskId,
        latency_minutes: latencyMinutes,
        sent_at: reminder.sentAt?.toISOString?.() || null,
        completed_at: reminder.completedAt.toISOString()
      });
    }
  }

  getReminderForTask(userId, taskId) {
    return this.reminders
      .slice()
      .reverse()
      .find((item) => item.userId === userId && item.taskId === taskId);
  }

  getReminderStats(userId, horizonMs = DAY_MS) {
    const cutoff = Date.now() - horizonMs;
    const relevant = this.reminders.filter(
      (item) => item.userId === userId && item.sentAt.getTime() >= cutoff
    );

    const sent = relevant.length;
    const completed = relevant.filter((item) => item.completed).length;
    const latencies = relevant
      .filter((item) => item.completed && item.latencyMinutes !== null)
      .map((item) => item.latencyMinutes);

    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, val) => sum + val, 0) / latencies.length)
      : null;

    return {
      sent,
      completed,
      avgLatency
    };
  }

  getReminderEffectiveness(userId, horizonMs = DAY_MS) {
    const stats = this.getReminderStats(userId, horizonMs);
    if (!stats.sent) return 0;
    return Math.round((stats.completed / stats.sent) * 100);
  }

  recordUserMessage(userId) {
    if (!this.userMessages.has(userId)) {
      this.userMessages.set(userId, []);
    }
    this.userMessages.get(userId).push(Date.now());
  }

  getEngagementScore(userId, horizonMs = DAY_MS) {
    const cutoff = Date.now() - horizonMs;
    const messages = (this.userMessages.get(userId) || []).filter((ts) => ts >= cutoff);
    if (messages.length === 0) {
      return 0;
    }
    // Simple capped score (0-5) based on message count
    return Math.min(5, parseFloat((messages.length / 3).toFixed(2)));
  }

  updateStreak(userId, completionRate) {
    const previous = this.userStreaks.get(userId) || 0;
    const next = completionRate >= 60 ? previous + 1 : 0;
    this.userStreaks.set(userId, next);
    return next;
  }

  getStreak(userId) {
    return this.userStreaks.get(userId) || 0;
  }

  getMessageVolume(userId, horizonMs = DAY_MS) {
    const cutoff = Date.now() - horizonMs;
    return (this.userMessages.get(userId) || []).filter((ts) => ts >= cutoff).length;
  }
}

module.exports = new MetricsStore();
