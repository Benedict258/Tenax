import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import type { TrendPoint } from '../../types/analytics';
import { LineChart, TrendingUp } from 'lucide-react';
import { FeaturesSectionWithHoverEffects } from '../../components/ui/feature-section-with-hover-effects';

const WeeklyProgressPage = () => {
  const { weeklyTrend } = useAnalytics();
  const summary = buildWeeklySummary(weeklyTrend);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Weekly narrative</p>
            <h2 className="text-2xl font-semibold text-black">Progress signal</h2>
          </div>
          <TrendingUp className="h-6 w-6 text-gray-500" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InsightCard label="Average completion" value={`${summary.average}%`} hint="Last 7 days" />
          <InsightCard label="Momentum" value={summary.momentumLabel} hint={summary.momentumHint} />
          <InsightCard label="Total completed" value={`${summary.totalCompleted} tasks`} hint={`vs ${summary.totalPlanned} planned`} />
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-black">Weekly pulse detail</h3>
          <LineChart className="h-5 w-5 text-gray-500" />
        </div>
        {weeklyTrend.length === 0 ? (
          <p className="mt-6 text-gray-500">No telemetry yet. Run reminders to generate a weekly trace.</p>
        ) : (
          <FeaturesSectionWithHoverEffects
            features={weeklyTrend.slice(0, 7).map((day) => ({
              title: new Date(day.date).toLocaleDateString(undefined, { weekday: 'long' }),
              description: `${day.completed}/${day.total} done • ${day.completionRate}%`,
              icon: <LineChart className="h-5 w-5" />,
            }))}
          />
        )}
      </section>
    </div>
  );
};

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
