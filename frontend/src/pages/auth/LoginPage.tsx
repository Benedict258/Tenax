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
    password: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = form.email.trim() && form.password.trim();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login({
        email: form.email.trim(),
        password: form.password.trim(),
      });
      navigate('/dashboard/today');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(typeof message === 'string' ? message : 'Login failed. Please try again.');
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
        <div className="mb-6">
          <label htmlFor="password-input" className="mb-1.5 block text-zinc-500">
            Password
          </label>
          <input
            id="password-input"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="••••••••"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-800 placeholder-zinc-400 ring-1 ring-transparent transition-shadow focus:outline-0 focus:ring-blue-700"
            autoComplete="current-password"
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
