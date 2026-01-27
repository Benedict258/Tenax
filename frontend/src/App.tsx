import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HeroLanding from './pages/HeroLanding';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import TodayPage from './pages/dashboard/TodayPage';
import BentoDashboard from './pages/dashboard/BentoDashboard';
import WebChatPage from './pages/dashboard/WebChatPage';
import WeeklyProgressPage from './pages/dashboard/WeeklyProgressPage';
import LeaderboardPage from './pages/dashboard/LeaderboardPage';
import BehaviorPage from './pages/admin/BehaviorPage';
import OpikPulsePage from './pages/admin/OpikPulsePage';
import SignalsPage from './pages/admin/SignalsPage';
import AddTaskPage from './pages/dashboard/AddTaskPage';
import ScheduleEditorPage from './pages/dashboard/ScheduleEditorPage';
import ResolutionBuilderPage from './pages/dashboard/ResolutionBuilderPage';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import { AnalyticsProvider } from './context/AnalyticsContext';
import { ADMIN_ENABLED } from './lib/env';
import AuthProvider from './context/AuthContext';
import TasksProvider from './context/TasksContext';

function App() {
  return (
    <AuthProvider>
      <AnalyticsProvider>
        <TasksProvider>
          <Routes>
            <Route path="/" element={<HeroLanding />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<TodayPage />} />
              <Route path="bento" element={<BentoDashboard />} />
              <Route path="chat" element={<WebChatPage />} />
              <Route path="add-task" element={<AddTaskPage />} />
              <Route path="schedule" element={<ScheduleEditorPage />} />
              <Route path="weekly" element={<WeeklyProgressPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="resolution-builder" element={<ResolutionBuilderPage />} />
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
        </TasksProvider>
      </AnalyticsProvider>
    </AuthProvider>
  );
}

export default App;
