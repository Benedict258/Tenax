import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthShell, PrimaryButton } from '../../components/ui/auth-form';
import AuthWizard from '../../components/ui/auth-wizard';

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
  const [searchParams] = useSearchParams();
  const prefillEmail = searchParams.get('email') || '';
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    preferredName: '',
    email: prefillEmail,
    password: '',
    phone: '',
    primaryGoal1: '',
    primaryGoal2: '',
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
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  const toggleSelection = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const goNext = () => {
    setDirection('forward');
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const goBack = () => {
    setDirection('backward');
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const validateStep = () => {
    setError(null);
    if (step === 0) {
      if (!form.name.trim() || !form.preferredName.trim() || !form.email.trim() || !form.password.trim()) {
        setError('Fill in all required fields to continue.');
        return false;
      }
      if (form.password.trim().length < 8) {
        setError('Password must be at least 8 characters.');
        return false;
      }
      return true;
    }
    if (step === 1) {
      if (!selectedRoles.length) {
        setError('Pick at least one role.');
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (!selectedReasons.length) {
        setError('Pick at least one reason.');
        return false;
      }
      if (!form.primaryGoal1.trim()) {
        setError('Add at least one primary goal.');
        return false;
      }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    goNext();
  };

  const buildPrimaryGoal = () => {
    const goals = [form.primaryGoal1, form.primaryGoal2].map((goal) => goal.trim()).filter(Boolean);
    return goals.slice(0, 2).join(' | ');
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    const primaryGoal = buildPrimaryGoal();
    if (!primaryGoal) {
      setError('Add at least one primary goal.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        preferred_name: form.preferredName,
        email: form.email,
        password: form.password,
        phone_number: form.phone || undefined,
        role: selectedRoles.length === 1 ? selectedRoles[0] : selectedRoles,
        reason_for_using: selectedReasons,
        primary_goal: primaryGoal,
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
      };
      const result = await register(payload);
      if (result?.needs_email_confirmation) {
        navigate(`/auth/check-email?email=${encodeURIComponent(form.email)}`);
        return;
      }
      navigate('/dashboard/today');
    } catch (err: any) {
      console.error('Signup failed', err);
      const message = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(typeof message === 'string' ? message : 'Unable to complete signup right now. Try again shortly.');
      setStep(0);
    } finally {
      setSubmitting(false);
    }
  };

  const stepContent = [
    <section key="identity" className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">Step 1 of 4</p>
        <h2 className="mt-2 text-xl font-semibold text-black">Identity</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Full name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} required />
        <Input label="Preferred name" value={form.preferredName} onChange={(value) => setForm((prev) => ({ ...prev, preferredName: value }))} required />
        <Input label="Email" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} required />
        <Input label="Password" type="password" value={form.password} onChange={(value) => setForm((prev) => ({ ...prev, password: value }))} required />
        <Input label="Phone number (optional for WhatsApp)" placeholder="+234..." value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
        <Select label="Timezone" value={form.timezone} options={timezoneOptions} onChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))} />
        <div>
          <label className="text-sm text-zinc-500">Daily start time *</label>
          <input
            type="time"
            value={form.dailyStart}
            onChange={(event) => setForm((prev) => ({ ...prev, dailyStart: event.target.value }))}
            className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3"
          />
        </div>
      </div>
    </section>,
    <section key="roles" className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">Step 2 of 4</p>
        <h2 className="mt-2 text-xl font-semibold text-black">Role</h2>
        <p className="text-sm text-zinc-500">Pick everything that applies.</p>
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
    </section>,
    <section key="reasons" className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">Step 3 of 4</p>
        <h2 className="mt-2 text-xl font-semibold text-black">Why Tenax</h2>
        <p className="text-sm text-zinc-500">Pick everything that applies.</p>
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
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Primary goal (required)"
          value={form.primaryGoal1}
          onChange={(value) => setForm((prev) => ({ ...prev, primaryGoal1: value }))}
          required
        />
        <Input
          label="Primary goal (optional second)"
          value={form.primaryGoal2}
          onChange={(value) => setForm((prev) => ({ ...prev, primaryGoal2: value }))}
        />
      </div>
    </section>,
    <section key="preferences" className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">Step 4 of 4</p>
        <h2 className="mt-2 text-xl font-semibold text-black">Preferences + Setup</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Select label="Availability pattern" value={form.availability} options={availabilityOptions} onChange={(value) => setForm((prev) => ({ ...prev, availability: value }))} />
        <Select label="Tone preference" value={form.tone} options={toneOptions} onChange={(value) => setForm((prev) => ({ ...prev, tone: value }))} />
        <Toggle label="Enforce daily P1" checked={form.enforceP1} onChange={(checked) => setForm((prev) => ({ ...prev, enforceP1: checked }))} />
        <Toggle label="Enforce workout" checked={form.enforceWorkout} onChange={(checked) => setForm((prev) => ({ ...prev, enforceWorkout: checked }))} />
        <Toggle label="Enforce pre-class reading" checked={form.enforcePreClass} onChange={(checked) => setForm((prev) => ({ ...prev, enforcePreClass: checked }))} />
        <Toggle label="Enforce post-class review" checked={form.enforcePostClass} onChange={(checked) => setForm((prev) => ({ ...prev, enforcePostClass: checked }))} />
        <Toggle label="Timetable/schedule upload" checked={form.timetableEnabled} onChange={(checked) => setForm((prev) => ({ ...prev, timetableEnabled: checked }))} helper="Optional. You can add this later." />
        <Toggle label="Google Calendar connect" checked={form.calendarConnected} onChange={(checked) => setForm((prev) => ({ ...prev, calendarConnected: checked }))} helper="Optional, read-only." />
      </div>
    </section>,
  ];

  const canLaunch = useMemo(() => {
    return (
      form.name.trim() &&
      form.preferredName.trim() &&
      form.email.trim() &&
      form.password.trim().length >= 8 &&
      selectedRoles.length > 0 &&
      selectedReasons.length > 0 &&
      form.primaryGoal1.trim()
    );
  }, [form, selectedRoles.length, selectedReasons.length]);

  return (
    <AuthShell
      title="Create your Tenax account"
      subtitle="Already have an account?"
      link={
        <Link to="/login" className="text-blue-600 hover:underline">
          Sign in.
        </Link>
      }
      onBack={() => navigate(-1)}
      containerClassName="max-w-5xl"
      cardClassName="p-8"
    >
      <div className="space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">Tenax onboarding</p>
          <p className="mt-2 text-zinc-500">
            Quick setup so the agent can execute immediately.
          </p>
        </div>

        <AuthWizard step={step} direction={direction} steps={stepContent} />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Back
              </button>
            )}
          </div>
          {step < 3 ? (
            <PrimaryButton type="button" onClick={handleNext}>
              Next
            </PrimaryButton>
          ) : (
            <PrimaryButton type="button" onClick={handleSubmit} disabled={!canLaunch || submitting}>
              {submitting ? 'Launching...' : 'Launch Tenax'}
            </PrimaryButton>
          )}
        </div>

        <p className="text-zinc-500 text-xs text-center">
          Timetable upload and calendar connect are optional. You can enable them later.
        </p>
      </div>
    </AuthShell>
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
    <label className="text-sm text-zinc-500">
      {label}
      {required && ' *'}
    </label>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 placeholder:text-zinc-500"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) => (
  <div>
    <label className="text-sm text-zinc-500">{label}</label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3"
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
    className={`rounded-2xl border px-4 py-3 text-left transition ${checked ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-zinc-200 bg-white'}`}
  >
    <p className="font-semibold">{label}</p>
    <p className="text-zinc-500 text-xs">{checked ? 'Selected' : 'Tap to include'}</p>
  </button>
);

const Toggle = ({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (value: boolean) => void; helper?: string }) => (
  <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1"
    />
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {helper && <p className="text-zinc-500 text-xs">{helper}</p>}
    </div>
  </label>
);

export default SignupPage;
