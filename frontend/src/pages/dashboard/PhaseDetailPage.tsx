import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api";

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
  completion_criteria_json?: { type?: string; threshold?: number; criteria?: string[] };
};

type RoadmapPayload = {
  roadmap: { id: string; goal_text: string };
  phases: Phase[];
};

const PhaseDetailPage = () => {
  const { roadmapId, phaseId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (!roadmapId || !phaseId) return;
        const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
        const match = response.data?.phases?.find((item) => item.id === phaseId) || null;
        setPhase(match);
      } catch (err) {
        console.error(err);
        setError("Unable to load phase details.");
      }
    };
    void load();
  }, [roadmapId, phaseId]);

  const completionCriteria = useMemo(() => {
    const criteria = phase?.completion_criteria_json?.criteria;
    if (Array.isArray(criteria) && criteria.length) return criteria;
    return [];
  }, [phase]);

  const handleComplete = async () => {
    if (!roadmapId || !phaseId) return;
    setSaving(true);
    try {
      await apiClient.post(`/resolution/roadmaps/${roadmapId}/phases/${phaseId}/complete`);
      const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
      const match = response.data?.phases?.find((item) => item.id === phaseId) || null;
      setPhase(match);
    } catch (err) {
      console.error(err);
      setError("Unable to mark phase complete.");
    } finally {
      setSaving(false);
    }
  };

  if (!phase) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">{error || "Loading phase..."}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Phase {phase.phase_index + 1}</p>
        <h1 className="mt-2 text-2xl font-semibold text-black">{phase.title}</h1>
        {phase.description && <p className="mt-2 text-sm text-gray-600">{phase.description}</p>}
        {phase.phase_objective && <p className="mt-2 text-sm text-brand-500">{phase.phase_objective}</p>}
        <div className="mt-4 flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
          <Button variant="outline" onClick={handleComplete} disabled={phase.completion_status === "completed" || saving}>
            {phase.completion_status === "completed" ? "Completed" : "Mark phase complete"}
          </Button>
        </div>
      </section>

      {phase.what_to_learn_json?.length ? (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">What to learn</p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
            {phase.what_to_learn_json.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {phase.what_to_build_json?.length ? (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Deliverables</p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
            {phase.what_to_build_json.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {completionCriteria.length ? (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Completion criteria</p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
            {completionCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {phase.resources && phase.resources.length > 0 && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Resources</p>
          <div className="mt-3 space-y-2">
            {phase.resources.map((resource) => (
              <a
                key={resource.id}
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-brand-500"
              >
                {resource.title}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PhaseDetailPage;
