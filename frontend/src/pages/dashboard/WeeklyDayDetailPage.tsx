import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { useTasks } from '../../context/TasksContext';
import {
  TableBody,
  TableCell,
  TableColumnHeader,
  TableHead,
  TableHeader,
  TableHeaderGroup,
  TableProvider,
  TableRow,
} from '../../components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays } from 'lucide-react';

type TaskRow = {
  id: string;
  title: string;
  category?: string;
  status?: string;
  start_time?: string | null;
  created_at?: string;
  description?: string | null;
  objective?: string | null;
  metadata?: { resources?: Array<{ title?: string; url?: string }> };
};

const WeeklyDayDetailPage = () => {
  const { date } = useParams();
  const { tasks: cachedTasks } = useTasks();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/tasks');
        setTasks(response.data || []);
      } catch (err) {
        console.error('Failed to load tasks', err);
        setError('Unable to load tasks for this day.');
      } finally {
        setLoading(false);
      }
    };

    if (cachedTasks.length) {
      setTasks(cachedTasks as TaskRow[]);
      setLoading(false);
    } else {
      loadTasks();
    }
  }, [cachedTasks]);

  const targetDate = date ? new Date(date) : new Date();
  const dayLabel = targetDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const dayTasks = useMemo(() => {
    return tasks.filter((task) => {
      const base = task.start_time || task.created_at;
      if (!base) return false;
      const ts = new Date(base);
      return ts >= start && ts < end;
    });
  }, [tasks, start, end]);

  const columns: ColumnDef<TaskRow>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <TableColumnHeader column={column} title="Task" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            {row.original.objective && (
              <div className="text-xs text-muted-foreground">{row.original.objective}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <TableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => <span>{row.original.category || 'General'}</span>,
      },
      {
        id: 'details',
        header: ({ column }) => <TableColumnHeader column={column} title="Details" />,
        cell: ({ row }) => (
          <div className="space-y-1 text-xs text-muted-foreground">
            {row.original.description && <div>{row.original.description}</div>}
            {row.original.metadata?.resources?.length ? (
              <div className="space-y-1">
                {row.original.metadata.resources.slice(0, 2).map((resource, index) =>
                  resource?.url ? (
                    <a
                      key={`${resource.url}-${index}`}
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-blue-600 hover:underline"
                    >
                      {resource.title || 'Resource'}
                    </a>
                  ) : null
                )}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'start_time',
        header: ({ column }) => <TableColumnHeader column={column} title="Time" />,
        cell: ({ row }) =>
          row.original.start_time
            ? new Date(row.original.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Flexible',
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <TableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <span className="uppercase text-xs">{row.original.status || 'todo'}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Daily view</p>
            <h2 className="mt-2 text-2xl font-semibold text-black">{dayLabel}</h2>
            <p className="text-sm text-gray-500">{dayTasks.length} tasks scheduled</p>
          </div>
          <CalendarDays className="h-5 w-5 text-gray-500" />
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        {loading && <p className="text-sm text-gray-500">Loading tasks...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && (
          <TableProvider columns={columns} data={dayTasks} className="border rounded-lg">
            <TableHeader>
              {({ headerGroup }) => (
                <TableHeaderGroup key={headerGroup.id} headerGroup={headerGroup}>
                  {({ header }) => <TableHead key={header.id} header={header} />}
                </TableHeaderGroup>
              )}
            </TableHeader>
            <TableBody>
              {({ row }) => (
                <TableRow key={row.id} row={row}>
                  {({ cell }) => <TableCell key={cell.id} cell={cell} />}
                </TableRow>
              )}
            </TableBody>
          </TableProvider>
        )}
      </section>
    </div>
  );
};

export default WeeklyDayDetailPage;
