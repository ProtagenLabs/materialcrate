import { prisma } from "../config/prisma.js";
import {
  createNotification,
  NOTIFICATION_TYPE,
  NOTIFICATION_ICON,
} from "./notifications.js";

const BOUNTY_AUTO_RELEASE_DAYS = 7;
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export const processExpiredBounties = async () => {
  const cutoff = new Date(
    Date.now() - BOUNTY_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000,
  );

  const expiredRequests = await prisma.documentRequest.findMany({
    where: {
      deleted: false,
      closed: false,
      solved: false,
      bounty: { gt: 0 },
      bountyEscrowedAt: { lte: cutoff },
      bountyReleasedAt: null,
    },
    select: {
      id: true,
      authorId: true,
      bounty: true,
      title: true,
    },
  });

  if (expiredRequests.length === 0) return { processed: 0 };

  let processed = 0;

  for (const request of expiredRequests) {
    try {
      const bounty = request.bounty!;

      const topFulfillment = await prisma.documentRequestFulfillment.findFirst({
        where: { requestId: request.id },
        orderBy: [{ likeCount: "desc" }, { createdAt: "asc" }],
        select: { id: true, authorId: true, likeCount: true },
      });

      if (topFulfillment) {
        await prisma.$transaction([
          prisma.documentRequest.update({
            where: { id: request.id },
            data: {
              solved: true,
              acceptedFulfillmentId: topFulfillment.id,
              bountyReleasedAt: new Date(),
            },
          }),
          prisma.user.update({
            where: { id: topFulfillment.authorId },
            data: {
              tokenBalance: { increment: bounty },
              tokensEarned: { increment: bounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: topFulfillment.authorId,
              type: "REQUEST_BOUNTY_RELEASE",
              amount: bounty,
              description: `Auto-released bounty: "${request.title}"`,
            },
          }),
        ]);

        await createNotification({
          userId: topFulfillment.authorId,
          requestId: request.id,
          type: NOTIFICATION_TYPE.DOCUMENT_REQUEST_ACCEPTED,
          title: "Bounty auto-awarded!",
          description: `You earned ${bounty} tokens — top fulfillment for "${request.title}"`,
          icon: NOTIFICATION_ICON.DOCUMENT_REQUEST,
        });
      } else {
        await prisma.$transaction([
          prisma.documentRequest.update({
            where: { id: request.id },
            data: { closed: true, bountyReleasedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: request.authorId },
            data: {
              tokenBalance: { increment: bounty },
              tokensRedeemed: { decrement: bounty },
            },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: request.authorId,
              type: "REQUEST_BOUNTY_REFUND",
              amount: bounty,
              description: `Bounty refund (expired, no fulfillments): "${request.title}"`,
            },
          }),
        ]);
      }

      processed++;
    } catch (error) {
      console.error(`Failed to process bounty for request ${request.id}:`, error);
    }
  }

  return { processed };
};

export const startDocumentRequestBountyLoop = () => {
  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await processExpiredBounties();
      if (result.processed > 0) {
        console.log(`Auto-released ${result.processed} expired request bounties`);
      }
    } catch (error) {
      console.error("Failed to process document request bounties:", error);
    } finally {
      isRunning = false;
    }
  };

  void run();

  const configuredInterval = Number(process.env.BOUNTY_CHECK_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(configuredInterval) && configuredInterval > 0
      ? configuredInterval
      : DEFAULT_CHECK_INTERVAL_MS;

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  timer.unref?.();
};
