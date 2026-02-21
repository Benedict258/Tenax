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
import { RefreshCw, ChevronLeft, Bell } from 'lucide-react';
import { Tiles } from '../../components/ui/tiles';
import { useNotifications } from '../../context/NotificationsContext';

const DashboardLayout = () => {
  const { summary, loading, error, refresh } = useAnalytics();
  const { user, loading: authLoading } = useAuth();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhatsAppGuide, setShowWhatsAppGuide] = useState(false);
  const location = useLocation();
  const whatsappLink = 'http://wa.me/+14155238886?text=join%20pipe-born';

  const navItems = useMemo(
    () => dashboardNavItems.filter((item) => (item.adminOnly ? ADMIN_ENABLED : true)),
    [],
  );

  React.useEffect(() => {
    const seen = localStorage.getItem('tenax.onboarding_seen');
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  React.useEffect(() => {
    if (!user?.id) {
      return;
    }
    const seenWhatsApp = localStorage.getItem('tenax.whatsapp_seen');
    if (!seenWhatsApp) {
      setShowWhatsAppGuide(true);
    }
  }, [user?.id]);

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
        <p className="text-white/70">Check your backend connection and try again.</p>
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
  const isWeeklySchedule = location.pathname.startsWith('/dashboard/weekly') || location.pathname.startsWith('/dashboard/schedule');

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen && unreadCount) {
      markRead(notifications.filter((item) => !item.read).map((item) => item.id));
    }
  };

  const closeOnboarding = () => {
    localStorage.setItem('tenax.onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  return (
    <div className="relative flex flex-col md:flex-row bg-white w-full flex-1 mx-auto overflow-hidden min-h-screen text-black">
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{ ['--tile' as any]: '#fde7dc' }}
      >
        <Tiles rows={60} cols={12} tileSize="md" className="h-full w-full" />
      </div>
      <div className="relative z-10 flex min-h-screen w-full flex-col md:flex-row">
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="justify-between gap-10">
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
              <div className="flex items-center">
                {sidebarOpen ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-[#03040b]/60">Tenax</p>
                    <p className="mt-1 text-xl font-semibold text-[#03040b]">Command Deck</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-xs font-semibold tracking-[0.4em] text-[#03040b]/60 leading-none">
                    {'TENAX'.split('').map((letter) => (
                      <span key={letter} className="block">
                        {letter}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <nav className="mt-8 flex flex-col gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.path);
                  return (
                    <SidebarLink
                      key={item.path}
                      link={{
                        label: item.label,
                        href: item.path,
                        icon: (
                          <Icon
                            className={cn('h-4 w-4', active ? 'text-brand' : 'text-[#03040b]/70')}
                          />
                        ),
                      }}
                      className={cn(
                        'rounded-md px-2',
                        active
                          ? 'text-[#03040b] font-semibold bg-brand-50/70 border-l-2 border-brand'
                          : 'text-[#03040b]/70',
                      )}
                    />
                  );
                })}
              </nav>
            </div>
            {sidebarOpen && (
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[#03040b]/60">Operator</p>
                <p className="mt-2 text-sm font-semibold text-[#03040b]">
                  {user?.preferred_name || summary?.user?.name || 'Tenax Learner'}
                </p>
                <p className="text-xs text-[#03040b]/60">{summary?.user?.goal || 'Stay consistent'}</p>
              </div>
            )}
          </SidebarBody>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <header className="relative flex flex-col gap-4 border-b border-gray-200 bg-white px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <Button
                variant="ghost"
                className="w-fit border border-gray-200 text-gray-700"
                onClick={() => window.history.back()}
              >
                <ChevronLeft className="mr-2 h-4 w-4" /> Go back
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Command Module</p>
                <h1 className="text-2xl font-semibold text-[#03040b]">{currentNavLabel}</h1>
              </div>
            </div>
            <div className="flex w-full justify-center md:absolute md:left-1/2 md:top-1/2 md:w-auto md:-translate-x-1/2 md:-translate-y-1/2">
              <Button
                className="w-full max-w-xs border border-green-200 bg-green-100 text-green-900 hover:bg-green-200 md:w-auto"
                onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
              >
                Chat with Tenax
              </Button>
            </div>
            {!isWeeklySchedule && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Button
                  variant="outline"
                  className="border-gray-200 text-gray-700"
                  onClick={toggleNotifications}
                >
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">
                      {unreadCount}
                    </span>
                  )}
                </Button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-3 w-96 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Updates</p>
                    <div className="mt-3 flex max-h-72 flex-col gap-3 overflow-y-auto">
                      {notifications.length === 0 && (
                        <p className="text-sm text-gray-500">No notifications yet.</p>
                      )}
                      {notifications.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-xl border px-3 py-2 ${item.read ? 'border-gray-100' : 'border-brand-100 bg-brand-50/40'}`}
                        >
                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                          {item.message && <p className="text-xs text-gray-500">{item.message}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="outline" className="border-gray-200 text-gray-700" onClick={() => refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh telemetry
              </Button>
            </div>
            )}
          </header>
          <main className="flex-1 p-4 md:p-8 bg-white overflow-y-auto">
            <div className="w-full max-w-6xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Welcome to Tenax</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#03040b]">WhatsApp + Dashboard, one system</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-600">
              <li>Send tasks or updates on WhatsApp, and they appear instantly on your dashboard.</li>
              <li>Use simple phrases like "done deep work" or "add workout 6am".</li>
              <li>To mark tasks complete in the app, tap the status toggle in the Execution Core.</li>
            </ul>
            <div className="mt-6 flex justify-end">
              <Button onClick={closeOnboarding}>Got it</Button>
            </div>
          </div>
        </div>
      )}
      {showWhatsAppGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="relative w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
            <button
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
              onClick={() => {
                localStorage.setItem('tenax.whatsapp_seen', 'true');
                setShowWhatsAppGuide(false);
              }}
              aria-label="Close WhatsApp guide"
            >
              ✕
            </button>
            <div className="flex items-start gap-4">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                alt="WhatsApp"
                className="h-12 w-12"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-gray-400">WhatsApp Setup</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#03040b]">Tenax runs on WhatsApp</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Reminders, check-ins, and daily execution happen in WhatsApp.
                </p>
                <div className="mt-4 space-y-2 text-sm text-gray-700">
                  <p>
                    <span className="font-semibold">Number:</span> +1 415 523 8886
                  </p>
                  <p>
                    <span className="font-semibold">Join code:</span>{' '}
                    <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">join pipe-born</span>
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}>
                    Open WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    className="border-gray-200 text-gray-700"
                    onClick={() => {
                      localStorage.setItem('tenax.whatsapp_seen', 'true');
                      setShowWhatsAppGuide(false);
                    }}
                  >
                    Got it
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FullScreenState = ({ children }: { children: React.ReactNode }) => (
  <div className="relative min-h-screen bg-[#03040b] text-white overflow-hidden flex flex-col items-center justify-center gap-6">
    <div className="pointer-events-none absolute inset-0 opacity-60">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/40 via-transparent to-cyan-400/30 blur-[200px]" />
      <div className="absolute inset-0 bg-noise" />
    </div>
    <div className="relative z-10 flex flex-col items-center gap-6">{children}</div>
  </div>
);

export default DashboardLayout;
