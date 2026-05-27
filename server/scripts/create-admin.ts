/**
 * Bootstrap script to create an admin user.
 *
 * Usage:
 *   pnpm create:admin --email you@example.com --password "secret" --role super_admin --name "Your Name"
 *
 * Roles: super_admin | admin | moderator | viewer
 * Defaults to "super_admin" if --role is omitted.
 * Run from the server/ directory.
 */

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("--email");
  const password = arg("--password");
  const role = arg("--role") ?? "super_admin";
  const name = arg("--name");

  if (!email || !password) {
    console.error("Usage: pnpm create:admin --email <email> --password <password> [--role owner|moderator] [--name <name>]");
    process.exit(1);
  }

  if (!["super_admin", "admin", "moderator", "viewer"].includes(role)) {
    console.error('--role must be one of: super_admin, admin, moderator, viewer');
    process.exit(1);
  }

  const existing = await (prisma as any).adminUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    console.error(`An admin with email "${email}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await (prisma as any).adminUser.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash,
      role,
      name: name?.trim() ?? null,
    },
  });

  console.log(`\n✓ Admin created`);
  console.log(`  ID:    ${admin.id}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Role:  ${admin.role}`);
  if (admin.name) console.log(`  Name:  ${admin.name}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
