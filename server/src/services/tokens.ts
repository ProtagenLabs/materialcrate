import { prisma } from "../config/prisma.js";

// One-time welcome bonus granted when a user first verifies their email.
export const SIGNUP_BONUS_TOKENS = 100;
export const SIGNUP_BONUS_TYPE = "SIGNUP_BONUS";

/**
 * Grant the one-time signup/welcome token bonus to a user.
 *
 * Idempotent: it checks for an existing SIGNUP_BONUS transaction first, so it's
 * safe to call from every email-verification path (code, link, social login)
 * without double-crediting. Errors are swallowed — safe to fire-and-forget.
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const existing = await prisma.tokenTransaction.findFirst({
      where: { userId, type: SIGNUP_BONUS_TYPE },
      select: { id: true },
    });
    if (existing) return;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          tokenBalance: { increment: SIGNUP_BONUS_TOKENS },
          tokensEarned: { increment: SIGNUP_BONUS_TOKENS },
        },
      }),
      prisma.tokenTransaction.create({
        data: {
          userId,
          type: SIGNUP_BONUS_TYPE,
          amount: SIGNUP_BONUS_TOKENS,
          description: "Welcome bonus for verifying your email",
        },
      }),
    ]);
  } catch (err) {
    console.error("grantSignupBonus error:", err);
  }
}
