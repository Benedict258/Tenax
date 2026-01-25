import React, { FormEvent, useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity,
  Bell,
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
            {ADMIN_ENABLED && (
              <>
                <Route path="behavior" element={<BehaviorPage />} />
                <Route path="opik" element={<OpikPulsePage />} />
                <Route path="signals" element={<SignalsPage />} />
              </>
            )}
            {!ADMIN_ENABLED && (
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
    );
  }

  export default App;
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

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Opik Quality Pulse</h3>
                <Sparkles className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {['tone_score', 'specificity_score', 'realism_score', 'goal_alignment_score'].map((metric) => (
                  <div key={metric} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/40">{metric.replace('_', ' ')}</p>
                    <p className="mt-2 text-2xl font-semibold">{opikMetrics[metric] ?? '—'}<span className="text-sm">/5</span></p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Behavior & Evaluator</h3>
                <ShieldCheck className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(behaviorMetrics).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/40">{label.replace(/_/g, ' ')}</p>
                    <p className="mt-2 text-2xl font-semibold">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Today’s Execution Board</h3>
                <span className="text-white/60">{tasksToday.length} tasks</span>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                {tasksToday.length === 0 && <p className="text-white/60">Nothing scheduled. Add via WhatsApp.</p>}
                {tasksToday.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{task.title}</p>
                      <p className="text-xs text-white/50">{task.category || 'General'}</p>
                    </div>
                    <div className="text-right text-sm text-white/70 space-y-1">
                      <p>{formatTime(task.start_time)}</p>
                      {task.severity && <span className="inline-flex rounded-full border border-white/20 px-3 py-0.5 text-xs">{task.severity.toUpperCase()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Weekly Trend</h3>
                <TrendingUp className="h-5 w-5 text-white/60" />
              </div>
              <div className="mt-4 space-y-3">
                {weeklyTrend.map((day) => (
                  <div key={day.date} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{day.date}</p>
                      <p className="text-xs text-white/50">{day.completed}/{day.total} tasks</p>
                    </div>
                    <div className="flex min-w-[200px] items-center gap-3">
                      <span className="text-sm font-semibold">{day.completionRate}%</span>
                      <div className="h-2 flex-1 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${Math.min(day.completionRate, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Category Breakdown</h3>
                <Target className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {categoryEntries.map(([label, stats]) => {
                  const rate = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
                  return (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                      <p className="text-sm text-white/60">{label}</p>
                      <p className="text-2xl font-semibold">{stats.done}/{stats.total}</p>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-brand-500" style={{ width: `${Math.min(rate, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Leaderboard • Weekly Consistency</h3>
                <LineChart className="h-5 w-5 text-white/60" />
              </div>
              <div className="space-y-3">
                {leaderboard.map((item, idx) => (
                  <div key={item.date} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <span className="text-2xl font-semibold text-brand-500">#{idx + 1}</span>
                    <div>
                      <p className="font-semibold">{item.date}</p>
                      <p className="text-xs text-white/60">{item.completed}/{item.total} completed</p>
                    </div>
                    <span className="text-lg font-semibold">{item.completionRate}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Admin Snapshot</h3>
                <Users className="h-5 w-5 text-white/60" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricPill label="Active users" value={overview?.totals?.users ?? '—'} icon={Users} />
                <MetricPill label="Tasks (14d)" value={overview?.totals?.tasks ?? '—'} icon={Activity} />
                <MetricPill label="Completion" value={`${overview?.totals?.avgCompletion ?? '—'}%`} icon={TrendingUp} />
                <MetricPill label="Completed" value={overview?.totals?.completedTasks ?? '—'} icon={Zap} />
              </div>
              <div className="space-y-2">
                {variantEntries.length === 0 && <p className="text-white/60">No experiments recorded yet.</p>}
                {variantEntries.map(([variant, count]) => (
                  <div key={variant} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>{variant}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Signals Board</h3>
                <Bell className="h-5 w-5 text-white/60" />
              </div>
              <div className="space-y-3 text-sm text-white/80">
                <p>• Reminder follow-through dips after {reminderStats.avgLatency > 15 ? 'midday' : 'late afternoon'} — consider proactive check-ins.</p>
                <p>• {completion.completion_rate >= 75 ? 'Maintain throttle — keep stretching goals.' : 'Opportunity: reinforce morning ramp to protect streak.'}</p>
                <p>• Experiments tracked: {variantEntries.length}. Keep labeling WhatsApp experiments for clean analytics.</p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <ExpandableChat size="lg" position="bottom-right" icon={<Bot className="h-6 w-6" />}>
        <ExpandableChatHeader className="flex-col text-center">
          <h1 className="text-xl font-semibold">Chat with Tenax ✨</h1>
          <p className="text-sm text-white/60">Ask for summaries, reminders, or ops experiments.</p>
        </ExpandableChatHeader>
        <ExpandableChatBody>
          <ChatMessageList>
            {chatMessages.map((message) => (
              <ChatBubble key={message.id} variant={message.sender === 'user' ? 'sent' : 'received'}>
                <ChatBubbleAvatar
                  className="h-8 w-8"
                  src={
                    message.sender === 'user'
                      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&q=80&crop=faces&fit=crop'
                      : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop'
                  }
                  fallback={message.sender === 'user' ? 'US' : 'AI'}
                />
                <ChatBubbleMessage variant={message.sender === 'user' ? 'sent' : 'received'}>
                  {message.content}
                </ChatBubbleMessage>
              </ChatBubble>
            ))}
            {chatBusy && (
              <ChatBubble variant="received">
                <ChatBubbleAvatar
                  className="h-8 w-8"
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                  fallback="AI"
                />
                <ChatBubbleMessage isLoading />
              </ChatBubble>
            )}
          </ChatMessageList>
        </ExpandableChatBody>
        <ExpandableChatFooter>
          <form onSubmit={handleChatSubmit} className="rounded-2xl border border-white/10 bg-black/40 p-1">
            <ChatInput
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message..."
              className="text-white"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" type="button">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" type="button">
                  <Bot className="h-4 w-4" />
                </Button>
              </div>
              <Button type="submit" size="sm" className="gap-2">
                Send
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </ExpandableChatFooter>
      </ExpandableChat>
    </div>
  );
}

export default App;
