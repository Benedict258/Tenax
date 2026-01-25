import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  ClipboardList,
  LineChart,
  MessageSquare,
  PlusSquare,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

export interface DashboardNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const dashboardNavItems: DashboardNavItem[] = [
  { label: 'Today', path: '/dashboard/today', icon: Activity },
  { label: 'Add Task', path: '/dashboard/add-task', icon: PlusSquare },
  { label: 'Web Chat', path: '/dashboard/chat', icon: MessageSquare },
  { label: 'Execution Board', path: '/dashboard/execution', icon: ClipboardList },
  { label: 'Weekly Progress', path: '/dashboard/weekly', icon: Target },
  { label: 'Leaderboard', path: '/dashboard/leaderboard', icon: LineChart },
  { label: 'Behavior & Evaluator', path: '/dashboard/behavior', icon: ShieldCheck, adminOnly: true },
  { label: 'Opik Quality Pulse', path: '/dashboard/opik', icon: Sparkles, adminOnly: true },
  { label: 'Signals Board', path: '/dashboard/signals', icon: Bot, adminOnly: true },
];
