import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar, SidebarBody, SidebarLink } from '../../components/ui/sidebar';
import { dashboardNavItems } from '../../config/navigation';
import { ADMIN_ENABLED } from '../../lib/env';
import { useAnalytics } from '../../context/AnalyticsContext';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/ui/loader';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { RefreshCw } from 'lucide-react';

const DashboardLayout = () => {
  const { summary, loading, error, refresh } = useAnalytics();
  const { user, loading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = useMemo(
    () => dashboardNavItems.filter((item) => (item.adminOnly ? ADMIN_ENABLED : true)),
    [],
  );

  if (authLoading) {
    return (
      <FullScreenState>
        <Loader />
        <p className="text-white/70">Checking session...</p>
      </FullScreenState>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <FullScreenState>
        <Loader />
        <p className="text-white/70">Syncing telemetry...</p>
      </FullScreenState>
    );
  }

  if (error) {
    return (
      <FullScreenState>
        <p className="text-lg font-semibold text-white">{error}</p>
        <p className="text-white/60">Check your backend connection and try again.</p>
        <Button className="mt-6" onClick={refresh}>
          Retry sync
        </Button>
      </FullScreenState>
    );
  }

  if (location.pathname === '/dashboard') {
    return <Navigate to="/dashboard/today" replace />;
  }

  const currentNavLabel = navItems.find((item) => location.pathname.startsWith(item.path))?.label || 'Command Deck';

  return (
    <div className="relative min-h-screen bg-[#03040b] text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/30 via-transparent to-cyan-400/20 blur-[160px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="justify-between">
            <div className="flex flex-col gap-8">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/50">Tenax</p>
                <p className="mt-1 text-2xl font-semibold">Command Deck</p>
              </div>
              <nav className="flex flex-col gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.path);
                  return (
                    <SidebarLink
                      key={item.path}
                      link={{ label: item.label, href: item.path, icon: <Icon className="h-4 w-4" /> }}
                      className={cn(
                        'transition',
                        active ? 'text-white font-semibold' : 'text-white/70',
                      )}
                    />
                  );
                })}
              </nav>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/40">Operator</p>
              <p className="mt-2 text-sm font-semibold">{user?.preferred_name || summary?.user?.name || 'Tenax Learner'}</p>
              <p className="text-white/50 text-xs">{summary?.user?.goal || 'Stay consistent'}</p>
            </div>
          </SidebarBody>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex flex-col gap-4 border-b border-white/10 bg-[#050611]/60 backdrop-blur px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">Command Module</p>
              <h1 className="text-2xl font-semibold">{currentNavLabel}</h1>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" className="border border-white/20" onClick={() => refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh telemetry
              </Button>
            </div>
          </header>
          <main className="flex-1 px-6 py-10 lg:px-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

const FullScreenState = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#04050b] text-white flex flex-col items-center justify-center gap-6">
    {children}
  </div>
);

export default DashboardLayout;
