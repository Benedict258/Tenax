import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api";

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (roadmapId) {
          const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
          setData(response.data);
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
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((roadmap) => (
            <div key={roadmap.id} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Resolution</p>
              <p className="text-lg font-semibold text-black">{roadmap.goal_text}</p>
              <p className="text-sm text-gray-500">
                {roadmap.duration_weeks || ""} weeks {roadmap.resolution_type ? `• ${roadmap.resolution_type}` : ""}
              </p>
              <Button onClick={() => navigate(`/dashboard/roadmap/${roadmap.id}`)}>Open roadmap</Button>
            </div>
          ))}
        </div>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {phases.map((phase) => (
          <div key={phase.id} className="rounded-3xl border border-gray-200 bg-white p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Phase {phase.phase_index + 1}</p>
              <h2 className="text-lg font-semibold text-black">{phase.title}</h2>
              <p className="text-sm text-gray-500">{phase.description}</p>
              {phase.phase_objective && <p className={`text-sm ${Accent}`}>{phase.phase_objective}</p>}
            </div>
            {phase.what_to_learn_json?.length ? (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">What to learn</p>
                <ul className="list-disc pl-4 text-sm text-gray-600">
                  {phase.what_to_learn_json.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {phase.what_to_build_json?.length ? (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Deliverables</p>
                <ul className="list-disc pl-4 text-sm text-gray-600">
                  {phase.what_to_build_json.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {phase.resources && phase.resources.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Resources</p>
                <div className="space-y-1">
                  {phase.resources.map((resource) => (
                    <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className={`text-sm ${Accent}`}>
                      {resource.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => handleCompletePhase(phase.id)}
              disabled={phase.completion_status === "completed"}
            >
              {phase.completion_status === "completed" ? "Completed" : "Mark phase complete"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoadmapPage;
