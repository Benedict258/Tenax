import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';

const stepLabels = [
  'Capture resolution',
  'Set duration',
  'Clarify outcome',
  'Time reality check',
  'Pick pace',
  'Roadmap + resources',
  'Schedule preview',
  'Execution handoff',
];

type DayOption = { label: string; dayOfWeek: number };
type BlockOption = { label: string; time: { hour: number; minute: number } };

type ScheduleSlot = {
  day_of_week: number;
  day_label: string;
  time: { hour: number; minute: number };
  time_label: string;
  phase_index: number;
  phase_name: string;
  focus: string;
};

type ResolutionState = {
  step: number;
  resolution_goal: string;
  resolution_type?: string;
  target_outcome: string;
  duration_weeks: number | null;
  end_date: string | null;
  time_commitment_hours: number | null;
  days_free: DayOption[];
  preferred_blocks: BlockOption[];
  pace?: string;
  roadmap: unknown | null;
  resources: unknown[];
  schedule_preview: ScheduleSlot[];
  permission: boolean | null;
  active: boolean;
  completed: boolean;
  time_step?: string;
  edit_mode?: boolean;
};

type ReplyPayload = {
  replies?: Array<{ text: string; metadata?: { state?: ResolutionState } }>;
};

const formatList = (items: string[]) => (items.length ? items.join(', ') : 'Not set yet');

const ResolutionBuilderPage = () => {
  const { user } = useAuth();
  const [builderState, setBuilderState] = useState<ResolutionState | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState(
    'Start Tenax Resolution Builder to create a roadmap that turns a resolution into daily execution.',
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = builderState?.step || 0;

  const normalizedStep = Math.min(Math.max(currentStep || 1, 1), 8);
  const activeStepIndex = normalizedStep - 1;
  const activeStepLabel = stepLabels[activeStepIndex];

  useEffect(() => {
    if (builderState?.completed) {
      setAssistantPrompt('Roadmap created. Open the Roadmaps page to review phases, resources, and daily tasks.');
    }
  }, [builderState?.completed]);

  const quickSuggestions = useMemo(() => {
    if (!builderState || builderState.step === 1) {
      return ['Master JavaScript', 'Become consistent with fitness', 'Learn AI engineering', 'Build my portfolio'];
    }
    if (builderState.step === 2) {
      return ['4 weeks', '8 weeks', '12 weeks', '2026-06-01'];
    }
    if (builderState.step === 3) {
      if (builderState.resolution_type === 'habit_based') {
        return ['4 days/week, 20 minutes', '3 days/week, 30 minutes', '5 days/week, 15 minutes'];
      }
      if (builderState.resolution_type === 'outcome_based') {
        return ['Ship MVP + demo', 'Portfolio + case studies', 'Certification + capstone'];
      }
      if (builderState.resolution_type === 'hybrid') {
        return ['Build 2 projects + jog 3 days/week', 'Learn core skills + 4 days/week routine'];
      }
      return ['Fundamentals + projects', 'Job-ready portfolio', 'Interview prep', 'Consistency and stamina'];
    }
    if (builderState.step === 4 && builderState.time_step === 'hours') {
      return ['4 hours', '6 hours', '8 hours'];
    }
    if (builderState.step === 4 && builderState.time_step === 'days') {
      return ['Mon Wed Sat', 'Weekdays', 'Weekend'];
    }
    if (builderState.step === 4 && builderState.time_step === 'blocks') {
      return ['Evenings', '7-9pm', 'Mornings'];
    }
    if (builderState.step === 5) {
      return ['Light', 'Standard', 'Intense'];
    }
    if (builderState.step === 6) {
      return ['Yes', 'No'];
    }
    if (builderState.step === 7) {
      return ['Approve', 'Edit', 'Cancel'];
    }
    return [];
  }, [builderState]);

  const sendMessage = async (text: string) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.post<ReplyPayload>('/agent/message', {
        channel: 'web',
        text,
        timestamp: new Date().toISOString(),
      });
      const reply = response.data?.replies?.[0];
      if (reply?.text) {
        setAssistantPrompt(reply.text);
      }
      if (reply?.metadata?.state) {
        setBuilderState(reply.metadata.state);
      }
    } catch (err) {
      console.error('Resolution builder message failed', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setError('Session expired. Please sign in again to continue.');
        return;
      }
      setError('Unable to reach the Resolution Builder.');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => {
    void sendMessage('Start Resolution Builder');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input.trim());
    setInput('');
  };

  const handleSuggestion = (value: string) => {
    setInput(value);
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-xl font-semibold text-black">Sign in to start the Resolution Builder</h2>
        <p className="mt-3 text-gray-500 text-sm">The guided roadmap uses your Tenax profile to schedule execution.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-gray-500">Tenax Resolution Builder</p>
            <h1 className="mt-3 text-3xl font-semibold text-black">From resolution to daily execution</h1>
            <p className="mt-3 text-gray-500 max-w-2xl text-sm">
              A controlled planning mode that converts a New Year resolution into a roadmap, schedule preview, and explicit
              execution handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleStart} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" /> Start Resolution Builder
            </Button>
            <Button variant="outline" onClick={() => window.location.assign('/dashboard/roadmap')}>
              View Roadmaps
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Guided flow</p>
              <h2 className="mt-2 text-xl font-semibold text-black">Resolution Builder stages</h2>
            </div>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs uppercase text-gray-600">
              Step {normalizedStep} / 8
            </span>
          </header>

          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              {builderState?.completed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Clock className="h-4 w-4 text-brand-500" />
              )}
              <div>
                <p className="text-sm font-medium text-black">{activeStepLabel}</p>
                <p className="text-xs text-gray-500">Step {normalizedStep}</p>
              </div>
            </div>
            <span className="text-xs uppercase text-gray-500">{builderState?.completed ? 'done' : 'active'}</span>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Tenax prompt</p>
            <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{assistantPrompt}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              rows={3}
              placeholder="Answer the current step prompt."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !input.trim()}>
                Send response <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {error && <span className="text-sm text-red-500">{error}</span>}
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 space-y-6">
          <header>
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Roadmaps live in</p>
            <h2 className="mt-2 text-xl font-semibold text-black">Resolution Roadmaps</h2>
            <p className="mt-2 text-sm text-gray-500">
              This page builds the plan. Review phases, resources, and daily execution inside the Roadmaps hub.
            </p>
          </header>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Current resolution</p>
            <p className="mt-2 text-base font-semibold text-black">{builderState?.resolution_goal || 'Awaiting goal'}</p>
            <p className="text-sm text-gray-500">{builderState?.target_outcome || 'Awaiting success definition'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Time reality check</p>
            <p className="mt-2 text-sm text-gray-600">
              Duration: {builderState?.duration_weeks ?? 'Not set'} weeks
              {builderState?.end_date ? ` (end ${builderState.end_date})` : ''}
            </p>
            <p className="text-sm text-gray-600">
              Hours per week: {builderState?.time_commitment_hours ?? 'Not set'}
            </p>
            <p className="text-sm text-gray-600">
              Days: {formatList((builderState?.days_free || []).map((day) => day.label))}
            </p>
            <p className="text-sm text-gray-600">
              Blocks: {formatList((builderState?.preferred_blocks || []).map((block) => block.label))}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.assign('/dashboard/roadmap')}>
            Go to Roadmaps
          </Button>
        </section>
      </div>

    </div>
  );
};

export default ResolutionBuilderPage;
