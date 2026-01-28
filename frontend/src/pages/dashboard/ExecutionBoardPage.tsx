import React from 'react';
import { useTasks } from '../../context/TasksContext';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ClipboardList } from 'lucide-react';
import { FeaturesSectionWithHoverEffects } from '../../components/ui/feature-section-with-hover-effects';

const ExecutionBoardPage = () => {
  const { tasks } = useTasks();
  const { summary } = useAnalytics();
  const tasksToday = tasks.length ? tasks : summary?.tasks?.today ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gray-500">Execution board</p>
          <h2 className="text-2xl font-semibold text-black">Today&apos;s Execution Board</h2>
          <p className="text-sm text-gray-500">All tasks scheduled for today.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-semibold text-black">{tasksToday.length}</p>
        </div>
      </header>

      {tasksToday.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Nothing scheduled today. Add via WhatsApp or the Add Task page.
        </div>
      ) : (
        <FeaturesSectionWithHoverEffects
          features={tasksToday.map((task) => ({
            title: task.title,
            description: `${task.category || 'General'} • ${
              task.start_time
                ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Flexible'
            }${task.severity ? ` • ${task.severity}` : ''}`,
            icon: <ClipboardList />,
          }))}
        />
      )}
    </div>
  );
};

export default ExecutionBoardPage;
