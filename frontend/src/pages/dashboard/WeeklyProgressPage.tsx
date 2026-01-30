import React, { useMemo, useState } from 'react';
import { RefreshCw, Bell } from 'lucide-react';
import { useAnalytics } from '../../context/AnalyticsContext';
import type { TrendPoint } from '../../types/analytics';
import { useNotifications } from '../../context/NotificationsContext';
import { Button } from '../../components/ui/button';
import ScheduleEditorPage from './ScheduleEditorPage';

const WeeklyProgressPage = () => {
  const { refresh, weeklyTrend } = useAnalytics();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const summary = useMemo(() => buildWeeklySummary(weeklyTrend), [weeklyTrend]);

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen && unreadCount) {
      markRead(notifications.filter((item) => !item.read).map((item) => item.id));
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Weekly narrative</p>
            <h2 className="text-2xl font-semibold text-black">Progress signal</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Button variant="outline" className="border-gray-200 text-gray-700" onClick={toggleNotifications}>
                <Bell className="mr-2 h-4 w-4" />
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">
                    {unreadCount}
                  </span>
                )}
              </Button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-3 w-96 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl z-10">
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Updates</p>
                  <div className="mt-3 flex max-h-72 flex-col gap-3 overflow-y-auto">
                    {notifications.length === 0 && <p className="text-sm text-gray-500">No notifications yet.</p>}
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border px-3 py-2 ${
                          item.read ? 'border-gray-100' : 'border-brand-100 bg-brand-50/40'
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                        {item.message && <p className="text-xs text-gray-500">{item.message}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button variant="outline" className="border-gray-200 text-gray-700" onClick={() => refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh telemetry
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InsightCard label="Average completion" value={`${summary.average}%`} hint="Last 7 days" />
          <InsightCard label="Momentum" value={summary.momentumLabel} hint={summary.momentumHint} />
          <InsightCard label="Total completed" value={`${summary.totalCompleted} tasks`} hint={`vs ${summary.totalPlanned} planned`} />
        </div>
      </section>

      <ScheduleEditorPage />
    </div>
  );
};

export default WeeklyProgressPage;

const InsightCard = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5">
    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-black">{value}</p>
    <p className="text-gray-500 text-sm">{hint}</p>
  </div>
);

const buildWeeklySummary = (trend: TrendPoint[]) => {
  if (!trend.length) {
    return {
      average: 0,
      momentumLabel: '+0 pts',
      momentumHint: 'Acceleration this week',
      totalCompleted: 0,
      totalPlanned: 0,
    };
  }
  const average = Math.round(trend.reduce((acc, day) => acc + day.completionRate, 0) / trend.length);
  const first = trend[0]?.completionRate ?? 0;
  const last = trend[trend.length - 1]?.completionRate ?? 0;
  const delta = last - first;
  const momentumLabel = delta >= 0 ? `+${delta} pts` : `${delta} pts`;
  const momentumHint = delta >= 0 ? 'Acceleration this week' : 'Stabilize follow-through';
  const totalCompleted = trend.reduce((acc, day) => acc + day.completed, 0);
  const totalPlanned = trend.reduce((acc, day) => acc + day.total, 0);

  return { average, momentumLabel, momentumHint, totalCompleted, totalPlanned };
};
