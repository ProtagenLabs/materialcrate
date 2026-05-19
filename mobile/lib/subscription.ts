export function normalizeSubscriptionPlan(plan?: string | null): "free" | "pro" | "premium" {
  const n = String(plan || "").trim().toLowerCase();
  if (n === "pro") return "pro";
  if (n === "premium") return "premium";
  return "free";
}

export function hasPaidSubscription(plan?: string | null): boolean {
  const n = normalizeSubscriptionPlan(plan);
  return n === "pro" || n === "premium";
}

export function getSubscriptionBadgeLabel(plan?: string | null): string {
  const n = normalizeSubscriptionPlan(plan);
  if (n === "premium") return "Premium";
  if (n === "pro") return "Pro";
  return "Free";
}
