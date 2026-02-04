import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../lib/api";
import { ArrowRight } from "lucide-react";

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
  plan?: { active_phase_index?: number | null };
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
  const activePhaseIndex = data?.plan?.active_phase_index ?? 1;

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
        {list.length === 0 ? (
          <p className="text-sm text-gray-500">No roadmaps yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((roadmap) => (
              <button
                key={roadmap.id}
                type="button"
                className="group rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-200"
                onClick={() => navigate(`/dashboard/roadmap/${roadmap.id}`)}
              >
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Roadmap</p>
                <h3 className="mt-2 text-lg font-semibold text-black">{roadmap.goal_text}</h3>
                <p className="mt-2 text-sm text-gray-500">
                  {roadmap.duration_weeks || "—"} weeks{" "}
                  {roadmap.resolution_type ? `• ${roadmap.resolution_type}` : ""}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-brand-500">
                  View roadmap
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6">
        <button
          type="button"
          className="text-xs uppercase tracking-[0.3em] text-gray-500"
          onClick={() => navigate("/dashboard/roadmap")}
        >
          Back to Roadmaps
        </button>
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {phases.map((phase) => {
            const progress = phaseProgress.get(phase.id);
            const objective = phase.phase_objective || phase.description || "";
            const progressText = progress?.total
              ? `Progress ${progress.done}/${progress.total} (${Math.round((progress.done / progress.total) * 100)}%)`
              : "Progress tracking available after tasks are scheduled.";
            const isActive = phase.phase_index + 1 === activePhaseIndex;
            const isLocked = phase.phase_index + 1 > activePhaseIndex;
            return (
              <button
                key={phase.id}
                type="button"
                className="group rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-200"
                onClick={() => navigate(`/dashboard/roadmap/${roadmapId}/phase/${phase.id}`)}
              >
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Phase {phase.phase_index + 1}</p>
                <h4 className="mt-2 text-lg font-semibold text-black">{phase.title}</h4>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {isActive && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Active</span>}
                  {isLocked && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">Locked</span>}
                </div>
                <p className="mt-2 text-sm text-gray-500">{objective || "Phase details available."}</p>
                <p className="mt-3 text-xs text-gray-400">{progressText}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-brand-500">
                  View phase
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

    </div>
  );
};

export default RoadmapPage;
