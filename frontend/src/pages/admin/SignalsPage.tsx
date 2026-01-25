import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ADMIN_ENABLED } from '../../lib/env';
import AdminGate from './AdminGate';
import { Bot } from 'lucide-react';

const SignalsPage = () => {
  const { summary, overview } = useAnalytics();

  if (!ADMIN_ENABLED) {
    return <AdminGate />;
  }

  const completionRate = summary?.today?.completion?.completion_rate ?? 0;
  const reminderLatency = summary?.today?.reminderStats?.avgLatency ?? 0;
  const experiments = Object.keys(overview?.variants ?? {}).length;

  const signals = [
    `Reminder follow-through dips after ${reminderLatency > 15 ? 'midday' : 'late afternoon'} — consider proactive check-ins.`,
    completionRate >= 75
      ? 'Maintain throttle — keep stretching goals and cadence.'
      : 'Opportunity: reinforce morning ramp to protect streak.',
    `Experiments tracked: ${experiments}. Ensure WhatsApp threads are labeled for clean attribution.`,
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin panel</p>
          <h2 className="text-2xl font-semibold">Signals board</h2>
          <p className="text-white/60 text-sm">Internal-only insight stream.</p>
        </div>
        <Bot className="h-6 w-6 text-white/70" />
      </div>
      <ul className="space-y-3 text-sm text-white/80">
        {signals.map((signal, idx) => (
          <li key={idx} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
            {signal}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SignalsPage;
