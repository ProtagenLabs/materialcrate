import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import HomeHeader from "@/components/HomeHeader";
import Post, { HomePost } from "@/components/home/Post";
import PdfViewerModal from "@/components/home/PdfViewerModal";
import { gql } from "@/lib/api";

const PAGE_SIZE = 20;

const POSTS_QUERY = `
  query Posts($limit: Int!, $offset: Int!) {
    posts(limit: $limit, offset: $offset) {
      id
      fileUrl
      thumbnailUrl
      title
      categories
      description
      year
      pinned
      commentsDisabled
      likeCount
      commentCount
      viewerHasLiked
      viewCount
      createdAt
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

export default function HomeScreen() {
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<HomePost | null>(null);

  // Use refs for values read inside async callbacks to avoid stale closures
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);

  const fetchPosts = useCallback(
    async (nextOffset: number, isRefresh = false) => {
      if (isFetchingRef.current && !isRefresh) return;
      if (!hasMoreRef.current && !isRefresh) return;

      isFetchingRef.current = true;
      setLoading(true);
      try {
        const data = await gql<{ posts: HomePost[] }>(POSTS_QUERY, {
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        const newPosts = data.posts ?? [];

        setPosts((prev) =>
          nextOffset === 0 ? newPosts : [...prev, ...newPosts],
        );
        offsetRef.current = nextOffset + newPosts.length;
        hasMoreRef.current = newPosts.length === PAGE_SIZE;
      } catch (e) {
        console.error("Failed to fetch posts", e);
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPosts(0);
  }, [fetchPosts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    hasMoreRef.current = true;
    void fetchPosts(0, true);
  }, [fetchPosts]);

  const handleEndReached = useCallback(() => {
    if (!isFetchingRef.current && hasMoreRef.current) {
      void fetchPosts(offsetRef.current);
    }
  }, [fetchPosts]);

  return (
    <View style={styles.container}>
      <HomeHeader />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Post post={item} onFileClick={setSelectedPost} />
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E1761F"
          />
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator style={styles.loader} color="#E1761F" />
          ) : null
        }
      />
      <PdfViewerModal
        post={selectedPost}
        isOpen={selectedPost !== null}
        onClose={() => setSelectedPost(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loader: {
    paddingVertical: 24,
  },
});
