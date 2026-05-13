"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Add,
  SearchNormal1,
  MessageQuestion,
} from "iconsax-reactjs";
import { useAuth } from "@/app/lib/auth-client";
import RequestCard, {
  type DocumentRequest,
} from "@/app/components/request/RequestCard";

const MOCK_REQUESTS: DocumentRequest[] = [
  {
    id: "req_1",
    title: "Grade 12 Physics Notes – ZSCE",
    description:
      "Looking for comprehensive physics notes covering electricity, magnetism, and wave optics for the Grade 12 ZSCE exams. Preferably handwritten or well-organized typed notes.",
    categories: ["Physics", "Grade 12"],
    bounty: 500,
    solved: false,
    responseCount: 3,
    commentCount: 7,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u1",
      displayName: "Mwamba Chilufya",
      username: "mwamba_c",
      profilePicture: null,
      subscriptionPlan: null,
    },
  },
  {
    id: "req_2",
    title: "Introduction to Algorithms – CLRS 4th Edition PDF",
    description:
      "Need the 4th edition of CLRS (Cormen, Leiserson, Rivest, Stein). Looking specifically for chapters on dynamic programming and graph algorithms.",
    categories: ["Computer Science", "Algorithms"],
    bounty: null,
    solved: true,
    responseCount: 12,
    commentCount: 15,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u2",
      displayName: "Thandiwe Daka",
      username: "thandiwe.d",
      profilePicture: null,
      subscriptionPlan: "pro",
    },
  },
  {
    id: "req_3",
    title: "Zambian Tax Law Past Papers 2020–2024",
    description:
      "I'm preparing for ZICA exams and need past papers for Zambian Tax Law from 2020 to 2024. Any format is fine – scanned copies are welcome.",
    categories: ["Law", "Tax", "ZICA"],
    bounty: 200,
    solved: false,
    responseCount: 1,
    commentCount: 2,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    author: {
      id: "u3",
      displayName: "Joseph Banda",
      username: "jo_banda",
      profilePicture: null,
      subscriptionPlan: null,
    },
  },
  {
    id: "req_4",
    title: "Introduction to Linear Algebra – Gilbert Strang 5th Edition",
    description:
      "Need the 5th edition by Gilbert Strang for my linear algebra course. A searchable PDF would be ideal.",
    categories: ["Mathematics", "Linear Algebra"],
    bounty: 1000,
    solved: false,
    responseCount: 6,
    commentCount: 9,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u4",
      displayName: "Precious Mwale",
      username: "precious_m",
      profilePicture: null,
      subscriptionPlan: null,
    },
  },
  {
    id: "req_5",
    title: "UNZA Business Management Past Exams 2018–2023",
    description:
      "Looking for University of Zambia Business Management past papers from 2018 to 2023 for final year revision.",
    categories: ["Business", "Management", "UNZA"],
    bounty: null,
    solved: false,
    responseCount: 0,
    commentCount: 1,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    author: {
      id: "u5",
      displayName: "Chanda Mutale",
      username: "c.mutale",
      profilePicture: null,
      subscriptionPlan: null,
    },
  },
  {
    id: "req_6",
    title: "Organic Chemistry Reactions Summary Sheet",
    description:
      "Need a concise summary or cheat sheet covering the major organic chemistry reactions – substitution, elimination, addition, and oxidation/reduction.",
    categories: ["Chemistry", "Organic Chemistry"],
    bounty: 300,
    solved: false,
    responseCount: 4,
    commentCount: 3,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    author: {
      id: "u6",
      displayName: "Natasha Phiri",
      username: "natasha.p",
      profilePicture: null,
      subscriptionPlan: null,
    },
  },
];

type FilterTab = "all" | "open" | "fulfilled";

function RequestSkeleton() {
  const sk = "skeleton";
  return (
    <div className="w-full px-3">
      <article className="border-b border-edge lg:rounded-xl lg:border lg:border-edge lg:mb-4 lg:bg-surface lg:shadow-sm">
        <div className="flex items-start justify-between px-2 pt-3">
          <div className="flex items-center gap-3">
            <div className={`${sk} h-10 w-10 shrink-0 rounded-full`} />
            <div className="space-y-2">
              <div className={`${sk} h-3.5 w-28 rounded-full`} />
              <div className={`${sk} h-2.5 w-20 rounded-full`} />
            </div>
          </div>
          <div className={`${sk} h-6 w-16 rounded-full`} />
        </div>
        <div className="px-2 pt-3 space-y-2">
          <div className={`${sk} h-5 w-16 rounded-full`} />
          <div className={`${sk} h-4 w-4/5 rounded-full`} />
          <div className={`${sk} h-3.5 w-full rounded-full`} />
          <div className={`${sk} h-3.5 w-3/4 rounded-full`} />
        </div>
        <div className="flex gap-1.5 px-2 pt-3">
          <div className={`${sk} h-5 w-16 rounded-full`} />
          <div className={`${sk} h-5 w-20 rounded-full`} />
        </div>
        <div className="flex items-center justify-between px-2 py-3 mt-3 border-t border-edge">
          <div className="flex gap-4">
            <div className={`${sk} h-4 w-20 rounded-full`} />
            <div className={`${sk} h-4 w-12 rounded-full`} />
          </div>
          <div className={`${sk} h-7 w-16 rounded-full`} />
        </div>
      </article>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-0">
      {[0, 1, 2, 3].map((i) => (
        <RequestSkeleton key={i} />
      ))}
    </div>
  );
}

export default function RequestFeedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [isLoading] = useState(false);

  const filteredRequests = MOCK_REQUESTS.filter((r) => {
    if (activeTab === "open") return !r.solved;
    if (activeTab === "fulfilled") return r.solved;
    return true;
  });

  const handleNewRequest = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push("/request/create");
  };

  return (
    <div className="min-h-screen bg-page">
      {/* Mobile-only header */}
      <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between bg-surface px-5 pb-3 pt-6 shadow-[0_1px_0_0_var(--edge)] lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EFF6FF]">
            <MessageQuestion size={18} color="#1D4ED8" variant="Bold" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Requests</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Search requests"
            className="cursor-pointer rounded-full p-2 transition-colors duration-200 hover:bg-black/5 active:bg-black/10"
            onClick={() => router.push("/search")}
          >
            <SearchNormal1 size={20} color="#959595" />
          </button>
          <button
            type="button"
            aria-label="New request"
            onClick={handleNewRequest}
            className="cursor-pointer flex items-center gap-1.5 rounded-full bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#1A44C2] active:scale-95"
          >
            <Add size={14} color="white" variant="Bold" />
            New
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[600px] pt-[5.5rem] pb-32 lg:pt-6 lg:pb-12">
        {/* Desktop section title */}
        <div className="hidden lg:flex lg:items-center lg:justify-between lg:px-0 lg:pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EFF6FF]">
              <MessageQuestion size={20} color="#1D4ED8" variant="Bold" />
            </div>
            <h1 className="text-xl font-semibold text-ink">Requests</h1>
          </div>
          <button
            type="button"
            onClick={handleNewRequest}
            className="cursor-pointer flex items-center gap-1.5 rounded-full bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#1A44C2] active:scale-95"
          >
            <Add size={16} color="white" variant="Bold" />
            New Request
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b border-edge px-3 lg:px-0 lg:mb-2">
          {(["all", "open", "fulfilled"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`cursor-pointer px-4 py-3 text-sm font-semibold capitalize transition-all duration-200 border-b-2 ${
                activeTab === tab
                  ? "border-[#1D4ED8] text-[#1D4ED8]"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {tab}
              {tab === "open" && (
                <span className="ml-1.5 rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">
                  {MOCK_REQUESTS.filter((r) => !r.solved).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="space-y-0">
          {isLoading ? (
            <FeedSkeleton />
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-high mb-4">
                <MessageQuestion size={28} color="var(--ink-3)" variant="Bold" />
              </div>
              <p className="text-base font-semibold text-ink">
                {activeTab === "fulfilled"
                  ? "No fulfilled requests yet"
                  : "No open requests"}
              </p>
              <p className="mt-1.5 text-sm text-ink-3">
                {activeTab === "fulfilled"
                  ? "Requests that have been answered will appear here."
                  : "Be the first to post a request!"}
              </p>
              {activeTab !== "fulfilled" && (
                <button
                  type="button"
                  onClick={handleNewRequest}
                  className="cursor-pointer mt-5 rounded-full bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#1A44C2] active:scale-95"
                >
                  Post a Request
                </button>
              )}
            </div>
          ) : (
            filteredRequests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))
          )}
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={handleNewRequest}
        className="lg:hidden fixed bottom-24 right-5 z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[#1D4ED8] shadow-[0_4px_20px_rgba(29,78,216,0.35)] transition-all duration-200 hover:bg-[#1A44C2] active:scale-95"
        aria-label="New request"
      >
        <Add size={24} color="white" variant="Bold" />
      </button>
    </div>
  );
}
