import React from "react";
import { usePathname } from "next/navigation";
import { FaGoogle } from "react-icons/fa";
import ActionButton from "../ActionButton";

interface EmailTypes {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  error?: string | null;
}

export default function Email({ email, setEmail, error }: EmailTypes) {
  const pathname = usePathname();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const mode = pathname === "/register" ? "register" : "login";

  const handleSocialAuth = (provider: "google") => {
    if (typeof window === "undefined") return;
    window.location.assign(`/api/auth/social/${provider}?mode=${mode}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
      <div className="space-y-4 sm:space-y-5">
        <button
          type="button"
          onClick={() => handleSocialAuth("google")}
          className="cursor-pointer flex w-full items-center justify-between rounded-2xl border border-edge-mid bg-surface px-4 py-3.5 text-left transition-all duration-200 hover:border-[#E1761F]/35 hover:bg-[#FFF9F4] active:scale-[0.98]"
        >
          <p className="font-medium text-ink">Continue with Google</p>
          <FaGoogle size={22} className="text-ink" />
        </button>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-gray-400 to-black/50" />
          <p className="text-[11px] font-medium tracking-[0.16em] text-ink-2">
            OR CONTINUE WITH EMAIL
          </p>
          <div className="h-px flex-1 bg-linear-to-l from-transparent via-gray-400 to-black/50" />
        </div>

        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="mt-3 w-full rounded-2xl border border-edge-mid bg-surface-high px-4 py-3.5 text-[16px] transition-all duration-200 focus:border-[#E1761F] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[#E1761F]/15"
            required
          />
          {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
          <p className="mt-2 text-sm font-medium text-ink">
            {pathname === "/register"
              ? "Already have an account? "
              : "Don\'t have an account? "}
            <button
              type="button"
              className="cursor-pointer font-semibold text-black transition-colors duration-200 hover:text-[#E1761F] active:opacity-70"
              onClick={() => {
                if (typeof window === "undefined") return;
                window.location.assign(
                  pathname === "/register" ? "/login" : "/register",
                );
              }}
            >
              {pathname === "/register" ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>

        <ActionButton
          type="submit"
          disabled={!isValidEmail}
          className="mt-2 w-full"
        >
          NEXT
        </ActionButton>
      </div>
    </div>
  );
}
