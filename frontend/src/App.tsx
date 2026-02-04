import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HeroLanding from './pages/HeroLanding';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import TodayPage from './pages/dashboard/TodayPage';
import BentoDashboard from './pages/dashboard/BentoDashboard';
import WebChatPage from './pages/dashboard/WebChatPage';
import WeeklyProgressPage from './pages/dashboard/WeeklyProgressPage';
import WeeklyDayDetailPage from './pages/dashboard/WeeklyDayDetailPage';
import ScheduleDayDetailPage from './pages/dashboard/ScheduleDayDetailPage';
import LeaderboardPage from './pages/dashboard/LeaderboardPage';
import ExecutionBoardPage from './pages/dashboard/ExecutionBoardPage';
import PinnedP1Page from './pages/dashboard/PinnedP1Page';
import RoadmapPage from './pages/dashboard/RoadmapPage';
import PhaseDetailPage from './pages/dashboard/PhaseDetailPage';
import BehaviorPage from './pages/admin/BehaviorPage';
import OpikPulsePage from './pages/admin/OpikPulsePage';
import SignalsPage from './pages/admin/SignalsPage';
import AddTaskPage from './pages/dashboard/AddTaskPage';
import ScheduleEditorPage from './pages/dashboard/ScheduleEditorPage';
import ResolutionBuilderPage from './pages/dashboard/ResolutionBuilderPage';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import CheckEmailPage from './pages/auth/CheckEmailPage';
import { AnalyticsProvider } from './context/AnalyticsContext';
import { ADMIN_ENABLED } from './lib/env';
import AuthProvider from './context/AuthContext';
import TasksProvider from './context/TasksContext';
import NotificationsProvider from './context/NotificationsContext';
import SettingsPage from './pages/dashboard/SettingsPage';

function App() {
  return (
    <AuthProvider>
      <AnalyticsProvider>
        <TasksProvider>
          <NotificationsProvider>
            <Routes>
              <Route path="/" element={<HeroLanding />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/check-email" element={<CheckEmailPage />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Navigate to="today" replace />} />
                <Route path="today" element={<TodayPage />} />
                <Route path="bento" element={<BentoDashboard />} />
                <Route path="chat" element={<WebChatPage />} />
                <Route path="add-task" element={<AddTaskPage />} />
              <Route path="schedule" element={<WeeklyProgressPage />} />
              <Route path="schedule/day/:day" element={<ScheduleDayDetailPage />} />
              <Route path="weekly" element={<WeeklyProgressPage />} />
              <Route path="weekly/:date" element={<WeeklyDayDetailPage />} />
                <Route path="leaderboard" element={<LeaderboardPage />} />
                <Route path="execution-board" element={<ExecutionBoardPage />} />
                <Route path="p1" element={<PinnedP1Page />} />
              <Route path="roadmap" element={<RoadmapPage />} />
              <Route path="roadmap/:roadmapId" element={<RoadmapPage />} />
              <Route path="roadmap/:roadmapId/phase/:phaseId" element={<PhaseDetailPage />} />
                <Route path="resolution-builder" element={<ResolutionBuilderPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {ADMIN_ENABLED ? (
                  <>
                    <Route path="behavior" element={<BehaviorPage />} />
                    <Route path="opik" element={<OpikPulsePage />} />
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
          </NotificationsProvider>
        </TasksProvider>
      </AnalyticsProvider>
    </AuthProvider>
  );
}

export default App;
