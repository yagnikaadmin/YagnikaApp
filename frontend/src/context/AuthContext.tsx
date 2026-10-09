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
  gothram?: string | null;
  busy?: boolean;
  approval_status?: string | null;
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
  updateProfile: (data: Record<string, any>) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
const TOKEN_KEY = 'yagnika_token';
const USER_KEY = 'yagnika_user';

// FastAPI errors come back as { detail: string } for HTTPException, but as
// { detail: [{ loc, msg, type }, ...] } for 422 validation errors. Passing
// the array/object straight into new Error() is what produced the
// "[object Object]" message users were seeing — this normalises any shape
// into a readable string.
export function messageFromDetail(detail: any, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || d?.message))
      .filter((m): m is string => typeof m === 'string' && m.length > 0);
    if (msgs.length) return msgs.join('. ');
  }
  if (detail && typeof detail === 'object') {
    const m = detail.msg || detail.message || detail.detail;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({} as any));
  return new Error(messageFromDetail(body?.detail, fallback));
}

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
    let res: Response;
    try {
      res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection and try again.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      if (res.status === 401) throw new Error('Invalid email or password. Please check your credentials and try again.');
      if (res.status === 403) throw new Error(messageFromDetail(body?.detail, 'This account is not active. Please contact the admin.'));
      if (res.status === 429) throw new Error('Too many login attempts. Please wait a minute and try again.');
      throw new Error(messageFromDetail(body?.detail, 'Login failed. Please try again.'));
    }
    const data = await res.json();
    await persistSession(data.access_token, data.user);
    return data.user as User;
  }, []);

  const registerDevotee = useCallback(async (payload: any) => {
    let res: Response;
    try {
      res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection and try again.');
    }
    if (!res.ok) throw await readError(res, 'Registration failed. Please check your details and try again.');
    const data = await res.json();
    await persistSession(data.access_token, data.user);
    return data.user as User;
  }, []);

  const registerPriest = useCallback(async (payload: any) => {
    let res: Response;
    try {
      res = await apiFetch('/auth/register-priest', { method: 'POST', body: JSON.stringify(payload) });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection and try again.');
    }
    if (!res.ok) throw await readError(res, 'Registration failed. Please check your details and try again.');
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

  const updateProfile = useCallback(async (data: Record<string, any>) => {
    const res = await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }, token);
    if (!res.ok) throw await readError(res, 'Could not update profile. Please try again.');
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
