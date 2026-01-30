import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
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

type TimetableRow = {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string | null;
  category?: string | null;
};

const dayLookup: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const ScheduleDayDetailPage = () => {
  const { day } = useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dayIndex = Number(day);
  const dayLabel = dayLookup[dayIndex] || 'Day';

  useEffect(() => {
    const loadRows = async () => {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/schedule/extractions/${user.id}`);
        const allRows = response.data?.rows || [];
        setRows(allRows.filter((row: TimetableRow) => row.day_of_week === dayIndex));
      } catch (err) {
        console.error('Failed to load day blocks', err);
        setError('Unable to load timetable blocks.');
      } finally {
        setLoading(false);
      }
    };

    if (Number.isNaN(dayIndex)) {
      setError('Invalid day selected.');
      setLoading(false);
      return;
    }
    if (user?.id) {
      loadRows();
    }
  }, [user?.id, dayIndex]);

  const columns: ColumnDef<TimetableRow>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <TableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'start_time',
        header: ({ column }) => <TableColumnHeader column={column} title="Window" />,
        cell: ({ row }) => (
          <span>
            {row.original.start_time?.slice(0, 5)} - {row.original.end_time?.slice(0, 5)}
          </span>
        ),
      },
      {
        accessorKey: 'location',
        header: ({ column }) => <TableColumnHeader column={column} title="Location" />,
        cell: ({ row }) => <span>{row.original.location || '-'}</span>,
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <TableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => <span>{row.original.category || 'class'}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Daily schedule</p>
            <h2 className="mt-2 text-2xl font-semibold text-black">{dayLabel}</h2>
            <p className="text-sm text-gray-500">{rows.length} blocks scheduled</p>
          </div>
          <CalendarDays className="h-5 w-5 text-gray-500" />
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        {loading && <p className="text-sm text-gray-500">Loading blocks...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && (
          <TableProvider columns={columns} data={rows} className="border rounded-lg">
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

export default ScheduleDayDetailPage;
