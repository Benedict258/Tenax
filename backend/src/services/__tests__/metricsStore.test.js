const metricsStore = require('../metricsStore');

describe('Reminder dedupe', () => {
  test('registerReminderSchedule prevents duplicates', () => {
    const userId = 'user-1';
    const taskId = 'task-1';
    const scheduledFor = new Date('2026-01-30T10:00:00.000Z').toISOString();

    const first = metricsStore.registerReminderSchedule({
      userId,
      taskId,
      reminderType: '30_min',
      scheduledFor
    });
    const second = metricsStore.registerReminderSchedule({
      userId,
      taskId,
      reminderType: '30_min',
      scheduledFor
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});

