import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { GRAPHQL_URL, setNetworkErrorHandler } from "./api";

interface ServerStatusContextValue {
  isOffline: boolean;
  retry: () => Promise<void>;
}

const ServerStatusContext = createContext<ServerStatusContextValue>({
  isOffline: false,
  retry: async () => {},
});

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  const retry = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
        signal: controller.signal,
      });
      if (res.ok) setIsOffline(false);
    } catch {
      // still offline — state unchanged
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    setNetworkErrorHandler(() => setIsOffline(true));
    return () => setNetworkErrorHandler(null);
  }, []);

  return (
    <ServerStatusContext.Provider value={{ isOffline, retry }}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus() {
  return useContext(ServerStatusContext);
}
