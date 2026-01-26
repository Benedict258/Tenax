import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';

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
    <div className="min-h-screen bg-[#03040b] text-white flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8 shadow-xl">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-semibold">Login</h1>
          <p className="text-white/60">Sign in to your Tenax account</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white"
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>
          <div className="text-center text-white/50 text-xs">or</div>
          <div>
            <label className="block text-sm text-white/60 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white"
              placeholder="Enter your phone number"
              autoComplete="tel"
            />
          </div>
        </div>
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Login'}
        </Button>
        <div className="text-center text-white/60 text-sm pt-2">
          Don&apos;t have an account?{' '}
          <span className="underline cursor-pointer" onClick={() => navigate('/signup')}>
            Sign up
          </span>
        </div>
      </form>
    </div>
  );
};

export default LoginPage;
