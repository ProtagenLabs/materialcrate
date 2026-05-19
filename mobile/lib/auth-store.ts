import { useEffect, useReducer } from 'react';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'mc_auth_token';

type AuthState = { token: string | null; isAuthenticated: boolean };

let _state: AuthState = { token: null, isAuthenticated: false };
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export function getAuth() {
  return _state;
}

export function setAuth(token: string) {
  _state = { token, isAuthenticated: true };
  notify();
  SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => null);
}

export function clearAuth() {
  _state = { token: null, isAuthenticated: false };
  notify();
  SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
}

export async function loadStoredAuth(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      _state = { token, isAuthenticated: true };
      notify();
    }
  } catch {
    // Secure store unavailable (e.g. simulator edge case) — stay logged out
  }
}

export function useAuth(): AuthState {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    _listeners.add(rerender);
    return () => {
      _listeners.delete(rerender);
    };
  }, []);
  return _state;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    // eslint-disable-next-line no-undef
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getCurrentUserId(): string | null {
  const { token } = _state;
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' ? payload.sub : null;
}
