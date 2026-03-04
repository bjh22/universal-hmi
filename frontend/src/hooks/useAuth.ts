import { createContext, useContext, useState, useCallback } from 'react';
import type { UserData } from '../types';

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

  return { user, token, login, logout, isAuthenticated: !!token };
}
