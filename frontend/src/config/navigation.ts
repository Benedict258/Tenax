import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  Calendar,
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
  { label: 'Execution Core', path: '/dashboard/today', icon: Activity },
  { label: 'Add Task', path: '/dashboard/add-task', icon: PlusSquare },
  { label: 'Schedule Intel', path: '/dashboard/schedule', icon: Calendar },
  { label: 'Web Chat', path: '/dashboard/chat', icon: MessageSquare },
  { label: 'Weekly Progress', path: '/dashboard/weekly', icon: Target },
  { label: 'Leaderboard', path: '/dashboard/leaderboard', icon: LineChart },
  { label: 'Resolution Builder', path: '/dashboard/resolution-builder', icon: Sparkles },
  { label: 'Behavior & Evaluator', path: '/dashboard/behavior', icon: ShieldCheck, adminOnly: true },
  { label: 'Opik Quality Pulse', path: '/dashboard/opik', icon: Sparkles, adminOnly: true },
  { label: 'Signals Board', path: '/dashboard/signals', icon: Bot, adminOnly: true },
];
