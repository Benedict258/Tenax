import React, { useState } from 'react';
import { useTasks } from '../../context/TasksContext';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { FeaturesSectionWithHoverEffects } from '../../components/ui/feature-section-with-hover-effects';

const ExecutionBoardPage = () => {
  const { tasks, deleteTask } = useTasks();
  const { summary } = useAnalytics();
  const tasksToday = tasks.length ? tasks : summary?.tasks?.today ?? [];
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (taskId?: string) => {
    if (!taskId) return;
    setDeleting(taskId);
    await deleteTask(taskId);
    setDeleting(null);
  };

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
            action: task.is_schedule_block ? null : (
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleDelete(task.id);
                }}
                disabled={!task.id || deleting === task.id}
                className="h-7 w-7"
              >
                <Trash2 className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            )
          }))}
        />
      )}
    </div>
  );
};

export default ExecutionBoardPage;
