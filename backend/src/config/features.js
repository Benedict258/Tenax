const scheduleIntelEnabled = process.env.SCHEDULE_INTEL_V1 === 'true';

module.exports = {
  scheduleIntelEnabled,
  requireScheduleIntel() {
    if (!scheduleIntelEnabled) {
      const error = new Error('Schedule intelligence feature disabled');
      error.statusCode = 503;
      throw error;
    }
  }
};
