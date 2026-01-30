const metricsStore = require('./metricsStore');

function selectTone({ completionRate = 0, streakDays = 0, reminderStats = { sent: 0, completed: 0 } }) {
  if (completionRate >= 85 && streakDays >= 3) return 'playful_duolingo';
  if (completionRate >= 70) return 'friendly_supportive';
  if (completionRate >= 45) return 'focused_coach';
  if (reminderStats.sent > 0 && reminderStats.completed === 0) return 'strict_but_supportive';
  return 'strict_but_supportive';
}

function buildToneContext(user, stats = {}, reminderStats = {}) {
  const completionRate = stats.completion_rate ?? stats.completionRate ?? 0;
  const streakDays = metricsStore.getStreak(user.id);
  const resolvedReminderStats = reminderStats.sent !== undefined ? reminderStats : metricsStore.getReminderStats(user.id);

  return {
    completionRate,
    streakDays,
    reminderStats: resolvedReminderStats,
    tone: selectTone({ completionRate, streakDays, reminderStats: resolvedReminderStats })
  };
}

module.exports = {
  selectTone,
  buildToneContext
};

