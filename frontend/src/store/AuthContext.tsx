/**
 * SmartPOS AI – Auth Context
 * Global authentication state with persistent JWT storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import api from '../services/api';
import {LoginPayload, TokenResponse, User} from '../types';

// ─── Context Shape ─────────────────────────────────────────────────────────

interface AuthState {
  user:      User | null;
  token:     string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login:  (payload: LoginPayload) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export const demoAccount = {
  email: 'demo@smartpos.community',
};

// ─── Provider ─────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [user,      setUser]      = useState<User | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    const restore = async () => {
      try {
        const [storedToken, storedUser] = await AsyncStorage.multiGet([
          'access_token',
          'user',
        ]);
        if (storedToken[1] === 'demo-local-token') {
          await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
        } else if (storedToken[1] && storedUser[1]) {
          setToken(storedToken[1]);
          setUser(JSON.parse(storedUser[1]));
        }
      } catch {
        // Silent fail – user will need to log in
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleExpired = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('smartpos:auth-expired', handleExpired);
    return () => window.removeEventListener('smartpos:auth-expired', handleExpired);
  }, []);

  const persistSession = useCallback(async (data: TokenResponse) => {
    await AsyncStorage.multiSet([
      ['access_token',  data.access_token],
      ['refresh_token', data.refresh_token],
    ]);

    const meRes = await api.get<User>('/auth/me', {
      headers: {Authorization: `Bearer ${data.access_token}`},
    });
    const userData = meRes.data;

    await AsyncStorage.setItem('user', JSON.stringify(userData));
    setToken(data.access_token);
    setUser(userData);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const res = await api.post<TokenResponse>('/auth/login', payload);
    await persistSession(res.data);
  }, [persistSession]);

  const loginDemo = useCallback(async () => {
    const res = await api.post<TokenResponse>('/auth/demo');
    await persistSession(res.data);
  }, [persistSession]);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        loginDemo,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ──────────────────────────────────────────────────────────────────

export const useAuth = () => useContext(AuthContext);
