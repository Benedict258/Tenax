import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ADMIN_ENABLED } from '../../lib/env';
import AdminGate from './AdminGate';
import { Sparkles } from 'lucide-react';

const metricOrder = ['tone_score', 'specificity_score', 'realism_score', 'goal_alignment_score'];

const OpikPulsePage = () => {
  const { summary } = useAnalytics();
  const metrics = summary?.opikMetrics ?? {};

  if (!ADMIN_ENABLED) {
    return <AdminGate />;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5/5 p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin panel</p>
          <h2 className="text-2xl font-semibold text-white">Opik quality pulse</h2>
          <p className="text-white/60 text-sm">Monitor tone, specificity, realism, and goal alignment trends.</p>
        </div>
        <Sparkles className="h-6 w-6 text-white/70" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {metricOrder.map((metric) => {
          const score = metrics[metric] ?? 0;
          return (
            <div key={metric} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">{metric.replace('_', ' ')}</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {score || '-'}<span className="text-base text-white/60"> / 5</span>
              </p>
              <div className="mt-3 h-2 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400"
                  style={{ width: `${(Number(score) / 5) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-white/60 text-xs">Wire Opik API scores here for live monitoring in production.</p>
    </section>
  );
};

export default OpikPulsePage;
