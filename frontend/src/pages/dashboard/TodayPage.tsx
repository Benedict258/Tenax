import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bell, Flame, TrendingUp, Sparkles } from 'lucide-react';
import type { TrendPoint, Task } from '../../types/analytics';
import { useAnalytics } from '../../context/AnalyticsContext';
import { useTasks } from '../../context/TasksContext';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';
import { BentoCard, BentoGrid } from '../../components/ui/bento-grid';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ArrowRightIcon } from '@radix-ui/react-icons';

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

const TodayPage = () => {
  const { summary, weeklyTrend } = useAnalytics();
  const { tasks } = useTasks();
  const { user } = useAuth();
  const today = summary?.today ?? {};
  const completion = today.completion ?? { completion_rate: 0, completed: 0, total: 0 };
  const hasLiveTasks = tasks.length > 0;
  const tasksToday = hasLiveTasks ? tasks : summary?.tasks?.today ?? [];
  const pinnedTasks = hasLiveTasks
    ? tasks.filter((task) => task.severity?.toLowerCase() === 'p1')
    : summary?.tasks?.pinned ?? [];
  const [scheduleRows, setScheduleRows] = useState<TimetableRow[]>([]);
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

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const loadScheduleIntel = async () => {
      if (!user?.id) {
        setScheduleRows([]);
        setCoverageStats(null);
        return;
      }

      try {
        const todayIso = new Date().toISOString();
        const [rowsResult, coverageResult] = await Promise.allSettled([
          apiClient.get(`/schedule/extractions/${user.id}`),
          apiClient.get(`/schedule/coverage/${user.id}`, { params: { date: todayIso } }),
        ]);

        if (!active) return;

        if (rowsResult.status === 'fulfilled') {
          setScheduleRows(rowsResult.value.data?.rows || []);
        } else {
          console.warn('Schedule fetch failed', rowsResult.reason);
          setScheduleRows([]);
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
    [scheduleRows, todayDay],
  );

  const localScheduleMinutes = useMemo(() => calcMinutes(todaysBlocks), [todaysBlocks]);
  const scheduleMinutesToShow = coverageStats?.schedule?.total_minutes ?? localScheduleMinutes;
  const coverageRatio = coverageStats?.coverage_percent ?? 0;

  const heroTitle = summary?.user?.name ? `${summary.user.name}, stay locked in.` : 'Craft your highest-leverage day';
  const averageCompletion = getAverageCompletion(weeklyTrend);
  const bestDayLabel = getBestDay(weeklyTrend);

  const overviewCards = useMemo(
    () => [
      {
        Icon: Bell,
        name: 'Schedule intel',
        description: `${formatHours(scheduleMinutesToShow)} scheduled - ${coverageRatio}% coverage`,
        href: '/dashboard/schedule',
        cta: 'Review schedule',
        background: <div className="absolute inset-0 bg-blue-50 opacity-20" />,
        className: 'lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4',
      },
      {
        Icon: Sparkles,
        name: 'Resolution Builder',
        description: 'Turn a resolution into an execution plan.',
        href: '/dashboard/resolution-builder',
        cta: 'Start builder',
        background: <div className="absolute inset-0 bg-rose-50 opacity-20" />,
        className: 'lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2',
      },
      {
        Icon: TrendingUp,
        name: 'Weekly pulse',
        description: `Avg ${averageCompletion}% - Best ${bestDayLabel}`,
        href: '/dashboard/weekly',
        cta: 'View weekly',
        background: <div className="absolute inset-0 bg-purple-50 opacity-20" />,
        className: 'lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4',
      },
    ],
    [averageCompletion, bestDayLabel, coverageRatio, scheduleMinutesToShow],
  );

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Schedule intel</p>
            <p className="mt-1 text-sm text-gray-700">{toastMessage}</p>
            <button
              type="button"
              onClick={() => {
                if (toastTimeoutRef.current) {
                  clearTimeout(toastTimeoutRef.current);
                  toastTimeoutRef.current = null;
                }
                setToastMessage(null);
              }}
              className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="space-y-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Overview</p>
              <h2 className="mt-2 text-3xl font-semibold text-black">{heroTitle}</h2>
              <p className="mt-2 text-sm text-gray-600">
                {summary?.user?.goal || 'Stay consistent.'} Adaptive reminders and WhatsApp + web accountability.
              </p>
            </div>
          </div>
          <BentoGrid className="lg:grid-rows-3">
            <CompletionBentoCard
              completionRate={completion.completion_rate}
              completed={completion.completed}
              total={completion.total}
              streak={today.streak || 0}
              engagement={today.engagement || 0}
            />
            <ExecutionBoardBentoCard
              tasks={tasksToday}
              scheduleBlocks={todaysBlocks}
            />
            <PinnedP1BentoCard tasks={pinnedTasks} />
            {overviewCards.map((card) => (
              <BentoCard key={card.name} {...card} />
            ))}
          </BentoGrid>
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
  <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
      <Icon className="h-5 w-5" />
    </span>
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-black">{value}</p>
    </div>
  </div>
);

const CompletionBentoCard = ({
  completionRate,
  completed,
  total,
  streak,
  engagement,
}: {
  completionRate: number;
  completed: number;
  total: number;
  streak: number;
  engagement: number;
}) => (
  <div className="group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl bg-white [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] lg:row-start-1 lg:row-end-3 lg:col-start-2 lg:col-end-3">
    <div className="absolute inset-0 bg-emerald-50 opacity-40" />
    <div className="relative z-10 flex flex-col gap-4 p-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Completion</p>
      <div>
        <p className="text-4xl font-semibold text-black">{completionRate}%</p>
        <p className="text-gray-600">{completed}/{total} tasks today</p>
      </div>
      <div className="space-y-3">
        <MetricPill label="Streak" value={`${streak} days`} icon={Flame} />
        <MetricPill label="Engagement" value={`${engagement}/5`} icon={Activity} />
      </div>
    </div>
  </div>
);

const PinnedP1BentoCard = ({ tasks }: { tasks: Task[] }) => {
  const firstTask = tasks[0];
  return (
    <div className="group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl bg-white [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] lg:col-start-2 lg:col-end-3 lg:row-start-3 lg:row-end-4">
      <div className="absolute inset-0 bg-amber-50 opacity-30" />
      <div className="relative z-10 flex flex-col gap-3 p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Pinned P1</p>
        {firstTask ? (
          <div className="space-y-2">
            <p className="text-base font-semibold text-black">{firstTask.title}</p>
            <p className="text-xs text-gray-500">{firstTask.category || 'General'}</p>
            <p className="text-sm text-gray-600">{formatTime(firstTask.start_time)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active P1. Tell Tenax the next non-negotiable.</p>
        )}
        <div className="mt-auto flex items-center justify-between text-xs text-gray-500">
          <Button variant="ghost" size="sm" asChild className="px-0 text-brand-600 hover:text-brand-700">
            <Link to="/dashboard/p1">
              View all <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <span className="text-gray-400">{tasks.length} total</span>
        </div>
      </div>
    </div>
  );
};

const ExecutionBoardBentoCard = ({
  tasks,
  scheduleBlocks,
}: {
  tasks: Task[];
  scheduleBlocks: TimetableRow[];
}) => {
  const now = Date.now();
  const scheduleItems = scheduleBlocks.map((block) => {
    const base = new Date();
    const start = block.start_time ? new Date(base) : null;
    const end = block.end_time ? new Date(base) : null;
    if (start && block.start_time) {
      const [hh, mm, ss] = block.start_time.split(':').map((part) => parseInt(part, 10));
      start.setHours(hh || 0, mm || 0, ss || 0, 0);
    }
    if (end && block.end_time) {
      const [hh, mm, ss] = block.end_time.split(':').map((part) => parseInt(part, 10));
      end.setHours(hh || 0, mm || 0, ss || 0, 0);
    }
    return {
      id: `schedule-${block.id}`,
      title: block.title,
      category: block.category || 'Schedule',
      start_time: start ? start.toISOString() : null,
      end_time: end ? end.toISOString() : null,
      status: 'todo',
      severity: null
    };
  });
  const combined = [...tasks, ...scheduleItems];
  const realTaskCount = tasks.length;
  const scheduleCount = scheduleItems.length;
  const combinedCount = combined.length;
  const withTimes = combined.map((item) => ({
    ...item,
    startMs: item.start_time ? new Date(item.start_time).getTime() : null,
    endMs: item.end_time ? new Date(item.end_time).getTime() : null
  }));
  const inProgress = withTimes.filter((item) => {
    if (!item.startMs) return false;
    const end = item.endMs ?? item.startMs + 60 * 60000;
    return item.startMs <= now && end >= now && item.status !== 'done';
  });
  const upcoming = withTimes
    .filter((item) => item.startMs && item.startMs > now && item.status !== 'done')
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  const overdue = withTimes
    .filter((item) => item.startMs && item.startMs < now && item.status !== 'done')
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  const anytime = withTimes.filter((item) => !item.startMs && item.status !== 'done');
  const ordered = [...inProgress, ...upcoming, ...overdue, ...anytime];
  const firstTask = ordered[0];
  return (
    <div className="group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl bg-white [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3">
      <div className="absolute inset-0 bg-amber-50 opacity-30" />
      <div className="relative z-10 flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Today's Execution Board</p>
          <span className="text-xs text-gray-500">
            {realTaskCount} tasks{scheduleCount ? ` · ${scheduleCount} schedule` : ''}
          </span>
        </div>
        {firstTask ? (
          <div className="space-y-2">
            <p className="text-base font-semibold text-black">{firstTask.title}</p>
            <p className="text-xs text-gray-500">{firstTask.category || 'General'}</p>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <p>{formatTime(firstTask.start_time)}</p>
              {firstTask.severity && (
                <span className="inline-flex rounded-full border border-gray-200 px-3 py-0.5 text-xs uppercase text-gray-600">
                  {firstTask.severity}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nothing scheduled. Add via WhatsApp or Add Task.</p>
        )}
        <div className="mt-auto flex items-center justify-between text-xs text-gray-500">
          <Button variant="ghost" size="sm" asChild className="px-0 text-brand-600 hover:text-brand-700">
            <Link to="/dashboard/execution-board">
              View all <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <span className="text-gray-400">{combinedCount} total</span>
        </div>
      </div>
    </div>
  );
};

const formatTime = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

const getAverageCompletion = (trend: TrendPoint[]) => {
  if (!trend.length) return 0;
  const avg = trend.reduce((acc, day) => acc + day.completionRate, 0) / trend.length;
  return Math.round(avg);
};

const getBestDay = (trend: TrendPoint[]) => {
  if (!trend.length) return '-';
  const best = trend.reduce((prev, current) => (current.completionRate > prev.completionRate ? current : prev));
  return `${best.date} (${best.completionRate}%)`;
};

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
