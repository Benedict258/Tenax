import React, { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Download, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';

type DayOption = { label: string; dayOfWeek: number };
type BlockOption = { label: string; time: { hour: number; minute: number } };
type RoadmapPhase = { name: string; description: string; duration_weeks?: number };
type RoadmapResource = { title: string; url: string; type: string };
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
  target_outcome: string;
  time_commitment_hours: number | null;
  days_free: DayOption[];
  preferred_blocks: BlockOption[];
  roadmap_title: string;
  roadmap: RoadmapPhase[];
  resources: RoadmapResource[];
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

const stepLabels = [
  'Capture resolution',
  'Clarify outcome',
  'Time reality check',
  'Roadmap generation',
  'Resource enrichment',
  'Schedule preview',
  'Permission gate',
  'Execution handoff',
];

const formatList = (items: string[]) => (items.length ? items.join(', ') : 'Not set yet');

const safeText = (value: string) => value.replace(/[^\x20-\x7E]/g, '?');
const escapePdfText = (value: string) => safeText(value).replace(/([()\\])/g, '\\$1');
const escapeSvgText = (value: string) =>
  safeText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildRoadmapSvg = (state: ResolutionState | null) => {
  const title = state?.roadmap_title || 'Tenax Resolution Builder';
  const phases = state?.roadmap || [];
  const padding = 32;
  const lineHeight = 22;
  const width = 720;
  const height = Math.max(240, padding * 2 + (phases.length + 4) * lineHeight);
  const titleLine = `${escapeSvgText(title)}`;
  const lines = phases.map(
    (phase, index) => `Phase ${index + 1}: ${escapeSvgText(phase.name)} - ${escapeSvgText(phase.description)}`,
  );

  const textLines = [
    titleLine,
    `Goal: ${escapeSvgText(state?.resolution_goal || 'Not set')}`,
    `Outcome: ${escapeSvgText(state?.target_outcome || 'Not set')}`,
    'Roadmap:',
    ...lines,
  ];

  const textMarkup = textLines
    .map((line, index) => {
      const y = padding + lineHeight * index;
      return `<text x="${padding}" y="${y}" fill="#1f2937" font-size="14" font-family="Space Grotesk, Arial">${line}</text>`;
    })
    .join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="18" fill="#f8fafc" stroke="#e2e8f0"/>
  ${textMarkup}
</svg>`;
};

const buildPdf = (state: ResolutionState | null) => {
  const lines = [
    'Tenax Resolution Builder Summary',
    `Goal: ${state?.resolution_goal || 'Not set'}`,
    `Outcome: ${state?.target_outcome || 'Not set'}`,
    `Hours per week: ${state?.time_commitment_hours ?? 'Not set'}`,
    `Days: ${formatList((state?.days_free || []).map((day) => day.label))}`,
    `Time blocks: ${formatList((state?.preferred_blocks || []).map((block) => block.label))}`,
    'Roadmap:',
  ];

  (state?.roadmap || []).forEach((phase, index) => {
    lines.push(`${index + 1}. ${phase.name} - ${phase.description}`);
  });

  if (state?.schedule_preview?.length) {
    lines.push('Schedule preview:');
    state.schedule_preview.forEach((slot) => {
      lines.push(`${slot.day_label} ${slot.time_label}: ${slot.phase_name} - ${slot.focus}`);
    });
  }

  const content = [
    'BT',
    '/F1 12 Tf',
    '50 760 Td',
    ...lines.map((line, index) => `${index === 0 ? '' : '0 -16 Td '}(${escapePdfText(line)}) Tj`),
    'ET',
  ].join(' ');

  const encoder = new TextEncoder();
  const byteLength = (value: string) => encoder.encode(value).length;

  const parts: string[] = [];
  const offsets: number[] = [0];

  const pushPart = (value: string) => {
    parts.push(value);
    return byteLength(value);
  };

  let cursor = 0;
  cursor += pushPart('%PDF-1.3\n');

  const addObject = (index: number, body: string) => {
    offsets[index] = cursor;
    const objectString = `${index} 0 obj\n${body}\nendobj\n`;
    cursor += pushPart(objectString);
  };

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  );
  addObject(4, `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
  addObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const xrefStart = cursor;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    const offset = String(offsets[i]).padStart(10, '0');
    xref += `${offset} 00000 n \n`;
  }
  cursor += pushPart(xref);
  cursor += pushPart(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts, { type: 'application/pdf' });
};

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
  const roadmapPhases = builderState?.roadmap || [];
  const schedulePreview = builderState?.schedule_preview || [];
  const resources = builderState?.resources || [];

  const stepStatuses = useMemo(() => {
    if (!builderState) {
      return stepLabels.map(() => 'pending');
    }
    const hasTime =
      Boolean(builderState.time_commitment_hours) &&
      builderState.days_free.length > 0 &&
      builderState.preferred_blocks.length > 0;
    return [
      builderState.resolution_goal ? 'done' : 'active',
      builderState.target_outcome ? 'done' : currentStep >= 2 ? 'active' : 'pending',
      hasTime ? 'done' : currentStep >= 3 ? 'active' : 'pending',
      roadmapPhases.length ? 'done' : currentStep >= 4 ? 'active' : 'pending',
      currentStep > 5 ? 'done' : currentStep === 5 ? 'active' : 'pending',
      schedulePreview.length ? 'done' : currentStep >= 6 ? 'active' : 'pending',
      builderState.permission !== null ? 'done' : currentStep >= 7 ? 'active' : 'pending',
      builderState.completed ? 'done' : currentStep >= 8 ? 'active' : 'pending',
    ];
  }, [builderState, currentStep, roadmapPhases.length, schedulePreview.length]);

  const normalizedStep = Math.min(Math.max(currentStep || 1, 1), 8);
  const activeStepIndex = normalizedStep - 1;
  const activeStepLabel = stepLabels[activeStepIndex];
  const activeStepStatus = stepStatuses[activeStepIndex] || 'pending';

  const quickSuggestions = useMemo(() => {
    if (!builderState) {
      return ['Master JavaScript', 'Become consistent with fitness', 'Learn AI engineering', 'Build my portfolio'];
    }
    if (builderState.step === 1) {
      return ['Master JavaScript', 'Become consistent with fitness', 'Learn AI engineering', 'Build my portfolio'];
    }
    if (builderState.step === 2) {
      return ['Fundamentals + projects', 'Job-ready portfolio', 'Interview prep', 'Consistency and stamina'];
    }
    if (builderState.step === 3 && builderState.time_step === 'hours') {
      return ['4 hours', '6 hours', '8 hours'];
    }
    if (builderState.step === 3 && builderState.time_step === 'days') {
      return ['Mon Wed Sat', 'Weekdays', 'Weekend'];
    }
    if (builderState.step === 3 && builderState.time_step === 'blocks') {
      return ['Evenings', '7-9pm', 'Mornings'];
    }
    if (builderState.step === 5) {
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

  const handleDownloadImage = () => {
    const svgMarkup = buildRoadmapSvg(builderState);
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tenax-resolution-roadmap.svg';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const blob = buildPdf(builderState);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tenax-resolution-summary.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
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
            <Button variant="outline" onClick={handleDownloadImage} disabled={!roadmapPhases.length}>
              <Download className="mr-2 h-4 w-4" /> Download image
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf} disabled={!roadmapPhases.length}>
              <Download className="mr-2 h-4 w-4" /> Download PDF
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

          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
              activeStepStatus === 'done'
                ? 'border-emerald-200 bg-emerald-50'
                : activeStepStatus === 'active'
                ? 'border-brand-200 bg-brand-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              {activeStepStatus === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : activeStepStatus === 'active' ? (
                <Clock className="h-4 w-4 text-brand-500" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-gray-300" />
              )}
              <div>
                <p className="text-sm font-medium text-black">{activeStepLabel}</p>
                <p className="text-xs text-gray-500">Step {normalizedStep}</p>
              </div>
            </div>
            <span className="text-xs uppercase text-gray-500">{activeStepStatus}</span>
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
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Roadmap tree</p>
            <h2 className="mt-2 text-xl font-semibold text-black">Notebook-style plan view</h2>
            <p className="mt-2 text-sm text-gray-500">
              A visual path that mirrors roadmap.sh while staying anchored to your available time.
            </p>
          </header>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Resolution</p>
            <p className="mt-2 text-base font-semibold text-black">{builderState?.resolution_goal || 'Awaiting goal'}</p>
            <p className="text-sm text-gray-500">{builderState?.target_outcome || 'Awaiting success definition'}</p>
          </div>
          <div className="relative rounded-2xl border border-gray-200 bg-white p-5">
            <div className="absolute left-7 top-6 bottom-6 w-px bg-gray-200" />
            <div className="space-y-6 pl-10">
              {roadmapPhases.length ? (
                roadmapPhases.map((phase, index) => (
                  <div key={`${phase.name}-${index}`} className="relative">
                    <div className="absolute -left-6 top-2 h-3 w-3 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(200,90,71,0.4)]" />
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Phase {index + 1}</p>
                      <p className="mt-1 text-sm font-semibold text-black">{phase.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{phase.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Roadmap phases appear here after the time check.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Time reality check</p>
            <p className="mt-2 text-sm text-gray-600">
              Hours per week: {builderState?.time_commitment_hours ?? 'Not set'}
            </p>
            <p className="text-sm text-gray-600">
              Days: {formatList((builderState?.days_free || []).map((day) => day.label))}
            </p>
            <p className="text-sm text-gray-600">
              Blocks: {formatList((builderState?.preferred_blocks || []).map((block) => block.label))}
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Schedule preview</p>
              <h3 className="mt-2 text-xl font-semibold text-black">Execution-ready draft</h3>
            </div>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs uppercase text-gray-600">
              Preview only
            </span>
          </header>
          <div className="mt-4 space-y-3">
            {schedulePreview.length ? (
              schedulePreview.map((slot, index) => (
                <div key={`${slot.day_label}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{slot.day_label}</p>
                  <p className="mt-1 text-sm font-semibold text-black">{slot.phase_name}</p>
                  <p className="text-xs text-gray-500">{slot.focus}</p>
                  <p className="mt-2 text-xs text-gray-600">Time: {slot.time_label}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Schedule preview appears after resources are handled.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <header>
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Learning resources</p>
            <h3 className="mt-2 text-xl font-semibold text-black">Optional enrichment</h3>
          </header>
          <div className="mt-4 space-y-3">
            {resources.length ? (
              resources.map((resource) => (
                <a
                  key={resource.title}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-300"
                >
                  <p className="text-sm font-semibold text-black">{resource.title}</p>
                  <p className="text-xs text-gray-500">{resource.type}</p>
                  <p className="mt-1 text-xs text-brand-500">{resource.url}</p>
                </a>
              ))
            ) : (
              <p className="text-sm text-gray-500">Resources appear if you approve enrichment in step 5.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ResolutionBuilderPage;

