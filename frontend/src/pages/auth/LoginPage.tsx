import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthShell, PrimaryButton } from '../../components/ui/auth-form';
import { Link } from 'react-router-dom';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = form.email.trim() || form.phone.trim();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError('Please enter your email or phone number.');
      return;
    }
    setSubmitting(true);
    try {
      await login({
        email: form.email.trim() || undefined,
        phone_number: form.phone.trim() || undefined,
      });
      navigate('/dashboard/today');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Don't have an account?"
      link={
        <Link to="/signup" className="text-blue-600 hover:underline">
          Create one.
        </Link>
      }
      onBack={() => navigate(-1)}
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="email-input" className="mb-1.5 block text-zinc-500">
            Email
          </label>
          <input
            id="email-input"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="your.email@provider.com"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-800 placeholder-zinc-400 ring-1 ring-transparent transition-shadow focus:outline-0 focus:ring-blue-700"
            autoComplete="email"
          />
        </div>
        <div className="mb-3 text-center text-xs text-zinc-500">or</div>
        <div className="mb-6">
          <label htmlFor="phone-input" className="mb-1.5 block text-zinc-500">
            Phone Number
          </label>
          <input
            id="phone-input"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="+1 555 000 0000"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-800 placeholder-zinc-400 ring-1 ring-transparent transition-shadow focus:outline-0 focus:ring-blue-700"
            autoComplete="tel"
          />
        </div>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <PrimaryButton type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
