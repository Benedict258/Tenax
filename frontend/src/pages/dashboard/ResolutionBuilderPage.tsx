import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Download, Sparkles, Lock } from 'lucide-react';
import { toJpeg, toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';

const stepLabels = [
  'Capture resolution',
  'Clarify outcome',
  'Set duration',
  'Time reality check',
  'Pick pace',
  'Roadmap + resources',
  'Schedule preview',
  'Execution handoff',
];

type DayOption = { label: string; dayOfWeek: number };
type BlockOption = { label: string; time: { hour: number; minute: number } };

type RoadmapTopic = {
  title: string;
  subtopics?: string[];
  type?: 'core' | 'optional';
};

type RoadmapResource = {
  title: string;
  url: string;
  kind?: string;
  difficulty?: string;
};

type RoadmapPhase = {
  phase_index: number;
  title: string;
  description: string;
  objectives?: string[];
  topics?: RoadmapTopic[];
  resources?: RoadmapResource[];
  completion_criteria?: { type: 'manual_confirm' | 'threshold'; threshold?: number };
  duration_weeks?: number;
};

type Roadmap = {
  goal: string;
  duration_weeks: number;
  title: string;
  phases: RoadmapPhase[];
};

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
  duration_weeks: number | null;
  end_date: string | null;
  time_commitment_hours: number | null;
  days_free: DayOption[];
  preferred_blocks: BlockOption[];
  pace?: string;
  roadmap: Roadmap | null;
  resources: RoadmapResource[];
  schedule_preview: ScheduleSlot[];
  permission: boolean | null;
  active: boolean;
  completed: boolean;
  time_step?: string;
  edit_mode?: boolean;
};

type ResolutionPlan = {
  id: string;
  title: string;
  goal_text: string;
  target_outcome: string | null;
  duration_weeks: number | null;
  end_date: string | null;
  status: string;
  roadmap_json: Roadmap | null;
  svg_url?: string | null;
  png_url?: string | null;
  pdf_url?: string | null;
};

type ResolutionPhase = {
  id: string;
  plan_id: string;
  phase_index: number;
  title: string;
  description: string;
  objectives_json?: string[];
  topics_json?: RoadmapTopic[];
  resources_json?: RoadmapResource[];
  completion_status: string;
  completion_criteria_json?: { type: 'manual_confirm' | 'threshold'; threshold?: number };
};

type ResolutionTask = {
  id: string;
  plan_id: string;
  phase_id: string | null;
  date: string;
  start_time: string | null;
  title: string;
  objective: string | null;
  description: string | null;
  resources_json?: RoadmapResource[];
  status: 'todo' | 'done';
  order_index: number;
  locked: boolean;
};

type ActivePlanPayload = {
  plan: ResolutionPlan;
  phases: ResolutionPhase[];
  tasks: ResolutionTask[];
};

type ReplyPayload = {
  replies?: Array<{ text: string; metadata?: { state?: ResolutionState } }>;
};

const formatList = (items: string[]) => (items.length ? items.join(', ') : 'Not set yet');

const formatTime = (value: string | null) => {
  if (!value) return 'Flexible';
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute || 0).padStart(2, '0')} ${suffix}`;
};

const getPhaseProgress = (phase: ResolutionPhase, tasks: ResolutionTask[]) => {
  const phaseTasks = tasks.filter((task) => task.phase_id === phase.id);
  const total = phaseTasks.length || 1;
  const completed = phaseTasks.filter((task) => task.status === 'done').length;
  return {
    total,
    completed,
    ratio: completed / total,
    threshold: phase.completion_criteria_json?.threshold ?? 0.8,
  };
};

const RoadmapTreeSvg = ({ roadmap }: { roadmap: Roadmap | null }) => {
  if (!roadmap) {
    return <p className="text-sm text-gray-500">Roadmap tree renders here once generated.</p>;
  }

  const nodeWidth = 260;
  const nodeHeight = 54;
  const topicWidth = 240;
  const topicHeight = 40;
  const verticalGap = 30;
  const topicGap = 14;
  const leftPad = 60;
  const width = 960;
  const centerX = width / 2;
  const rootX = centerX - nodeWidth / 2;
  const phaseX = rootX;
  const topicX = phaseX + 20;
  const truncate = (value: string, max = 28) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

  let cursorY = 40;
  const rootY = cursorY;
  cursorY += nodeHeight + verticalGap;

  const phases = roadmap.phases || [];
  const phasePositions = phases.map((phase) => {
    const phaseY = cursorY;
    cursorY += nodeHeight + topicGap;
    const topics = phase.topics || [];
    const topicPositions = topics.map((topic) => {
      const topicY = cursorY;
      cursorY += topicHeight + topicGap;
      return { topic, y: topicY };
    });
    cursorY += verticalGap;
    return { phase, phaseY, topics: topicPositions };
  });

  const height = Math.max(380, cursorY + 20);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
      <rect width={width} height={height} rx="24" fill="#f8fafc" />
      <rect x="12" y="12" width={width - 24} height={height - 24} rx="20" fill="#ffffff" stroke="#e2e8f0" />

      <g>
        <rect x={rootX} y={rootY} width={nodeWidth} height={nodeHeight} rx="14" fill="#111827" />
        <text x={rootX + 16} y={rootY + 22} fill="#f8fafc" fontSize="13" fontWeight="600">
          {truncate(roadmap.goal)}
        </text>
        <text x={rootX + 16} y={rootY + 40} fill="#cbd5f5" fontSize="11">
          {roadmap.duration_weeks} weeks
        </text>
      </g>

      {phasePositions.map((entry) => (
        <g key={entry.phase.title}>
          <line
            x1={centerX}
            y1={rootY + nodeHeight}
            x2={centerX}
            y2={entry.phaseY}
            stroke="#cbd5f5"
            strokeWidth="1.6"
          />
          <rect x={phaseX} y={entry.phaseY} width={nodeWidth} height={nodeHeight} rx="12" fill="#1f2937" />
          <text x={phaseX + 14} y={entry.phaseY + 22} fill="#f9fafb" fontSize="12" fontWeight="600">
            {truncate(entry.phase.title)}
          </text>
          <text x={phaseX + 14} y={entry.phaseY + 40} fill="#9ca3af" fontSize="10">
            {truncate(entry.phase.description, 32)}
          </text>

          {entry.topics.map((topic) => (
            <g key={`${entry.phase.title}-${topic.topic.title}`}>
              <line
                x1={phaseX + nodeWidth / 2}
                y1={entry.phaseY + nodeHeight}
                x2={topicX}
                y2={topic.y + topicHeight / 2}
                stroke="#e2e8f0"
                strokeWidth="1.4"
              />
              <rect x={topicX} y={topic.y} width={topicWidth} height={topicHeight} rx="10" fill="#ffffff" stroke="#e2e8f0" />
              <text x={topicX + 12} y={topic.y + 24} fill="#111827" fontSize="11" fontWeight="500">
                {truncate(topic.topic.title, 30)}
              </text>
              {topic.topic.type && (
                <text x={topicX + topicWidth - 54} y={topic.y + 24} fill="#6b7280" fontSize="9">
                  [{topic.topic.type}]
                </text>
              )}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
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
  const [activePlan, setActivePlan] = useState<ActivePlanPayload | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);

  const currentStep = builderState?.step || 0;
  const schedulePreview = builderState?.schedule_preview || [];
  const roadmapPhases = builderState?.roadmap?.phases || activePlan?.plan?.roadmap_json?.phases || [];
  const resources =
    builderState?.roadmap?.phases?.flatMap((phase) => phase.resources || []) ||
    activePlan?.plan?.roadmap_json?.phases?.flatMap((phase) => phase.resources || []) ||
    [];

  const normalizedStep = Math.min(Math.max(currentStep || 1, 1), 8);
  const activeStepIndex = normalizedStep - 1;
  const activeStepLabel = stepLabels[activeStepIndex];

  const fetchActivePlan = async () => {
    if (!user) return;
    try {
      const response = await apiClient.get<ActivePlanPayload>('/resolution/active');
      setActivePlan(response.data);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) {
        console.error('Failed to load active resolution plan', err);
      }
    }
  };

  useEffect(() => {
    void fetchActivePlan();
  }, [user]);

  useEffect(() => {
    if (builderState?.completed) {
      void fetchActivePlan();
    }
  }, [builderState?.completed]);

  const quickSuggestions = useMemo(() => {
    if (!builderState || builderState.step === 1) {
      return ['Master JavaScript', 'Become consistent with fitness', 'Learn AI engineering', 'Build my portfolio'];
    }
    if (builderState.step === 2) {
      return ['Fundamentals + projects', 'Job-ready portfolio', 'Interview prep', 'Consistency and stamina'];
    }
    if (builderState.step === 3) {
      return ['4 weeks', '8 weeks', '12 weeks', '2026-06-01'];
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

  const handleDownloadImage = async (format: 'png' | 'jpg') => {
    if (!treeRef.current) return;
    const dataUrl = format === 'png'
      ? await toPng(treeRef.current, { cacheBust: true })
      : await toJpeg(treeRef.current, { cacheBust: true, quality: 0.95 });

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `tenax-resolution-roadmap.${format}`;
    anchor.click();

    if (activePlan?.plan?.id) {
      await apiClient.post(`/resolution/plan/${activePlan.plan.id}/assets`, {
        kind: format,
        dataUrl,
        filename: `roadmap.${format}`
      });
    }
  };

  const handleDownloadSvg = async () => {
    if (!treeRef.current) return;
    const dataUrl = await toSvg(treeRef.current, { cacheBust: true });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'tenax-resolution-roadmap.svg';
    anchor.click();

    if (activePlan?.plan?.id) {
      await apiClient.post(`/resolution/plan/${activePlan.plan.id}/assets`, {
        kind: 'svg',
        dataUrl,
        filename: 'roadmap.svg'
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!activePlan?.plan) return;
    const plan = activePlan.plan;
    const phases = activePlan.phases;
    const tasks = activePlan.tasks;
    const weekLabel = (dateStr: string) => {
      const date = new Date(`${dateStr}T00:00:00`);
      const day = (date.getDay() + 6) % 7;
      const monday = new Date(date);
      monday.setDate(date.getDate() - day);
      return `Week of ${monday.toISOString().slice(0, 10)}`;
    };

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 56;

    const addHeading = (text: string, size = 18) => {
      doc.setFontSize(size);
      doc.setTextColor('#111827');
      doc.text(text, 48, y);
      y += size + 12;
    };

    const addBody = (text: string, size = 11) => {
      doc.setFontSize(size);
      doc.setTextColor('#374151');
      const lines = doc.splitTextToSize(text, 500);
      doc.text(lines, 48, y);
      y += lines.length * (size + 3) + 8;
    };

    addHeading('Tenax Resolution Builder Summary');
    addBody(`Resolution: ${plan.goal_text}`);
    addBody(`Target outcome: ${plan.target_outcome || 'Not set'}`);
    addBody(`Duration: ${plan.duration_weeks || 'n/a'} weeks${plan.end_date ? ` (ends ${plan.end_date})` : ''}`);

    addHeading('Phase Breakdown', 14);
    phases.forEach((phase) => {
      addBody(`${phase.phase_index + 1}. ${phase.title}`);
      addBody(phase.description);
      const objectives = phase.objectives_json || [];
      if (objectives.length) {
        addBody(`Objectives: ${objectives.join('; ')}`);
      }
      const topics = phase.topics_json || [];
      if (topics.length) {
        addBody(`Key topics: ${topics.map((topic) => topic.title).join(', ')}`);
      }
      const resources = phase.resources_json || [];
      if (resources.length) {
        addBody('Resources:');
        resources.forEach((resource) => {
          doc.setTextColor('#2563eb');
          doc.textWithLink(`- ${resource.title}`, 56, y, { url: resource.url });
          y += 16;
          doc.setTextColor('#374151');
        });
      }
      y += 6;
    });

    addHeading('Weekly Pacing', 14);
    const groupedWeeks = tasks.reduce<Record<string, ResolutionTask[]>>((acc, task) => {
      const key = weekLabel(task.date);
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});
    Object.entries(groupedWeeks).forEach(([week, weekTasks]) => {
      addBody(`${week}: ${weekTasks.length} sessions`);
      weekTasks.slice(0, 3).forEach((task) => {
        addBody(`- ${task.title}`);
      });
    });

    const pdfDataUrl = doc.output('datauristring');
    doc.save('tenax-resolution-summary.pdf');

    await apiClient.post(`/resolution/plan/${plan.id}/assets`, {
      kind: 'pdf',
      dataUrl: pdfDataUrl,
      filename: 'tenax-resolution-summary.pdf'
    });
  };

  const handleTaskToggle = async (task: ResolutionTask) => {
    if (task.status === 'done' || task.locked) return;
    await apiClient.post(`/resolution/tasks/${task.id}/complete`);
    await fetchActivePlan();
  };

  const handlePhaseConfirm = async (phaseId: string) => {
    await apiClient.post(`/resolution/phases/${phaseId}/complete`);
    await fetchActivePlan();
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
            <Button variant="outline" onClick={() => handleDownloadImage('png')} disabled={!roadmapPhases.length}>
              <Download className="mr-2 h-4 w-4" /> Download PNG
            </Button>
            <Button variant="outline" onClick={() => handleDownloadImage('jpg')} disabled={!roadmapPhases.length}>
              <Download className="mr-2 h-4 w-4" /> Download JPG
            </Button>
            <Button variant="outline" onClick={handleDownloadSvg} disabled={!roadmapPhases.length}>
              <Download className="mr-2 h-4 w-4" /> Download SVG
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf} disabled={!activePlan?.plan?.id}>
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
          <div className="rounded-2xl border border-gray-200 bg-white p-4" ref={treeRef}>
            <RoadmapTreeSvg roadmap={builderState?.roadmap || activePlan?.plan?.roadmap_json || null} />
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
            <h3 className="mt-2 text-xl font-semibold text-black">Linked references</h3>
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
                  <p className="text-xs text-gray-500">{resource.kind || resource.difficulty || 'Resource'}</p>
                  <p className="mt-1 text-xs text-brand-500">{resource.url}</p>
                </a>
              ))
            ) : (
              <p className="text-sm text-gray-500">Resources appear after the roadmap is generated.</p>
            )}
          </div>
        </section>
      </div>

      {activePlan && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Daily execution</p>
              <h3 className="mt-2 text-xl font-semibold text-black">Tasks mapped to your schedule</h3>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(
              activePlan.tasks.reduce<Record<string, ResolutionTask[]>>((acc, task) => {
                if (!acc[task.date]) acc[task.date] = [];
                acc[task.date].push(task);
                return acc;
              }, {}),
            ).map(([date, tasks]) => (
              <div key={date} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{date}</p>
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-black">{task.title}</p>
                        <p className="text-xs text-gray-500">{task.objective}</p>
                        <p className="mt-2 text-xs text-gray-600">{task.description}</p>
                        <p className="mt-2 text-xs text-gray-500">Time: {formatTime(task.start_time)}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleTaskToggle(task)}
                        disabled={task.status === 'done' || task.locked}
                      >
                        {task.locked ? <Lock className="h-4 w-4" /> : task.status === 'done' ? 'Done' : 'Mark done'}
                      </Button>
                    </div>
                    {task.resources_json && task.resources_json.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {task.resources_json.map((resource) => (
                          <a
                            key={`${task.id}-${resource.title}`}
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-brand-500"
                          >
                            {resource.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {activePlan.phases.map((phase) => {
              const progress = getPhaseProgress(phase, activePlan.tasks);
              const ready = progress.ratio >= progress.threshold && phase.completion_status !== 'completed';
              const manualConfirm = phase.completion_criteria_json?.type === 'manual_confirm';
              return (
                <div key={phase.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Phase {phase.phase_index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-black">{phase.title}</p>
                  <p className="text-xs text-gray-500">{phase.description}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Progress: {progress.completed}/{progress.total} ({Math.round(progress.ratio * 100)}%)
                  </p>
                  {ready && phase.completion_status !== 'completed' && (
                    <p className="mt-2 text-xs text-amber-600">Ready to complete. Confirm to unlock next phase.</p>
                  )}
                  {(manualConfirm || phase.completion_status === 'ready') && phase.completion_status !== 'completed' && (
                    <div className="mt-3">
                      <Button variant="outline" onClick={() => handlePhaseConfirm(phase.id)}>
                        Mark phase complete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default ResolutionBuilderPage;
