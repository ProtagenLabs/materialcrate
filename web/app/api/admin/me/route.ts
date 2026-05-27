import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, decodeAdminToken } from "@/app/lib/admin-auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const payload = decodeAdminToken(token);
  if (!payload) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  return NextResponse.json({ email: payload.email, role: payload.adminRole });
}
