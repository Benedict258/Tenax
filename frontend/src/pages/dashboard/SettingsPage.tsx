import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';
import { Button } from '../../components/ui/button';

const SettingsPage = () => {
  const { user } = useAuth();
  const [calendarStatus, setCalendarStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await apiClient.get('/integrations/google/status');
        setCalendarStatus(response.data.status === 'connected' ? 'connected' : 'disconnected');
        setCalendarEmail(response.data.email || null);
      } catch (err) {
        setCalendarStatus('disconnected');
      }
    };
    loadStatus();
  }, []);

  const connectCalendar = async () => {
    try {
      const response = await apiClient.get('/integrations/google/auth-url');
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      setError('Unable to start Google Calendar connection.');
    }
  };

  const loadCalendarEvents = async () => {
    try {
      const response = await apiClient.post('/integrations/google/review-today');
      if (response.data?.inserted > 0) {
        setReviewResult(`Added ${response.data.inserted} events to Today's Execution.`);
      } else {
        setReviewResult('No events found today.');
      }
      setError(null);
    } catch (err) {
      setError('Unable to review Today's events.');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#03040b] text-white p-8">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/40 via-transparent to-cyan-400/30 blur-[200px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="relative z-10 space-y-8">
        <header>
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">Settings</p>
          <h2 className="mt-2 text-3xl font-semibold">Integrations + Preferences</h2>
          <p className="text-white/70 mt-2">Connect Google Calendar and manage how Tenax syncs with WhatsApp.</p>
        </header>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-semibold">Google Calendar (read-only)</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/50">
            Status: {calendarStatus === 'loading' ? 'checking' : calendarStatus}
          </p>
          {calendarEmail && (
            <p className="text-white/60 text-sm mt-2">Connected as {calendarEmail}</p>
          )}
          <p className="text-white/70 mt-2">
            Pull fixed-time commitments and optionally add them to your Tenax schedule.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={connectCalendar}>
              {calendarStatus === 'connected' ? 'Reconnect Calendar' : 'Connect Google Calendar'}
            </Button>
            <Button
              variant="ghost"
              className="border border-white/20"
              onClick={loadCalendarEvents}
              disabled={calendarStatus !== 'connected'}
            >
              Review today&apos;s events
            </Button>
          </div>
          {reviewResult && (
            <p className="mt-4 text-sm text-white/70">{reviewResult}</p>
          )}

        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-xl font-semibold">WhatsApp workflow</h3>
          <p className="text-white/70 mt-2">
            Send tasks and updates directly to Tenax. Example: &quot;add workout 6am&quot; or &quot;done deep work&quot;.
          </p>
          <p className="text-white/60 text-sm mt-3">
            Connected number: {user?.phone_number || 'Add one in your profile'}
          </p>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;




