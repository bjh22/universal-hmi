/**
 * useAuth — Custom React hook that manages user authentication state
 * (login, logout, and auto-timeout after inactivity).
 *
 * A "custom hook" is just a function that uses built-in React hooks internally.
 * Components call useAuthState() to get the current user, token, and login/logout functions.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { UserData } from '../types';
import { api } from '../lib/api';

const DEFAULT_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// TypeScript interface — defines the shape of the object this hook returns.
// Any component using this hook gets exactly these properties and methods.
interface AuthState {
  user: UserData | null;
  token: string | null;
  login: (token: string, user: UserData) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export function useAuthState(): AuthState {
  // useState with an initializer function (the arrow function passed to useState).
  // This function only runs on the FIRST render — it reads from localStorage so the
  // user stays logged in across page refreshes. Without this, every refresh would
  // reset the state to null and require a fresh login.
  //
  // localStorage is a browser API that persists key-value pairs even after the tab
  // is closed. The JWT token stored here is sent with every API request to prove
  // the user is authenticated.
  const [user, setUser] = useState<UserData | null>(() => {
    const stored = localStorage.getItem('hmi_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('hmi_token')
  );

  // useRef stores a mutable value that persists across renders WITHOUT triggering
  // re-renders when changed. Perfect for timer IDs that are internal bookkeeping.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMsRef = useRef(DEFAULT_INACTIVITY_TIMEOUT_MS);

  // useCallback memoizes the function so the same reference is reused across renders.
  // Without it, a new function object is created every render, which would cause
  // child components receiving this function as a prop to re-render unnecessarily.
  const login = useCallback((newToken: string, newUser: UserData) => {
    localStorage.setItem('hmi_token', newToken);
    localStorage.setItem('hmi_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    // Fire-and-forget: record logout in audit log before clearing token
    api.logout().catch(() => {});
    localStorage.removeItem('hmi_token');
    localStorage.removeItem('hmi_user');
    setToken(null);
    setUser(null);
  }, []);

  // Fetch the configured inactivity timeout from the backend on mount.
  useEffect(() => {
    api.getSystemInfo().then(info => {
      timeoutMsRef.current = info.auto_logout_minutes * 60 * 1000;
    }).catch(() => {
      // Fall back to default if the backend is unreachable
    });
  }, []);

  // useEffect runs side effects after rendering. This one sets up an inactivity
  // auto-logout: it listens for mouse/keyboard/touch activity and resets a countdown
  // timer on each event. If no activity happens within the configured timeout, it
  // auto-logs out for security — important in industrial environments with shared
  // terminals. The timeout is configured via HMI_AUTO_LOGOUT_MINUTES (default 30).
  useEffect(() => {
    // If not logged in, there's nothing to time out — skip setup entirely.
    if (!token) return;

    const onInactivityTimeout = () => {
      logout();
      // Navigate to the default dashboard so the screen shows live data
      // rather than whatever authenticated page the user was on.
      if (window.location.pathname !== '/') {
        window.__hmiAutoLogout = true;
        window.location.href = '/';
      }
    };

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(onInactivityTimeout, timeoutMsRef.current);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    // Listen for 401 responses from the API client — when the backend rejects the
    // token (expired or invalid), auto-logout so the user sees the login screen
    // instead of cryptic "Invalid token" errors.
    const onAuthExpired = () => {
      logout();
      if (window.location.pathname !== '/') {
        window.__hmiAutoLogout = true;
        window.location.href = '/';
      }
    };
    window.addEventListener('hmi:auth-expired', onAuthExpired);

    // Cleanup function — React calls this when the component unmounts OR before
    // re-running the effect (e.g., when `token` changes). Removing event listeners
    // and clearing timers prevents memory leaks and zombie callbacks.
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
      window.removeEventListener('hmi:auth-expired', onAuthExpired);
    };
  }, [token, logout]);

  // The return value is this hook's public API — the data and functions that any
  // consuming component can use. `!!token` converts the token to a boolean
  // (truthy string → true, null → false) for convenient conditional checks.
  return { user, token, login, logout, isAuthenticated: !!token };
}
