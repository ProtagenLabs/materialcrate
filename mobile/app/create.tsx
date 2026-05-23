import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated,
  Modal,
  FlatList,
  Alert as RNAlert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft2,
  CloseCircle,
  DocumentUpload,
  Trash,
  DocumentText,
  ArrowDown2,
  TickCircle,
} from "iconsax-react-nativejs";
import * as DocumentPicker from "expo-document-picker";
import { File as FSFile, Paths } from "expo-file-system";
import { gql } from "@/lib/api";
import { getAuth, useAuth } from "@/lib/auth-store";
import {
  POST_CATEGORIES,
  normalizeAllowedCategory,
} from "@/lib/post-categories";
import ActionButton from "@/components/ActionButton";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SECTION_COUNT = 6;

const CREATE_POST_MUTATION = `
  mutation CreatePost(
    $fileBase64: String!
    $fileName: String!
    $mimeType: String!
    $title: String!
    $categories: [String!]!
    $description: String
    $year: Int
    $thumbnailBase64: String
  ) {
    createPost(
      fileBase64: $fileBase64
      fileName: $fileName
      mimeType: $mimeType
      title: $title
      categories: $categories
      description: $description
      year: $year
      thumbnailBase64: $thumbnailBase64
    ) { id }
  }
`;

const UPDATE_POST_MUTATION = `
  mutation UpdatePost(
    $postId: ID!
    $title: String!
    $categories: [String!]!
    $description: String
    $year: Int
  ) {
    updatePost(
      postId: $postId
      title: $title
      categories: $categories
      description: $description
      year: $year
    ) { id }
  }
`;

const GET_POST_QUERY = `
  query GetPostForEdit($id: ID!) {
    post(id: $id) { id title categories year description }
  }
`;

const FULFILL_MUTATION = `
  mutation FulfillDocumentRequest($requestId: ID!, $postId: ID!) {
    fulfillDocumentRequest(requestId: $requestId, postId: $postId) { id }
  }
`;

type SelectedFile = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
};

type EditPost = {
  id: string;
  title: string;
  categories: string[];
  year?: number | null;
  description?: string | null;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 60 }, (_, i) =>
  String(CURRENT_YEAR - i),
);

export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { postId, requestId } = useLocalSearchParams<{
    postId?: string;
    requestId?: string;
  }>();
  const isEditMode = Boolean(postId);

  const [editPost, setEditPost] = useState<EditPost | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState(isEditMode);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryInputFocused, setIsCategoryInputFocused] = useState(false);
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState<"error" | "success" | "info">(
    "error",
  );
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);

  // Animation values
  const sectionAnims = useRef(
    Array.from({ length: SECTION_COUNT }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(28),
    })),
  ).current;
  const alertAnim = useRef(new Animated.Value(0)).current;
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const publishPulseAnim = useRef(new Animated.Value(1)).current;
  const tagAnimsRef = useRef<Map<string, Animated.Value>>(new Map());
  const fileCardAnim = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Entrance animation ────────────────────────────────────────────────────
  useEffect(() => {
    Animated.stagger(
      65,
      sectionAnims.map(({ opacity, translateY }) =>
        Animated.parallel([
          Animated.spring(opacity, {
            toValue: 1,
            damping: 22,
            stiffness: 200,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 200,
            useNativeDriver: true,
          }),
        ]),
      ),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) router.replace("/(auth)/login" as never);
  }, [isAuthenticated, router]);

  // ── Load post for edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    const { token } = getAuth();

    gql<{ post: EditPost }>(GET_POST_QUERY, { id: postId }, token ?? undefined)
      .then(({ post }) => {
        if (cancelled) return;
        setEditPost(post);
        setTitle(post.title ?? "");
        setSelectedCategories(
          Array.isArray(post.categories) ? post.categories : [],
        );
        setYear(post.year ? String(post.year) : "");
        setDescription(post.description ?? "");
      })
      .catch(() => {
        if (!cancelled) showAlert("Failed to load post for editing.", "error");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPost(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  // ── Alert animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (alertMessage) {
      alertAnim.setValue(0);
      Animated.spring(alertAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(alertAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [alertMessage, alertAnim]);

  // ── Category dropdown animation ───────────────────────────────────────────
  const showDropdown =
    isCategoryInputFocused && filteredCategories().length > 0;
  useEffect(() => {
    if (showDropdown) {
      dropdownAnim.setValue(0);
      Animated.spring(dropdownAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown]);

  // ── File card animation ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(fileCardAnim, {
      toValue: selectedFile ? 1 : 0,
      damping: 18,
      stiffness: 240,
      useNativeDriver: true,
    }).start();
  }, [selectedFile, fileCardAnim]);

  // ── Publish loading pulse ─────────────────────────────────────────────────
  useEffect(() => {
    if (isPublishing) {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(publishPulseAnim, {
            toValue: 0.55,
            duration: 550,
            useNativeDriver: true,
          }),
          Animated.timing(publishPulseAnim, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      publishPulseAnim.setValue(1);
    }
    return () => pulseLoopRef.current?.stop();
  }, [isPublishing, publishPulseAnim]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showAlert(
    msg: string,
    type: "error" | "success" | "info" = "error",
  ) {
    setAlertType(type);
    setAlertMessage(msg);
  }

  function filteredCategories() {
    const trimmed = categoryQuery.trim().toLowerCase();
    return POST_CATEGORIES.filter((c) => {
      if (selectedCategories.includes(c)) return false;
      if (!trimmed) return true;
      return c.toLowerCase().includes(trimmed);
    }).slice(0, 14);
  }

  const isFormValid =
    title.trim().length >= 3 &&
    selectedCategories.length > 0 &&
    !isPublishing &&
    !isLoadingPost &&
    (isEditMode || (Boolean(selectedFile) && Boolean(fileBase64)));

  // ── File picking ──────────────────────────────────────────────────────────
  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      if (asset.size && asset.size > MAX_FILE_BYTES) {
        showAlert("File size exceeds 20 MB limit.");
        return;
      }

      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? "application/pdf",
      });
      setFileBase64(null);
      setAlertMessage("");
      setIsReadingFile(true);

      // content:// URIs (Android) can't be read directly — copy to local cache first
      let readFile = new FSFile(asset.uri);
      if (!asset.uri.startsWith("file://")) {
        const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const dest = new FSFile(Paths.cache, `mc_${Date.now()}_${safeName}`);
        readFile.copy(dest);
        readFile = dest;
      }

      const base64 = await readFile.base64();
      setFileBase64(base64);
    } catch {
      showAlert("Could not read the selected file. Please try again.");
      setSelectedFile(null);
      setFileBase64(null);
    } finally {
      setIsReadingFile(false);
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileBase64(null);
    setIsReadingFile(false);
  }, []);

  // ── Category helpers ──────────────────────────────────────────────────────
  const addCategory = useCallback(
    (cat: string) => {
      if (selectedCategories.length >= 3) return;
      const tagAnim = new Animated.Value(0);
      tagAnimsRef.current.set(cat, tagAnim);
      setSelectedCategories((prev) => [...prev, cat]);
      setCategoryQuery("");
      setIsCategoryInputFocused(false);
      Animated.spring(tagAnim, {
        toValue: 1,
        damping: 14,
        stiffness: 320,
        useNativeDriver: true,
      }).start();
    },
    [selectedCategories.length],
  );

  const removeCategory = useCallback((cat: string) => {
    const tagAnim = tagAnimsRef.current.get(cat);
    const doRemove = () => {
      setSelectedCategories((prev) => prev.filter((c) => c !== cat));
      tagAnimsRef.current.delete(cat);
    };
    if (tagAnim) {
      Animated.timing(tagAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start(doRemove);
    } else {
      doRemove();
    }
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!isFormValid) return;

    setIsPublishing(true);
    setAlertMessage("");

    const { token } = getAuth();

    try {
      if (isEditMode && postId) {
        await gql(
          UPDATE_POST_MUTATION,
          {
            postId,
            title: title.trim(),
            categories: selectedCategories,
            description: description.trim() || null,
            year: year ? Number(year) : null,
          },
          token ?? undefined,
        );
      } else {
        if (!selectedFile || !fileBase64) return;

        const createResult = await gql<{ createPost: { id: string } }>(
          CREATE_POST_MUTATION,
          {
            fileBase64,
            fileName: selectedFile.name,
            mimeType: selectedFile.mimeType,
            title: title.trim(),
            categories: selectedCategories,
            description: description.trim() || null,
            year: year ? Number(year) : null,
            thumbnailBase64: null,
          },
          token ?? undefined,
        );

        // Fulfill request if coming from a request
        if (requestId && createResult.createPost?.id) {
          await gql(
            FULFILL_MUTATION,
            { requestId, postId: createResult.createPost.id },
            token ?? undefined,
          ).catch(() => null);
        }
      }

      showAlert(
        isEditMode ? "Changes saved!" : "Published successfully!",
        "success",
      );
      setTimeout(() => router.back(), 900);
    } catch {
      showAlert(
        isEditMode ? "Failed to save changes." : "Failed to publish document.",
      );
      setIsPublishing(false);
    }
  }, [
    isFormValid,
    isEditMode,
    postId,
    requestId,
    title,
    selectedCategories,
    description,
    year,
    selectedFile,
    fileBase64,
    router,
  ]);

  // ── Animated style helpers ────────────────────────────────────────────────
  const sectionStyle = (i: number) => ({
    opacity: sectionAnims[i].opacity,
    transform: [{ translateY: sectionAnims[i].translateY }],
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + 12 },
          sectionStyle(0),
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <ArrowLeft2 size={22} color="#111111" variant="Linear" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? "Edit Material" : "Share a Material"}
        </Text>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Alert */}
        {alertMessage ? (
          <Animated.View
            style={[
              styles.alert,
              alertType === "success"
                ? styles.alertSuccess
                : alertType === "info"
                  ? styles.alertInfo
                  : styles.alertError,
              {
                opacity: alertAnim,
                transform: [
                  {
                    translateY: alertAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {alertType === "success" && (
              <TickCircle size={16} color="#16A34A" variant="Bold" />
            )}
            <Text
              style={[
                styles.alertText,
                alertType === "success" && styles.alertTextSuccess,
              ]}
            >
              {alertMessage}
            </Text>
          </Animated.View>
        ) : null}

        {/* File picker */}
        <Animated.View style={[styles.section, sectionStyle(1)]}>
          <Text style={styles.label}>
            {isEditMode ? "Document" : "Select document"}
            {!isEditMode && <Text style={styles.required}> *</Text>}
          </Text>

          {isEditMode ? (
            <View style={styles.editDocCard}>
              <DocumentText size={28} color="#E1761F" variant="Bold" />
              <Text style={styles.editDocTitle} numberOfLines={2}>
                {editPost?.title ?? "Current document"}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.dropzone, selectedFile && styles.dropzoneFilled]}
              onPress={handlePickFile}
              activeOpacity={0.75}
            >
              {!selectedFile ? (
                /* Empty state */
                <Animated.View
                  style={[
                    styles.dropzoneContent,
                    {
                      opacity: fileCardAnim.interpolate({
                        inputRange: [0, 0.5],
                        outputRange: [1, 0],
                      }),
                    },
                  ]}
                >
                  <DocumentUpload size={36} color="#B0B0B0" />
                  <View style={styles.dropzoneTextWrap}>
                    <Text style={styles.dropzoneHint}>
                      Tap to select a file
                    </Text>
                    <Text style={styles.dropzoneSubHint}>
                      Max 20 MB · PDF, DOCX, DOC
                    </Text>
                  </View>
                </Animated.View>
              ) : (
                /* File selected state */
                <Animated.View
                  style={[
                    styles.fileRow,
                    {
                      opacity: fileCardAnim,
                      transform: [
                        {
                          scale: fileCardAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.94, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <DocumentText size={34} color="#E1761F" variant="Bold" />
                  <View style={styles.fileMeta}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {selectedFile.name}
                    </Text>
                    <Text style={styles.fileSize}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </Text>
                    {isReadingFile && (
                      <Text style={styles.fileReading}>Reading file…</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRemoveFile();
                    }}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Trash size={20} color="#E00505" variant="Bold" />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Title */}
        <Animated.View style={[styles.section, sectionStyle(2)]}>
          <Text style={styles.label}>
            Document title<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="E.g. 'Stanford CS 101 Notes' (at least 3 characters)"
            placeholderTextColor="#AAAAAA"
            value={title}
            onChangeText={setTitle}
            maxLength={50}
            returnKeyType="next"
          />
          <Text style={styles.charCount}>{title.length}/50</Text>
        </Animated.View>

        {/* Categories */}
        <Animated.View style={[styles.section, sectionStyle(3)]}>
          <Text style={styles.label}>
            Categories<Text style={styles.required}> *</Text>
            <Text style={styles.labelMeta}>
              {" "}
              ({selectedCategories.length}/3)
            </Text>
          </Text>

          {/* Selected tags */}
          {selectedCategories.length > 0 && (
            <View style={styles.tagsRow}>
              {selectedCategories.map((cat) => {
                const tagAnim =
                  tagAnimsRef.current.get(cat) ?? new Animated.Value(1);
                return (
                  <Animated.View
                    key={cat}
                    style={[
                      styles.tag,
                      {
                        opacity: tagAnim,
                        transform: [{ scale: tagAnim }],
                      },
                    ]}
                  >
                    <Text style={styles.tagText}>{cat}</Text>
                    <TouchableOpacity
                      onPress={() => removeCategory(cat)}
                      hitSlop={6}
                      activeOpacity={0.7}
                    >
                      <CloseCircle size={14} color="#E1761F" variant="Bold" />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {selectedCategories.length < 3 && (
            <View>
              <TextInput
                style={styles.input}
                placeholder={
                  selectedCategories.length === 0
                    ? "Search categories…"
                    : "Add another category…"
                }
                placeholderTextColor="#AAAAAA"
                value={categoryQuery}
                onChangeText={(t) => setCategoryQuery(t)}
                onFocus={() => setIsCategoryInputFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsCategoryInputFocused(false), 120);
                }}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />

              {/* Dropdown — conditionally rendered so it takes no space when closed */}
              {showDropdown && (
                <Animated.View
                  style={[
                    styles.dropdown,
                    {
                      opacity: dropdownAnim,
                      transform: [
                        {
                          translateY: dropdownAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-8, 0],
                          }),
                        },
                        {
                          scaleY: dropdownAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.92, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {filteredCategories().map((cat, i, arr) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.dropdownItem,
                        i < arr.length - 1 && styles.dropdownItemBorder,
                      ]}
                      onPress={() => addCategory(cat)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.dropdownItemText}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              )}

              {categoryQuery.trim() !== "" &&
                !normalizeAllowedCategory(categoryQuery.trim()) &&
                !isCategoryInputFocused && (
                  <Text style={styles.categoryError}>
                    Select a category from the list.
                  </Text>
                )}
            </View>
          )}
        </Animated.View>

        {/* Year */}
        <Animated.View style={[styles.section, sectionStyle(4)]}>
          <Text style={styles.label}>Year</Text>
          <TouchableOpacity
            style={styles.yearPickerBtn}
            onPress={() => setIsYearPickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.yearPickerText,
                !year && styles.yearPickerPlaceholder,
              ]}
            >
              {year || "Select year"}
            </Text>
            <ArrowDown2 size={16} color="#737373" />
          </TouchableOpacity>
        </Animated.View>

        {/* Description */}
        <Animated.View style={[styles.section, sectionStyle(5)]}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder={"E.g. 'Notes for the first lecture'"}
            placeholderTextColor="#AAAAAA"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </Animated.View>

        {/* Bottom publish button */}
        <Animated.View style={{ opacity: publishPulseAnim, marginTop: 8 }}>
          <ActionButton
            onPress={handlePublish}
            disabled={!isFormValid}
            loading={isPublishing || isLoadingPost}
          >
            {isEditMode ? "Save changes" : "Publish"}
          </ActionButton>
        </Animated.View>
      </ScrollView>

      {/* Year picker modal */}
      <Modal
        visible={isYearPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsYearPickerOpen(false)}
      >
        <View style={[styles.yearModal, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.yearModalHeader}>
            <Text style={styles.yearModalTitle}>Select Year</Text>
            <TouchableOpacity
              onPress={() => setIsYearPickerOpen(false)}
              activeOpacity={0.7}
            >
              <CloseCircle size={24} color="#6B7280" variant="Bold" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={["", ...YEAR_OPTIONS]}
            keyExtractor={(item) => item || "none"}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.yearItem,
                  year === item && styles.yearItemSelected,
                ]}
                onPress={() => {
                  setYear(item);
                  setIsYearPickerOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.yearItemText,
                    !item && styles.yearItemPlaceholder,
                    year === item && styles.yearItemTextSelected,
                  ]}
                >
                  {item || "No year"}
                </Text>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  backBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  publishBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  publishBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 4,
  },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  alertError: {
    backgroundColor: "#FEF2F2",
  },
  alertSuccess: {
    backgroundColor: "#F0FDF4",
  },
  alertInfo: {
    backgroundColor: "#EFF6FF",
  },
  alertText: {
    fontSize: 13,
    color: "#B91C1C",
    flex: 1,
    fontWeight: "500",
  },
  alertTextSuccess: {
    color: "#15803D",
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  required: {
    color: "#EF4444",
  },
  labelMeta: {
    fontSize: 11,
    fontWeight: "400",
    color: "#9CA3AF",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: "#111111",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textarea: {
    height: 104,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
    marginTop: 4,
  },
  dropzone: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
    minHeight: 110,
  },
  dropzoneFilled: {
    borderStyle: "solid",
    borderColor: "#E1761F",
    backgroundColor: "#FFF8F2",
  },
  dropzoneContent: {
    alignItems: "center",
    gap: 10,
  },
  dropzoneTextWrap: {
    alignItems: "center",
    gap: 4,
  },
  dropzoneHint: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  dropzoneSubHint: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111111",
  },
  fileSize: {
    fontSize: 11,
    color: "#6B7280",
  },
  fileReading: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  editDocCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  editDocTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111111",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF3E7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#E1761F",
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    overflow: "hidden",
    transformOrigin: "top",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemText: {
    fontSize: 13,
    color: "#111111",
  },
  categoryError: {
    fontSize: 11,
    color: "#EF4444",
    marginTop: 4,
    fontWeight: "500",
  },
  yearPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  yearPickerText: {
    fontSize: 13,
    color: "#111111",
  },
  yearPickerPlaceholder: {
    color: "#AAAAAA",
  },
  bottomPublishBtn: {
    backgroundColor: "#131212",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomPublishBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  bottomPublishBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  yearModal: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingTop: 16,
  },
  yearModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  yearModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  yearItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  yearItemSelected: {
    backgroundColor: "#FFF3E7",
  },
  yearItemText: {
    fontSize: 15,
    color: "#111111",
  },
  yearItemPlaceholder: {
    color: "#9CA3AF",
  },
  yearItemTextSelected: {
    color: "#E1761F",
    fontWeight: "700",
  },
});
