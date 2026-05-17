"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AuthSplashScreen from "@/app/components/AuthSplashScreen";
import ServerDownPage from "@/app/components/ServerDownPage";

type Status = "checking" | "online" | "offline";

interface ServerStatusContextValue {
  retry: () => void;
}

const ServerStatusContext = createContext<ServerStatusContextValue>({
  retry: () => {},
});

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  const check = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      setStatus(res.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    check();
  }, [check]);

  // Re-check every 15s while offline
  useEffect(() => {
    if (status !== "offline") return;
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [status, check]);

  if (status === "checking") return <AuthSplashScreen />;
  if (status === "offline") return <ServerDownPage onRetry={check} />;

  return (
    <ServerStatusContext.Provider value={{ retry: check }}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  return useContext(ServerStatusContext);
}
