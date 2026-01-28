import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ADMIN_ENABLED } from '../../lib/env';
import { ShieldCheck } from 'lucide-react';
import AdminGate from './AdminGate';

const BehaviorPage = () => {
  const { overview } = useAnalytics();

  if (!ADMIN_ENABLED) {
    return <AdminGate />;
  }

  const metrics = overview?.opikMetrics ?? {};

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5/5 p-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin panel</p>
          <h2 className="text-2xl font-semibold text-white">Behavior & Evaluator</h2>
        </div>
        <ShieldCheck className="h-6 w-6 text-white/70" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Object.entries(metrics).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label.replace(/_/g, ' ')}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{value ?? '-'}</p>
            <p className="text-white/60 text-xs">Evaluator telemetry</p>
          </div>
        ))}
        {!Object.keys(metrics).length && <p className="text-white/60">No admin metrics returned yet.</p>}
      </div>
    </section>
  );
};

export default BehaviorPage;
