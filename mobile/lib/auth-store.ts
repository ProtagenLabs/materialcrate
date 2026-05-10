import { useEffect, useReducer } from 'react';

type AuthState = { token: string | null; isAuthenticated: boolean };

let _state: AuthState = { token: null, isAuthenticated: false };
const _listeners = new Set<() => void>();

export function getAuth() {
  return _state;
}

export function setAuth(token: string) {
  _state = { token, isAuthenticated: true };
  _listeners.forEach((l) => l());
}

export function clearAuth() {
  _state = { token: null, isAuthenticated: false };
  _listeners.forEach((l) => l());
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
