import Constants from "expo-constants";

function getBaseUrl(): string {
  if (!__DEV__) return "https://materialcrate.com";

  // Expo sets hostUri to the Metro bundler address (e.g. "192.168.1.5:8081").
  // Strip the Metro port to get the dev machine's IP, then point at the API server.
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;

  // Fallback for iOS simulator (localhost works there)
  return "http://localhost:4000";
}

function getWebBaseUrl(): string {
  if (!__DEV__) return "https://materialcrate.com";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:3000`;
  return "http://localhost:3000";
}

export const WEB_URL = getWebBaseUrl();

const BASE_URL = getBaseUrl();
export const GRAPHQL_URL = `${BASE_URL}/graphql`;

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export class NetworkError extends Error {
  constructor() {
    super("Server is unavailable. Please check your connection.");
    this.name = "NetworkError";
  }
}

type NetworkErrorHandler = () => void;
let _networkErrorHandler: NetworkErrorHandler | null = null;

export function setNetworkErrorHandler(handler: NetworkErrorHandler | null) {
  _networkErrorHandler = handler;
}

export async function gql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    _networkErrorHandler?.();
    throw new NetworkError();
  }

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}
