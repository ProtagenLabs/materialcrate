import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { GRAPHQL_URL, setNetworkErrorHandler } from "./api";

type Status = "checking" | "online" | "offline";

interface ServerStatusContextValue {
  status: Status;
  retry: () => Promise<void>;
}

const ServerStatusContext = createContext<ServerStatusContextValue>({
  status: "checking",
  retry: async () => {},
});

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  const check = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
        signal: controller.signal,
      });
      setStatus(res.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // Initial health check on mount
  useEffect(() => {
    check();
  }, [check]);

  // Re-check every 15s while offline
  useEffect(() => {
    if (status !== "offline") return;
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [status, check]);

  // Catch mid-session network failures from any gql() call
  useEffect(() => {
    setNetworkErrorHandler(() => setStatus("offline"));
    return () => setNetworkErrorHandler(null);
  }, []);

  return (
    <ServerStatusContext.Provider value={{ status, retry: check }}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  return useContext(ServerStatusContext);
}
