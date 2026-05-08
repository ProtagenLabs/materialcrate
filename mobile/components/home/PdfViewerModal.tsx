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
import { CloseCircle } from "iconsax-react-nativejs";
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
    if (!isOpen) {
      setLoadState("loading");
      return;
    }
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
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.title} numberOfLines={1}>
              {post?.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {post?.categories.join(", ")}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
            <CloseCircle size={28} color="#131212" variant="Bold" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {loadState === "loading" && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#E1761F" />
              <Text style={styles.loadingText}>Loading PDF...</Text>
            </View>
          )}

          {loadState === "error" && (
            <View style={styles.centered}>
              <Text style={styles.errorText}>
                Unable to render this PDF right now.
              </Text>
            </View>
          )}

          {!!fileUrl && (
            <WebView
              source={{ uri: fileUrl }}
              style={[
                styles.webview,
                loadState !== "ready" && styles.hidden,
              ]}
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
    backgroundColor: "#F4F1EC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D1D5DB",
    backgroundColor: "#ffffff",
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#131212",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
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
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 14,
    color: "#8A3A25",
    textAlign: "center",
    maxWidth: 260,
  },
});
