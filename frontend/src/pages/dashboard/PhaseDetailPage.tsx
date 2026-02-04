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
  phase_end_goal?: string | null;
  objectives_json?: string[];
  what_to_learn_json?: string[];
  what_to_build_json?: string[];
  topics_json?: Array<{ title?: string | null }>;
  resources?: Array<{ id: string; title: string; url: string; type?: string | null }>;
  completion_status: string;
  completion_criteria_json?: { type?: string; threshold?: number; criteria?: string[]; end_goal?: string };
};

type RoadmapPayload = {
  roadmap: { id: string; goal_text: string };
  phases: Phase[];
  plan_id?: string | null;
};

const PhaseDetailPage = () => {
  const { roadmapId, phaseId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [planTasks, setPlanTasks] = useState<Array<{ id: string; phase_id?: string | null; date?: string | null; title: string; objective?: string | null; description?: string | null; resources_json?: Array<{ title?: string | null; url?: string | null }> }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (!roadmapId || !phaseId) return;
        const response = await apiClient.get<RoadmapPayload>(`/resolution/roadmaps/${roadmapId}`);
        const match = response.data?.phases?.find((item) => item.id === phaseId) || null;
        setPhase(match);
        if (response.data?.plan_id) {
          const taskResponse = await apiClient.get(`/resolution/plan/${response.data.plan_id}/tasks`);
          const tasks = taskResponse.data?.tasks || [];
          setPlanTasks(tasks);
        }
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

  const learnItems = useMemo(() => {
    if (phase?.what_to_learn_json?.length) {
      return phase.what_to_learn_json;
    }
    if (phase?.topics_json?.length) {
      return phase.topics_json.map((topic) => topic?.title).filter(Boolean) as string[];
    }
    return [];
  }, [phase]);

  const deliverables = useMemo(() => phase?.what_to_build_json || [], [phase]);

  const learningOutcomes = useMemo(() => {
    if (phase?.objectives_json?.length) {
      return phase.objectives_json;
    }
    return learnItems;
  }, [phase, learnItems]);

  const objectiveText = phase?.phase_objective || phase?.description || "";
  const endGoalText = useMemo(() => {
    if (phase?.completion_criteria_json?.end_goal) {
      return phase.completion_criteria_json.end_goal;
    }
    if (deliverables.length) {
      return deliverables[deliverables.length - 1];
    }
    const criteria = phase?.completion_criteria_json?.criteria;
    if (Array.isArray(criteria) && criteria.length) {
      return criteria[0];
    }
    return "";
  }, [phase, deliverables]);

  const phaseTasksByDate = useMemo<Record<string, typeof planTasks>>(() => {
    if (!phase?.id) return {};
    return planTasks
      .filter((task) => task.phase_id === phase.id)
      .reduce<Record<string, typeof planTasks>>((acc, task) => {
        const dateKey = task.date ?? "unscheduled";
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(task);
        return acc;
      }, {});
  }, [planTasks, phase?.id]);

  const resources = useMemo(() => {
    const list = phase?.resources || [];
    const seen = new Set<string>();
    return list.filter((item) => {
      if (!item.url) return false;
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
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
        {objectiveText && (
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Objective</p>
              <p className="mt-2">{objectiveText}</p>
            </div>
            {endGoalText && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">End goal</p>
                <p className="mt-2">{endGoalText}</p>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
          <Button variant="outline" onClick={handleComplete} disabled={phase.completion_status === "completed" || saving}>
            {phase.completion_status === "completed" ? "Completed" : "Mark phase complete"}
          </Button>
        </div>
      </section>

      {learningOutcomes.length ? (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Learning outcomes</p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
            {learningOutcomes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {deliverables.length ? (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Deliverables</p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
            {deliverables.map((item) => (
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

      {resources.length > 0 && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Resources</p>
          <div className="mt-3 space-y-2">
            {resources.map((resource) => (
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

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Tasks mapped to your schedule</p>
        <h3 className="mt-2 text-xl font-semibold text-black">Phase execution</h3>
        {Object.keys(phaseTasksByDate).length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No scheduled tasks tied to this phase yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {Object.entries(phaseTasksByDate).map(([date, tasks]) => (
              <div key={date} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{date}</p>
                <div className="mt-3 space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-black">{task.title}</p>
                      {task.objective && <p className="text-xs text-gray-500">{task.objective}</p>}
                      {task.description && <p className="text-xs text-gray-600 mt-1">{task.description}</p>}
                      {task.resources_json?.length ? (
                        <div className="mt-2 space-y-1">
                          {task.resources_json.map((resource) => (
                            <a
                              key={`${task.id}-${resource.title || resource.url}`}
                              href={resource.url || undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-xs text-brand-500"
                            >
                              {resource.title || resource.url}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PhaseDetailPage;
