import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HeroLanding from './pages/HeroLanding';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import TodayPage from './pages/dashboard/TodayPage';
import WebChatPage from './pages/dashboard/WebChatPage';
import ExecutionBoardPage from './pages/dashboard/ExecutionBoardPage';
import WeeklyProgressPage from './pages/dashboard/WeeklyProgressPage';
import LeaderboardPage from './pages/dashboard/LeaderboardPage';
import BehaviorPage from './pages/admin/BehaviorPage';
import OpikPulsePage from './pages/admin/OpikPulsePage';
import SignalsPage from './pages/admin/SignalsPage';
import { AnalyticsProvider } from './context/AnalyticsContext';
import { ADMIN_ENABLED } from './lib/env';

function App() {
  return (
    <div>
      <AnalyticsProvider>
        <Routes>
          <Route path="/" element={<HeroLanding />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate to="today" replace />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="chat" element={<WebChatPage />} />
            <Route path="execution" element={<ExecutionBoardPage />} />
            <Route path="weekly" element={<WeeklyProgressPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            {ADMIN_ENABLED ? (
              <>
                <Route path="behavior" element={<BehaviorPage />} />
                <Route path="opik" element={<OpikPulsePagePage />} />
                <Route path="signals" element={<SignalsPage />} />
              </>
            ) : (
              <>
                <Route path="behavior" element={<Navigate to="today" replace />} />
                <Route path="opik" element={<Navigate to="today" replace />} />
                <Route path="signals" element={<Navigate to="today" replace />} />
              </>
            )}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnalyticsProvider>
      <main>
        {/* Dashboard and chat UI code starts here */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Completion</p>
            <h2 className="mt-4 text-4xl font-semibold">{completion.completion_rate}%</h2>
            <p className="text-white/60">{completion.completed}/{completion.total} tasks locked</p>
            <div className="mt-6 space-y-4">
              <MetricPill label="Streak" value={`${today.streak || 0} days`} icon={Flame} />
              <MetricPill label="Engagement" value={`${today.engagement || 0}/5`} icon={Activity} />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Reminder Controls</p>
            <div className="mt-4 space-y-4 text-sm text-white/80">
              <p>
                <span className="font-semibold">Follow-through:</span> {reminderStats.completed}/{reminderStats.sent}
              </p>
              <p>
                <span className="font-semibold">Avg latency:</span> {reminderStats.avgLatency}m
              </p>
              <p className="text-white/60">
                Use WhatsApp: <strong>snooze 30</strong>, <strong>stop reminders</strong>, <strong>start my day</strong>. Tone + cadence shift instantly.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur space-y-4">
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Pinned P1</p>
            {pinnedTasks.length === 0 && <p className="text-white/60">No active P1. Tell Tenax the next non-negotiable.</p>}
            <div className="flex flex-col gap-3">
              {pinnedTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-white/50">{task.category || 'General'}</p>
                  </div>
                  <p className="text-sm text-white/70">{formatTime(task.start_time)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        {/* ...rest of dashboard and chat UI sections, all inside <main> ... */}
      </main>
      {/* ExpandableChat and other UI components should also be inside the parent div, after <main> */}
    </div>
  );
}

export default App;
