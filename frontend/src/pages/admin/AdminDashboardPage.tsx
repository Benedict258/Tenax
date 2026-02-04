import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../lib/env';
import { Button } from '../../components/ui/button';

const ADMIN_STORAGE_KEY = 'tenax.admin';

type TraceRecord = {
  id: string;
  logged_at: string;
  message_type: string;
  output_snippet?: string;
  tone_score?: number;
  specificity_score?: number;
  realism_score?: number;
  goal_alignment_score?: number;
  agent_version?: string;
  prompt_version?: string;
  experiment_id?: string;
  user_id?: string;
  trace_url?: string | null;
};

const getAdminToken = () => {
  try {
    const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored)?.token || null;
  } catch {
    return null;
  }
};

const AdminDashboardPage = () => {
  const [summary, setSummary] = useState<any>(null);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [signals, setSignals] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    message_type: '',
    agent_version: '',
    prompt_version: '',
    experiment_id: ''
  });
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => getAdminToken(), []);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const fetchData = async () => {
      try {
        const summaryResponse = await axios.get(`${API_BASE}/admin/opik/summary?range=${range}`, { headers });
        const traceResponse = await axios.get(`${API_BASE}/admin/opik/traces`, {
          headers,
          params: { ...filters }
        });
        const signalsResponse = await axios.get(`${API_BASE}/admin/opik/signals?range=${range}`, { headers });
        setSummary(summaryResponse.data);
        setTraces(traceResponse.data.traces || []);
        setSignals(signalsResponse.data.signals || []);
        setError(null);
      } catch (err) {
        setError('Unable to load admin metrics. Check passcode.');
      }
    };
    fetchData();
  }, [token, range, filters]);

  if (!token) {
    window.location.href = '/admin/login';
    return null;
  }

  const averages = summary?.averages || {};

  return (
    <div className="min-h-screen bg-[#03040b] text-white px-6 py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/50">Tenax Admin • Opik Observability</p>
          <h1 className="mt-2 text-3xl font-semibold">Behavior & Quality Pulse</h1>
        </div>
        <div className="flex gap-3">
          <Button variant={range === '24h' ? 'default' : 'ghost'} onClick={() => setRange('24h')}>
            Last 24h
          </Button>
          <Button variant={range === '7d' ? 'default' : 'ghost'} onClick={() => setRange('7d')}>
            Last 7d
          </Button>
        </div>
      </header>

      {error && <p className="mt-4 text-red-300">{error}</p>}

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Total traces</p>
          <p className="mt-2 text-2xl font-semibold">{summary?.totalTraces ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Fail rate</p>
          <p className="mt-2 text-2xl font-semibold">{summary?.failRate ?? '-'}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Best dimension</p>
          <p className="mt-2 text-lg">{summary?.bestDimension?.metric || '-'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Active experiment</p>
          <p className="mt-2 text-lg">{summary?.activeExperiment || '-'}</p>
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Behavior & Evaluator</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {Object.entries(averages).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{key.replace(/_/g, ' ')}</p>
              <p className="mt-2 text-2xl font-semibold">{value ?? '-'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Opik Quality Pulse</h2>
        <p className="text-white/60 mt-2 text-sm">Filters</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {Object.keys(filters).map((key) => (
            <input
              key={key}
              value={(filters as any)[key]}
              onChange={(event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }))}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
              placeholder={key.replace(/_/g, ' ')}
            />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {traces.slice(0, 10).map((trace) => (
            <div key={trace.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">{trace.message_type}</p>
                <p className="text-xs text-white/50">{new Date(trace.logged_at).toLocaleString()}</p>
              </div>
              <p className="mt-2 text-white/80">{trace.output_snippet}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/60">
                <span>tone: {trace.tone_score ?? '-'}</span>
                <span>specificity: {trace.specificity_score ?? '-'}</span>
                <span>realism: {trace.realism_score ?? '-'}</span>
                <span>alignment: {trace.goal_alignment_score ?? '-'}</span>
              </div>
              <div className="mt-2 text-xs text-white/50">
                agent {trace.agent_version || '-'} • prompt {trace.prompt_version || '-'} • exp {trace.experiment_id || '-'}
              </div>
              {trace.trace_url && (
                <a className="text-xs text-brand-400 mt-2 inline-block" href={trace.trace_url} target="_blank" rel="noreferrer">
                  View in Opik
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Signals Board</h2>
        <div className="mt-4 space-y-3">
          {signals.map((signal, idx) => (
            <div key={idx} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p>{signal}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardPage;
