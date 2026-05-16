"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ServerStatusContextValue {
  isOffline: boolean;
  retry: () => void;
}

const ServerStatusContext = createContext<ServerStatusContextValue>({
  isOffline: false,
  retry: () => {},
});

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const isOfflineRef = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const next = !res.ok;
      setIsOffline(next);
      isOfflineRef.current = next;
    } catch {
      setIsOffline(true);
      isOfflineRef.current = true;
    }
  }, []);

  // Patch window.fetch to detect server failures from any /api/ call
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const input = args[0];
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : String(input);

      const isApiCall =
        url.startsWith("/api/") && !url.startsWith("/api/health");

      try {
        const response = await originalFetch.apply(window, args as Parameters<typeof fetch>);
        if (isApiCall) {
          if (response.status === 503) {
            setIsOffline(true);
            isOfflineRef.current = true;
          } else if (isOfflineRef.current && response.status < 500) {
            // A non-server-error response while we thought we were offline means we're back
            setIsOffline(false);
            isOfflineRef.current = false;
          }
        }
        return response;
      } catch (err) {
        // TypeError = network failure (Next.js server itself unreachable)
        if (isApiCall && err instanceof TypeError) {
          setIsOffline(true);
          isOfflineRef.current = true;
        }
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Poll health: every 15s when offline, every 60s when online; also on tab focus
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, isOffline ? 15_000 : 60_000);
    window.addEventListener("focus", checkHealth);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkHealth);
    };
  }, [isOffline, checkHealth]);

  return (
    <ServerStatusContext.Provider value={{ isOffline, retry: checkHealth }}>
      {children}
      {isOffline && <ServerDownBanner onRetry={checkHealth} />}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  return useContext(ServerStatusContext);
}

function ServerDownBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between gap-4 bg-red-600 px-5 py-3 text-white shadow-lg"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        Server is currently unavailable. Some features may not work.
      </div>
      <button
        onClick={onRetry}
        className="shrink-0 rounded border border-white/40 px-3 py-1 text-sm font-semibold transition-colors hover:bg-white/10"
      >
        Retry
      </button>
    </div>
  );
}
