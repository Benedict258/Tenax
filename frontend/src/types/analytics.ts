export interface Task {
  id: string;
  title: string;
  status?: string;
  severity?: string | null;
  category?: string;
  start_time?: string;
  end_time?: string | null;
  location?: string | null;
  is_schedule_block?: boolean;
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
  outcome?: {
    reminder_effectiveness?: number;
    completion_rate?: number;
  };
  tasks?: {
    today?: Task[];
    pinned?: Task[];
  };
  weeklyTrend?: TrendPoint[];
  categoryBreakdown?: CategoryBreakdown;
  opikMetrics?: Record<string, number>;
  opikTrends?: {
    daily?: Array<Record<string, number | string>>;
    hourly?: Array<Record<string, number | string>>;
  };
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
