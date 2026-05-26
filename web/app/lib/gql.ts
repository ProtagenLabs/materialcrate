const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

type GqlOptions = {
  query: string;
  variables?: Record<string, unknown>;
  token?: string | null;
  /** Pass the real client IP so the GraphQL server can rate-limit per user, not per proxy. */
  forwardedFor?: string | null;
};

type GqlResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  errors: Array<{ message: string }> | null;
};

export async function runGql({
  query,
  variables,
  token,
  forwardedFor,
}: GqlOptions): Promise<GqlResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const errors = Array.isArray(body?.errors)
    ? (body.errors as Array<{ message: string }>)
    : null;

  return {
    ok: res.ok && !errors?.length,
    status: res.status,
    data: (body?.data as Record<string, unknown>) ?? null,
    errors,
  };
}

/** Extract the real client IP from an incoming Next.js request. */
export function getClientIp(request: Request): string | null {
  return (
    (request.headers.get("x-forwarded-for") ?? "")
      .split(",")[0]
      ?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}
