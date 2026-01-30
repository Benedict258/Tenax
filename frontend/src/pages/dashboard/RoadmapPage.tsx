import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
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
  const [daily, setDaily] = useState<Record<string, any[]>>({});
  const [planTasks, setPlanTasks] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (roadmapId) {
          const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
          setData(response.data);
          if (response.data?.plan_id) {
            const taskResponse = await apiClient.get(`/resolution/plan/${response.data.plan_id}/tasks`);
            setDaily(taskResponse.data?.grouped || {});
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
          <p className="mt-2 text-sm text-gray-500">Pick a roadmap to review phases and progress.</p>
        </div>
        {list.length === 0 && <p className="text-sm text-gray-500">No roadmaps yet.</p>}
        <FeaturesSectionWithHoverEffects
          features={list.map((roadmap) => ({
            title: roadmap.goal_text,
            description: `${roadmap.duration_weeks || ""} weeks ${
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
        <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Daily execution</p>
        <h2 className="text-xl font-semibold text-black">Resolution Builder tasks</h2>
        {Object.keys(daily).length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No daily tasks yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {Object.entries(daily).map(([date, tasks]) => (
              <div key={date} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{date}</p>
                <div className="mt-3 space-y-2">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-black">{task.title}</p>
                      {task.objective && <p className="text-xs text-gray-500">{task.objective}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-black">Phases</h3>
        </div>
        <FeaturesSectionWithHoverEffects
          features={phases.map((phase) => ({
            title: `Phase ${phase.phase_index + 1}`,
            description: (() => {
              const progress = phaseProgress.get(phase.id);
              if (!progress || !progress.total) {
                return `${phase.title} · In progress`;
              }
              const percent = Math.round((progress.done / progress.total) * 100);
              return `${phase.title} · Progress ${progress.done}/${progress.total} (${percent}%)`;
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
