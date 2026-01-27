import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, setApiAuthToken } from '../lib/api';

interface AuthUser {
  id: string;
  name: string;
  preferred_name?: string;
  email?: string;
  phone_number?: string;
  role?: string;
  timezone?: string;
  tone_preference?: string;
}

interface RegisterPayload {
  name: string;
  preferred_name: string;
  email: string;
  phone_number: string;
  role: string | string[];
  reason_for_using: string[];
  primary_goal: string;
  daily_start_time: string;
  timezone: string;
  enforce_daily_p1?: boolean;
  enforce_workout?: boolean;
  enforce_pre_class_reading?: boolean;
  enforce_post_class_review?: boolean;
  availability_pattern?: string;
  timetable_upload_enabled?: boolean;
  google_calendar_connected?: boolean;
  tone_preference?: string;
}

interface LoginPayload {
  email?: string;
  phone_number?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (payload: RegisterPayload) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'tenax.auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed.user || null);
        setToken(parsed.token || null);
        setApiAuthToken(parsed.token);
      } catch (error) {
        console.warn('Failed to parse auth cache', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (token && user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setApiAuthToken(token);
  }, [token, user, loading]);

  const hydrateSession = (nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    setApiAuthToken(nextToken);
  };

  const register = async (payload: RegisterPayload) => {
    const response = await apiClient.post('/auth/register', payload);
    const { user: registeredUser, token: issuedToken } = response.data;
    hydrateSession(registeredUser, issuedToken);
  };

  const login = async (payload: LoginPayload) => {
    const response = await apiClient.post('/auth/login', payload);
    hydrateSession(response.data.user, response.data.token);
  };

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setApiAuthToken(undefined);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('tenax:unauthorized', handleUnauthorized);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tenax:unauthorized', handleUnauthorized);
      }
    };
  }, [logout]);

  const value = useMemo(() => ({ user, token, loading, register, login, logout }), [user, token, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthProvider;
