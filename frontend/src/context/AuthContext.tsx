import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, setApiAuthToken } from '../lib/api';
import { setSupabaseSession } from '../lib/supabaseClient';

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
  phone_number?: string;
  password: string;
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
  email: string;
  password: string;
}

interface RegisterResult {
  needs_email_confirmation?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (payload: RegisterPayload) => Promise<RegisterResult>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'tenax.auth';
const STORAGE_SUPABASE = 'tenax.supabase.session';

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
    const storedSupabase = localStorage.getItem(STORAGE_SUPABASE);
    if (storedSupabase) {
      try {
        const parsed = JSON.parse(storedSupabase);
        setSupabaseSession(parsed);
      } catch (error) {
        console.warn('Failed to parse supabase cache', error);
        localStorage.removeItem(STORAGE_SUPABASE);
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

  const register = async (payload: RegisterPayload): Promise<RegisterResult> => {
    const response = await apiClient.post('/auth/register', payload);
    const { user: registeredUser, token: issuedToken, needs_email_confirmation, supabase_session } = response.data;
    if (issuedToken && registeredUser) {
      hydrateSession(registeredUser, issuedToken);
    }
    if (supabase_session) {
      localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(supabase_session));
      await setSupabaseSession(supabase_session);
    }
    return { needs_email_confirmation };
  };

  const login = async (payload: LoginPayload) => {
    const response = await apiClient.post('/auth/login', payload);
    hydrateSession(response.data.user, response.data.token);
    if (response.data.supabase_session) {
      localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(response.data.supabase_session));
      await setSupabaseSession(response.data.supabase_session);
    }
  };

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_SUPABASE);
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
