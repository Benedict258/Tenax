import React, { FormEvent, useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity,
  Bell,
  Bot,
  CornerDownLeft,
  Flame,
  LayoutDashboard,
  LineChart,
  Paperclip,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HeroGeometric } from './components/ui/shape-landing-hero';
import { Sidebar, SidebarBody, SidebarLink, SidebarLinkItem } from './components/ui/sidebar';
import { ExpandableChat, ExpandableChatHeader, ExpandableChatBody, ExpandableChatFooter } from './components/ui/expandable-chat';
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage } from './components/ui/chat-bubble';
import { ChatMessageList } from './components/ui/chat-message-list';
import { ChatInput } from './components/ui/chat-input';
import { Button } from './components/ui/button';
import Loader from './components/ui/loader';

const API_BASE = process.env.REACT_APP_API_URL || '/api';
const DEMO_USER_ID = process.env.REACT_APP_DEMO_USER_ID || 'demo';

interface Task {
  id: string;
  title: string;
  status?: string;
  severity?: string;
  category?: string;
  start_time?: string;
}

interface CompletionStats {
  completion_rate: number;
  completed: number;
  total: number;
}

interface ReminderStats {
  sent: number;
  completed: number;
  avgLatency: number;
}

interface TrendPoint {
  date: string;
  completionRate: number;
  completed: number;
  total: number;
}

type CategoryBreakdown = Record<string, { done: number; total: number }>;

interface Summary {
  user?: { name?: string; goal?: string };
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

interface AdminOverview {
  totals?: {
    users?: number;
    tasks?: number;
    avgCompletion?: number;
    completedTasks?: number;
  };
  variants?: Record<string, number>;
  opikMetrics?: Record<string, number>;
}

interface ChatMessage {
  id: number;
  content: string;
  sender: 'ai' | 'user';
}

const navLinks: SidebarLinkItem[] = [
  {
    label: 'Overview',
    href: '/',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: 'Ops Pulse',
    href: '/ops',
    icon: <Activity className="h-4 w-4" />,
  },
  {
    label: 'Variants',
    href: '/variants',
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <Settings className="h-4 w-4" />,
  },
];

const heroGradientChips = [
  { label: 'Reminder routing', value: 'Adaptive cadence' },
  { label: 'Quality pulse', value: 'Opik-compliant' },
  { label: 'Channels', value: 'WhatsApp + Web' },
];

const fallbackCompletion: CompletionStats = { completion_rate: 0, completed: 0, total: 0 };
const fallbackReminders: ReminderStats = { sent: 0, completed: 0, avgLatency: 0 };

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const MetricPill = ({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 backdrop-blur">
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
      <Icon className="h-5 w-5" />
    </span>
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  </div>
);

function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      content: 'I am Tenax. Daily briefing ready when you are.',
      sender: 'ai',
    },
    {
      id: 2,
      content: "Pull the sharpest insight from today's run.",
      sender: 'user',
    },
    {
      id: 3,
      content: 'Reminder follow-through is dipping after 3pm. Want to tighten cadence?',
      sender: 'ai',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [userRes, adminRes] = await Promise.all([
          axios.get(`${API_BASE}/analytics/user/${DEMO_USER_ID}/summary`),
          axios.get(`${API_BASE}/analytics/admin/overview`),
        ]);
        setSummary(userRes.data);
        setOverview(adminRes.data);
      } catch (err) {
        console.error('Analytics load failed:', err);
        setError('Unable to load analytics right now.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const today = summary?.today ?? {};
  const completion = today.completion ?? fallbackCompletion;
  const reminderStats = today.reminderStats ?? fallbackReminders;
  const tasksToday = summary?.tasks?.today ?? [];
  const pinnedTasks = summary?.tasks?.pinned ?? [];
  const trend = summary?.weeklyTrend ?? [];
  const categoryEntries = Object.entries(summary?.categoryBreakdown ?? {});
  const opikMetrics = summary?.opikMetrics ?? {};
  const behaviorMetrics = overview?.opikMetrics ?? {};
  const leaderboard = useMemo(
    () => [...trend].sort((a, b) => b.completionRate - a.completionRate).slice(0, 3),
    [trend],
  );
  const variantEntries = Object.entries(overview?.variants ?? {});

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setChatMessages((prev) => [...prev, { id: prev.length + 1, content: chatInput, sender: 'user' }]);
    setChatInput('');
    setChatBusy(true);

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          content: 'Logged. Tenax will nudge the ops loop and surface an updated insight shortly.',
          sender: 'ai',
        },
      ]);
      setChatBusy(false);
    }, 900);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#04050b] text-white flex flex-col items-center justify-center gap-6">
        <Loader />
        <p className="text-white/70">Booting Tenax insights…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#04050b] text-white flex items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-10 py-12 text-center">
          <p className="text-lg font-semibold">{error}</p>
          <p className="text-white/60 mt-2">Try again shortly — telemetry may still be syncing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#03040b] text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/30 via-transparent to-cyan-400/20 blur-[160px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="relative z-10 flex min-h-screen">
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="justify-between">
            <div className="flex flex-col gap-8">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/50">Tenax</p>
                <p className="mt-1 text-2xl font-semibold">Command</p>
              </div>
              <div className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <SidebarLink key={link.label} link={link} />
                ))}
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.4em] text-white/50">Live Signal</p>
                <p className="mt-3 text-2xl font-semibold">{completion.completion_rate}%</p>
                <p className="text-white/50 text-sm">Today's completion</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/40">Operator</p>
              <p className="mt-2 text-sm font-semibold">{summary?.user?.name || 'Tenax Learner'}</p>
              <p className="text-white/50 text-xs">{summary?.user?.goal || 'Stay consistent'}</p>
            </div>
          </SidebarBody>
        </Sidebar>

        <main className="flex-1 px-6 py-10 lg:px-10 space-y-10">
          <HeroGeometric
            badge="Tenax Execution Companion"
            title1={summary?.user?.name ? `${summary.user.name}, stay locked in.` : 'Craft your highest-leverage day'}
            title2={summary?.user?.goal || 'North Star: Relentless focus'}
            description="Adaptive reminders, Opik-aligned messaging, and a WhatsApp + web copilot keeping every commitment accountable."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {heroGradientChips.map((chip) => (
              <div key={chip.label} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-4 text-left">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">{chip.label}</p>
                <p className="text-lg font-semibold mt-2">{chip.value}</p>
              </div>
            ))}
          </div>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm uppercase tracking-[0.4em] text-white/40">Completion</p>
              <h2 className="mt-4 text-4xl font-semibold">{completion.completion_rate}%</h2>
              <p className="text-white/60">{completion.completed}/{completion.total} tasks locked</p>
              <div className="mt-6 space-y-4">
                <MetricPill label="Streak" value={`${today.streak || 0} days`} icon={Flame} />
                <MetricPill label="Engagement" value={`${today.engagement || 0}/5`} icon={Activity} />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm uppercase tracking-[0.4em] text-white/40">Reminder Controls</p>
              <div className="mt-4 space-y-4 text-sm text-white/80">
                <p>
                  <span className="font-semibold">Follow-through:</span> {reminderStats.completed}/{reminderStats.sent}
                </p>
                <p>
                  <span className="font-semibold">Avg latency:</span> {reminderStats.avgLatency}m
                </p>
                <p className="text-white/60">
                  Use WhatsApp: <strong>snooze 30</strong>, <strong>stop reminders</strong>, <strong>start my day</strong>. Tone + cadence shift instantly.
                </p>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur space-y-4">
              <p className="text-sm uppercase tracking-[0.4em] text-white/40">Pinned P1</p>
              {pinnedTasks.length === 0 && <p className="text-white/60">No active P1. Tell Tenax the next non-negotiable.</p>}
              <div className="flex flex-col gap-3">
                {pinnedTasks.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-white/50">{task.category || 'General'}</p>
                    </div>
                    <p className="text-sm text-white/70">{formatTime(task.start_time)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Opik Quality Pulse</h3>
                <Sparkles className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {['tone_score', 'specificity_score', 'realism_score', 'goal_alignment_score'].map((metric) => (
                  <div key={metric} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/40">{metric.replace('_', ' ')}</p>
                    <p className="mt-2 text-2xl font-semibold">{opikMetrics[metric] ?? '—'}<span className="text-sm">/5</span></p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Behavior & Evaluator</h3>
                <ShieldCheck className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(behaviorMetrics).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/40">{label.replace(/_/g, ' ')}</p>
                    <p className="mt-2 text-2xl font-semibold">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Today’s Execution Board</h3>
                <span className="text-white/60">{tasksToday.length} tasks</span>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                {tasksToday.length === 0 && <p className="text-white/60">Nothing scheduled. Add via WhatsApp.</p>}
                {tasksToday.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{task.title}</p>
                      <p className="text-xs text-white/50">{task.category || 'General'}</p>
                    </div>
                    <div className="text-right text-sm text-white/70 space-y-1">
                      <p>{formatTime(task.start_time)}</p>
                      {task.severity && <span className="inline-flex rounded-full border border-white/20 px-3 py-0.5 text-xs">{task.severity.toUpperCase()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Weekly Trend</h3>
                <TrendingUp className="h-5 w-5 text-white/60" />
              </div>
              <div className="mt-4 space-y-3">
                {trend.map((day) => (
                  <div key={day.date} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{day.date}</p>
                      <p className="text-xs text-white/50">{day.completed}/{day.total} tasks</p>
                    </div>
                    <div className="flex min-w-[200px] items-center gap-3">
                      <span className="text-sm font-semibold">{day.completionRate}%</span>
                      <div className="h-2 flex-1 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${Math.min(day.completionRate, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Category Breakdown</h3>
                <Target className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {categoryEntries.map(([label, stats]) => {
                  const rate = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
                  return (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                      <p className="text-sm text-white/60">{label}</p>
                      <p className="text-2xl font-semibold">{stats.done}/{stats.total}</p>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-brand-500" style={{ width: `${Math.min(rate, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Leaderboard • Weekly Consistency</h3>
                <LineChart className="h-5 w-5 text-white/60" />
              </div>
              <div className="space-y-3">
                {leaderboard.map((item, idx) => (
                  <div key={item.date} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <span className="text-2xl font-semibold text-brand-500">#{idx + 1}</span>
                    <div>
                      <p className="font-semibold">{item.date}</p>
                      <p className="text-xs text-white/60">{item.completed}/{item.total} completed</p>
                    </div>
                    <span className="text-lg font-semibold">{item.completionRate}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Admin Snapshot</h3>
                <Users className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricPill label="Active users" value={overview?.totals?.users ?? '—'} icon={Users} />
                <MetricPill label="Tasks (14d)" value={overview?.totals?.tasks ?? '—'} icon={Activity} />
                <MetricPill label="Completion" value={`${overview?.totals?.avgCompletion ?? '—'}%`} icon={TrendingUp} />
                <MetricPill label="Completed" value={overview?.totals?.completedTasks ?? '—'} icon={Zap} />
              </div>
              <div className="space-y-2">
                {variantEntries.length === 0 && <p className="text-white/60">No experiments recorded yet.</p>}
                {variantEntries.map(([variant, count]) => (
                  <div key={variant} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>{variant}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Signals Board</h3>
                <Bell className="h-5 w-5 text-white/60" />
              </div>
              <div className="space-y-3 text-sm text-white/80">
                <p>• Reminder follow-through dips after {reminderStats.avgLatency > 15 ? 'midday' : 'late afternoon'} — consider proactive check-ins.</p>
                <p>• {completion.completion_rate >= 75 ? 'Maintain throttle — keep stretching goals.' : 'Opportunity: reinforce morning ramp to protect streak.'}</p>
                <p>• Experiments tracked: {variantEntries.length}. Keep labeling WhatsApp experiments for clean analytics.</p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <ExpandableChat size="lg" position="bottom-right" icon={<Bot className="h-6 w-6" />}>
        <ExpandableChatHeader className="flex-col text-center">
          <h1 className="text-xl font-semibold">Chat with Tenax ✨</h1>
          <p className="text-sm text-white/60">Ask for summaries, reminders, or ops experiments.</p>
        </ExpandableChatHeader>
        <ExpandableChatBody>
          <ChatMessageList>
            {chatMessages.map((message) => (
              <ChatBubble key={message.id} variant={message.sender === 'user' ? 'sent' : 'received'}>
                <ChatBubbleAvatar
                  className="h-8 w-8"
                  src={
                    message.sender === 'user'
                      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&q=80&crop=faces&fit=crop'
                      : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop'
                  }
                  fallback={message.sender === 'user' ? 'US' : 'AI'}
                />
                <ChatBubbleMessage variant={message.sender === 'user' ? 'sent' : 'received'}>
                  {message.content}
                </ChatBubbleMessage>
              </ChatBubble>
            ))}
            {chatBusy && (
              <ChatBubble variant="received">
                <ChatBubbleAvatar
                  className="h-8 w-8"
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                  fallback="AI"
                />
                <ChatBubbleMessage isLoading />
              </ChatBubble>
            )}
          </ChatMessageList>
        </ExpandableChatBody>
        <ExpandableChatFooter>
          <form onSubmit={handleChatSubmit} className="rounded-2xl border border-white/10 bg-black/40 p-1">
            <ChatInput
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message..."
              className="text-white"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" type="button">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" type="button">
                  <Bot className="h-4 w-4" />
                </Button>
              </div>
              <Button type="submit" size="sm" className="gap-2">
                Send
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </ExpandableChatFooter>
      </ExpandableChat>
    </div>
  );
}

export default App;
