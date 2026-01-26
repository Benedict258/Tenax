import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

import type { AdminOverview, Summary, Task, LeaderboardEntry, TrendPoint } from '../types/analytics';
import { apiClient } from '../lib/api';
import { useAuth } from './AuthContext';

interface AnalyticsContextValue {
  summary: Summary | null;
  overview: AdminOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addLocalTask: (task: Omit<Task, 'id'>) => void;
  leaderboard: LeaderboardEntry[];
  weeklyTrend: TrendPoint[];
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

const defaultLeaderboardSeeds: LeaderboardEntry[] = [
  { id: 'leader-01', name: 'Nia K', completionRate: 88, streak: 9, percentile: 94 },
  { id: 'leader-02', name: 'Robin M', completionRate: 84, streak: 7, percentile: 92 },
  { id: 'leader-03', name: 'Kai K', completionRate: 82, streak: 6, percentile: 90 },
  { id: 'leader-04', name: 'Ivy M', completionRate: 80, streak: 5, percentile: 88 },
  { id: 'leader-05', name: 'Leila A', completionRate: 79, streak: 4, percentile: 86 },
  { id: 'leader-06', name: 'Noah P', completionRate: 77, streak: 4, percentile: 84 },
  { id: 'leader-07', name: 'Maya B', completionRate: 75, streak: 3, percentile: 82 },
  { id: 'leader-08', name: 'Ravi S', completionRate: 73, streak: 3, percentile: 80 },
  { id: 'leader-09', name: 'Seyi D', completionRate: 71, streak: 2, percentile: 78 },
  { id: 'leader-10', name: 'Ana Q', completionRate: 69, streak: 2, percentile: 75 },
];

export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!user?.id) {
        setError('User not authenticated. Please log in.');
        setLoading(false);
        return;
      }
      const [userRes, adminRes] = await Promise.all([
        apiClient.get(`/analytics/user/${user.id}/summary`),
        apiClient.get('/analytics/admin/overview'),
      ]);
      setSummary(userRes.data);
      setOverview(adminRes.data);
    } catch (err) {
      console.error('Analytics load failed:', err);
      setError('Unable to load analytics right now. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const addLocalTask = (taskInput: Omit<Task, 'id'>) => {
    setSummary((prev) => {
      if (!prev) {
        return prev;
      }
      const newTask: Task = {
        id: `local-${Date.now()}`,
        title: taskInput.title,
        category: taskInput.category,
        severity: taskInput.severity ?? 'p2',
        start_time: taskInput.start_time,
        status: taskInput.status ?? 'scheduled',
      };

      const todayTasks = prev.tasks?.today ?? [];
      const pinnedTasks = prev.tasks?.pinned ?? [];
      const nextPinned = newTask.severity?.toLowerCase() === 'p1' ? [newTask, ...pinnedTasks] : pinnedTasks;

      return {
        ...prev,
        tasks: {
          today: [newTask, ...todayTasks],
          pinned: nextPinned,
        },
      };
    });
  };

  const leaderboard = useMemo(() => {
    const points = summary?.weeklyTrend ?? [];
    if (!summary?.user) {
      return defaultLeaderboardSeeds;
    }
    const userCompletion =
      points.length > 0
        ? Math.round(points.reduce((acc, day) => acc + day.completionRate, 0) / points.length)
        : 70;
    const userEntry: LeaderboardEntry = {
      id: summary.user.id,
      name: summary.user.name || 'Current Operator',
      completionRate: userCompletion,
      streak: summary.today?.streak ?? 0,
      percentile: Math.min(99, Math.max(70, userCompletion + 10)),
    };

    const withoutDuplicate = defaultLeaderboardSeeds.filter(
      (entry) => entry.name !== userEntry.name && entry.id !== userEntry.id,
    );
    return [userEntry, ...withoutDuplicate].slice(0, 10);
  }, [summary]);

  const weeklyTrend = useMemo(() => summary?.weeklyTrend ?? [], [summary?.weeklyTrend]);

  const value: AnalyticsContextValue = {
    summary,
    overview,
    loading,
    error,
    refresh: fetchAnalytics,
    addLocalTask,
    leaderboard,
    weeklyTrend,
  };

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
};

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider');
  }
  return context;
};
