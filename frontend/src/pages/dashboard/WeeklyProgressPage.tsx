import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import type { TrendPoint } from '../../types/analytics';
import { LineChart, TrendingUp } from 'lucide-react';

const WeeklyProgressPage = () => {
  const { weeklyTrend } = useAnalytics();
  const summary = buildWeeklySummary(weeklyTrend);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Weekly narrative</p>
            <h2 className="text-2xl font-semibold">Progress signal</h2>
          </div>
          <TrendingUp className="h-6 w-6 text-white/70" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InsightCard label="Average completion" value={`${summary.average}%`} hint="Last 7 days" />
          <InsightCard label="Momentum" value={summary.momentumLabel} hint={summary.momentumHint} />
          <InsightCard label="Total completed" value={`${summary.totalCompleted} tasks`} hint={`vs ${summary.totalPlanned} planned`} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h3 className="text-xl font-semibold">Visual progression</h3>
          <LineChart className="h-5 w-5 text-white/60" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {weeklyTrend.map((day) => (
            <div key={day.date} className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'long' })}</p>
                  <p className="text-xl font-semibold">{day.completionRate}%</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-sm">{day.completed}/{day.total} done</p>
                  <MiniPill>{day.completionRate >= summary.average ? 'Ahead' : 'Catch up'}</MiniPill>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                  style={{ width: `${Math.min(day.completionRate, 100)}%` }}
                />
              </div>
            </div>
          ))}
          {weeklyTrend.length === 0 && <p className="text-white/60">No telemetry yet. Run reminders to generate a weekly trace.</p>}
        </div>
      </section>
    </div>
  );
};

const InsightCard = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
    <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
    <p className="text-white/60 text-sm">{hint}</p>
  </div>
);

const MiniPill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex rounded-full border border-white/20 px-3 py-0.5 text-xs text-white/70">{children}</span>
);

const buildWeeklySummary = (trend: TrendPoint[]) => {
  if (!trend.length) {
    return {
      average: 0,
      momentumLabel: 'Awaiting data',
      momentumHint: 'Complete a few days to unlock insights',
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

export default WeeklyProgressPage;
