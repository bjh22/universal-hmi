import { useState, useCallback, useEffect, useRef } from 'react';
import type { UserData } from '../types';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthState {
  user: UserData | null;
  token: string | null;
  login: (token: string, user: UserData) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export function useAuthState(): AuthState {
  const [user, setUser] = useState<UserData | null>(() => {
    const stored = localStorage.getItem('hmi_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('hmi_token')
  );

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const login = useCallback((newToken: string, newUser: UserData) => {
    localStorage.setItem('hmi_token', newToken);
    localStorage.setItem('hmi_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hmi_token');
    localStorage.removeItem('hmi_user');
    setToken(null);
    setUser(null);
  }, []);

  // Auto-logout on inactivity
  useEffect(() => {
    if (!token) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(logout, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [token, logout]);

  return { user, token, login, logout, isAuthenticated: !!token };
}
