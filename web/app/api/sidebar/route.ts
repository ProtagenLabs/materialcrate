import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runGql, getClientIp } from "../../lib/gql";

const SIDEBAR_QUERY = `
  query Sidebar($trendingLimit: Int!, $catLimit: Int!, $usersLimit: Int!) {
    trendingPosts(limit: $trendingLimit) {
      id
      title
      viewCount
      categories
      thumbnailUrl
      fileType
      fileUrl
      author {
        username
        displayName
        profilePicture
        subscriptionPlan
        isBot
      }
    }
    suggestedCategories(limit: $catLimit)
    suggestedUsers(limit: $usersLimit) {
      id
      username
      displayName
      profilePicture
      subscriptionPlan
    }
  }
`;

type SidebarUser = {
  id: string;
  username: string;
  displayName: string;
  profilePicture?: string | null;
  subscriptionPlan: string;
};

type SidebarPost = {
  id: string;
  title: string;
  viewCount: number;
  categories: string[];
  thumbnailUrl?: string | null;
  fileType: string;
  fileUrl: string;
  author?: {
    username: string;
    displayName: string;
    profilePicture?: string | null;
    subscriptionPlan: string;
    isBot: boolean;
  } | null;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value ?? undefined;

  const result = await runGql({
    query: SIDEBAR_QUERY,
    variables: { trendingLimit: 5, catLimit: 12, usersLimit: 5 },
    token,
    forwardedFor: getClientIp(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.errors?.[0]?.message || "Failed to load sidebar" },
      { status: 400 },
    );
  }

  const trendingPosts = (result.data?.trendingPosts ?? []) as SidebarPost[];
  const suggestedCategories = (result.data?.suggestedCategories ?? []) as string[];
  const suggestedUsers = (result.data?.suggestedUsers ?? []) as SidebarUser[];

  return NextResponse.json({ trendingPosts, suggestedCategories, suggestedUsers });
}
