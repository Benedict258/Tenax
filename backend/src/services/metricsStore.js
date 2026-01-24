const datasetExporter = require('./datasetExporter');

const DAY_MS = 24 * 60 * 60 * 1000;

class MetricsStore {
  constructor() {
    this.reminders = [];
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
