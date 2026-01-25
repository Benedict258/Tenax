export interface Task {
  id: string;
  title: string;
  status?: string;
  severity?: string;
  category?: string;
  start_time?: string;
}

export interface CompletionStats {
  completion_rate: number;
  completed: number;
  total: number;
}

export interface ReminderStats {
  sent: number;
  completed: number;
  avgLatency: number;
}

export interface TrendPoint {
  date: string;
  completionRate: number;
  completed: number;
  total: number;
}

export type CategoryBreakdown = Record<string, { done: number; total: number }>;

export interface Summary {
  user?: { id?: string; name?: string; goal?: string };
  today?: {
    completion?: CompletionStats;
    reminderStats?: ReminderStats;
    streak?: number;
    engagement?: number;
  };
  tasks?: {
    today?: Task[];
    pinned?: Task[];
  };
  weeklyTrend?: TrendPoint[];
  categoryBreakdown?: CategoryBreakdown;
  opikMetrics?: Record<string, number>;
}

export interface AdminOverview {
  totals?: {
    users?: number;
    tasks?: number;
    avgCompletion?: number;
    completedTasks?: number;
  };
  variants?: Record<string, number>;
  opikMetrics?: Record<string, number>;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  completionRate: number;
  streak: number;
  percentile: number;
}
