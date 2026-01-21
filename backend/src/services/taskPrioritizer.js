const scheduleService = require('./scheduleService');

const MAX_TASK_DURATION_MINUTES = 180;
const MIN_TASK_DURATION_MINUTES = 15;

const severityWeight = (severity) => {
  if (severity === 'p1') return 0;
  if (severity === 'p2') return 1;
  if (severity === 'p3') return 2;
  return 3;
};

const clampDuration = (task) => {
  const parsed = Number(task?.duration_minutes);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return Math.min(Math.max(parsed, MIN_TASK_DURATION_MINUTES), MAX_TASK_DURATION_MINUTES);
  }
  return task?.severity === 'p1' ? 60 : 30;
};

const windowLengthMinutes = (window) => {
  if (!window?.start || !window?.end) return 0;
  return Math.max(0, Math.round((window.end.getTime() - window.start.getTime()) / 60000));
};

function allocateWindows(tasks, freeWindows) {
  if (!tasks.length || !freeWindows.length) return tasks;

  const windows = freeWindows
    .map((window) => ({ ...window }))
    .sort((a, b) => a.start - b.start);

  return tasks.map((task) => {
    const duration = clampDuration(task);
    const slot = windows.find((window) => windowLengthMinutes(window) >= duration);

    if (!slot) {
      return { ...task, recommended_start: null, recommended_end: null };
    }

    const recommendedStart = new Date(slot.start.getTime());
    const recommendedEnd = new Date(recommendedStart.getTime() + duration * 60000);
    slot.start = new Date(recommendedEnd.getTime());

    return {
      ...task,
      recommended_start: recommendedStart.toISOString(),
      recommended_end: recommendedEnd.toISOString()
    };
  });
}

async function rankTasksWithAvailability(userId, tasks = [], date = new Date()) {
  if (!tasks.length || !userId) return tasks;

  const { freeWindows } = await scheduleService.getAvailability(userId, date);
  if (!freeWindows || !freeWindows.length) {
    return tasks;
  }

  const prioritized = tasks
    .slice()
    .sort((a, b) => {
      const severityDelta = severityWeight(a.severity) - severityWeight(b.severity);
      if (severityDelta !== 0) return severityDelta;
      const priorityDelta = (a.priority || 5) - (b.priority || 5);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(a.start_time || 0) - new Date(b.start_time || 0);
    });

  const annotated = allocateWindows(prioritized, freeWindows);
  return annotated;
}

module.exports = {
  rankTasksWithAvailability
};
