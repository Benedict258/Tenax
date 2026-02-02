import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../lib/api";
import { FeaturesSectionWithHoverEffects } from "../../components/ui/feature-section-with-hover-effects";
import { LineChart } from "lucide-react";

const Accent = "text-brand-500";

type Roadmap = {
  id: string;
  goal_text: string;
  resolution_type: string | null;
  duration_weeks: number | null;
};

type Phase = {
  id: string;
  phase_index: number;
  title: string;
  description: string | null;
  phase_objective: string | null;
  what_to_learn_json?: string[];
  what_to_build_json?: string[];
  resources?: Array<{ id: string; title: string; url: string; type?: string | null }>;
  completion_status: string;
};

type RoadmapPayload = {
  roadmap: Roadmap;
  phases: Phase[];
  plan_id?: string | null;
};

type RoadmapListPayload = {
  roadmaps: Roadmap[];
};

const RoadmapPage = () => {
  const { roadmapId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<RoadmapPayload | null>(null);
  const [list, setList] = useState<Roadmap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [planTasks, setPlanTasks] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (roadmapId) {
          const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
          setData(response.data);
          if (response.data?.plan_id) {
            const taskResponse = await apiClient.get(`/resolution/plan/${response.data.plan_id}/tasks`);
            setPlanTasks(taskResponse.data?.tasks || []);
          }
        } else {
          const response = await apiClient.get<RoadmapListPayload>("/resolution/roadmaps");
          setList(response.data.roadmaps || []);
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load roadmap data.");
      }
    };
    void fetchData();
  }, [roadmapId]);

  const phases = data?.phases || [];

  const phaseProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    phases.forEach((phase) => {
      const phaseTasks = planTasks.filter((task) => task.phase_id === phase.id);
      const total = phaseTasks.length;
      const done = phaseTasks.filter((task) => task.status === "done").length;
      map.set(phase.id, { total, done });
    });
    return map;
  }, [phases, planTasks]);

  const handleCompletePhase = async (phaseId: string) => {
    if (!roadmapId) return;
    await apiClient.post(`/resolution/roadmaps/${roadmapId}/phases/${phaseId}/complete`);
    const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
    setData(response.data);
  };

  if (!roadmapId) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <h1 className="text-2xl font-semibold text-black">Resolution Roadmaps</h1>
          <p className="mt-2 text-sm text-gray-500">Pick a roadmap to review phases, objectives, and progress.</p>
        </div>
        {list.length === 0 && <p className="text-sm text-gray-500">No roadmaps yet.</p>}
        <FeaturesSectionWithHoverEffects
          features={list.map((roadmap) => ({
            title: roadmap.goal_text,
            description: `${roadmap.duration_weeks || "—"} weeks ${
              roadmap.resolution_type ? `• ${roadmap.resolution_type}` : ""
            }`,
            icon: <LineChart className="h-5 w-5" />,
            href: `/dashboard/roadmap/${roadmap.id}`
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-black">{data?.roadmap.goal_text || "Resolution Roadmap"}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {data?.roadmap.duration_weeks} weeks {data?.roadmap.resolution_type ? `• ${data.roadmap.resolution_type}` : ""}
        </p>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-black">Phases</h3>
        </div>
        <FeaturesSectionWithHoverEffects
          features={phases.map((phase) => ({
            title: `Phase ${phase.phase_index + 1}: ${phase.title}`,
            description: (() => {
              const progress = phaseProgress.get(phase.id);
              const objective = phase.phase_objective || phase.description || '';
              if (!progress || !progress.total) {
                return `${objective || 'In progress'}`;
              }
              const percent = Math.round((progress.done / progress.total) * 100);
              return `${objective ? `${objective} · ` : ''}Progress ${progress.done}/${progress.total} (${percent}%)`;
            })(),
            icon: <LineChart className="h-5 w-5" />,
            href: `/dashboard/roadmap/${roadmapId}/phase/${phase.id}`
          }))}
        />
      </section>

    </div>
  );
};

export default RoadmapPage;
