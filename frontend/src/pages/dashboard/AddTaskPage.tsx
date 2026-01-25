import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { useTasks } from '../../context/TasksContext';
import { useAnalytics } from '../../context/AnalyticsContext';
import type { Task } from '../../types/analytics';

const priorityOptions = [
  { label: 'P1 • Non-negotiable', value: 'P1', helper: 'Pinned to the front of Today view' },
  { label: 'P2 • Important', value: 'P2', helper: 'Scheduled but flexible within the day' },
  { label: 'P3 • Nice to have', value: 'P3', helper: 'Fills the flexible block when time opens up' },
];

const AddTaskPage = () => {
  const { createTask, tasks, loading } = useTasks();
  const { summary } = useAnalytics();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>('P2');
  const [time, setTime] = useState('');
  const [hasFixedTime, setHasFixedTime] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setStatusMessage('Task name is required.');
      return;
    }
    setStatusMessage(null);
    const isoTime = hasFixedTime && time ? new Date(time).toISOString() : null;
    const result = await createTask({
      title,
      description,
      priority,
      time_for_execution: isoTime,
      category: priority === 'P1' ? 'P1' : 'Manual',
    });
    if (result) {
      setTitle('');
      setDescription('');
      setPriority('P2');
      setTime('');
      setHasFixedTime(false);
      setStatusMessage('Task added. It now appears in Today + agent context.');
    }
  };

  const flexibleTasks = tasks.filter((task) => !task.start_time);
  const scheduledTasks = tasks.filter((task) => task.start_time);
  const pinnedLive = tasks.filter((task) => task.severity?.toLowerCase() === 'p1');
  const pinnedTasks = pinnedLive.length ? pinnedLive : summary?.tasks?.pinned ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.4em] text-white/40">Manual creation</p>
        <h2 className="text-2xl font-semibold">Add a task</h2>
        <p className="text-white/60 text-sm mt-2">Everything added here syncs instantly to Today view, WhatsApp, and web chat.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-white/60">Task name *</label>
            <input
              className="mt-2 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g., Deep work sprint, 10 pages of reading"
            />
          </div>
          <div>
            <label className="text-sm text-white/60">Description</label>
            <textarea
              className="mt-2 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Details, links, or acceptance criteria"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {priorityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPriority(option.value as 'P1' | 'P2' | 'P3')}
                className={`rounded-2xl border px-3 py-3 text-left ${
                  priority === option.value ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/10 bg-black/30'
                }`}
              >
                <p className="font-semibold">{option.label}</p>
                <p className="text-white/50 text-xs">{option.helper}</p>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 space-y-3">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" checked={hasFixedTime} onChange={(event) => setHasFixedTime(event.target.checked)} />
              This task has a fixed time
            </label>
            {hasFixedTime ? (
              <input
                type="datetime-local"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3"
              />
            ) : (
              <p className="text-white/50 text-sm">No fixed time → It will land in the flexible block.</p>
            )}
          </div>
          {statusMessage && <p className="text-sm text-cyan-300">{statusMessage}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Syncing…' : 'Create task'}
          </Button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-white/40">Today preview</p>
          <p className="text-white/60 text-sm">P1s stay pinned. Everything else slots into execution blocks.</p>
        </div>
        <div className="space-y-4">
          <TaskGroup label="Pinned P1" tasks={pinnedTasks} emptyLabel="Declare at least one P1 to keep Tenax strict." />
          <TaskGroup label="Scheduled" tasks={scheduledTasks} emptyLabel="No fixed windows yet." />
          <TaskGroup label="Flexible block" tasks={flexibleTasks} emptyLabel="Add a task with no time to populate this." />
        </div>
      </section>
    </div>
  );
};

const TaskGroup = ({ label, tasks, emptyLabel }: { label: string; tasks: Task[]; emptyLabel: string }) => (
  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
    <div className="flex items-center justify-between">
      <p className="text-sm uppercase tracking-[0.3em] text-white/40">{label}</p>
      <span className="text-white/50 text-xs">{tasks.length} tasks</span>
    </div>
    <div className="mt-3 flex flex-col gap-3">
      {tasks.length === 0 && <p className="text-white/50 text-sm">{emptyLabel}</p>}
      {tasks.map((task) => (
        <div key={task.id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold">{task.title}</p>
            <p className="text-white/50 text-xs">{task.category || 'Manual'}</p>
          </div>
          <div className="text-right text-sm text-white/60">
            <p>{task.start_time ? new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Flexible'}</p>
            {task.severity && <span className="text-xs uppercase">{task.severity}</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default AddTaskPage;
