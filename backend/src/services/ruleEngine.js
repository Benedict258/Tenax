const { DateTime } = require('luxon');
const Task = require('../models/Task');
const QueueService = require('./queue');
const scheduleService = require('./scheduleService');

const buildStartTimeISO = (dateInput, timeString, timezone = 'UTC') => {
  if (!timeString) return null;
  const [hourRaw = '0', minuteRaw = '0', secondRaw = '0'] = String(timeString).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if ([hour, minute, second].some((value) => Number.isNaN(value))) return null;
  const base = DateTime.fromJSDate(dateInput).setZone(timezone);
  const local = base.set({ hour, minute, second, millisecond: 0 });
  return local.toUTC().toISO();
};

const hasRuleTask = (tasks, ruleType, scheduleBlockId = null) => tasks.some((task) => {
  const meta = task?.metadata || {};
  if (meta.rule_type !== ruleType) return false;
  if (scheduleBlockId) {
    return String(meta.schedule_block_id) === String(scheduleBlockId);
  }
  return true;
});

async function enforceDailyRules(user, dateInput = new Date()) {
  if (!user?.id) return [];
  const timezone = user.timezone || 'UTC';
  const tasksToday = await Task.getTodaysTasks(user.id, timezone);
  const createdTasks = [];

  const baseDate = DateTime.fromJSDate(dateInput).setZone(timezone);
  const workoutTime = baseDate.set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
  const p1Time = buildStartTimeISO(dateInput, user.daily_start_time || user.start_time || '07:00:00', timezone);

  if (user.enforce_daily_p1 && !hasRuleTask(tasksToday, 'daily_p1')) {
    createdTasks.push({
      user_id: user.id,
      title: 'Daily P1 Focus',
      description: 'Protect your most important task today.',
      category: 'P1',
      severity: 'p1',
      priority: 'P1',
      start_time: p1Time,
      created_via: 'rule_engine',
      metadata: {
        rule_type: 'daily_p1',
        source: 'rule_engine'
      }
    });
  }

  if (user.enforce_workout && !hasRuleTask(tasksToday, 'workout')) {
    createdTasks.push({
      user_id: user.id,
      title: 'Workout',
      description: 'Get a workout in today.',
      category: 'Health',
      severity: 'p2',
      priority: 'P2',
      start_time: workoutTime.toUTC().toISO(),
      created_via: 'rule_engine',
      metadata: {
        rule_type: 'workout',
        source: 'rule_engine'
      }
    });
  }

  if (user.enforce_pre_class_reading || user.enforce_post_class_review) {
    const blocks = await scheduleService.buildScheduleBlockInstances(user.id, dateInput, timezone);
    for (const block of blocks) {
      if (!block.start_time_utc) continue;
      if (user.enforce_pre_class_reading && !hasRuleTask(tasksToday, 'pre_class_reading', block.id)) {
        const start = DateTime.fromISO(block.start_time_utc, { zone: 'utc' }).minus({ minutes: 45 });
        createdTasks.push({
          user_id: user.id,
          title: `Pre-class reading: ${block.title}`,
          description: `Read ahead for ${block.title}.`,
          category: 'Academic',
          severity: 'p2',
          priority: 'P2',
          start_time: start.toISO(),
          duration_minutes: 30,
          created_via: 'rule_engine',
          metadata: {
            rule_type: 'pre_class_reading',
            schedule_block_id: block.id,
            source: 'rule_engine'
          }
        });
      }
      if (user.enforce_post_class_review && block.end_time_utc && !hasRuleTask(tasksToday, 'post_class_review', block.id)) {
        const start = DateTime.fromISO(block.end_time_utc, { zone: 'utc' }).plus({ minutes: 15 });
        createdTasks.push({
          user_id: user.id,
          title: `Post-class review: ${block.title}`,
          description: `Review and summarize ${block.title}.`,
          category: 'Academic',
          severity: 'p2',
          priority: 'P2',
          start_time: start.toISO(),
          duration_minutes: 30,
          created_via: 'rule_engine',
          metadata: {
            rule_type: 'post_class_review',
            schedule_block_id: block.id,
            source: 'rule_engine'
          }
        });
      }
    }
  }

  if (!createdTasks.length) return [];
  const inserted = await Task.createMany(createdTasks);
  for (const task of inserted) {
    if (!task.start_time) continue;
    // eslint-disable-next-line no-await-in-loop
    await QueueService.scheduleTaskReminders(user, task);
  }
  return inserted;
}

module.exports = {
  enforceDailyRules
};
