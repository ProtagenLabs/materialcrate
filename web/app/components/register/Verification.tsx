import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ActionButton from "../ActionButton";

interface VerificationProps {
  email: string;
  title?: string;
  description?: React.ReactNode;
  verifyEndpoint?: string;
  resendEndpoint?: string;
  buildVerifyBody?: (code: string) => Record<string, string>;
  buildResendBody?: () => Record<string, string>;
  successRedirect?: string;
  onVerified?: () => void | Promise<void>;
  fixedAction?: boolean;
}

export default function Verification({
  email,
  title = "Verify email",
  description,
  verifyEndpoint = "/api/auth/verify-email-code",
  resendEndpoint = "/api/auth/resend-verification",
  buildVerifyBody,
  buildResendBody,
  successRedirect = "/login",
  onVerified,
  fixedAction = false,
}: VerificationProps) {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 3) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (!pasted) return;

    const nextCode = ["", "", "", ""];
    pasted.split("").forEach((digit, idx) => {
      nextCode[idx] = digit;
    });
    setCode(nextCode);

    const focusIndex = Math.min(pasted.length, 4) - 1;
    if (focusIndex >= 0) {
      inputs.current[focusIndex]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== 4) return;

    setIsVerifying(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildVerifyBody
            ? buildVerifyBody(fullCode)
            : { email, code: fullCode },
        ),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Verification failed");
      }

      await onVerified?.();
      router.replace(successRedirect);
      return;
    } catch (err: unknown) {
      setError("Verification failed");
      console.error("Verification failed: ", err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch(resendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildResendBody ? buildResendBody() : { email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to resend verification code");
      }

      setCode(["", "", "", ""]);
      inputs.current[0]?.focus();
      setStatus("A new verification code was sent.");
    } catch (err: unknown) {
      setError("Failed to resend verification code");
      console.error("Failed to resend verification code: ", err);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col justify-between px-1 py-4 sm:px-2 sm:py-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink-3">
            Verification
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
            {title}
          </h1>
          <div className="mx-auto mt-3 max-w-92 text-sm leading-6 text-ink-2">
            {description ?? (
              <>
                We&apos;ve sent a verification code to{" "}
                <span className="font-semibold text-ink">{email}</span>.
                Enter it below to continue.
              </>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-2.5 sm:gap-4">
          {code.map((digit, i) => (
            <input
              title="Verification input"
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              placeholder=" "
              value={digit}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onPaste={handlePaste}
              className="h-12 w-12 rounded-2xl border border-edge-mid bg-surface-high text-center text-xl font-semibold text-ink outline-none transition-all duration-200 focus:border-[#E1761F] focus:bg-surface focus:ring-2 focus:ring-[#E1761F]/15 sm:h-16 sm:w-16 sm:text-2xl"
            />
          ))}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-ink-2">
            Didn&apos;t receive it?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="cursor-pointer font-medium text-[#A15D16] underline underline-offset-4 transition-colors duration-200 hover:text-[#E1761F] active:opacity-70 disabled:cursor-not-allowed disabled:text-ink-3"
            >
              {isResending ? "Sending..." : "Resend code"}
            </button>
          </p>
        </div>

        {status && <p className="mt-4 text-center text-sm text-green-600">{status}</p>}
        {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}
      </div>

      <div className="mx-auto mt-8 w-full max-w-md">
        <ActionButton
          type="button"
          onClick={handleVerify}
          fixedBottom={fixedAction}
          className="w-full"
          disabled={
            code.some((digit) => digit === "") || isVerifying || isResending
          }
        >
          {isVerifying ? "VERIFYING..." : "VERIFY"}
        </ActionButton>
      </div>
    </div>
  );
}
