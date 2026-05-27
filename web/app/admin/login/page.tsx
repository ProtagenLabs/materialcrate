"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HiExclamationTriangle, HiShieldExclamation } from "react-icons/hi2";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Countdown timer when locked out
  useEffect(() => {
    if (!lockedUntil) return;

    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(secs);
      if (secs <= 0) {
        setLockedUntil(null);
        setError("");
        setAttemptsRemaining(null);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && countdown > 0;
  const fmtCountdown = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;

    setError("");
    setAttemptsRemaining(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setLockedUntil(Date.now() + (body.retryAfter ?? 900) * 1000);
        setError(body.error ?? "Too many attempts.");
        return;
      }

      if (!res.ok) {
        setError(body.error ?? "Invalid credentials");
        if (typeof body.attemptsRemaining === "number") {
          setAttemptsRemaining(body.attemptsRemaining);
        }
        return;
      }

      router.push("/admin");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center">
            <Image src="/logo.svg" alt="MaterialCrate" width={36} height={36} />
          </div>
          <h1 className="text-2xl font-bold text-[#111]">Admin Sign In</h1>
          <p className="mt-1 text-sm text-[#888]">MaterialCrate</p>
        </div>

        <div className="rounded-2xl border border-black/[0.07] bg-white p-6 shadow-sm space-y-4">
          {/* Lockout banner */}
          {isLocked && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <HiShieldExclamation className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-700">
                  Account temporarily locked
                </p>
                <p className="mt-0.5 text-xs text-red-500">
                  Too many failed attempts. Try again in{" "}
                  <span className="font-mono font-semibold">
                    {fmtCountdown}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Regular error */}
          {error && !isLocked && (
            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <HiExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Low attempts warning */}
          {attemptsRemaining !== null &&
            attemptsRemaining <= 2 &&
            !isLocked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-medium text-amber-700">
                  Warning:{" "}
                  {attemptsRemaining === 0
                    ? "No attempts remaining — you are now locked out."
                    : `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before lockout.`}
                </p>
              </div>
            )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-email"
                className="text-sm font-medium text-[#333]"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLocked}
                autoComplete="email"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm transition-colors focus:border-[#E1761F] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#f9fafb] disabled:text-[#aaa]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="text-sm font-medium text-[#333]"
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLocked}
                autoComplete="current-password"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm transition-colors focus:border-[#E1761F] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#f9fafb] disabled:text-[#aaa]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || isLocked || !email || !password}
              className="w-full rounded-xl bg-[#E1761F] py-3 text-sm font-semibold text-white transition-all hover:bg-[#cf6919] active:scale-[0.98] active:bg-[#be6117] disabled:cursor-not-allowed disabled:bg-[#f0f0f0] disabled:text-[#aaa]"
            >
              {isLoading
                ? "Signing in…"
                : isLocked
                  ? `Locked — ${fmtCountdown}`
                  : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
