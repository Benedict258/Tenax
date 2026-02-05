import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ADMIN_ENABLED } from '../../lib/env';
import AdminGate from './AdminGate';
import { Sparkles } from 'lucide-react';

const metricOrder = [
  'tone_score',
  'specificity_score',
  'realism_score',
  'goal_alignment_score',
  'resolution_alignment_score'
];

const OpikPulsePage = () => {
  const { summary } = useAnalytics();
  const metrics = summary?.opikMetrics ?? {};
  const opikTrends = summary?.opikTrends ?? {};
  const daily = Array.isArray(opikTrends.daily) ? opikTrends.daily : [];
  const hourly = Array.isArray(opikTrends.hourly) ? opikTrends.hourly : [];
  const dailyTone = daily.map((point) => Number(point.tone_score || 0));
  const dailySpecificity = daily.map((point) => Number(point.specificity_score || 0));
  const dailyRealism = daily.map((point) => Number(point.realism_score || 0));
  const dailyAlignment = daily.map((point) => Number(point.goal_alignment_score || 0));

  if (!ADMIN_ENABLED) {
    return <AdminGate />;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5/5 p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin panel</p>
          <h2 className="text-2xl font-semibold text-white">Opik quality pulse</h2>
          <p className="text-white/60 text-sm">Monitor tone, specificity, realism, goal alignment, and resolution alignment trends.</p>
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
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Last 7 days</p>
          <MiniBars label="Tone" values={dailyTone} />
          <MiniBars label="Specificity" values={dailySpecificity} />
          <MiniBars label="Realism" values={dailyRealism} />
          <MiniBars label="Goal alignment" values={dailyAlignment} />
          {daily.length === 0 && <p className="mt-3 text-sm text-white/60">No Opik trend data yet.</p>}
          {daily.length > 0 && (
            <div className="mt-3 space-y-3">
              {daily.slice(-7).map((row) => (
                <div key={row.key as string} className="flex items-center justify-between text-sm text-white/70">
                  <span>{row.key}</span>
                  <span>
                    Tone {Number(row.tone_score || 0).toFixed(1)} • Spec {Number(row.specificity_score || 0).toFixed(1)} • Realism {Number(row.realism_score || 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Last 24 hours</p>
          <MiniBars label="Tone" values={hourly.map((point) => Number(point.tone_score || 0))} />
          <MiniBars label="Goal alignment" values={hourly.map((point) => Number(point.goal_alignment_score || 0))} />
          {hourly.length === 0 && <p className="mt-3 text-sm text-white/60">No hourly Opik trend data yet.</p>}
          {hourly.length > 0 && (
            <div className="mt-3 space-y-3">
              {hourly.slice(-6).map((row) => (
                <div key={row.key as string} className="flex items-center justify-between text-sm text-white/70">
                  <span>{row.key}</span>
                  <span>
                    Tone {Number(row.tone_score || 0).toFixed(1)} • Goal {Number(row.goal_alignment_score || 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-white/60 text-xs">Trend data is sourced from the Opik mirror table and updates with new traces.</p>
    </section>
  );
};

export default OpikPulsePage;

const MiniBars = ({ label, values }: { label: string; values: number[] }) => {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
      <div className="mt-2 flex items-end gap-1">
        {values.slice(-14).map((value, idx) => (
          <div
            key={`${label}-${idx}`}
            className="w-2 rounded-full bg-gradient-to-t from-brand-500/70 to-emerald-400/90"
            style={{ height: `${Math.max(10, (value / max) * 48)}px` }}
          />
        ))}
      </div>
    </div>
  );
};
