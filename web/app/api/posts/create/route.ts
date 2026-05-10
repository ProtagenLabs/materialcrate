import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizeAllowedCategory } from "@/app/lib/post-categories";

export const runtime = "nodejs";

const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";
const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024;

const CREATE_POST_MUTATION = `
  mutation CreatePost(
    $fileBase64: String!
    $thumbnailBase64: String
    $fileName: String!
    $mimeType: String!
    $title: String!
    $categories: [String!]!
    $description: String
    $year: Int
  ) {
    createPost(
      fileBase64: $fileBase64
      thumbnailBase64: $thumbnailBase64
      fileName: $fileName
      mimeType: $mimeType
      title: $title
      categories: $categories
      description: $description
      year: $year
    ) {
      id
      fileUrl
      thumbnailUrl
      fileType
      title
      categories
      description
      year
      pinned
      commentsDisabled
      createdAt
      likeCount
      commentCount
      viewerHasLiked
      author {
        id
        displayName
        username
        profilePicture
        subscriptionPlan
        isBot
      }
    }
  }
`;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mc_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const title = formData.get("title");
  const rawCategories = formData.getAll("categories");
  const description = formData.get("description");
  const thumbnailBase64 = formData.get("thumbnailBase64");
  const yearValue = formData.get("year");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return NextResponse.json(
      { error: "File size exceeds 20MB limit" },
      { status: 400 },
    );
  }

  if (typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const normalizedCategories = rawCategories
    .map((c) => (typeof c === "string" ? normalizeAllowedCategory(c) : null))
    .filter(Boolean) as string[];

  if (normalizedCategories.length === 0 || normalizedCategories.length > 3) {
    return NextResponse.json(
      { error: "Please select between 1 and 3 valid categories" },
      { status: 400 },
    );
  }

  // Determine MIME type: prefer what the browser reports, fall back to
  // detecting from the file extension so Word files aren't misidentified.
  const MIME_BY_EXT: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
  };
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const resolvedMime =
    file.type && file.type !== "application/octet-stream"
      ? file.type
      : (MIME_BY_EXT[ext] ?? file.type ?? "application/pdf");

  const arrayBuffer = await file.arrayBuffer();
  const fileBase64 = Buffer.from(arrayBuffer).toString("base64");
  let parsedYear: number | null = null;
  if (typeof yearValue === "string" && yearValue.trim().length) {
    const trimmedYear = yearValue.trim();
    if (!/^\d{4}$/.test(trimmedYear)) {
      return NextResponse.json(
        { error: "Year must be a 4-digit number" },
        { status: 400 },
      );
    }

    parsedYear = Number.parseInt(trimmedYear, 10);
  }

  const graphqlResponse = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: CREATE_POST_MUTATION,
      variables: {
        fileBase64,
        thumbnailBase64:
          typeof thumbnailBase64 === "string" && thumbnailBase64.trim()
            ? thumbnailBase64.trim()
            : null,
        fileName: file.name,
        mimeType: resolvedMime,
        title: title.trim(),
        categories: normalizedCategories,
        description:
          typeof description === "string" ? description.trim() : null,
        year: Number.isFinite(parsedYear) ? parsedYear : null,
      },
    }),
  });

  const graphqlBody = await graphqlResponse.json().catch(() => ({}));

  if (!graphqlResponse.ok || graphqlBody?.errors?.length) {
    return NextResponse.json(
      {
        error: graphqlBody?.errors?.[0]?.message || "Failed to create post",
        details: graphqlBody?.errors ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, post: graphqlBody?.data?.createPost });
}
