import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runGql, getClientIp } from "@/app/lib/gql";

const USER_PRESENCE_QUERY = `
  query UserPresence($userId: ID!) {
    userPresence(userId: $userId) {
      online
      lastSeen
    }
  }
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value ?? undefined;

  const result = await runGql({
    query: USER_PRESENCE_QUERY,
    variables: { userId },
    token,
    forwardedFor: getClientIp(request),
  });

  if (!result.ok) {
    return NextResponse.json({ online: false, lastSeen: null });
  }

  const presence = result.data?.userPresence as { online: boolean; lastSeen: string | null } | null;
  return NextResponse.json(presence ?? { online: false, lastSeen: null });
}
