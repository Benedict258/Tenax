import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';
import Loader from '../../components/ui/loader';

interface TimetableRow {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string;
  category?: string;
  confidence?: number;
}

interface UploadSnapshot {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  failure_reason?: string | null;
  uploaded_at?: string;
}

interface TimetableFormState {
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  category: string;
}

const emptyForm: TimetableFormState = {
  title: '',
  day_of_week: 1,
  start_time: '',
  end_time: '',
  location: '',
  category: 'class',
};

const dayOptions = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
];

const dayLookup = dayOptions.reduce<Record<number, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const categoryOptions = ['class', 'lab', 'study', 'exam', 'other'];

const withSeconds = (value: string) => {
  if (!value) return '';
  return value.length === 5 ? `${value}:00` : value;
};

const toTimeInput = (value?: string) => {
  if (!value) return '';
  return value.slice(0, 5);
};

const ScheduleEditorPage = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [form, setForm] = useState<TimetableFormState>(emptyForm);
  const [editingRow, setEditingRow] = useState<TimetableRow | null>(null);
  const [editForm, setEditForm] = useState<TimetableFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [latestUpload, setLatestUpload] = useState<UploadSnapshot | null>(null);
  const previousUploadStatusRef = useRef<string | null>(null);
  const optimisticRowsRef = useRef<Record<string, TimetableRow>>({});

  const fetchRows = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/schedule/extractions/${user.id}`);
      setRows(response.data?.rows || []);
      optimisticRowsRef.current = {};
    } catch (err) {
      console.error('Failed to load timetable rows', err);
      setError('Unable to load timetable rows.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const fetchLatestUpload = useCallback(async () => {
    if (!user?.id) {
      setLatestUpload(null);
      return;
    }
    try {
      const response = await apiClient.get(`/schedule/uploads/${user.id}/latest`);
      setLatestUpload(response.data?.upload || null);
    } catch (err) {
      console.warn('Latest upload fetch failed', err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLatestUpload();
  }, [fetchLatestUpload]);

  useEffect(() => {
    const prev = previousUploadStatusRef.current;
    if (latestUpload?.status === 'done' && prev && prev !== 'done') {
      fetchRows();
      setStatus('Timetable auto-synced from OCR upload.');
    }
    previousUploadStatusRef.current = latestUpload?.status || null;
  }, [latestUpload, fetchRows]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const shouldPoll = latestUpload && ['pending', 'processing'].includes(latestUpload.status);
    if (!shouldPoll) return undefined;
    const interval = setInterval(() => {
      fetchLatestUpload();
      fetchRows();
    }, 8000);
    return () => clearInterval(interval);
  }, [latestUpload, fetchLatestUpload, fetchRows, user?.id]);

  useEffect(() => {
    if (!status) return undefined;
    const timeout = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timeout);
  }, [status]);

  const canSubmitCreate = useMemo(() => {
    return form.title.trim() && form.start_time && form.end_time;
  }, [form]);

  const canSubmitUpdate = useMemo(() => {
    return editingRow !== null && editForm.title.trim() && editForm.start_time && editForm.end_time;
  }, [editForm, editingRow]);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const timeToMinutes = (value: string) => {
    if (!value) return null;
    const [hour, minute] = value.split(':');
    const h = Number(hour);
    const m = Number(minute);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  const overlapsExisting = useCallback(
    (candidate: TimetableFormState, ignoreId?: string | null) => {
      const start = timeToMinutes(candidate.start_time);
      const end = timeToMinutes(candidate.end_time);
      if (start == null || end == null || start >= end) {
        setValidationError('Start time must be before end time.');
        return true;
      }
      const conflict = rows.some((row) => {
        if (row.day_of_week !== candidate.day_of_week) return false;
        if (row.id === ignoreId) return false;
        if (!row.start_time || !row.end_time) return false;
        const rowStart = timeToMinutes(row.start_time.slice(0, 5));
        const rowEnd = timeToMinutes(row.end_time.slice(0, 5));
        if (rowStart == null || rowEnd == null) return false;
        return start < rowEnd && rowStart < end;
      });
      if (conflict) {
        setValidationError('Overlap detected on this day. Adjust the window or edit the existing block.');
      } else {
        setValidationError(null);
      }
      return conflict;
    },
    [rows],
  );

  const pushOptimisticRow = (row: TimetableRow) => {
    optimisticRowsRef.current[row.id] = row;
    setRows((prev) => [row, ...prev]);
  };

  const removeOptimisticRow = (tempId: string) => {
    if (!optimisticRowsRef.current[tempId]) return;
    delete optimisticRowsRef.current[tempId];
    setRows((prev) => prev.filter((row) => row.id !== tempId));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canSubmitCreate) {
      setStatus('Fill the required fields first.');
      return;
    }
    if (overlapsExisting(form)) {
      return;
    }
    setSaving(true);
    setStatus(null);
    const tempId = `temp-${Date.now()}`;
    const optimisticRow: TimetableRow = {
      id: tempId,
      title: form.title.trim(),
      day_of_week: form.day_of_week,
      start_time: withSeconds(form.start_time),
      end_time: withSeconds(form.end_time),
      location: form.location,
      category: form.category,
    };
    pushOptimisticRow(optimisticRow);
    try {
      await apiClient.post(`/schedule/extractions/${user.id}`, {
        title: form.title.trim(),
        day_of_week: form.day_of_week,
        start_time: withSeconds(form.start_time),
        end_time: withSeconds(form.end_time),
        location: form.location || undefined,
        category: form.category || undefined,
      });
      setStatus('Block added to timetable.');
      resetForm();
      await fetchRows();
    } catch (err) {
      console.error('Failed to create timetable row', err);
      setStatus('Unable to add block right now.');
      removeOptimisticRow(tempId);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSelect = (row: TimetableRow) => {
    setEditingRow(row);
    setEditForm({
      title: row.title,
      day_of_week: row.day_of_week,
      start_time: toTimeInput(row.start_time),
      end_time: toTimeInput(row.end_time),
      location: row.location || '',
      category: row.category || 'class',
    });
    setStatus(null);
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingRow || !canSubmitUpdate) {
      setStatus('Select a block to edit and fill required fields.');
      return;
    }
    setSaving(true);
    setStatus(null);
    if (overlapsExisting(editForm, editingRow.id)) {
      setSaving(false);
      return;
    }
    const previousSnapshot = rows;
    setRows((prev) =>
      prev.map((row) =>
        row.id === editingRow.id
          ? {
              ...row,
              title: editForm.title,
              day_of_week: editForm.day_of_week,
              start_time: withSeconds(editForm.start_time),
              end_time: withSeconds(editForm.end_time),
              location: editForm.location,
              category: editForm.category,
            }
          : row,
      ),
    );
    try {
      await apiClient.patch(`/schedule/extractions/row/${editingRow.id}`, {
        title: editForm.title.trim(),
        day_of_week: editForm.day_of_week,
        start_time: withSeconds(editForm.start_time),
        end_time: withSeconds(editForm.end_time),
        location: editForm.location || undefined,
        category: editForm.category || undefined,
      });
      setStatus('Block updated.');
      await fetchRows();
    } catch (err) {
      console.error('Failed to update timetable row', err);
      setStatus('Unable to update block.');
      setRows(previousSnapshot);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rowId: string) => {
    if (!window.confirm('Delete this block?')) {
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await apiClient.delete(`/schedule/extractions/row/${rowId}`);
      if (editingRow?.id === rowId) {
        setEditingRow(null);
      }
      await fetchRows();
      setStatus('Block removed.');
    } catch (err) {
      console.error('Failed to delete timetable row', err);
      setStatus('Unable to delete block right now.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center space-y-3">
        <p className="text-xl font-semibold text-black">Sign in to unlock timetable tooling</p>
        <p className="text-gray-500">Manual schedule edits feed Tenax reminders and conflict detection.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-4">
        <Loader />
        <p className="text-gray-600">Syncing timetable...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Timetable intelligence</p>
            <h2 className="text-2xl font-semibold text-black">Manual schedule editor</h2>
            <p className="text-gray-500 text-sm">Curate class blocks so reminders stay conflict-aware.</p>
          </div>
          <Button variant="ghost" className="border border-gray-200 text-gray-600" onClick={fetchRows}>
            Refresh
          </Button>
        </div>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        {status && <p className="mt-4 text-sm text-emerald-600">{status}</p>}
        {validationError && <p className="mt-2 text-sm text-amber-500">{validationError}</p>}
        {latestUpload && latestUpload.status !== 'done' && (
          <p className="mt-4 text-sm text-gray-600">
            Latest upload is <span className="font-semibold">{latestUpload.status}</span>. Rows will auto-populate once
            processing completes.
          </p>
        )}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Window</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No timetable blocks yet. Use the form below to seed the day.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-200">
                  <td className="px-3 py-3 font-semibold">{dayLookup[row.day_of_week] || '-'}</td>
                  <td className="px-3 py-3 text-gray-600">
                    {row.start_time?.slice(0, 5)} - {row.end_time?.slice(0, 5)}
                  </td>
                  <td className="px-3 py-3">{row.title}</td>
                  <td className="px-3 py-3 text-gray-500">{row.location || '-'}</td>
                  <td className="px-3 py-3 text-gray-500">{row.category || 'class'}</td>
                  <td className="px-3 py-3 space-x-2">
                    <Button size="sm" variant="ghost" className="border border-gray-200 text-gray-700" onClick={() => handleEditSelect(row)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="border border-red-200 text-red-500" onClick={() => handleDelete(row.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Add block</p>
          <h3 className="text-xl font-semibold text-black">Seed recurring slots</h3>
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <TimetableForm form={form} setForm={setForm} disabled={saving} />
            <Button type="submit" className="w-full" disabled={!canSubmitCreate || saving}>
              {saving ? 'Saving...' : 'Add to timetable'}
            </Button>
          </form>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Edit selection</p>
          <h3 className="text-xl font-semibold text-black">Fine-tune existing blocks</h3>
          {!editingRow && <p className="mt-3 text-gray-500 text-sm">Select a block above to populate this editor.</p>}
          {editingRow && (
            <form className="mt-4 space-y-4" onSubmit={handleUpdate}>
              <TimetableForm form={editForm} setForm={setEditForm} disabled={saving} />
              <Button type="submit" className="w-full" disabled={!canSubmitUpdate || saving}>
                {saving ? 'Updating...' : 'Update block'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

interface TimetableFormProps {
  form: TimetableFormState;
  setForm: React.Dispatch<React.SetStateAction<TimetableFormState>>;
  disabled?: boolean;
}

const TimetableForm = ({ form, setForm, disabled }: TimetableFormProps) => (
  <>
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-sm text-gray-500">Title *</label>
        <input
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          disabled={disabled}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
          placeholder="Course or block label"
          type="text"
        />
      </div>
      <div>
        <label className="text-sm text-gray-500">Day of week</label>
        <select
          value={form.day_of_week}
          onChange={(event) => setForm((prev) => ({ ...prev, day_of_week: Number(event.target.value) }))}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
          disabled={disabled}
        >
          {dayOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-sm text-gray-500">Start time *</label>
        <input
          type="time"
          value={form.start_time}
          onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
          disabled={disabled}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
        />
      </div>
      <div>
        <label className="text-sm text-gray-500">End time *</label>
        <input
          type="time"
          value={form.end_time}
          onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
          disabled={disabled}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
        />
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-sm text-gray-500">Location</label>
        <input
          value={form.location}
          onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
          disabled={disabled}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
          placeholder="Room, hall, lab"
          type="text"
        />
      </div>
      <div>
        <label className="text-sm text-gray-500">Category</label>
        <select
          value={form.category}
          onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3"
          disabled={disabled}
        >
          {categoryOptions.map((option) => (
            <option key={option} value={option}>
              {option.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
    </div>
  </>
);

export default ScheduleEditorPage;

