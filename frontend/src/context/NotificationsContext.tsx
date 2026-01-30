import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import { supabaseClient } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

interface NotificationsContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  markRead: (ids: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const NotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const refresh = async () => {
    if (!user || !token) return;
    try {
      const response = await apiClient.get('/notifications');
      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.warn('Failed to load notifications', error);
    }
  };

  useEffect(() => {
    refresh();
  }, [user?.id, token]);

  useEffect(() => {
    if (!user || !supabaseClient) return;
    const channel = supabaseClient
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as NotificationItem;
          setNotifications((prev) => [next, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [user?.id]);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await apiClient.post('/notifications/read', { ids });
      setNotifications((prev) =>
        prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item))
      );
    } catch (error) {
      console.warn('Failed to mark notifications read', error);
    }
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, markRead, refresh }),
    [notifications, unreadCount]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
};

export default NotificationsProvider;
