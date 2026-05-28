"use client";

import { useAuth } from "@/app/lib/auth-client";
import { usePresenceHeartbeat } from "@/app/lib/use-presence-heartbeat";

/**
 * Drop this once inside the layout. It is a pure side-effect component —
 * renders nothing but keeps the current user's lastSeen timestamp fresh.
 */
export default function PresenceHeartbeat() {
  const { user } = useAuth();
  usePresenceHeartbeat(user?.id);
  return null;
}
