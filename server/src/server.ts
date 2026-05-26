import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { ApolloServer } from "apollo-server-express";
import { context } from "./auth/context.js";
import { typeDefs, resolvers } from "./graphql/index.js";
import { registerPostActivityRealtime } from "./realtime/postActivity.js";
import { handleGumroadWebhook } from "./billing/gumroad.js";
import {
  globalLimiter,
  graphqlLimiter,
  operationLimiter,
  googleMobileLimiter,
  webhookLimiter,
} from "./middleware/rateLimiters.js";

const GRAPHQL_BODY_LIMIT = process.env.GRAPHQL_BODY_LIMIT?.trim() || "35mb";

type RestUser = {
  sub: string;
  email?: string;
};

type AuthenticatedRequest = express.Request & {
  user?: RestUser;
};

const requireAuthenticatedUser: express.RequestHandler = (req, res, next) => {
  const auth = req.headers.authorization;
  const secret = process.env.JWT_SECRET;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET is not configured" });
    return;
  }

  try {
    const token = auth.replace("Bearer ", "");
    (req as AuthenticatedRequest).user = jwt.verify(token, secret) as RestUser;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
};

const GOOGLE_MOBILE_SOCIAL_AUTH = `
  mutation SocialAuth($provider: String!, $providerUserId: String!, $email: String!, $displayName: String) {
    socialAuth(provider: $provider, providerUserId: $providerUserId, email: $email, displayName: $displayName) {
      token restoreRequired restoreDeadline
      user { id username }
    }
  }
`;

export const server = new ApolloServer({
  typeDefs,
  resolvers,
  context,
});

let httpServerPromise: Promise<http.Server> | null = null;

export const createHttpServer = () => {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      const app = express();
      app.disable("x-powered-by");

      // Trust the first proxy hop so req.ip reflects the real client IP behind
      // Railway/Render load balancers rather than the load balancer's own address.
      // Without this, all users share one rate-limit counter.
      app.set("trust proxy", 1);

      // Serve email assets (logo, wordmark) for use in transactional emails
      const emailAssetsDir = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "email",
        "assets",
      );
      if (existsSync(emailAssetsDir)) {
        app.use("/email-assets", express.static(emailAssetsDir));
      }

      // Health checks registered immediately — respond before Apollo finishes starting
      app.get("/health", (_, res) => {
        res.status(200).json({ ok: true });
      });
      app.get("/.well-known/apollo/server-health", (_, res) => {
        res.status(200).json({ ok: true });
      });

      // Health routes respond before reaching this — all other traffic is rate-limited
      app.use(globalLimiter);

      app.post(
        "/auth/google/mobile",
        googleMobileLimiter,
        express.json({ limit: "16kb" }),
        async (req, res) => {
          const { code, redirectUri, codeVerifier } = (req.body ?? {}) as Record<string, string>;
          if (!code || !redirectUri) {
            res.status(400).json({ ok: false, error: "Missing code or redirectUri" });
            return;
          }

          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          if (!clientId || !clientSecret) {
            res.status(500).json({ ok: false, error: "Google auth is not configured on this server" });
            return;
          }

          try {
            const tokenParams = new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            });
            if (codeVerifier) tokenParams.set("code_verifier", codeVerifier);

            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: tokenParams,
            });
            const tokenBody = await tokenRes.json().catch(() => ({}));
            if (!tokenRes.ok || !tokenBody?.access_token) {
              throw new Error("Failed to exchange authorization code with Google");
            }

            const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
              headers: { Authorization: `Bearer ${tokenBody.access_token}` },
            });
            const profile = await profileRes.json().catch(() => ({}));
            if (!profileRes.ok || !profile?.sub) {
              throw new Error("Failed to fetch Google profile");
            }

            const email = String(profile.email || "").trim().toLowerCase();
            if (!email) throw new Error("No email returned from Google");

            const displayName =
              (profile.name ??
                [profile.given_name, profile.family_name].filter(Boolean).join(" ")) || null;

            const port = process.env.PORT || 4000;
            const gqlRes = await fetch(`http://localhost:${port}/graphql`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: GOOGLE_MOBILE_SOCIAL_AUTH,
                variables: { provider: "google", providerUserId: String(profile.sub), email, displayName },
              }),
            });
            const gqlBody = await gqlRes.json().catch(() => ({}));

            if (!gqlRes.ok || gqlBody?.errors?.length) {
              throw new Error(gqlBody?.errors?.[0]?.message || "Social authentication failed");
            }

            const payload = gqlBody?.data?.socialAuth;
            if (!payload?.token) throw new Error("No token returned from socialAuth");

            res.json({
              ok: true,
              token: payload.token,
              restoreRequired: Boolean(payload.restoreRequired),
              restoreDeadline: payload.restoreDeadline ?? null,
              hasCompletedProfile: Boolean(payload.user?.username),
            });
          } catch (err) {
            console.error("[auth/google/mobile]", err);
            res.status(500).json({
              ok: false,
              error: err instanceof Error ? err.message : "Authentication failed",
            });
          }
        },
      );

      app.post(
        "/billing/gumroad/webhook",
        webhookLimiter,
        express.urlencoded({ extended: false, limit: "16kb" }),
        async (req, res) => {
          try {
            const body = new URLSearchParams(
              req.body as Record<string, string>,
            );
            const result = await handleGumroadWebhook(body);
            res.status(200).json(result);
          } catch (error) {
            console.error("Gumroad webhook rejected", error);
            res.status(400).json({
              error:
                error instanceof Error
                  ? error.message
                  : "Invalid Gumroad webhook",
            });
          }
        },
      );

      // GraphQL rate limiters run before Apollo's own body parser.
      // express.json() here pre-populates req.body so operationLimiter can read
      // the operation name; Apollo's body-parser skips re-parsing when req.body is set.
      app.use("/graphql", graphqlLimiter);
      app.use("/graphql", express.json({ limit: GRAPHQL_BODY_LIMIT }));
      app.use("/graphql", operationLimiter);

      const httpServer = http.createServer(app);
      registerPostActivityRealtime(httpServer);

      // Start Apollo and apply middleware asynchronously — doesn't block server startup
      server.start().then(() => {
        server.applyMiddleware({
          app,
          path: "/graphql",
          cors: {
            origin: true,
            credentials: true,
          },
          bodyParserConfig: {
            limit: GRAPHQL_BODY_LIMIT,
          },
        });
        console.log("GraphQL middleware ready");
      });

      return httpServer;
    })();
  }

  return httpServerPromise;
};
