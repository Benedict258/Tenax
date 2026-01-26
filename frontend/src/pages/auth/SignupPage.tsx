import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';

const roleOptions = ['Student', 'Developer/Builder', 'Professional', 'Creator', 'Self-learner', 'Other'];
const reasons = [
  'Build daily consistency',
  'Improve focus',
  'Reduce procrastination',
  'Stick to routines',
  'Balance school + personal work',
  'Execute long-term goals',
];
const availabilityOptions = ['Morning-focused', 'Evening-focused', 'Mixed', 'Irregular'];
const toneOptions = ['Friendly', 'Balanced', 'Strict but supportive'];
const timezoneOptions = ['Africa/Lagos', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore'];

const SignupPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    preferredName: '',
    email: '',
    phone: '',
    primaryGoal: '',
    dailyStart: '07:00',
    timezone: 'Africa/Lagos',
    availability: 'Mixed',
    tone: 'Balanced',
    enforceP1: true,
    enforceWorkout: false,
    enforcePreClass: false,
    enforcePostClass: false,
    timetableEnabled: false,
    calendarConnected: false,
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['Student']);
  const [selectedReasons, setSelectedReasons] = useState<string[]>(['Build daily consistency']);

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() &&
      form.preferredName.trim() &&
      form.email.trim() &&
      form.phone.trim() &&
      form.primaryGoal.trim() &&
      selectedRoles.length > 0 &&
      selectedReasons.length > 0
    );
  }, [form, selectedReasons.length, selectedRoles.length]);

  const toggleSelection = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setError('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await register({
        name: form.name,
        preferred_name: form.preferredName,
        email: form.email,
        phone_number: form.phone,
        role: selectedRoles.length === 1 ? selectedRoles[0] : selectedRoles, // backend supports array or string
        reason_for_using: selectedReasons,
        primary_goal: form.primaryGoal,
        daily_start_time: form.dailyStart,
        timezone: form.timezone,
        availability_pattern: form.availability,
        tone_preference: form.tone,
        enforce_daily_p1: form.enforceP1,
        enforce_workout: form.enforceWorkout,
        enforce_pre_class_reading: form.enforcePreClass,
        enforce_post_class_review: form.enforcePostClass,
        timetable_upload_enabled: form.timetableEnabled,
        google_calendar_connected: form.calendarConnected,
      });
      navigate('/dashboard/today');
    } catch (err) {
      console.error('Signup failed', err);
      setError('Unable to complete signup right now. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#03040b] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/30 via-transparent to-cyan-400/20 blur-[200px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <header className="flex flex-col gap-2 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">Tenax onboarding</p>
          <h1 className="text-4xl font-semibold">Day 1 setup</h1>
          <p className="text-white/60">Only the inputs that help the agent execute correctly from day one.</p>
        </header>
        <form onSubmit={handleSubmit} className="mt-10 space-y-10">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Identity</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input label="Full name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} required />
              <Input label="Preferred name" value={form.preferredName} onChange={(value) => setForm((prev) => ({ ...prev, preferredName: value }))} required />
              <Input label="Email" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} required />
              <Input label="Phone number" placeholder="+234..." value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} required />
              <Select label="Timezone" value={form.timezone} options={timezoneOptions} onChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))} />
              <div>
                <label className="text-sm text-white/60">Daily start time</label>
                <input
                  type="time"
                  value={form.dailyStart}
                  onChange={(event) => setForm((prev) => ({ ...prev, dailyStart: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-6">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-white/40">Role</p>
              <p className="text-white/60 text-sm">Pick everything that applies.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {roleOptions.map((role) => (
                <CheckboxChip
                  key={role}
                  label={role}
                  checked={selectedRoles.includes(role)}
                  onChange={() => toggleSelection(role, selectedRoles, setSelectedRoles)}
                />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-6">
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-white/40">Reason for using Tenax</p>
              <p className="text-white/60 text-sm">This keeps the agent on-mission.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {reasons.map((reason) => (
                <CheckboxChip
                  key={reason}
                  label={reason}
                  checked={selectedReasons.includes(reason)}
                  onChange={() => toggleSelection(reason, selectedReasons, setSelectedReasons)}
                />
              ))}
            </div>
            <Input
              label="Primary goal (1–2 max)"
              value={form.primaryGoal}
              onChange={(value) => setForm((prev) => ({ ...prev, primaryGoal: value }))}
              required
            />
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 grid gap-6 md:grid-cols-2">
            <Select label="Availability pattern" value={form.availability} options={availabilityOptions} onChange={(value) => setForm((prev) => ({ ...prev, availability: value }))} />
            <Select label="Tone preference" value={form.tone} options={toneOptions} onChange={(value) => setForm((prev) => ({ ...prev, tone: value }))} />
            <Toggle label="Enforce daily P1" checked={form.enforceP1} onChange={(checked) => setForm((prev) => ({ ...prev, enforceP1: checked }))} />
            <Toggle label="Enforce workout" checked={form.enforceWorkout} onChange={(checked) => setForm((prev) => ({ ...prev, enforceWorkout: checked }))} />
            <Toggle label="Enforce pre-class reading" checked={form.enforcePreClass} onChange={(checked) => setForm((prev) => ({ ...prev, enforcePreClass: checked }))} />
            <Toggle label="Enforce post-class review" checked={form.enforcePostClass} onChange={(checked) => setForm((prev) => ({ ...prev, enforcePostClass: checked }))} />
            <Toggle label="Timetable upload ready" checked={form.timetableEnabled} onChange={(checked) => setForm((prev) => ({ ...prev, timetableEnabled: checked }))} helper="Optional. You can add this later." />
            <Toggle label="Google Calendar connected" checked={form.calendarConnected} onChange={(checked) => setForm((prev) => ({ ...prev, calendarConnected: checked }))} helper="Optional, read-only." />
          </section>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={!canSubmit || submitting} className="w-full md:w-auto">
              {submitting ? 'Setting up…' : 'Launch Tenax'}
            </Button>
            <p className="text-white/60 text-sm text-center">
              Timetable upload is optional. Tenax works immediately after signup.
            </p>
            <p className="text-white/40 text-xs text-center">
              Already onboarded? <Link to="/dashboard/today" className="text-cyan-300 underline">Enter the command deck</Link>.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}

const Input = ({ label, value, onChange, required, placeholder, type = 'text' }: InputProps) => (
  <div>
    <label className="text-sm text-white/60">{label}{required && ' *'}</label>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 placeholder:text-white/40"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) => (
  <div>
    <label className="text-sm text-white/60">{label}</label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

const CheckboxChip = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) => (
  <button
    type="button"
    onClick={onChange}
    className={`rounded-2xl border px-4 py-3 text-left transition ${checked ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/10 bg-black/30'}`}
  >
    <p className="font-semibold">{label}</p>
    <p className="text-white/50 text-xs">{checked ? 'Selected' : 'Tap to include'}</p>
  </button>
);

const Toggle = ({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (value: boolean) => void; helper?: string }) => (
  <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1"
    />
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {helper && <p className="text-white/50 text-xs">{helper}</p>}
    </div>
  </label>
);

export default SignupPage;
