import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { CloseCircle, DocumentText1, Warning2 } from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import type { HomePost } from "./Post";

const TRACK_MUTATION = `
  mutation TrackFeedInteraction($input: FeedInteractionInput!) {
    trackFeedInteraction(input: $input)
  }
`;

type Props = {
  post: HomePost | null;
  isOpen: boolean;
  onClose: () => void;
};

type LoadState = "loading" | "ready" | "error";

export default function PdfViewerModal({ post, isOpen, onClose }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileUrl = post?.fileUrl ?? "";

  useEffect(() => {
    setLoadState("loading");
  }, [isOpen, post?.id]);

  useEffect(() => {
    if (!isOpen || !post?.id) return;

    void gql(TRACK_MUTATION, {
      input: {
        postId: post.id,
        interactionType: "OPEN_PREVIEW",
        signalKind: "positive",
        metadata: JSON.stringify({ source: "pdf-viewer" }),
      },
    }).catch(() => null);

    timerRef.current = setTimeout(() => {
      void gql(TRACK_MUTATION, {
        input: {
          postId: post.id,
          interactionType: "LONG_VIEW",
          signalKind: "positive",
          durationMs: 8000,
          metadata: JSON.stringify({ source: "pdf-viewer" }),
        },
      }).catch(() => null);
    }, 8000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, post?.id]);

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={styles.container}
        edges={["top", "bottom", "left", "right"]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.docIconWrap}>
              <DocumentText1 size={20} color="#E1761F" variant="Bold" />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.title} numberOfLines={2}>
                {post?.title}
              </Text>
              {(post?.categories?.length ?? 0) > 0 && (
                <View style={styles.chips}>
                  {post!.categories.slice(0, 3).map((cat) => (
                    <View key={cat} style={styles.chip}>
                      <Text style={styles.chipText}>{cat.toUpperCase()}</Text>
                    </View>
                  ))}
                  {post!.year != null && (
                    <View style={[styles.chip, styles.chipYear]}>
                      <Text style={[styles.chipText, styles.chipYearText]}>
                        {post!.year}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            activeOpacity={0.7}
            style={styles.closeButton}
          >
            <CloseCircle size={26} color="#6B7280" variant="Bold" />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {loadState === "loading" && (
            <View style={styles.centered}>
              <View style={styles.loadingIconWrap}>
                <DocumentText1 size={36} color="#C8B99A" variant="Bold" />
              </View>
              <ActivityIndicator
                size="large"
                color="#E1761F"
                style={styles.spinner}
              />
              <Text style={styles.loadingText}>Opening document…</Text>
            </View>
          )}

          {loadState === "error" && (
            <View style={styles.centered}>
              <View style={styles.errorIconWrap}>
                <Warning2 size={32} color="#8A3A25" variant="Bold" />
              </View>
              <Text style={styles.errorTitle}>Couldn't open document</Text>
              <Text style={styles.errorText}>
                This file couldn't be loaded right now. Try again later.
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => setLoadState("loading")}
                activeOpacity={0.8}
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {!!fileUrl && (
            <WebView
              source={{ uri: fileUrl }}
              style={[styles.webview, loadState !== "ready" && styles.hidden]}
              onLoadEnd={() => setLoadState("ready")}
              onError={() => setLoadState("error")}
              onHttpError={() => setLoadState("error")}
              allowsInlineMediaPlayback={false}
              startInLoadingState={false}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAF8",
    paddingTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FAFAF8",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  docIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFF3E7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#131212",
    lineHeight: 21,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#6B7280",
  },
  chipYear: {
    backgroundColor: "#FFF3E7",
  },
  chipYearText: {
    color: "#E1761F",
  },
  closeButton: {
    marginTop: 6,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    backgroundColor: "#E7E1D8",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  hidden: {
    opacity: 0,
    position: "absolute",
    width: 0,
    height: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  loadingIconWrap: {
    marginBottom: 8,
  },
  spinner: {
    marginVertical: 4,
  },
  loadingText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
  },
  errorIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FDE9E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#131212",
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#131212",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
});
