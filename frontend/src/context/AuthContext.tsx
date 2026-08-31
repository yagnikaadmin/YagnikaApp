import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { storage } from '@/src/utils/storage';

export type Role = 'devotee' | 'priest' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  services?: string[];
  is_active?: boolean;
  title?: 'mr' | 'mrs' | null;
  photo_url?: string | null;
  busy?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string, role: Role) => Promise<User>;
  registerDevotee: (data: { name: string; email: string; mobile: string; password: string; title: 'mr' | 'mrs' }) => Promise<User>;
  registerPriest: (data: { name: string; email: string; mobile: string; password: string; address: string; latitude?: number | null; longitude?: number | null; services: string[] }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { name?: string; title?: string; photo_url?: string }) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TOKEN_KEY = 'yagnika_token';
const USER_KEY = 'yagnika_user';

export function apiFetch(path: string, opts: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE_URL}/api${path}`, { ...opts, headers });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Token is sensitive (Keychain/EncryptedSharedPreferences); the
        // user profile is not, so it stays in the general KV namespace.
        const [t, u] = await Promise.all([
          storage.secureGet<string | null>(TOKEN_KEY, null),
          // User isn't a plain StorageItemValue, but the wrapper's
          // JSON round-trip handles any serializable object fine.
          storage.getItem<any>(USER_KEY, null),
        ]);
        if (t && u) { setToken(t); setUser(u as User); }
      } catch (e) { console.warn('restore', e); }
      finally { setIsLoading(false); }
    })();
  }, []);

  const persistSession = async (t: string, u: User) => {
    setToken(t); setUser(u);
    await storage.secureSet(TOKEN_KEY, t);
    await storage.setItem(USER_KEY, u as any);
  };

  const login = useCallback(async (email: string, password: string, role: Role) => {
    const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) });
    if (!res.ok) throw new Error((await res.json()).detail || 'Login failed');
    const data = await res.json();
    await persistSession(data.access_token, data.user);
    return data.user as User;
  }, []);

  const registerDevotee = useCallback(async (payload: any) => {
    const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
    const data = await res.json();
    await persistSession(data.access_token, data.user);
    return data.user as User;
  }, []);

  const registerPriest = useCallback(async (payload: any) => {
    const res = await apiFetch('/auth/register-priest', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
    const data = await res.json();
    await persistSession(data.access_token, data.user);
    return data.user as User;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch('/auth/me', {}, token);
    if (res.ok) {
      const u = await res.json();
      setUser(u);
      await storage.setItem(USER_KEY, u as any);
    }
  }, [token]);

  const logout = useCallback(async () => {
    setUser(null); setToken(null);
    await Promise.all([storage.secureRemove(TOKEN_KEY), storage.removeItem(USER_KEY)]);
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; title?: string; photo_url?: string }) => {
    const res = await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }, token);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Could not update profile');
    const u = await res.json();
    setUser(u);
    await storage.setItem(USER_KEY, u as any);
    return u as User;
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, registerDevotee, registerPriest, logout, refreshUser, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
