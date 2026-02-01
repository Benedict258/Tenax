import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import type { Task } from '../types/analytics';
import { useAuth } from './AuthContext';

interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'P1' | 'P2' | 'P3';
  category?: string;
  time_for_execution?: string | null;
}

interface TasksContextValue {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task | null>;
  deleteTask: (taskId: string) => Promise<boolean>;
}

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

const TasksProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, token, loading: authLoading, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!user || !token) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/tasks/today');
      setTasks(response.data || []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setTasks([]);
        setError('Session expired. Please sign in again.');
        logout();
        return;
      }
      console.error('Failed to fetch tasks', err);
      setError('Unable to load tasks');
    } finally {
      setLoading(false);
    }
  }, [logout, token, user]);

  useEffect(() => {
    if (!authLoading) {
      refresh();
    }
  }, [authLoading, refresh]);

  const createTask = React.useCallback(async (input: CreateTaskInput) => {
    if (!user || !token) {
      setError('Sign in to add tasks');
      return null;
    }
    try {
      const payload = {
        title: input.title,
        description: input.description,
        priority: input.priority,
        category: input.category || 'Manual',
        time_for_execution: input.time_for_execution,
        created_via: 'web-dashboard'
      };
      const response = await apiClient.post('/tasks', payload);
      await refresh();
      return response.data?.task ?? null;
    } catch (err) {
      console.error('Failed to create task', err);
      setError('Unable to create task right now');
      return null;
    }
  }, [refresh, token, user]);

  const deleteTask = React.useCallback(async (taskId: string) => {
    if (!user || !token) {
      setError('Sign in to manage tasks');
      return false;
    }
    try {
      await apiClient.delete(`/tasks/${taskId}`);
      await refresh();
      return true;
    } catch (err) {
      console.error('Failed to delete task', err);
      setError('Unable to delete task right now');
      return false;
    }
  }, [refresh, token, user]);

  const value = useMemo(
    () => ({ tasks, loading, error, refresh, createTask, deleteTask }),
    [tasks, loading, error, refresh, createTask, deleteTask]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
};

export const useTasks = () => {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error('useTasks must be used within TasksProvider');
  }
  return context;
};

export default TasksProvider;
