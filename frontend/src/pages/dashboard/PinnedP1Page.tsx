import React from 'react';
import { useTasks } from '../../context/TasksContext';
import { useAnalytics } from '../../context/AnalyticsContext';
import { Flame } from 'lucide-react';
import { FeaturesSectionWithHoverEffects } from '../../components/ui/feature-section-with-hover-effects';

const PinnedP1Page = () => {
  const { tasks } = useTasks();
  const { summary } = useAnalytics();
  const pinnedTasks = tasks.length
    ? tasks.filter((task) => task.severity?.toLowerCase() === 'p1')
    : summary?.tasks?.pinned ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Pinned P1</p>
          <h2 className="text-2xl font-semibold text-black">P1 Focus List</h2>
          <p className="text-sm text-gray-500">Your non-negotiable priorities.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-semibold text-black">{pinnedTasks.length}</p>
        </div>
      </header>

      {pinnedTasks.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No active P1. Tell Tenax your next non-negotiable.
        </div>
      ) : (
        <FeaturesSectionWithHoverEffects
          features={pinnedTasks.map((task) => ({
            title: task.title,
            description: `${task.category || 'General'} • ${
              task.start_time
                ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Flexible'
            }${task.severity ? ` • ${task.severity}` : ''}`,
            icon: <Flame />,
          }))}
        />
      )}
    </div>
  );
};

export default PinnedP1Page;
