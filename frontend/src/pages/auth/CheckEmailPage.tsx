import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabaseClient } from '../../lib/supabaseClient';
import { PrimaryButton } from '../../components/ui/auth-form';

const CheckEmailPage = () => {
  const [searchParams] = useSearchParams();
  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleResend = async () => {
    if (!supabaseClient || !email) return;
    setSending(true);
    setStatus(null);
    try {
      await supabaseClient.auth.resend({ type: 'signup', email });
      setStatus('Verification email sent again. Check your inbox.');
    } catch (error: any) {
      const message = error?.message || 'Unable to resend email right now.';
      setStatus(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white py-20 text-zinc-800">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/30 via-transparent to-cyan-400/20 blur-[180px]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm">
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-400">Verify your email</p>
          <h1 className="mt-3 text-3xl font-semibold text-black">Check your email</h1>
          <p className="mt-4 text-sm text-zinc-500">
            We sent a verification link to{' '}
            <span className="font-semibold text-zinc-700">{email || 'your inbox'}</span>.
            Open it to finish setting up Tenax.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryButton
              type="button"
              onClick={() => window.open('https://mail.google.com', '_blank', 'noopener')}
            >
              Open Gmail
            </PrimaryButton>
            <button
              type="button"
              onClick={handleResend}
              disabled={!email || sending}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              {sending ? 'Resending...' : 'Resend email'}
            </button>
          </div>

          {status && <p className="mt-4 text-sm text-zinc-500">{status}</p>}

          <div className="mt-8 text-sm text-zinc-500">
            Wrong email?{' '}
            <Link
              to={`/signup?email=${encodeURIComponent(email)}`}
              className="text-blue-600 hover:underline"
            >
              Change it
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckEmailPage;
