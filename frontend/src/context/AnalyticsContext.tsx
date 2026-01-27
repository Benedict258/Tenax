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

export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
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
      const [userRes, adminRes, leaderboardRes] = await Promise.all([
        apiClient.get(`/analytics/user/${user.id}/summary`),
        apiClient.get('/analytics/admin/overview'),
        apiClient.get('/analytics/leaderboard'),
      ]);
      setSummary(userRes.data);
      setOverview(adminRes.data);
      setLeaderboard(leaderboardRes.data?.leaderboard || []);
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

  const leaderboardData = useMemo(() => leaderboard, [leaderboard]);

  const weeklyTrend = useMemo(() => summary?.weeklyTrend ?? [], [summary?.weeklyTrend]);

  const value: AnalyticsContextValue = {
    summary,
    overview,
    loading,
    error,
    refresh: fetchAnalytics,
    addLocalTask,
    leaderboard: leaderboardData,
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
