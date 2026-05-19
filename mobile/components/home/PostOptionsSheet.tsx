import { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Edit2,
  EyeSlash,
  Flag,
  ProfileAdd,
  Slash,
  Trash,
  VolumeMute,
  Location,
  LocationSlash,
  Clock,
  Clipboard,
  MessageQuestion,
} from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth, getCurrentUserId } from "@/lib/auth-store";
import type { HomePost, PostOptionsAnchor } from "./Post";

const POPUP_WIDTH = 270;
const GAP = 8;
const EDGE_PADDING = 16;
const ESTIMATED_POPUP_HEIGHT = 4 * 50 + 2 * 50 + 50 + 8 * 2 + 8 * 2;

type Props = {
  post: HomePost | null;
  anchor: PostOptionsAnchor | null;
  isOpen: boolean;
  onClose: () => void;
  onPostUpdated?: (post: HomePost) => void;
  onPostDeleted?: (postId: string) => void;
  onPostHidden?: (postId: string) => void;
};

const M = {
  followUser: `mutation FollowUser($username: String!) { followUser(username: $username) { followed pending } }`,
  muteUser: `mutation MuteUser($username: String!) { muteUser(username: $username) }`,
  blockUser: `mutation BlockUser($username: String!) { blockUser(username: $username) }`,
  markNotInterested: `mutation MarkPostNotInterested($postId: ID!) { markPostNotInterested(postId: $postId) }`,
  deletePost: `mutation DeletePost($postId: ID!) { deletePost(postId: $postId) }`,
  pinPost: `mutation PinPostToProfile($postId: ID!) { pinPostToProfile(postId: $postId) }`,
  toggleComments: `mutation TogglePostComments($postId: ID!) { togglePostComments(postId: $postId) }`,
};

type ActionItem = {
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; variant: string }>;
  color: string;
  onPress: () => void;
};

export default function PostOptionsPopup({
  post,
  anchor,
  isOpen,
  onClose,
  onPostUpdated,
  onPostDeleted,
  onPostHidden,
}: Props) {
  const router = useRouter();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      scaleAnim.setValue(0.92);
      opacityAnim.setValue(0);
      setVisible(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.88,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!post) return null;

  const currentUserId = getCurrentUserId();
  const isOwner = Boolean(currentUserId && post.author?.id && currentUserId === post.author.id);
  const authorUsername = post.author?.username?.trim() ?? "";
  const handle = authorUsername ? `@${authorUsername}` : "@unknown";

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleFollow() {
    const { token } = getAuth();
    await gql(M.followUser, { username: authorUsername }, token ?? undefined).catch(() => null);
    onClose();
  }

  async function handleMute() {
    const { token } = getAuth();
    await gql(M.muteUser, { username: authorUsername }, token ?? undefined).catch(() => null);
    onClose();
  }

  function handleBlock() {
    Alert.alert(
      `Block ${handle}?`,
      "They won't be able to find your profile or posts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const { token } = getAuth();
              await gql(M.blockUser, { username: authorUsername }, token ?? undefined).catch(() => null);
              onClose();
            }),
        },
      ],
    );
  }

  async function handleNotInterested() {
    const { token } = getAuth();
    await gql(M.markNotInterested, { postId: post.id }, token ?? undefined).catch(() => null);
    onPostHidden?.(post.id);
    onClose();
  }

  async function handlePin() {
    const { token } = getAuth();
    await gql(M.pinPost, { postId: post.id }, token ?? undefined).catch(() => null);
    onPostUpdated?.({ ...post, pinned: !post.pinned });
    onClose();
  }

  async function handleToggleComments() {
    const { token } = getAuth();
    await gql(M.toggleComments, { postId: post.id }, token ?? undefined).catch(() => null);
    onPostUpdated?.({ ...post, commentsDisabled: !post.commentsDisabled });
    onClose();
  }

  function handleDelete() {
    Alert.alert(
      "Delete post?",
      "This post will be permanently deleted after 30 days. You can restore it before then.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const { token } = getAuth();
              await gql(M.deletePost, { postId: post.id }, token ?? undefined).catch(() => null);
              onPostDeleted?.(post.id);
              onClose();
            }),
        },
      ],
    );
  }

  function handleReport() {
    Alert.alert("Report post", "Are you sure you want to report this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: () => onClose(),
      },
    ]);
  }

  const primaryActions: ActionItem[] = isOwner
    ? [
        {
          label: "Edit post",
          Icon: Edit2,
          color: "#111111",
          onPress: () => {
            onClose();
            router.push(`/post/${encodeURIComponent(post.id)}/edit` as never);
          },
        },
        {
          label: post.pinned ? "Unpin from profile" : "Pin to profile",
          Icon: post.pinned ? LocationSlash : Location,
          color: "#111111",
          onPress: () => run(handlePin),
        },
        {
          label: post.commentsDisabled ? "Enable comments" : "Disable comments",
          Icon: MessageQuestion,
          color: "#111111",
          onPress: () => run(handleToggleComments),
        },
      ]
    : [
        {
          label: `Follow ${handle}`,
          Icon: ProfileAdd,
          color: "#111111",
          onPress: () => run(handleFollow),
        },
        {
          label: `Mute ${handle}`,
          Icon: VolumeMute,
          color: "#111111",
          onPress: () => run(handleMute),
        },
        {
          label: "Not interested in this post",
          Icon: EyeSlash,
          color: "#111111",
          onPress: () => run(handleNotInterested),
        },
        {
          label: `Block ${handle}`,
          Icon: Slash,
          color: "#111111",
          onPress: handleBlock,
        },
      ];

  const secondaryActions: ActionItem[] = [
    {
      label: "Open in Hub",
      Icon: Clipboard,
      color: "#111111",
      onPress: () => {
        onClose();
        router.push(`/hub?postId=${encodeURIComponent(post.id)}` as never);
      },
    },
    {
      label: "View history",
      Icon: Clock,
      color: "#111111",
      onPress: () => {
        onClose();
        router.push(`/post/${encodeURIComponent(post.id)}/history` as never);
      },
    },
  ];

  const fitsBelow = anchor
    ? anchor.pageY + anchor.height + GAP + ESTIMATED_POPUP_HEIGHT <= screenHeight - EDGE_PADDING
    : false;
  const popupTop = anchor
    ? fitsBelow
      ? anchor.pageY + anchor.height + GAP
      : anchor.pageY - ESTIMATED_POPUP_HEIGHT - GAP
    : screenHeight * 0.2;
  const popupRight = anchor
    ? Math.max(EDGE_PADDING, screenWidth - anchor.pageX - anchor.width)
    : EDGE_PADDING;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.popup,
            { top: popupTop, right: popupRight },
            { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {busy && (
              <View style={styles.busyOverlay} pointerEvents="none">
                <ActivityIndicator color="#E1761F" />
              </View>
            )}

            <View style={styles.gap}>
              <View style={styles.group}>
                {primaryActions.map((action, i) => (
                  <TouchableOpacity
                    key={action.label}
                    style={[styles.row, i < primaryActions.length - 1 && styles.rowDivider]}
                    onPress={action.onPress}
                    disabled={busy}
                    activeOpacity={0.5}
                  >
                    <action.Icon size={20} color={action.color} variant="Bold" />
                    <Text style={styles.rowLabel}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.group}>
                {secondaryActions.map((action, i) => (
                  <TouchableOpacity
                    key={action.label}
                    style={[styles.row, i < secondaryActions.length - 1 && styles.rowDivider]}
                    onPress={action.onPress}
                    disabled={busy}
                    activeOpacity={0.5}
                  >
                    <action.Icon size={20} color={action.color} variant="Bold" />
                    <Text style={styles.rowLabel}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.group, styles.groupDestructive]}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={isOwner ? handleDelete : handleReport}
                  disabled={busy}
                  activeOpacity={0.5}
                >
                  {isOwner ? (
                    <Trash size={20} color="#D12F2F" variant="Bold" />
                  ) : (
                    <Flag size={20} color="#D12F2F" variant="Bold" />
                  )}
                  <Text style={styles.rowLabelDestructive}>
                    {isOwner ? "Delete post" : "Report post"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  popup: {
    position: "absolute",
    width: POPUP_WIDTH,
    borderRadius: 28,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 18,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderRadius: 28,
    backgroundColor: "rgba(250,250,250,0.6)",
  },
  gap: {
    gap: 6,
  },
  group: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },
  groupDestructive: {
    backgroundColor: "#FFF1F1",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111111",
    flex: 1,
  },
  rowLabelDestructive: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D12F2F",
    flex: 1,
  },
});
