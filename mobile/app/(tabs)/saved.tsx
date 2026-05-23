import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  Modal,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Archive,
  ArrowRight,
  CloseCircle,
  DocumentText,
  DocumentText1,
  Edit2,
  Folder2,
  FolderOpen,
  Trash,
} from "iconsax-react-nativejs";
import { gql } from "@/lib/api";
import { getAuth } from "@/lib/auth-store";
import PdfViewerModal from "@/components/home/PdfViewerModal";
import type { HomePost } from "@/components/home/Post";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SavedFolder = {
  id: string;
  archiveId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type SavedPostRecord = {
  id: string;
  archiveId: string;
  folderId?: string | null;
  postId: string;
  createdAt: string;
  post: HomePost;
  folder?: SavedFolder | null;
};

type ArchiveData = {
  id: string;
  name: string;
  folders: SavedFolder[];
  savedPosts: SavedPostRecord[];
};

type FolderWithPosts = SavedFolder & { savedPosts: SavedPostRecord[] };

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const ARCHIVE_QUERY = `
  query MyArchive {
    myArchive {
      id name
      folders { id archiveId name createdAt updatedAt }
      savedPosts {
        id archiveId folderId postId createdAt
        post {
          id fileUrl thumbnailUrl fileType title categories description year pinned
          commentsDisabled likeCount commentCount viewerHasLiked viewCount createdAt
          author { id displayName username profilePicture subscriptionPlan isBot }
        }
        folder { id archiveId name createdAt updatedAt }
      }
    }
  }
`;

const REMOVE_POST_MUTATION = `
  mutation RemoveArchivedPost($savedPostId: ID!) {
    removeArchivedPost(savedPostId: $savedPostId)
  }
`;

const CREATE_FOLDER_MUTATION = `
  mutation CreateArchiveFolder($name: String!) {
    createArchiveFolder(name: $name) { id archiveId name createdAt updatedAt }
  }
`;

const RENAME_FOLDER_MUTATION = `
  mutation UpdateArchiveFolder($folderId: ID!, $name: String!) {
    updateArchiveFolder(folderId: $folderId, name: $name) { id archiveId name createdAt updatedAt }
  }
`;

const DELETE_FOLDER_MUTATION = `
  mutation DeleteArchiveFolder($folderId: ID!) {
    deleteArchiveFolder(folderId: $folderId)
  }
`;

// ---------------------------------------------------------------------------
// SavedFileCard
// ---------------------------------------------------------------------------
function SavedFileCard({
  savedPost,
  onOpenFile,
  onOpenInHub,
  onRemove,
  isRemoving,
}: {
  savedPost: SavedPostRecord;
  onOpenFile: (post: HomePost) => void;
  onOpenInHub: (savedPost: SavedPostRecord) => void;
  onRemove: (savedPost: SavedPostRecord) => void;
  isRemoving?: boolean;
}) {
  const post = savedPost.post;

  return (
    <View style={cardStyles.wrap}>
      {/* Thumbnail */}
      <TouchableOpacity
        onPress={() => onOpenFile(post)}
        activeOpacity={0.8}
        style={cardStyles.thumb}
      >
        {post.thumbnailUrl ? (
          <Image
            source={{ uri: post.thumbnailUrl }}
            style={cardStyles.thumbImg}
            resizeMode="cover"
          />
        ) : (
          <View style={cardStyles.thumbPlaceholder}>
            <DocumentText1 size={28} color="#C8B99A" variant="Bold" />
          </View>
        )}
      </TouchableOpacity>

      {/* Info */}
      <View style={cardStyles.info}>
        <View style={cardStyles.topRow}>
          <View style={cardStyles.titleWrap}>
            <Text style={cardStyles.title} numberOfLines={2}>
              {post.title}
            </Text>
            <Text style={cardStyles.meta} numberOfLines={1}>
              {post.categories?.join(", ")}
              {post.year ? ` • ${post.year}` : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onRemove(savedPost)}
            disabled={isRemoving}
            hitSlop={8}
            style={isRemoving ? cardStyles.removingBtn : undefined}
          >
            <CloseCircle size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <View style={cardStyles.bottomRow}>
          <Text style={cardStyles.savedLabel}>Attachment saved</Text>
          <View style={cardStyles.actions}>
            <TouchableOpacity onPress={() => onOpenInHub(savedPost)} activeOpacity={0.7}>
              <Text style={cardStyles.actionSecondary}>Use in Hub</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onOpenFile(post)}
              activeOpacity={0.7}
              style={cardStyles.actionPrimaryBtn}
            >
              <Text style={cardStyles.actionPrimary}>Open file</Text>
              <ArrowRight size={13} color="#111111" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    padding: 12,
    shadowColor: "#111",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  thumb: { flexShrink: 0 },
  thumbImg: {
    width: 80,
    height: 110,
    borderRadius: 6,
    backgroundColor: "#E8E8E8",
  },
  thumbPlaceholder: {
    width: 80,
    height: 110,
    borderRadius: 6,
    backgroundColor: "#FFF3E7",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, justifyContent: "space-between", minWidth: 0 },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: "600", color: "#111111", lineHeight: 18 },
  meta: { fontSize: 11, color: "#9CA3AF", marginTop: 3 },
  removingBtn: { opacity: 0.4 },
  bottomRow: { gap: 4 },
  savedLabel: { fontSize: 10, color: "#9CA3AF", textAlign: "right" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 14 },
  actionSecondary: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  actionPrimaryBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  actionPrimary: { fontSize: 12, fontWeight: "600", color: "#111111" },
});

// ---------------------------------------------------------------------------
// FolderCard
// ---------------------------------------------------------------------------
function FolderCard({
  folder,
  onPress,
  onLongPress,
}: {
  folder: FolderWithPosts;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={folderCardStyles.wrap}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <Folder2 size={44} color="#C8B99A" variant="Bold" />
      <Text style={folderCardStyles.name} numberOfLines={2}>
        {folder.name}
      </Text>
      <Text style={folderCardStyles.count}>
        {folder.savedPosts.length} {folder.savedPosts.length === 1 ? "file" : "files"}
      </Text>
    </TouchableOpacity>
  );
}

const folderCardStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingVertical: 8,
  },
  name: {
    fontSize: 12,
    fontWeight: "500",
    color: "#111111",
    textAlign: "center",
  },
  count: { fontSize: 10, color: "#9CA3AF" },
});

// ---------------------------------------------------------------------------
// FolderModal — shows contents of a folder
// ---------------------------------------------------------------------------
function FolderModal({
  folder,
  visible,
  onClose,
  onOpenFile,
  onOpenInHub,
  onRemovePost,
  onRenameFolder,
  onDeleteFolder,
  removingIds,
}: {
  folder: FolderWithPosts | null;
  visible: boolean;
  onClose: () => void;
  onOpenFile: (post: HomePost) => void;
  onOpenInHub: (savedPost: SavedPostRecord) => void;
  onRemovePost: (savedPost: SavedPostRecord) => void;
  onRenameFolder: (folder: FolderWithPosts) => void;
  onDeleteFolder: (folder: FolderWithPosts) => void;
  removingIds: Record<string, boolean>;
}) {
  if (!folder) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={folderModalStyles.container} edges={["top"]}>
        {/* Header */}
        <View style={folderModalStyles.header}>
          <View style={folderModalStyles.headerLeft}>
            <Folder2 size={20} color="#E1761F" variant="Bold" />
            <Text style={folderModalStyles.title} numberOfLines={1}>
              {folder.name}
            </Text>
          </View>
          <View style={folderModalStyles.headerRight}>
            <TouchableOpacity
              onPress={() => onRenameFolder(folder)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Edit2 size={18} color="#6B7280" variant="Bold" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDeleteFolder(folder)}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Trash size={18} color="#D12F2F" variant="Bold" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
              <CloseCircle size={24} color="#9CA3AF" variant="Bold" />
            </TouchableOpacity>
          </View>
        </View>

        {folder.savedPosts.length === 0 ? (
          <View style={folderModalStyles.empty}>
            <Folder2 size={48} color="#E1CB9F" variant="Bold" />
            <Text style={folderModalStyles.emptyText}>This folder is empty</Text>
          </View>
        ) : (
          <FlatList
            data={folder.savedPosts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={folderModalStyles.cardWrap}>
                <SavedFileCard
                  savedPost={item}
                  onOpenFile={onOpenFile}
                  onOpenInHub={onOpenInHub}
                  onRemove={onRemovePost}
                  isRemoving={removingIds[item.id]}
                />
              </View>
            )}
            contentContainerStyle={folderModalStyles.list}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const folderModalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAF8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "700", color: "#111111", flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  list: { padding: 16, gap: 12 },
  cardWrap: { marginBottom: 12 },
});

// ---------------------------------------------------------------------------
// SavedScreen
// ---------------------------------------------------------------------------
export default function SavedScreen() {
  const router = useRouter();

  const [archive, setArchive] = useState<ArchiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});

  const [activePdfPost, setActivePdfPost] = useState<HomePost | null>(null);
  const [openFolder, setOpenFolder] = useState<FolderWithPosts | null>(null);

  // Create folder modal
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------
  const fetchArchive = useCallback(async ({ silent = false } = {}) => {
    const { token } = getAuth();
    if (!silent) setIsLoading(true);
    setError("");
    try {
      const data = await gql<{ myArchive: ArchiveData | null }>(
        ARCHIVE_QUERY,
        {},
        token ?? undefined,
      );
      setArchive(data.myArchive ?? null);
    } catch {
      setError("Failed to load saved files.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArchive();
  }, [fetchArchive]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchArchive({ silent: true }).finally(() => setRefreshing(false));
  }, [fetchArchive]);

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------
  const rootPosts = useMemo(
    () => archive?.savedPosts?.filter((p) => !p.folderId) ?? [],
    [archive],
  );

  const foldersWithPosts = useMemo<FolderWithPosts[]>(
    () =>
      (archive?.folders ?? []).map((folder) => ({
        ...folder,
        savedPosts: archive?.savedPosts?.filter((p) => p.folderId === folder.id) ?? [],
      })),
    [archive],
  );

  // Keep open folder in sync with archive updates
  const syncedOpenFolder = useMemo(() => {
    if (!openFolder) return null;
    return foldersWithPosts.find((f) => f.id === openFolder.id) ?? null;
  }, [openFolder, foldersWithPosts]);

  // ------------------------------------------------------------------
  // Remove post
  // ------------------------------------------------------------------
  const handleRemovePost = useCallback(
    (savedPost: SavedPostRecord) => {
      Alert.alert("Remove Saved File?", "This file will be removed from your saved list.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { token } = getAuth();
            setRemovingIds((p) => ({ ...p, [savedPost.id]: true }));
            try {
              await gql(
                REMOVE_POST_MUTATION,
                { savedPostId: savedPost.id },
                token ?? undefined,
              );
              setArchive((prev) =>
                prev
                  ? { ...prev, savedPosts: prev.savedPosts.filter((p) => p.id !== savedPost.id) }
                  : prev,
              );
            } catch {
              setError("Failed to remove file.");
            } finally {
              setRemovingIds((p) => ({ ...p, [savedPost.id]: false }));
            }
          },
        },
      ]);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Folder — create
  // ------------------------------------------------------------------
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const { token } = getAuth();
    setIsCreatingFolder(true);
    try {
      const data = await gql<{ createArchiveFolder: SavedFolder }>(
        CREATE_FOLDER_MUTATION,
        { name },
        token ?? undefined,
      );
      setArchive((prev) =>
        prev
          ? { ...prev, folders: [...prev.folders, data.createArchiveFolder] }
          : prev,
      );
      setNewFolderName("");
      setShowCreateFolder(false);
    } catch {
      setError("Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  }, [newFolderName]);

  // ------------------------------------------------------------------
  // Folder — rename
  // ------------------------------------------------------------------
  const handleRenameFolder = useCallback((folder: FolderWithPosts) => {
    Alert.prompt(
      "Rename Folder",
      undefined,
      async (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const { token } = getAuth();
        try {
          const data = await gql<{ updateArchiveFolder: SavedFolder }>(
            RENAME_FOLDER_MUTATION,
            { folderId: folder.id, name: trimmed },
            token ?? undefined,
          );
          setArchive((prev) =>
            prev
              ? {
                  ...prev,
                  folders: prev.folders.map((f) =>
                    f.id === folder.id ? data.updateArchiveFolder : f,
                  ),
                }
              : prev,
          );
        } catch {
          setError("Failed to rename folder.");
        }
      },
      "plain-text",
      folder.name,
    );
  }, []);

  // ------------------------------------------------------------------
  // Folder — delete
  // ------------------------------------------------------------------
  const handleDeleteFolder = useCallback(
    (folder: FolderWithPosts) => {
      Alert.alert(
        `Delete "${folder.name}"?`,
        "All files in this folder will also be removed.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const { token } = getAuth();
              try {
                await gql(
                  DELETE_FOLDER_MUTATION,
                  { folderId: folder.id },
                  token ?? undefined,
                );
                setArchive((prev) => {
                  if (!prev) return prev;
                  const folderPostIds = new Set(
                    prev.savedPosts
                      .filter((p) => p.folderId === folder.id)
                      .map((p) => p.id),
                  );
                  return {
                    ...prev,
                    folders: prev.folders.filter((f) => f.id !== folder.id),
                    savedPosts: prev.savedPosts.filter((p) => !folderPostIds.has(p.id)),
                  };
                });
                if (openFolder?.id === folder.id) setOpenFolder(null);
              } catch {
                setError("Failed to delete folder.");
              }
            },
          },
        ],
      );
    },
    [openFolder],
  );

  const handleOpenInHub = useCallback(
    (savedPost: SavedPostRecord) => {
      router.push(`/hub?postId=${encodeURIComponent(savedPost.postId)}` as never);
    },
    [router],
  );

  const isEmpty =
    !archive ||
    (archive.folders.length === 0 && archive.savedPosts.length === 0);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Saved</Text>
        <TouchableOpacity
          onPress={() => setShowCreateFolder(true)}
          style={styles.newFolderBtn}
          activeOpacity={0.7}
        >
          <Folder2 size={14} color="#E1761F" variant="Bold" />
          <Text style={styles.newFolderText}>New Folder</Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#E1761F" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#E1761F"
              colors={["#E1761F"]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {isEmpty ? (
            <View style={styles.emptyState}>
              <Archive size={48} color="#E1CB9F" variant="Bold" />
              <Text style={styles.emptyTitle}>No saved files yet</Text>
              <Text style={styles.emptySubtitle}>
                {"Save attachments from the feed and they'll appear here."}
              </Text>
            </View>
          ) : (
            <>
              {/* Folders section */}
              {foldersWithPosts.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <FolderOpen size={18} color="#111111" />
                      <Text style={styles.sectionTitle}>Folders</Text>
                    </View>
                    <Text style={styles.sectionCount}>{foldersWithPosts.length}</Text>
                  </View>
                  <View style={styles.folderGrid}>
                    {foldersWithPosts.map((folder) => (
                      <View key={folder.id} style={styles.folderGridItem}>
                        <FolderCard
                          folder={folder}
                          onPress={() => setOpenFolder(folder)}
                          onLongPress={() => {
                            Alert.alert(folder.name, undefined, [
                              {
                                text: "Rename",
                                onPress: () => handleRenameFolder(folder),
                              },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => handleDeleteFolder(folder),
                              },
                              { text: "Cancel", style: "cancel" },
                            ]);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Files section */}
              {rootPosts.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <DocumentText size={18} color="#111111" />
                      <Text style={styles.sectionTitle}>Files</Text>
                    </View>
                    <Text style={styles.sectionCount}>{rootPosts.length}</Text>
                  </View>
                  <View style={styles.fileList}>
                    {rootPosts.map((savedPost) => (
                      <SavedFileCard
                        key={savedPost.id}
                        savedPost={savedPost}
                        onOpenFile={setActivePdfPost}
                        onOpenInHub={handleOpenInHub}
                        onRemove={handleRemovePost}
                        isRemoving={removingIds[savedPost.id]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Folder contents modal */}
      <FolderModal
        folder={syncedOpenFolder}
        visible={openFolder !== null}
        onClose={() => setOpenFolder(null)}
        onOpenFile={setActivePdfPost}
        onOpenInHub={handleOpenInHub}
        onRemovePost={handleRemovePost}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        removingIds={removingIds}
      />

      {/* Create folder modal */}
      <Modal
        visible={showCreateFolder}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateFolder(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCreateFolder(false)}
        >
          <Pressable style={styles.createFolderSheet} onPress={() => {}}>
            <Text style={styles.createFolderTitle}>New Folder</Text>
            <TextInput
              style={styles.folderInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Folder name"
              placeholderTextColor="#B8A898"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateFolder()}
            />
            <View style={styles.createFolderActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setNewFolderName("");
                  setShowCreateFolder(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  (!newFolderName.trim() || isCreatingFolder) && styles.createBtnDisabled,
                ]}
                onPress={() => void handleCreateFolder()}
                disabled={!newFolderName.trim() || isCreatingFolder}
                activeOpacity={0.8}
              >
                {isCreatingFolder ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.createBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PDF Viewer */}
      <PdfViewerModal
        post={activePdfPost}
        isOpen={activePdfPost !== null}
        onClose={() => setActivePdfPost(null)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FAFAF8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FAFAF8",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111111" },
  newFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF3E7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newFolderText: { fontSize: 12, fontWeight: "600", color: "#E1761F" },

  errorBanner: {
    margin: 16,
    padding: 12,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
  },
  errorText: { fontSize: 13, color: "#D12F2F", textAlign: "center" },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  scroll: { padding: 16, gap: 20, paddingBottom: 40 },

  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#111111" },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },

  section: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 14,
    shadowColor: "#111",
    shadowOpacity: 0.03,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#111111" },
  sectionCount: { fontSize: 13, color: "#9CA3AF" },

  folderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  folderGridItem: { width: "33.33%", paddingHorizontal: 4 },

  fileList: { gap: 10 },

  // Create folder modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  createFolderSheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  createFolderTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  folderInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111111",
  },
  createFolderActions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 11,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "500", color: "#6B7280" },
  createBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#111111",
    paddingVertical: 11,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
});
