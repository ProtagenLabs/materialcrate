import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

// Prefer DIRECT_URL — bypasses the connection pooler (see seed-archive.ts).
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

// Every seed account across all seed scripts (archive, OCW, OpenStax) uses an
// *.example.com email domain. Matching on that suffix catches all of them and
// keeps the script self-maintaining — no real users are ever touched.
const SEED_EMAIL_SUFFIX = "example.com";

// ─── Realism tuning knobs ──────────────────────────────────────────────────────
// LIKES: a fraction of viewers actually like — most just read and move on.
const BASE_LIKE_PROBABILITY = 0.1;
// Followers engage far more with people they follow.
const FOLLOW_BOOST = 2.6;
// Even a wildly popular post never becomes a guaranteed like — always holdouts.
const MAX_LIKE_PROBABILITY = 0.82;

// VIEWS: views vastly outnumber likes in the real world. A post's "reach" is
// driven by its appeal, with a long tail and occasional viral outliers.
const MIN_BASE_VIEWS = 18;
const MAX_BASE_VIEWS = 380;
const VIRAL_CHANCE = 0.1; // 10% of posts get an outsized view spike
const VIRAL_MULTIPLIER_MIN = 2;
const VIRAL_MULTIPLIER_MAX = 5;
// Each like implies a viewer who engaged — guarantees views >> likes. A like
// rate of 4–13% means every like corresponds to ~8–25 views.
const LIKE_RATE_MIN = 0.04;
const LIKE_RATE_MAX = 0.13;

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

async function seedEngagement() {
  const reset = process.argv.includes("--reset");

  // ── Load seed users ──
  const seedUsers = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_SUFFIX } },
    select: { id: true },
  });

  if (seedUsers.length < 2) {
    console.error(
      `Found ${seedUsers.length} seed user(s) — need at least 2. ` +
        `Run the seed scripts first.`,
    );
    process.exit(1);
  }
  const seedUserIds = new Set(seedUsers.map((u) => u.id));
  console.log(`Found ${seedUsers.length} seed users.`);

  // ── Load every post authored by a seed user (archive + OCW + OpenStax) ──
  const posts = await prisma.post.findMany({
    where: { authorId: { in: [...seedUserIds] }, deleted: false },
    select: { id: true, authorId: true, createdAt: true, viewCount: true },
  });

  if (posts.length === 0) {
    console.error("No seed-authored posts found. Run the seed scripts first.");
    process.exit(1);
  }
  console.log(`Found ${posts.length} seed-authored posts.`);
  const postIds = posts.map((p) => p.id);

  // ── Optional reset: clear seed likes AND zero out view counts on seed posts ──
  if (reset) {
    const [deletedLikes] = await Promise.all([
      prisma.like.deleteMany({
        where: { userId: { in: [...seedUserIds] }, postId: { in: postIds } },
      }),
      prisma.post.updateMany({
        where: { id: { in: postIds } },
        data: { viewCount: 0 },
      }),
    ]);
    console.log(
      `--reset: removed ${deletedLikes.count} seed likes and zeroed view counts.`,
    );
  }

  // ── Existing likes — so re-runs never duplicate, and so view counts can be
  //    derived from each post's TOTAL like count (existing + new). ──
  const existingLikes = await prisma.like.findMany({
    where: { postId: { in: postIds } },
    select: { userId: true, postId: true },
  });
  const existingKeys = new Set(
    existingLikes.map((l) => `${l.userId}:${l.postId}`),
  );
  const likeCountByPost = new Map<string, number>();
  for (const l of existingLikes) {
    likeCountByPost.set(l.postId, (likeCountByPost.get(l.postId) ?? 0) + 1);
  }

  // ── Follow graph among seed users (drives the like engagement boost) ──
  const follows = await prisma.follow.findMany({
    where: {
      followerId: { in: [...seedUserIds] },
      followingId: { in: [...seedUserIds] },
    },
    select: { followerId: true, followingId: true },
  });
  const followsSet = new Set(
    follows.map((f) => `${f.followerId}:${f.followingId}`),
  );

  // ── Per-user "activity" — some accounts like far more than others ──
  const userActivity = new Map<string, number>();
  for (const u of seedUsers) {
    userActivity.set(u.id, randomBetween(0.35, 1.25));
  }

  // ── Build new like rows ──
  type LikeRow = { userId: string; postId: string; createdAt: Date };
  const newLikes: LikeRow[] = [];
  const now = Date.now();
  // Per-post appeal, kept so views and likes share the same "popularity".
  const appealByPost = new Map<string, number>();

  for (const post of posts) {
    const appeal = randomBetween(0.25, 1.4);
    appealByPost.set(post.id, appeal);

    for (const user of seedUsers) {
      if (user.id === post.authorId) continue; // no self-likes
      const key = `${user.id}:${post.id}`;
      if (existingKeys.has(key)) continue; // already liked in a prior run

      const followsAuthor = followsSet.has(`${user.id}:${post.authorId}`);
      const activity = userActivity.get(user.id) ?? 1;

      let probability =
        BASE_LIKE_PROBABILITY *
        appeal *
        activity *
        (followsAuthor ? FOLLOW_BOOST : 1);
      probability = Math.min(probability, MAX_LIKE_PROBABILITY);

      if (Math.random() < probability) {
        const createdAt = new Date(randomBetween(post.createdAt.getTime(), now));
        newLikes.push({ userId: user.id, postId: post.id, createdAt });
        likeCountByPost.set(post.id, (likeCountByPost.get(post.id) ?? 0) + 1);
      }
    }
  }

  // ── Insert likes in chunks ──
  let insertedLikes = 0;
  const CHUNK = 1000;
  for (let i = 0; i < newLikes.length; i += CHUNK) {
    const res = await prisma.like.createMany({
      data: newLikes.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    insertedLikes += res.count;
  }

  // ── Compute realistic view counts (views >> likes) and update posts ──
  // Monotonic: viewCount only ever increases, so real accumulated views are
  // never clobbered on a re-run.
  const updates: { id: string; viewCount: number }[] = [];
  for (const post of posts) {
    const appeal = appealByPost.get(post.id) ?? 1;
    const totalLikes = likeCountByPost.get(post.id) ?? 0;

    // Appeal-driven base reach, so even zero-like posts still get realistic views.
    let views = Math.round(randomBetween(MIN_BASE_VIEWS, MAX_BASE_VIEWS) * appeal);

    // Occasional viral outlier.
    if (Math.random() < VIRAL_CHANCE) {
      views = Math.round(
        views * randomBetween(VIRAL_MULTIPLIER_MIN, VIRAL_MULTIPLIER_MAX),
      );
    }

    // Invariant: every like implies a viewer, and likes are a small fraction of
    // views — so floor views well above the like count.
    if (totalLikes > 0) {
      const likeRate = randomBetween(LIKE_RATE_MIN, LIKE_RATE_MAX);
      views = Math.max(views, Math.ceil(totalLikes / likeRate));
    }

    // Never decrease an existing count.
    views = Math.max(views, post.viewCount);
    if (views !== post.viewCount) {
      updates.push({ id: post.id, viewCount: views });
    }
  }

  // Apply view updates with bounded concurrency.
  let updatedPosts = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((u) =>
        prisma.post.update({
          where: { id: u.id },
          data: { viewCount: u.viewCount },
        }),
      ),
    );
    updatedPosts += batch.length;
  }

  // ── Report distribution so you can eyeball realism ──
  const likeCounts = posts.map((p) => likeCountByPost.get(p.id) ?? 0);
  const viewCounts = updates.length
    ? updates.map((u) => u.viewCount)
    : posts.map((p) => p.viewCount);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const maxOf = (a: number[]) => (a.length ? Math.max(...a) : 0);
  const postsWithLikes = likeCounts.filter((c) => c > 0).length;

  console.log(
    `\nDone! Added ${insertedLikes} likes and updated views on ${updatedPosts} posts.`,
  );
  console.log(
    `  Likes: ${postsWithLikes}/${posts.length} posts have likes, ` +
      `max ${maxOf(likeCounts)}/post, total ${sum(likeCounts)}.`,
  );
  console.log(
    `  Views: max ${maxOf(viewCounts)}/post, total ~${sum(viewCounts)} ` +
      `(≈ ${(sum(viewCounts) / Math.max(1, sum(likeCounts))).toFixed(0)}× the likes).`,
  );
}

seedEngagement()
  .catch((err) => {
    console.error("Seed engagement failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
