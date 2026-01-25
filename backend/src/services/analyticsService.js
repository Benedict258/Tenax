const Task = require('../models/Task');
const User = require('../models/User');
const agentService = require('./agent');
const metricsStore = require('./metricsStore');
const opikBridge = require('../utils/opikBridge');

const LOOKBACK_DAYS = 7;
const ADMIN_LOOKBACK_DAYS = 14;

function groupCompletionByDay(tasks, startDate) {
  const buckets = {};
  tasks.forEach((task) => {
    const dayKey = new Date(task.created_at || task.start_time || task.updated_at || Date.now())
      .toISOString()
      .slice(0, 10);
    if (!buckets[dayKey]) {
      buckets[dayKey] = { total: 0, done: 0 };
    }
    buckets[dayKey].total += 1;
    if (task.status === 'done') {
      buckets[dayKey].done += 1;
    }
  });

  const days = [];
  const cursor = new Date(startDate);
  for (let i = 0; i < LOOKBACK_DAYS; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = buckets[key] || { total: 0, done: 0 };
    const rate = bucket.total ? Math.round((bucket.done / bucket.total) * 100) : 0;
    days.push({ date: key, completionRate: rate, completed: bucket.done, total: bucket.total });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildCategoryBreakdown(tasks) {
  return tasks.reduce((acc, task) => {
    const key = task.category || 'Uncategorized';
    if (!acc[key]) {
      acc[key] = { total: 0, done: 0 };
    }
    acc[key].total += 1;
    if (task.status === 'done') {
      acc[key].done += 1;
    }
    return acc;
  }, {});
}

function mapTaskForClient(task) {
  return {
    id: task.id,
    title: task.title,
    category: task.category,
    status: task.status,
    start_time: task.start_time,
    severity: task.severity || 'p2'
  };
}

async function fetchOpikMetrics(metricNames) {
  try {
    const response = await opikBridge.invoke('fetch_opik_metrics_snapshot', {
      metrics: metricNames
    });
    if (response?.metrics) {
      return response.metrics;
    }
  } catch (error) {
    console.warn('[Analytics] Failed to load Opik metrics snapshot:', error.message);
  }
  return metricNames.reduce((acc, metric) => {
    acc[metric] = null;
    return acc;
  }, {});
}

function buildDemoSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const weeklyTrend = Array.from({ length: LOOKBACK_DAYS }).map((_, idx) => ({
    date: new Date(Date.now() - (LOOKBACK_DAYS - 1 - idx) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    completionRate: 60 + (idx * 4),
    completed: 3 + idx,
    total: 5
  }));
  return {
    user: {
      id: 'demo',
      name: 'Demo Learner',
      goal: 'Stay consistent'
    },
    today: {
      completion: {
        total: 6,
        completed: 4,
        pending: 2,
        completion_rate: 67
      },
      reminderStats: {
        sent: 3,
        completed: 2,
        avgLatency: 21
      },
      streak: 3,
      engagement: 4.2
    },
    weeklyTrend,
    categoryBreakdown: {
      Academic: { total: 3, done: 2 },
      P1: { total: 1, done: 1 },
      Health: { total: 2, done: 1 }
    },
    opikMetrics: {
      tone_score: 4.4,
      specificity_score: 4.1,
      realism_score: 4.0,
      goal_alignment_score: 4.3
    }
  };
}

async function getUserSummary(userId) {
  if (!userId || userId === 'demo') {
    return buildDemoSummary();
  }
  try {
    const [user, todaysTasks] = await Promise.all([
      User.findById(userId).catch(() => null),
      Task.getTodaysTasks(userId)
    ]);

    if (!user) {
      return buildDemoSummary();
    }

    const completion = await agentService.calculateCompletionStats(user);
    const reminderStats = metricsStore.getReminderStats(user.id);
    const streak = metricsStore.getStreak(user.id);
    const engagement = metricsStore.getEngagementScore(user.id);

    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - (LOOKBACK_DAYS - 1));
    const recentTasks = await Task.findByUserSince(user.id, trendStart.toISOString());
    const weeklyTrend = groupCompletionByDay(recentTasks, trendStart);
    const categoryBreakdown = buildCategoryBreakdown(todaysTasks);
    const taskPayload = todaysTasks.map(mapTaskForClient);
    const pinnedTasks = taskPayload.filter((task) => task.severity === 'p1');

    const opikMetrics = await fetchOpikMetrics([
      'tone_score',
      'specificity_score',
      'realism_score',
      'goal_alignment_score'
    ]);

    return {
      user: {
        id: user.id,
        name: user.name,
        goal: user.primary_goal || user.goal || 'Stay consistent'
      },
      today: {
        completion,
        reminderStats,
        streak,
        engagement
      },
      tasks: {
        today: taskPayload,
        pinned: pinnedTasks
      },
      weeklyTrend,
      categoryBreakdown,
      opikMetrics
    };
  } catch (error) {
    console.error('[Analytics] Failed to build user summary:', error.message);
    throw error;
  }
}

async function getAdminOverview() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - ADMIN_LOOKBACK_DAYS);
    const [users, recentTasks] = await Promise.all([
      User.listAll(100),
      Task.findRecent(ADMIN_LOOKBACK_DAYS)
    ]);

    const totalTasks = recentTasks.length;
    const completedTasks = recentTasks.filter((task) => task.status === 'done').length;
    const avgCompletion = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const variantCounts = recentTasks.reduce((acc, task) => {
      const variant = task.metadata?.experiment_variant || 'control';
      acc[variant] = (acc[variant] || 0) + 1;
      return acc;
    }, {});

    const opikMetrics = await fetchOpikMetrics([
      'daily_completion_rate',
      'weekly_completion_rate',
      'P1_completion_rate',
      'reminder_response_time',
      'task_completion_latency',
      'missed_task_ratio',
      'regression_pass_rate',
      'optimizer_success_rate',
      'average_evaluator_score'
    ]);

    return {
      totals: {
        users: users.length,
        tasks: totalTasks,
        completedTasks,
        avgCompletion
      },
      variants: variantCounts,
      opikMetrics
    };
  } catch (error) {
    console.error('[Analytics] Admin overview error:', error.message);
    throw error;
  }
}

module.exports = {
  getUserSummary,
  getAdminOverview
};
