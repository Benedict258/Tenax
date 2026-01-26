import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeroGeometric } from '../../components/ui/shape-landing-hero';
import { useAnalytics } from '../../context/AnalyticsContext';
import { Activity, Bell, Flame, Target, TrendingUp, Zap } from 'lucide-react';
import type { TrendPoint } from '../../types/analytics';
import { useTasks } from '../../context/TasksContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';

interface TimetableRow {
  id: string | number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  location?: string;
  category?: string;
}

interface CoverageSnapshot {
  date: string;
  day_of_week: number;
  schedule: {
    total_minutes: number;
    block_count: number;
  };
  completion: {
    total_minutes: number;
    task_count: number;
  };
  coverage_percent: number;
  pending_minutes: number;
  generated_at: string;
}

const heroChips = [
  { label: 'Reminder routing', value: 'Adaptive cadence' },
  { label: 'Quality pulse', value: 'Opik compliant' },
  { label: 'Channels', value: 'WhatsApp + Web' },
];

const TodayPage = () => {
  const { summary, weeklyTrend } = useAnalytics();
  const { tasks } = useTasks();
  const { user } = useAuth();
  const today = summary?.today ?? {};
  const completion = today.completion ?? { completion_rate: 0, completed: 0, total: 0 };
  const reminderStats = today.reminderStats ?? { sent: 0, completed: 0, avgLatency: 0 };
  const hasLiveTasks = tasks.length > 0;
  const tasksToday = hasLiveTasks ? tasks : summary?.tasks?.today ?? [];
  const pinnedTasks = hasLiveTasks
    ? tasks.filter((task) => task.severity?.toLowerCase() === 'p1')
    : summary?.tasks?.pinned ?? [];
  const categoryEntries = Object.entries(summary?.categoryBreakdown ?? {});
  const [scheduleRows, setScheduleRows] = useState<TimetableRow[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [coverageStats, setCoverageStats] = useState<CoverageSnapshot | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToast = useCallback((message: string) => {
    if (!message) return;
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadScheduleIntel = async () => {
      if (!user?.id) {
        setScheduleRows([]);
        setCoverageStats(null);
        setScheduleError(null);
        return;
      }

      try {
        const todayIso = new Date().toISOString();
        const [rowsResult, coverageResult] = await Promise.allSettled([
          apiClient.get(`/schedule/extractions/${user.id}`),
          apiClient.get(`/schedule/coverage/${user.id}`, { params: { date: todayIso } })
        ]);

        if (!active) return;

        if (rowsResult.status === 'fulfilled') {
          setScheduleRows(rowsResult.value.data?.rows || []);
          setScheduleError(null);
        } else {
          console.warn('Schedule fetch failed', rowsResult.reason);
          setScheduleRows([]);
          setScheduleError('Schedule intel unavailable right now.');
          triggerToast('Schedule intel unavailable right now. Try again shortly.');
        }

        if (coverageResult.status === 'fulfilled') {
          setCoverageStats(coverageResult.value.data?.coverage || null);
        } else {
          console.warn('Coverage fetch failed', coverageResult.reason);
          setCoverageStats(null);
          triggerToast('Coverage metrics failed to load.');
        }
      } catch (err) {
        console.warn('Schedule intel request failed', err);
        if (!active) return;
        setScheduleRows([]);
        setCoverageStats(null);
        setScheduleError('Schedule intel unavailable right now.');
        triggerToast('Schedule intel unavailable right now. Try again shortly.');
      }
    };

    loadScheduleIntel();
    return () => {
      active = false;
    };
  }, [user?.id, triggerToast]);

  const todayDay = new Date().getDay();
  const todaysBlocks = useMemo(
    () =>
      scheduleRows
        .filter((row) => row.day_of_week === todayDay)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    [scheduleRows, todayDay]
  );

  const localScheduleMinutes = useMemo(() => calcMinutes(todaysBlocks), [todaysBlocks]);
  const scheduleMinutesToShow = coverageStats?.schedule?.total_minutes ?? localScheduleMinutes;
  const scheduleBlockCount = coverageStats?.schedule?.block_count ?? todaysBlocks.length;
  const coverageCompletionMinutes = coverageStats?.completion?.total_minutes ?? null;
  const coverageCompletionCount = coverageStats?.completion?.task_count ?? null;
  // No fallback coverage ratio in production
  const coverageRatio = coverageStats?.coverage_percent;

  const heroTitle = summary?.user?.name ? `${summary.user.name}, stay locked in.` : 'Craft your highest-leverage day';

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className="rounded-2xl border border-white/20 bg-black/80 px-4 py-3 text-sm text-white shadow-2xl shadow-brand-500/30">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Schedule intel</p>
            <p className="mt-1 text-sm text-white/90">{toastMessage}</p>
            <button
              type="button"
              onClick={() => {
                if (toastTimeoutRef.current) {
                  clearTimeout(toastTimeoutRef.current);
                  toastTimeoutRef.current = null;
                }
                setToastMessage(null);
              }}
              className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-brand-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <HeroGeometric
          badge="Tenax Execution Companion"
          title1={heroTitle}
          title2={summary?.user?.goal || 'Stay consistent.'}
          description="Adaptive reminders, Opik-aligned messaging, and a WhatsApp + web copilot keeping every commitment accountable."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {heroChips.map((chip) => (
            <div key={chip.label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-left">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{chip.label}</p>
              <p className="text-lg font-semibold">{chip.value}</p>
            </div>
          ))}
        </div>
      </section>

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
              Use WhatsApp keywords (snooze 30 / stop reminders / start my day) to pivot cadence instantly.
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
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Today’s Execution Board</h3>
            <span className="text-white/60">{tasksToday.length} tasks</span>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {tasksToday.length === 0 && <p className="text-white/60">Nothing scheduled. Add via WhatsApp or the Execution Board section.</p>}
            {tasksToday.map((task) => (
              <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{task.title}</p>
                  <p className="text-xs text-white/50">{task.category || 'General'}</p>
                </div>
                <div className="text-right text-sm text-white/70 space-y-1">
                  <p>{formatTime(task.start_time)}</p>
                  {task.severity && (
                    <span className="inline-flex rounded-full border border-white/20 px-3 py-0.5 text-xs uppercase">
                      {task.severity}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Category Breakdown</h3>
            <Target className="h-5 w-5 text-white/60" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {categoryEntries.map(([label, stats]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <p className="text-sm text-white/60">{label}</p>
                <p className="text-2xl font-semibold">{stats.done}/{stats.total}</p>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-brand-500"
                    style={{ width: `${Math.min((stats.done / (stats.total || 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {categoryEntries.length === 0 && <p className="text-white/60">No categories logged today.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Weekly Pulse</h3>
          <TrendingUp className="h-5 w-5 text-white/60" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TrendSummaryCard label="Average completion" value={`${getAverageCompletion(weeklyTrend)}%`} icon={<Activity className="h-4 w-4" />} />
          <TrendSummaryCard label="Best streak day" value={getBestDay(weeklyTrend)} icon={<Zap className="h-4 w-4" />} />
        </div>
        <div className="mt-6 space-y-3">
          {weeklyTrend.map((day) => (
            <div key={day.date} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{day.date}</p>
                <p className="text-xs text-white/50">{day.completed}/{day.total} tasks</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{day.completionRate}%</span>
                <div className="h-2 w-32 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${Math.min(day.completionRate, 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Schedule Coverage</h3>
          <Bell className="h-5 w-5 text-white/60" />
        </div>
        {scheduleError && <p className="mt-2 text-sm text-amber-300">{scheduleError}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Scheduled hours today</p>
            <p className="text-3xl font-semibold">{formatHours(scheduleMinutesToShow)}</p>
            <p className="text-white/60 text-sm">{scheduleBlockCount} blocks parsed from timetable</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Execution vs timetable</p>
            <p className="text-3xl font-semibold">{coverageRatio}%</p>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                style={{ width: `${Math.min(coverageRatio, 100)}%` }}
              />
            </div>
            <p className="text-white/60 text-sm mt-2">
              Completed {coverageCompletionCount ?? completion.completed}/{completion.total} tasks ·{' '}
              {coverageCompletionMinutes !== null
                ? `${formatHours(coverageCompletionMinutes)} executed`
                : ''}
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {todaysBlocks.length === 0 && <p className="text-white/60">No timetable intel captured for today.</p>}
          {todaysBlocks.slice(0, 4).map((block) => (
            <div key={block.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{block.title}</p>
                <p className="text-xs text-white/50">{block.location || '—'} · {block.category || 'class'}</p>
              </div>
              <p className="text-sm text-white/70">
                {block.start_time?.slice(0, 5)} - {block.end_time?.slice(0, 5)}
              </p>
            </div>
          ))}
        </div>
      </section>
      </div>
    </>
  );
};

interface MetricPillProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}

const MetricPill = ({ label, value, icon: Icon }: MetricPillProps) => (
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

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const getAverageCompletion = (trend: TrendPoint[]) => {
  if (!trend.length) return 0;
  const avg = trend.reduce((acc, day) => acc + day.completionRate, 0) / trend.length;
  return Math.round(avg);
};

const getBestDay = (trend: TrendPoint[]) => {
  if (!trend.length) return '—';
  const best = trend.reduce((prev, current) => (current.completionRate > prev.completionRate ? current : prev));
  return `${best.date} (${best.completionRate}%)`;
};

const TrendSummaryCard = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
  <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 px-6 py-5 flex items-center justify-between">
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{value}</p>
    </div>
    <div className="h-10 w-10 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-white">{icon}</div>
  </div>
);

const calcMinutes = (blocks: TimetableRow[]) =>
  blocks.reduce((total, block) => {
    if (!block.start_time || !block.end_time) return total;
    const start = parseInt(block.start_time.slice(0, 2), 10) * 60 + parseInt(block.start_time.slice(3, 5), 10);
    const end = parseInt(block.end_time.slice(0, 2), 10) * 60 + parseInt(block.end_time.slice(3, 5), 10);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return total;
    return total + (end - start);
  }, 0);

const formatHours = (minutes: number) => {
  if (!minutes) return '0h';
  const hours = minutes / 60;
  if (hours < 1) {
    return `${Math.round(minutes)}m`;
  }
  return `${hours.toFixed(1)}h`;
};

export default TodayPage;
