"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Coin1,
  Wallet3,
  Crown1,
  ArrowCircleDown2,
  TickCircle,
  CloseCircle,
  Clock,
  Eye,
  MoneyRecive,
  Mobile,
  Bank,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import Alert from "@/app/components/Alert";
import Header from "@/app/components/Header";

const TOKEN_COSTS = { pro: 3990, premium: 6990 };
const MIN_CASHOUT = 5000;
const TOKENS_PER_DOLLAR = 1000;

type PayoutMethod = "paypal" | "mobile_money" | "bank_transfer";

type TokenTransaction = {
  id: string;
  type: string;
  amount: number;
  description?: string | null;
  postId?: string | null;
  createdAt: string;
};

type CashoutRequest = {
  id: string;
  tokensAmount: number;
  cashAmount: number;
  status: string;
  payoutMethod: string;
  payoutDetails: string;
  adminNote?: string | null;
  createdAt: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const TX_LABELS: Record<string, string> = {
  VIEW_EARN: "View earned",
  REDEEM_PRO: "Redeemed — Pro subscription",
  REDEEM_PREMIUM: "Redeemed — Premium subscription",
  REDEEM_CASH: "Cashout requested",
  CASHOUT_REFUND: "Cashout refunded",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    Icon: TickCircle,
  },
  paid: {
    label: "Paid",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    Icon: TickCircle,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    Icon: CloseCircle,
  },
};

const METHOD_LABELS: Record<string, string> = {
  paypal: "PayPal",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
};

function formatPayoutSummary(method: string, detailsStr: string): string {
  try {
    const d = JSON.parse(detailsStr) as Record<string, string>;
    if (method === "paypal") return `PayPal · ${d.email ?? ""}`;
    if (method === "mobile_money")
      return `${d.provider ?? "Mobile Money"} · ${d.phone ?? ""}`;
    if (method === "bank_transfer")
      return `${d.bankName ?? "Bank"} · ****${String(d.accountNumber ?? "").slice(-4)}`;
  } catch {
    // fall through
  }
  return METHOD_LABELS[method] ?? method;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-[#E1761F] placeholder:text-ink-3"
    />
  );
}

function PayoutDetailsForm({
  method,
  details,
  onChange,
}: {
  method: PayoutMethod;
  details: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (method === "paypal") {
    return (
      <Field label="PayPal email">
        <TextInput
          type="email"
          value={details.email ?? ""}
          onChange={(v) => onChange("email", v)}
          placeholder="you@paypal.com"
        />
      </Field>
    );
  }

  if (method === "mobile_money") {
    return (
      <>
        <Field label="Provider (e.g. M-Pesa, Airtel Money)">
          <TextInput
            value={details.provider ?? ""}
            onChange={(v) => onChange("provider", v)}
            placeholder="M-Pesa"
          />
        </Field>
        <Field label="Phone number">
          <TextInput
            type="tel"
            value={details.phone ?? ""}
            onChange={(v) => onChange("phone", v)}
            placeholder="+254 7XX XXX XXX"
          />
        </Field>
        <Field label="Full name on account">
          <TextInput
            value={details.name ?? ""}
            onChange={(v) => onChange("name", v)}
            placeholder="Your full name"
          />
        </Field>
      </>
    );
  }

  if (method === "bank_transfer") {
    return (
      <>
        <Field label="Bank name">
          <TextInput
            value={details.bankName ?? ""}
            onChange={(v) => onChange("bankName", v)}
            placeholder="e.g. Equity Bank"
          />
        </Field>
        <Field label="Account holder name">
          <TextInput
            value={details.accountName ?? ""}
            onChange={(v) => onChange("accountName", v)}
            placeholder="Your full name"
          />
        </Field>
        <Field label="Account number">
          <TextInput
            value={details.accountNumber ?? ""}
            onChange={(v) => onChange("accountNumber", v)}
            placeholder="0012345678"
          />
        </Field>
        <Field label="Routing / SWIFT / Sort code (optional)">
          <TextInput
            value={details.routingCode ?? ""}
            onChange={(v) => onChange("routingCode", v)}
            placeholder="Optional"
          />
        </Field>
      </>
    );
  }

  return null;
}

export default function TokensPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [cashouts, setCashouts] = useState<CashoutRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [redeemPlan, setRedeemPlan] = useState<"pro" | "premium" | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const [showCashout, setShowCashout] = useState(false);
  const [cashoutTokens, setCashoutTokens] = useState(String(MIN_CASHOUT));
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("paypal");
  const [payoutDetails, setPayoutDetails] = useState<Record<string, string>>(
    {},
  );
  const [isCashingOut, setIsCashingOut] = useState(false);

  const [alert, setAlert] = useState<{
    message: string;
    type: "success" | "error" | "info";
  }>({ message: "", type: "success" });

  const showAlert = useCallback(
    (message: string, type: "success" | "error" | "info") =>
      setAlert({ message, type }),
    [],
  );

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/tokens/history?limit=30", {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setTransactions(body.transactions ?? []);
        setCashouts(body.cashoutRequests ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) void fetchHistory();
    else if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, fetchHistory, router]);

  const handleDetailChange = (key: string, value: string) =>
    setPayoutDetails((prev) => ({ ...prev, [key]: value }));

  const handleMethodChange = (m: PayoutMethod) => {
    setPayoutMethod(m);
    setPayoutDetails({});
  };

  const handleRedeem = async () => {
    if (!redeemPlan || isRedeeming) return;
    setIsRedeeming(true);
    try {
      const res = await fetch("/api/tokens/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: redeemPlan }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(body?.error || "Redemption failed", "error");
        return;
      }
      showAlert(
        `${redeemPlan.charAt(0).toUpperCase() + redeemPlan.slice(1)} subscription activated!`,
        "success",
      );
      setRedeemPlan(null);
      const { refreshAuth } = await import("@/app/lib/auth-client");
      await refreshAuth();
      void fetchHistory();
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleCashout = async () => {
    if (isCashingOut) return;
    const amount = Math.floor(Number(cashoutTokens));
    if (!Number.isFinite(amount) || amount < MIN_CASHOUT) {
      showAlert(`Minimum cashout is ${fmt(MIN_CASHOUT)} tokens`, "error");
      return;
    }
    if (amount > tokenBalance) {
      showAlert("You don't have enough tokens", "error");
      return;
    }
    setIsCashingOut(true);
    try {
      const res = await fetch("/api/tokens/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokensAmount: amount,
          payoutMethod,
          payoutDetails,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(body?.error || "Cashout request failed", "error");
        return;
      }
      showAlert(
        `Cashout request submitted! We'll send $${(amount / TOKENS_PER_DOLLAR).toFixed(2)} to your ${METHOD_LABELS[payoutMethod]} account.`,
        "success",
      );
      setShowCashout(false);
      setCashoutTokens(String(MIN_CASHOUT));
      setPayoutDetails({});
      const { refreshAuth } = await import("@/app/lib/auth-client");
      await refreshAuth();
      void fetchHistory();
    } finally {
      setIsCashingOut(false);
    }
  };

  const tokenBalance = user?.tokenBalance ?? 0;
  const tokensEarned = user?.tokensEarned ?? 0;
  const tokensRedeemed = user?.tokensRedeemed ?? 0;
  const cashoutDollars = Math.floor(Number(cashoutTokens)) / TOKENS_PER_DOLLAR;
  const hasPendingCashout = cashouts.some((c) => c.status === "pending");

  if (authLoading) {
    return (
      <div className="min-h-dvh bg-page">
        <Header title="Tokens & Rewards" />
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-ink-2">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-page">
      <Header title="Tokens & Rewards" />

      <div className="mx-auto max-w-2xl space-y-5 px-4 pb-12 pt-20 sm:px-6">
        <Alert message={alert.message || null} type={alert.type} className="mb-0" />
        <div className="overflow-hidden rounded-[20px] bg-linear-to-br from-[#E1761F] to-[#B35A12] p-6 text-white shadow-md">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Coin1 size={16} color="white" variant="Bold" />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Token Balance
            </span>
          </div>
          <p className="text-4xl font-bold tracking-tight">
            {fmt(tokenBalance)}
          </p>
          <p className="mt-1 text-sm opacity-70">tokens</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                Lifetime Earned
              </p>
              <p className="mt-0.5 text-lg font-bold">{fmt(tokensEarned)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                Lifetime Redeemed
              </p>
              <p className="mt-0.5 text-lg font-bold">{fmt(tokensRedeemed)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-edge bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye size={18} color="#E1761F" variant="Bold" />
            <h2 className="text-sm font-semibold text-ink">How to Earn</h2>
          </div>
          <p className="text-sm text-ink-2">
            Every{" "}
            <span className="font-semibold text-ink">5 views</span> your post
            receives earns you{" "}
            <span className="font-semibold text-ink">1 token</span>. A view is
            counted when someone opens your PDF and reads for at least 8 seconds
            once per person per day. You don&apos;t earn tokens from your own
            views.
          </p>
        </div>

        <div className="rounded-[20px] border border-edge bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-edge">
            <Crown1 size={18} color="#E1761F" variant="Bold" />
            <h2 className="text-sm font-semibold text-ink">
              Redeem for Subscription
            </h2>
          </div>
          <div className="divide-y divide-edge">
            {(["pro", "premium"] as const).map((plan) => {
              const cost = TOKEN_COSTS[plan];
              const canAfford = tokenBalance >= cost;
              const label = plan.charAt(0).toUpperCase() + plan.slice(1);
              return (
                <div
                  key={plan}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {label} — 1 month
                    </p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {fmt(cost)} tokens (≈ ${plan === "pro" ? "3.99" : "6.99"})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRedeemPlan(plan)}
                    disabled={!canAfford}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      canAfford
                        ? "bg-[#E1761F] text-white hover:bg-[#c96018]"
                        : "bg-surface-high text-ink-3 cursor-not-allowed"
                    }`}
                  >
                    {canAfford ? "Redeem" : "Not enough tokens"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[20px] border border-edge bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-edge">
            <MoneyRecive size={18} color="#E1761F" variant="Bold" />
            <h2 className="text-sm font-semibold text-ink">Cash Out</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <p className="text-ink-3 font-medium">Rate</p>
                <p className="mt-0.5 font-semibold text-ink">
                  1,000 tokens = $1
                </p>
              </div>
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <p className="text-ink-3 font-medium">Minimum</p>
                <p className="mt-0.5 font-semibold text-ink">
                  5,000 tokens ($5)
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-2">
              Payouts are processed manually within 5–10 business days. We
              support PayPal, mobile money, and bank transfer.
            </p>

            {hasPendingCashout ? (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <Clock size={16} color="#D97706" variant="Bold" />
                <p className="text-xs font-medium text-amber-700">
                  You have a pending cashout request being reviewed.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCashout((v) => !v)}
                disabled={tokenBalance < MIN_CASHOUT}
                className={`w-full rounded-full py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  tokenBalance >= MIN_CASHOUT
                    ? "bg-[#E1761F] text-white hover:bg-[#c96018]"
                    : "bg-surface-high text-ink-3 cursor-not-allowed"
                }`}
              >
                {tokenBalance >= MIN_CASHOUT
                  ? showCashout
                    ? "Cancel"
                    : "Request Payout"
                  : `Need ${fmt(MIN_CASHOUT - tokenBalance)} more tokens`}
              </button>
            )}

            {showCashout && !hasPendingCashout && (
              <div className="space-y-4 rounded-xl border border-edge bg-page p-4">
                <Field label="Tokens to cash out">
                  <TextInput
                    type="number"
                    value={cashoutTokens}
                    onChange={setCashoutTokens}
                    placeholder={String(MIN_CASHOUT)}
                  />
                  {Math.floor(Number(cashoutTokens)) >= MIN_CASHOUT && (
                    <p className="mt-1 text-xs text-ink-2">
                      ≈{" "}
                      <span className="font-semibold text-ink">
                        ${cashoutDollars.toFixed(2)} USD
                      </span>
                    </p>
                  )}
                </Field>

                <Field label="Payout method">
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {(
                      [
                        { key: "paypal", label: "PayPal", Icon: Wallet3 },
                        {
                          key: "mobile_money",
                          label: "Mobile Money",
                          Icon: Mobile,
                        },
                        {
                          key: "bank_transfer",
                          label: "Bank Transfer",
                          Icon: Bank,
                        },
                      ] as const
                    ).map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleMethodChange(key)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition-all duration-150 ${
                          payoutMethod === key
                            ? "border-[#E1761F] bg-[#FFF3E7] text-[#E1761F]"
                            : "border-edge bg-surface text-ink-2 hover:bg-surface-high"
                        }`}
                      >
                        <Icon
                          size={18}
                          color={
                            payoutMethod === key ? "#E1761F" : "var(--ink-3)"
                          }
                          variant={payoutMethod === key ? "Bold" : "Linear"}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                <PayoutDetailsForm
                  method={payoutMethod}
                  details={payoutDetails}
                  onChange={handleDetailChange}
                />

                <button
                  type="button"
                  onClick={() => void handleCashout()}
                  disabled={isCashingOut}
                  className="w-full rounded-full bg-[#E1761F] py-2.5 text-sm font-semibold text-white hover:bg-[#c96018] active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
                >
                  {isCashingOut ? "Submitting…" : "Submit Payout Request"}
                </button>
              </div>
            )}
          </div>
        </div>

        {cashouts.length > 0 && (
          <div className="rounded-[20px] border border-edge bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-edge">
              <Wallet3 size={18} color="#E1761F" variant="Bold" />
              <h2 className="text-sm font-semibold text-ink">
                Payout Requests
              </h2>
            </div>
            <div className="divide-y divide-edge">
              {cashouts.map((req) => {
                const config = STATUS_CONFIG[req.status] ?? {
                  label: req.status,
                  color: "text-ink-2",
                  bg: "bg-surface-high border-edge",
                  Icon: Clock,
                };
                const Icon = config.Icon;
                return (
                  <div key={req.id} className="px-5 py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">
                        ${req.cashAmount.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-ink-2">
                          ({fmt(req.tokensAmount)} tokens)
                        </span>
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.color} ${config.bg}`}
                      >
                        <Icon size={12} variant="Bold" />
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-2">
                      {formatPayoutSummary(req.payoutMethod, req.payoutDetails)}{" "}
                      · {fmtDate(req.createdAt)}
                    </p>
                    {req.adminNote && (
                      <p className="text-xs italic text-ink-2">
                        Note: {req.adminNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-[20px] border border-edge bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-edge">
            <ArrowCircleDown2 size={18} color="#E1761F" variant="Bold" />
            <h2 className="text-sm font-semibold text-ink">
              Transaction History
            </h2>
          </div>
          {historyLoading ? (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-ink-2">Loading…</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-5 text-center">
              <Coin1 size={32} color="var(--ink-3)" variant="Bulk" />
              <p className="text-sm font-medium text-ink-2">
                No transactions yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {transactions.map((tx) => {
                const isEarn = tx.amount > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {tx.description || TX_LABELS[tx.type] || tx.type}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {fmtDate(tx.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        isEarn ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {isEarn ? "+" : ""}
                      {fmt(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Redeem confirmation modal */}
      {redeemPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4 pb-4 sm:pb-0">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !isRedeeming && setRedeemPlan(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-ink">
              Redeem {redeemPlan.charAt(0).toUpperCase() + redeemPlan.slice(1)}?
            </h3>
            <p className="mt-2 text-sm text-ink-2">
              This will deduct{" "}
              <span className="font-semibold text-ink">
                {fmt(TOKEN_COSTS[redeemPlan])} tokens
              </span>{" "}
              and activate a 1-month{" "}
              {redeemPlan.charAt(0).toUpperCase() + redeemPlan.slice(1)}{" "}
              subscription.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => !isRedeeming && setRedeemPlan(null)}
                className="flex-1 rounded-full border border-edge py-2.5 text-sm font-semibold text-ink hover:bg-surface-high transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRedeem()}
                disabled={isRedeeming}
                className="flex-1 rounded-full bg-[#E1761F] py-2.5 text-sm font-semibold text-white hover:bg-[#c96018] transition-all active:scale-95 disabled:opacity-60"
              >
                {isRedeeming ? "Activating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
