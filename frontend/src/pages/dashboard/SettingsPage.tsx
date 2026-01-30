import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';
import { Button } from '../../components/ui/button';

const SettingsPage = () => {
  const { user } = useAuth();
  const [calendarStatus, setCalendarStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await apiClient.get('/calendar/status');
        setCalendarStatus(response.data.connected ? 'connected' : 'disconnected');
      } catch (err) {
        setCalendarStatus('disconnected');
      }
    };
    loadStatus();
  }, []);

  const connectCalendar = async () => {
    try {
      const response = await apiClient.get('/calendar/connect');
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (err) {
      setError('Unable to start Google Calendar connection.');
    }
  };

  const loadCalendarEvents = async () => {
    try {
      const response = await apiClient.get('/calendar/events');
      setCalendarEvents(response.data.events || []);
      setError(null);
    } catch (err) {
      setError('Unable to load calendar events.');
    }
  };

  const addEventAsTask = async (event: any) => {
    try {
      await apiClient.post('/tasks', {
        title: event.summary || 'Calendar event',
        start_time: event.start?.dateTime || event.start?.date,
        end_time: event.end?.dateTime || event.end?.date,
        category: 'Calendar',
        created_via: 'calendar'
      });
      setError(null);
    } catch (err) {
      setError('Failed to add calendar event as task.');
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
          <p className="text-white/70 mt-2">
            Pull fixed-time commitments and optionally add them to your Tenax schedule.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={connectCalendar}>
              {calendarStatus === 'connected' ? 'Reconnect Calendar' : 'Connect Google Calendar'}
            </Button>
            <Button variant="ghost" className="border border-white/20" onClick={loadCalendarEvents}>
              Review today&apos;s events
            </Button>
          </div>
          {calendarEvents.length > 0 && (
            <div className="mt-4 space-y-3">
              {calendarEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="font-semibold">{event.summary || 'Calendar event'}</p>
                  <p className="text-sm text-white/60">
                    {event.start?.dateTime || event.start?.date} — {event.end?.dateTime || event.end?.date}
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-3 border border-white/20"
                    onClick={() => addEventAsTask(event)}
                  >
                    Add to tasks
                  </Button>
                </div>
              ))}
            </div>
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
