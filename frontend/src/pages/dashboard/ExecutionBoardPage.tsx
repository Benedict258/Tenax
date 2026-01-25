import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { format } from 'date-fns';
import { useTasks } from '../../context/TasksContext';

const ExecutionBoardPage = () => {
  const { tasks, createTask, loading, refresh } = useTasks();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [severity, setSeverity] = useState('p2');
  const [startTime, setStartTime] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    await createTask({
      title,
      category,
      priority: severity.toUpperCase() as 'P1' | 'P2' | 'P3',
      time_for_execution: startTime ? new Date(startTime).toISOString() : null,
    });
    setTitle('');
    setStartTime('');
    setSeverity('p2');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">Execution queue</p>
            <h2 className="text-2xl font-semibold">Today’s board</h2>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/60">
            <span>{tasks.length} tasks</span>
            <button type="button" onClick={refresh} className="text-cyan-300 underline-offset-4 hover:underline">
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          {tasks.length === 0 && <p className="text-white/60">No tasks yet. Use the form to seed the run.</p>}
          {tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{task.title}</p>
                <p className="text-xs text-white/50">{task.category || 'General'}</p>
              </div>
              <div className="text-right text-sm text-white/70 space-y-1">
                <p>{task.start_time ? format(new Date(task.start_time), 'h:mmaaa') : '—'}</p>
                {task.severity && (
                  <span className="inline-flex rounded-full border border-white/20 px-3 py-0.5 text-xs uppercase">
                    {task.severity}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Add a task</p>
        <h3 className="text-xl font-semibold mt-2">Drop tasks straight from the command deck</h3>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder:text-white/40"
          />
          <input
            placeholder="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder:text-white/40"
          />
          <input
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder:text-white/40"
          />
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-white"
          >
            <option value="p1">P1</option>
            <option value="p2">P2</option>
            <option value="p3">P3</option>
          </select>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging…' : 'Commit to board'}
          </Button>
        </form>
        <p className="text-white/50 text-xs mt-4">
          Tasks sync instantly to the unified task system and are available to the agent across WhatsApp + web.
        </p>
      </section>
    </div>
  );
};

export default ExecutionBoardPage;
