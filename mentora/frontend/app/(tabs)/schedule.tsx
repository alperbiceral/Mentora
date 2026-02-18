import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.9)",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  accent: "#6D5EF7",
  accentSoft: "#A7B7F3",
  borderSubtle: "rgba(148,163,184,0.4)",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "courses" | "study";

type Course = {
  id: string;
  name: string;
  description: string;
  instructor: string;
  location: string;
  color: string;
  details: string[];
};

const COURSE_COLORS = [
  "#3B82F6",
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
  "#F97316",
];

type WeekdayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type CourseBlock = {
  id: string;
  courseId: string;
  day: WeekdayKey;
  start: string;
  end: string;
};

type StudyBlock = {
  id: string;
  day: WeekdayKey;
  title: string;
  focus: string;
  start: string;
  end: string;
  color: string;
};

type DraftBlock = {
  id: string;
  day: WeekdayKey;
  start: string;
  end: string;
};

type CourseBlockApi = {
  block_id: number;
  day: WeekdayKey;
  start: string;
  end: string;
};

type CourseApi = {
  course_id: number;
  username: string;
  name: string;
  description?: string | null;
  instructor?: string | null;
  location?: string | null;
  color?: string | null;
  blocks: CourseBlockApi[];
};

const DAYS: WeekdayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const START_HOUR = 6;
const END_HOUR = 24;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 16;
const GRID_MAX_HEIGHT = 580;
const DRAFT_GRID_MAX_HEIGHT = 420;

const TIME_SLOTS = buildTimeSlots(START_HOUR, END_HOUR, SLOT_MINUTES);

const INITIAL_COURSES: Course[] = [];
const INITIAL_BLOCKS: CourseBlock[] = [];
const STUDY_PLAN: Record<WeekdayKey, StudyBlock[]> = {
  Mon: [],
  Tue: [],
  Wed: [],
  Thu: [],
  Fri: [],
  Sat: [],
  Sun: [],
};

export default function ScheduleScreen() {
  const [mode, setMode] = useState<Mode>("courses");
  const [selectedPlanDay, setSelectedPlanDay] = useState<WeekdayKey>("Mon");
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [blocks, setBlocks] = useState<CourseBlock[]>(INITIAL_BLOCKS);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearingSchedule, setIsClearingSchedule] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [importingSyllabusId, setImportingSyllabusId] = useState<string | null>(
    null,
  );
  const [modalCourseForm, setModalCourseForm] = useState({
    name: "",
    description: "",
    instructor: "",
    location: "",
  });
  const [modalBlocks, setModalBlocks] = useState<DraftBlock[]>([]);
  const [modalSelection, setModalSelection] = useState({
    day: "Mon" as WeekdayKey,
    startIndex: null as number | null,
    endIndex: null as number | null,
  });
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const draftColor = COURSE_COLORS[courses.length % COURSE_COLORS.length];

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [mode, selectedPlanDay, courses.length, blocks.length]);

  const canAddCourse =
    modalCourseForm.name.trim().length > 0 && modalBlocks.length > 0;

  const canAddDraftBlock = useMemo(() => {
    if (
      modalSelection.startIndex === null ||
      modalSelection.endIndex === null
    ) {
      return false;
    }
    return modalSelection.endIndex > modalSelection.startIndex;
  }, [modalSelection]);

  const courseLookup = useMemo(() => {
    return new Map(courses.map((course) => [course.id, course]));
  }, [courses]);

  const blockedBlocks = useMemo(() => {
    if (modalMode === "edit" && editingCourseId) {
      return blocks.filter((block) => block.courseId !== editingCourseId);
    }
    return blocks;
  }, [blocks, modalMode, editingCourseId]);

  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setCourses([]);
        setBlocks([]);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/courses/${encodeURIComponent(username)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load courses");
      }
      const data = (await response.json()) as CourseApi[];
      const mappedCourses: Course[] = data.map((course) => ({
        id: String(course.course_id),
        name: course.name,
        description: course.description ?? "",
        instructor: course.instructor ?? "",
        location: course.location ?? "",
        color: course.color ?? COURSE_COLORS[0],
        details: [],
      }));
      const mappedBlocks: CourseBlock[] = data.flatMap((course) =>
        course.blocks.map((block) => ({
          id: `block-${block.block_id}`,
          courseId: String(course.course_id),
          day: block.day,
          start: block.start,
          end: block.end,
        })),
      );
      setCourses(mappedCourses);
      setBlocks(mappedBlocks);
    } catch (error) {
      setCourses([]);
      setBlocks([]);
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  async function handleImportSchedule() {
    if (isImporting) {
      return;
    }
    setImportError(null);
    setImportMessage(null);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setImportError("Login required to import a schedule.");
        return;
      }

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImportError("Media library permission is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      setIsImporting(true);
      setImportMessage("Uploading schedule image...");

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append("username", username);
      formData.append("replace_existing", "false");

      const fileName =
        asset.fileName ?? `schedule.${asset.uri.split(".").pop() ?? "jpg"}`;
      const mimeType = asset.mimeType ?? "image/jpeg";
      let file: File | { uri: string; name: string; type: string };

      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        file = new File([blob], fileName, { type: mimeType });
      } else {
        file = { uri: asset.uri, name: fileName, type: mimeType };
      }

      formData.append("file", file as unknown as Blob);

      const response = await fetch(`${API_BASE_URL}/courses/import-schedule`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail =
          typeof errorBody?.detail === "string"
            ? errorBody.detail
            : "Import failed";
        throw new Error(detail);
      }

      const data = (await response.json()) as CourseApi[];
      const mappedCourses: Course[] = data.map((course) => ({
        id: String(course.course_id),
        name: course.name,
        description: course.description ?? "",
        instructor: course.instructor ?? "",
        location: course.location ?? "",
        color: course.color ?? COURSE_COLORS[0],
        details: [],
      }));
      const mappedBlocks: CourseBlock[] = data.flatMap((course) =>
        course.blocks.map((block) => ({
          id: `block-${block.block_id}`,
          courseId: String(course.course_id),
          day: block.day,
          start: block.start,
          end: block.end,
        })),
      );

      setCourses((prev) => [...prev, ...mappedCourses]);
      setBlocks((prev) => [...prev, ...mappedBlocks]);
      setImportMessage("Schedule imported.");
      setIsImportModalOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Import failed. Please try again.";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleClearSchedule() {
    if (isClearingSchedule) {
      return;
    }
    setIsClearingSchedule(true);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        Alert.alert("Login required", "Please sign in to clear the schedule.");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/courses/${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Failed to clear schedule");
      }

      setCourses([]);
      setBlocks([]);
    } catch (error) {
      Alert.alert("Clear failed", "Please try again.");
    } finally {
      setIsClearingSchedule(false);
    }
  }

  async function handleSaveCourse() {
    if (savingCourse) {
      return;
    }
    if (!canAddCourse) {
      setModalMessage("Add a course name and at least one time block.");
      return;
    }
    setSavingCourse(true);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setModalMessage("Login required to save courses.");
        return;
      }

      const activeCourse = editingCourseId
        ? courseLookup.get(editingCourseId)
        : null;

      const payload = {
        username,
        name: modalCourseForm.name.trim(),
        description: modalCourseForm.description.trim(),
        instructor: modalCourseForm.instructor.trim() || "Instructor TBD",
        location: modalCourseForm.location.trim() || "Location TBD",
        color: activeCourse?.color ?? draftColor,
        blocks: modalBlocks.map((block) => ({
          day: block.day,
          start: block.start,
          end: block.end,
        })),
      };

      const response = await fetch(
        modalMode === "edit" && editingCourseId
          ? `${API_BASE_URL}/courses/${editingCourseId}`
          : `${API_BASE_URL}/courses`,
        {
          method: modalMode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to save course");
      }

      const savedCourse = (await response.json()) as CourseApi;
      const mappedCourse: Course = {
        id: String(savedCourse.course_id),
        name: savedCourse.name,
        description: savedCourse.description ?? "",
        instructor: savedCourse.instructor ?? "",
        location: savedCourse.location ?? "",
        color: savedCourse.color ?? draftColor,
        details: [],
      };
      const mappedBlocks: CourseBlock[] = savedCourse.blocks.map((block) => ({
        id: `block-${block.block_id}`,
        courseId: String(savedCourse.course_id),
        day: block.day,
        start: block.start,
        end: block.end,
      }));

      if (modalMode === "edit") {
        setCourses((prev) =>
          prev.map((course) =>
            course.id === mappedCourse.id ? mappedCourse : course,
          ),
        );
        setBlocks((prev) => [
          ...prev.filter((block) => block.courseId !== mappedCourse.id),
          ...mappedBlocks,
        ]);
      } else {
        setCourses((prev) => [...prev, mappedCourse]);
        setBlocks((prev) => [...prev, ...mappedBlocks]);
      }
      setModalCourseForm({
        name: "",
        description: "",
        instructor: "",
        location: "",
      });
      setModalBlocks([]);
      setModalSelection({ day: "Mon", startIndex: null, endIndex: null });
      setModalMessage(null);
      setEditingCourseId(null);
      setModalMode("add");
      setIsCourseModalOpen(false);
    } catch (error) {
      setModalMessage("Save failed. Please try again.");
    } finally {
      setSavingCourse(false);
    }
  }

  function handleModalSlotPress(day: WeekdayKey, slotIndex: number) {
    setModalSelection((prev) => {
      let nextDay = day;
      let startIndex = prev.startIndex;
      let endIndex = prev.endIndex;

      if (prev.day !== day) {
        startIndex = slotIndex;
        endIndex = null;
      } else if (startIndex === null || endIndex !== null) {
        startIndex = slotIndex;
        endIndex = null;
      } else {
        const proposedEnd = slotIndex + 1;
        if (proposedEnd <= startIndex) {
          startIndex = slotIndex;
          endIndex = slotIndex + 1;
        } else {
          endIndex = proposedEnd;
        }
      }

      setModalMessage(null);

      return { day: nextDay, startIndex, endIndex };
    });
  }

  function handleAddDraftBlock() {
    if (!canAddDraftBlock) {
      setModalMessage("Select a start and end slot first.");
      return;
    }
    if (
      modalSelection.startIndex === null ||
      modalSelection.endIndex === null
    ) {
      return;
    }
    const start = indexToTime(modalSelection.startIndex);
    const end = indexToTime(modalSelection.endIndex);
    const newBlock: DraftBlock = {
      id: `${modalSelection.day}-${start}-${end}`,
      day: modalSelection.day,
      start,
      end,
    };
    setModalBlocks((prev) => [...prev, newBlock]);
    setModalSelection((prev) => ({
      ...prev,
      startIndex: null,
      endIndex: null,
    }));
    setModalMessage("Time block added to this course.");
  }

  function handleOpenCourseModal() {
    setModalMode("add");
    setEditingCourseId(null);
    setModalCourseForm({
      name: "",
      description: "",
      instructor: "",
      location: "",
    });
    setModalBlocks([]);
    setModalSelection({ day: "Mon", startIndex: null, endIndex: null });
    setModalMessage(null);
    setIsCourseModalOpen(true);
  }

  function handleEditCourse(course: Course) {
    setModalMode("edit");
    setEditingCourseId(course.id);
    setModalCourseForm({
      name: course.name,
      description: course.description,
      instructor: course.instructor,
      location: course.location,
    });
    setModalBlocks(
      blocks
        .filter((block) => block.courseId === course.id)
        .map((block) => ({
          id: block.id,
          day: block.day,
          start: block.start,
          end: block.end,
        })),
    );
    setModalSelection({ day: "Mon", startIndex: null, endIndex: null });
    setModalMessage(null);
    setIsCourseModalOpen(true);
  }

  async function handleImportSyllabus(courseId: string) {
    try {
      setImportingSyllabusId(courseId);

      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImportingSyllabusId(null);
        return;
      }

      const asset = result.assets[0];
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        Alert.alert("Error", "Not logged in");
        setImportingSyllabusId(null);
        return;
      }

      const formData = new FormData();
      formData.append("course_id", courseId);

      // For both web and mobile
      let file: File | { uri: string; name: string; type: string };
      const fileName = asset.name || "syllabus";
      const mimeType = asset.mimeType || "application/octet-stream";

      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        file = new File([blob], fileName, { type: mimeType });
      } else {
        file = {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
        };
      }

      formData.append("file", file as any);

      const response = await fetch(`${API_BASE_URL}/courses/import-syllabus`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        Alert.alert("Error", error.detail || "Failed to import syllabus");
        setImportingSyllabusId(null);
        return;
      }

      Alert.alert("Success", "Syllabus imported successfully!");
      await loadCourses();
    } catch (error) {
      console.error("Import syllabus error:", error);
      Alert.alert("Error", "Failed to import syllabus");
    } finally {
      setImportingSyllabusId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Schedule</Text>
            <SegmentedControl mode={mode} setMode={setMode} />
          </View>

          {mode === "courses" ? (
            <View style={styles.section}>
              <View style={styles.coursesHeader}>
                <View style={styles.coursesTitleRow}>
                  <Text
                    style={styles.sectionTitleInline}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.9}
                  >
                    Weekly Schedule
                  </Text>
                  <View style={styles.coursesActionRow}>
                    <Pressable
                      style={styles.clearScheduleButton}
                      onPress={handleClearSchedule}
                      disabled={isClearingSchedule}
                      hitSlop={6}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={COLORS.danger}
                      />
                    </Pressable>
                    <Pressable
                      style={styles.importButton}
                      onPress={() => setIsImportModalOpen(true)}
                    >
                      <Ionicons
                        name="cloud-upload-outline"
                        size={16}
                        color={COLORS.textPrimary}
                      />
                      <Text style={styles.importButtonText}>Import</Text>
                    </Pressable>
                    <Pressable
                      style={styles.addCourseButton}
                      onPress={handleOpenCourseModal}
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                      <Text
                        style={styles.addCourseText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        Add Course
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <ScheduleCard>
                <CourseLegend courses={courses} loading={loadingCourses} />
                <CourseScheduleGrid
                  blocks={blocks}
                  courseLookup={courseLookup}
                />
              </ScheduleCard>

              <ScheduleCard title="Course details">
                <CourseCardList
                  courses={courses}
                  onPress={handleEditCourse}
                  onImportSyllabus={handleImportSyllabus}
                  loading={loadingCourses}
                  importingSyllabusId={importingSyllabusId}
                />
              </ScheduleCard>

              <CourseModal
                visible={isCourseModalOpen}
                mode={modalMode}
                courseForm={modalCourseForm}
                canAddCourse={canAddCourse}
                canAddDraftBlock={canAddDraftBlock}
                modalBlocks={modalBlocks}
                selection={modalSelection}
                blockedBlocks={blockedBlocks}
                courseLookup={courseLookup}
                draftColor={draftColor}
                saving={savingCourse}
                onChangeCourseForm={setModalCourseForm}
                onAddCourse={handleSaveCourse}
                onAddDraftBlock={handleAddDraftBlock}
                onSlotPress={handleModalSlotPress}
                message={modalMessage}
                onClose={() => setIsCourseModalOpen(false)}
              />

              <Modal
                animationType="fade"
                transparent
                visible={isImportModalOpen}
              >
                <View style={styles.importModalBackdrop}>
                  <View style={styles.importModalCard}>
                    <View style={styles.importModalHeader}>
                      <Text style={styles.importModalTitle}>
                        Syllabus import
                      </Text>
                      <Pressable
                        onPress={() => setIsImportModalOpen(false)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color={COLORS.textSecondary}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.importModalText}>
                      Upload a timetable image to auto-create courses.
                    </Text>
                    {importError ? (
                      <Text style={styles.importModalError}>{importError}</Text>
                    ) : null}
                    {importMessage ? (
                      <Text style={styles.importModalMessage}>
                        {importMessage}
                      </Text>
                    ) : null}
                    <Pressable
                      style={[
                        styles.primaryButton,
                        isImporting && styles.buttonDisabled,
                      ]}
                      onPress={handleImportSchedule}
                      disabled={isImporting}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isImporting ? "Importing..." : "Choose image"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
            </View>
          ) : (
            <View style={styles.section}>
              <SectionHeader
                title="Study plan"
                subtitle="Daily focus blocks in 30-minute slices."
              />

              <DaySelector
                selectedDay={selectedPlanDay}
                onSelect={setSelectedPlanDay}
              />

              <ScheduleCard title="Today plan">
                <StudyPlanGrid
                  day={selectedPlanDay}
                  blocks={STUDY_PLAN[selectedPlanDay] || []}
                  courseBlocks={blocks}
                  courseLookup={courseLookup}
                />
              </ScheduleCard>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

type SegmentedProps = {
  mode: Mode;
  setMode: (m: Mode) => void;
};

const SegmentedControl: React.FC<SegmentedProps> = ({ mode, setMode }) => (
  <View style={styles.segmentContainer}>
    <Pressable
      style={[
        styles.segmentItem,
        mode === "courses" && styles.segmentItemActive,
      ]}
      onPress={() => setMode("courses")}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.segmentLabel,
          mode === "courses" && styles.segmentLabelActive,
        ]}
      >
        Courses
      </Text>
    </Pressable>

    <Pressable
      style={[styles.segmentItem, mode === "study" && styles.segmentItemActive]}
      onPress={() => setMode("study")}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.segmentLabel,
          mode === "study" && styles.segmentLabelActive,
        ]}
      >
        Study Plan
      </Text>
    </Pressable>
  </View>
);

type SectionHeaderProps = {
  title: string;
  subtitle: string;
};

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionSubtitle}>{subtitle}</Text>
  </View>
);

type CourseModalProps = {
  visible: boolean;
  mode: "add" | "edit";
  courseForm: {
    name: string;
    description: string;
    instructor: string;
    location: string;
  };
  canAddCourse: boolean;
  canAddDraftBlock: boolean;
  modalBlocks: DraftBlock[];
  blockedBlocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  selection: {
    day: WeekdayKey;
    startIndex: number | null;
    endIndex: number | null;
  };
  draftColor: string;
  saving: boolean;
  onChangeCourseForm: (value: CourseModalProps["courseForm"]) => void;
  onAddCourse: () => void;
  onAddDraftBlock: () => void;
  onSlotPress: (day: WeekdayKey, slotIndex: number) => void;
  message: string | null;
  onClose: () => void;
};

const CourseModal: React.FC<CourseModalProps> = ({
  visible,
  mode,
  courseForm,
  canAddCourse,
  canAddDraftBlock,
  modalBlocks,
  blockedBlocks,
  courseLookup,
  selection,
  draftColor,
  saving,
  onChangeCourseForm,
  onAddCourse,
  onAddDraftBlock,
  onSlotPress,
  message,
  onClose,
}) => (
  <Modal animationType="slide" transparent visible={visible}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {mode === "edit" ? "Edit course" : "Add course"}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.modalBody}>
          <View style={styles.formRow}>
            <TextInput
              value={courseForm.name}
              onChangeText={(text) =>
                onChangeCourseForm({ ...courseForm, name: text })
              }
              placeholder="Course name"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            <TextInput
              value={courseForm.instructor}
              onChangeText={(text) =>
                onChangeCourseForm({ ...courseForm, instructor: text })
              }
              placeholder="Instructor"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.formRow}>
            <TextInput
              value={courseForm.location}
              onChangeText={(text) =>
                onChangeCourseForm({ ...courseForm, location: text })
              }
              placeholder="Location"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>
          <TextInput
            value={courseForm.description}
            onChangeText={(text) =>
              onChangeCourseForm({ ...courseForm, description: text })
            }
            placeholder="Description"
            placeholderTextColor={COLORS.textMuted}
            style={[styles.input, styles.descriptionInput]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <View style={styles.modalSectionHeader}>
            <Text style={styles.formLabel}>Weekly time slots</Text>
            <Pressable
              style={[
                styles.ghostButton,
                !canAddDraftBlock && styles.buttonDisabled,
              ]}
              onPress={onAddDraftBlock}
              disabled={!canAddDraftBlock}
            >
              <Text style={styles.ghostButtonText}>Add time block</Text>
            </Pressable>
          </View>

          <Text style={styles.selectionHint}>
            Tap a start slot, then tap an end slot to add a range.
          </Text>

          <DraftScheduleGrid
            draftBlocks={modalBlocks}
            selection={selection}
            onSlotPress={onSlotPress}
            color={draftColor}
            blockedBlocks={blockedBlocks}
            courseLookup={courseLookup}
          />

          {modalBlocks.length > 0 ? (
            <View style={styles.selectionList}>
              {modalBlocks.map((block) => (
                <View key={block.id} style={styles.selectionChip}>
                  <Text style={styles.selectionChipText}>
                    {block.day} · {block.start} - {block.end}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {message ? <Text style={styles.formMessage}>{message}</Text> : null}
        </View>

        <View style={styles.modalFooter}>
          <Pressable style={styles.ghostButton} onPress={onClose}>
            <Text style={styles.ghostButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryButton,
              (!canAddCourse || saving) && styles.buttonDisabled,
            ]}
            onPress={onAddCourse}
            disabled={!canAddCourse || saving}
          >
            <Text style={styles.primaryButtonText}>
              {saving
                ? "Saving..."
                : mode === "edit"
                  ? "Save changes"
                  : "Save course"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

type ScheduleCardProps = {
  title?: string;
  children: React.ReactNode;
};

const ScheduleCard: React.FC<ScheduleCardProps> = ({ title, children }) => (
  <View style={styles.panelCard}>
    {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
    {children}
  </View>
);

type CourseLegendProps = {
  courses: Course[];
  loading: boolean;
};

const CourseLegend: React.FC<CourseLegendProps> = ({ courses, loading }) => (
  <View style={styles.legendRow}>
    {loading ? (
      <Text style={styles.emptyText}>Loading courses...</Text>
    ) : courses.length === 0 ? (
      <Text style={styles.emptyText}>No courses yet.</Text>
    ) : (
      courses.map((course) => (
        <View key={course.id} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: course.color }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>
            {course.name.split(" - ")[0]}
          </Text>
        </View>
      ))
    )}
  </View>
);

type CourseScheduleGridProps = {
  blocks: CourseBlock[];
  courseLookup: Map<string, Course>;
};

const CourseScheduleGrid: React.FC<CourseScheduleGridProps> = ({
  blocks,
  courseLookup,
}) => {
  const gridHeight = TIME_SLOTS.length * SLOT_HEIGHT;

  return (
    <View style={styles.gridWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.gridScroll}
      >
        <View>
          <View style={styles.gridHeaderRow}>
            <View style={styles.timeHeaderSpacer} />
            {DAYS.map((day) => (
              <View key={`head-${day}`} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>
          <ScrollView
            style={[styles.gridBody, { maxHeight: GRID_MAX_HEIGHT }]}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gridRow}>
              <TimeColumn height={gridHeight} />
              {DAYS.map((day) => (
                <CourseDayColumn
                  key={day}
                  day={day}
                  blocks={blocks}
                  courseLookup={courseLookup}
                  height={gridHeight}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const TimeColumn: React.FC<{ height: number }> = ({ height }) => (
  <View style={[styles.timeColumn, { height }]}>
    {TIME_SLOTS.map((slot) => (
      <View key={`time-${slot}`} style={styles.timeSlot}>
        <Text style={styles.timeText}>{slot}</Text>
      </View>
    ))}
  </View>
);

type CourseDayColumnProps = {
  day: WeekdayKey;
  blocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  height: number;
};

const CourseDayColumn: React.FC<CourseDayColumnProps> = ({
  day,
  blocks,
  courseLookup,
  height,
}) => {
  const dayBlocks = blocks.filter((block) => block.day === day);

  return (
    <View style={[styles.dayColumn, { height }]}>
      {TIME_SLOTS.map((slot) => (
        <View key={`${day}-${slot}`} style={styles.gridSlot} />
      ))}

      {dayBlocks.map((block) => {
        const course = courseLookup.get(block.courseId);
        if (!course) {
          return null;
        }
        const startIndex = timeToIndex(block.start);
        const endIndex = timeToIndex(block.end);
        if (startIndex < 0 || endIndex <= startIndex) {
          return null;
        }
        const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;

        return (
          <View
            key={block.id}
            style={[
              styles.courseBlock,
              {
                top: startIndex * SLOT_HEIGHT,
                height: blockHeight,
                backgroundColor: course.color,
              },
            ]}
          >
            <Text style={styles.courseBlockCode} numberOfLines={1}>
              {course.name.split(" - ")[0]}
            </Text>
            <Text style={styles.courseBlockName} numberOfLines={2}>
              {course.location}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

type DraftScheduleGridProps = {
  draftBlocks: DraftBlock[];
  blockedBlocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  selection: {
    day: WeekdayKey;
    startIndex: number | null;
    endIndex: number | null;
  };
  onSlotPress: (day: WeekdayKey, slotIndex: number) => void;
  color: string;
};

const DraftScheduleGrid: React.FC<DraftScheduleGridProps> = ({
  draftBlocks,
  blockedBlocks,
  courseLookup,
  selection,
  onSlotPress,
  color,
}) => {
  const gridHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const selectionDay = selection.day;
  const showSelection =
    selection.startIndex !== null && selection.endIndex !== null;
  const showSelectionStart =
    selection.startIndex !== null && selection.endIndex === null;

  const isSlotBlocked = (day: WeekdayKey, slotIndex: number) => {
    const isInBlocks = (items: Array<DraftBlock | CourseBlock>) =>
      items.some((block) => {
        if (block.day !== day) {
          return false;
        }
        const startIndex = timeToIndex(block.start);
        const endIndex = timeToIndex(block.end);
        return slotIndex >= startIndex && slotIndex < endIndex;
      });

    return isInBlocks(blockedBlocks) || isInBlocks(draftBlocks);
  };

  return (
    <View style={styles.gridWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.gridScroll}
      >
        <View>
          <View style={styles.gridHeaderRow}>
            <View style={styles.timeHeaderSpacer} />
            {DAYS.map((day) => (
              <View key={`head-${day}`} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>
          <ScrollView
            style={[styles.gridBody, { maxHeight: DRAFT_GRID_MAX_HEIGHT }]}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gridRow}>
              <TimeColumn height={gridHeight} />
              {DAYS.map((day) => (
                <View
                  key={day}
                  style={[styles.dayColumn, { height: gridHeight }]}
                >
                  {TIME_SLOTS.map((slot, index) => {
                    const isDisabled = isSlotBlocked(day, index);
                    return (
                      <Pressable
                        key={`${day}-${slot}`}
                        style={[
                          styles.gridSlot,
                          isDisabled && styles.gridSlotDisabled,
                        ]}
                        onPress={() => onSlotPress(day, index)}
                        disabled={isDisabled}
                      />
                    );
                  })}

                  {blockedBlocks
                    .filter((block) => block.day === day)
                    .map((block) => {
                      const startIndex = timeToIndex(block.start);
                      const endIndex = timeToIndex(block.end);
                      if (startIndex < 0 || endIndex <= startIndex) {
                        return null;
                      }
                      const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;
                      const course = courseLookup.get(block.courseId);
                      return (
                        <View
                          key={`blocked-${block.id}`}
                          style={[
                            styles.blockedBlock,
                            {
                              top: startIndex * SLOT_HEIGHT,
                              height: blockHeight,
                              backgroundColor:
                                course?.color ?? "rgba(148,163,184,0.35)",
                            },
                          ]}
                        />
                      );
                    })}

                  {selectionDay === day && showSelection ? (
                    <View
                      style={[
                        styles.selectionBlock,
                        {
                          top: selection.startIndex! * SLOT_HEIGHT,
                          height:
                            (selection.endIndex! - selection.startIndex!) *
                            SLOT_HEIGHT,
                        },
                      ]}
                    />
                  ) : null}

                  {selectionDay === day && showSelectionStart ? (
                    <View
                      style={[
                        styles.selectionStart,
                        {
                          top: selection.startIndex! * SLOT_HEIGHT,
                          height: SLOT_HEIGHT,
                        },
                      ]}
                    />
                  ) : null}

                  {draftBlocks
                    .filter((block) => block.day === day)
                    .map((block) => {
                      const startIndex = timeToIndex(block.start);
                      const endIndex = timeToIndex(block.end);
                      if (startIndex < 0 || endIndex <= startIndex) {
                        return null;
                      }
                      const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;
                      return (
                        <View
                          key={block.id}
                          style={[
                            styles.courseBlock,
                            {
                              top: startIndex * SLOT_HEIGHT,
                              height: blockHeight,
                              backgroundColor: color,
                            },
                          ]}
                        />
                      );
                    })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

type CourseCardListProps = {
  courses: Course[];
  loading: boolean;
  onPress: (course: Course) => void;
  onImportSyllabus: (courseId: string) => void;
  importingSyllabusId: string | null;
};

const CourseCardList: React.FC<CourseCardListProps> = ({
  courses,
  loading,
  onPress,
  onImportSyllabus,
  importingSyllabusId,
}) => {
  if (loading) {
    return <Text style={styles.emptyText}>Loading courses...</Text>;
  }
  if (courses.length === 0) {
    return <Text style={styles.emptyText}>No courses yet.</Text>;
  }

  return (
    <View style={styles.courseCardList}>
      {courses.map((course) => {
        const isImporting = importingSyllabusId === course.id;
        return (
          <Pressable
            key={course.id}
            style={styles.courseCard}
            onPress={() => onPress(course)}
          >
            <View style={styles.courseCardContent}>
              <View style={styles.courseCardMain}>
                <View style={styles.courseCardHeader}>
                  <View
                    style={[
                      styles.courseCardDot,
                      { backgroundColor: course.color },
                    ]}
                  />
                  <Text style={styles.courseCardTitle} numberOfLines={1}>
                    {course.name.split(" - ")[0]}
                  </Text>
                </View>
                <Text style={styles.courseCardMeta} numberOfLines={1}>
                  {course.location || "Location TBD"}
                </Text>
                <Text style={styles.courseCardMeta} numberOfLines={1}>
                  {course.instructor || "Instructor TBD"}
                </Text>
                <Text style={styles.courseCardHint}>Tap to edit</Text>
              </View>
              <Pressable
                style={[
                  styles.syllabusButtonCompact,
                  isImporting && styles.buttonDisabled,
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  onImportSyllabus(course.id);
                }}
                disabled={isImporting}
              >
                <Ionicons
                  name={
                    isImporting ? "hourglass-outline" : "document-text-outline"
                  }
                  size={20}
                  color={isImporting ? COLORS.textMuted : COLORS.accent}
                />
              </Pressable>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

type StudyPlanGridProps = {
  day: WeekdayKey;
  blocks: StudyBlock[];
  courseBlocks: CourseBlock[];
  courseLookup: Map<string, Course>;
};

const StudyPlanGrid: React.FC<StudyPlanGridProps> = ({
  day,
  blocks,
  courseBlocks,
  courseLookup,
}) => {
  const gridHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const dayCourseBlocks = courseBlocks.filter((block) => block.day === day);

  return (
    <View style={styles.planGridWrapper}>
      <View style={styles.gridHeaderRow}>
        <View style={styles.timeHeaderSpacer} />
        <View style={styles.dayHeaderCellSingle}>
          <Text style={styles.dayHeaderText}>{day}</Text>
        </View>
      </View>
      <ScrollView
        style={[styles.gridBody, { maxHeight: GRID_MAX_HEIGHT }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridRow}>
          <TimeColumn height={gridHeight} />
          <View style={[styles.dayColumnSingle, { height: gridHeight }]}>
            {TIME_SLOTS.map((slot) => (
              <View key={`${day}-${slot}`} style={styles.gridSlot} />
            ))}

            {dayCourseBlocks.map((block) => {
              const course = courseLookup.get(block.courseId);
              if (!course) {
                return null;
              }
              const startIndex = timeToIndex(block.start);
              const endIndex = timeToIndex(block.end);
              if (startIndex < 0 || endIndex <= startIndex) {
                return null;
              }
              const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;
              return (
                <View
                  key={`plan-course-${block.id}`}
                  style={[
                    styles.courseBlock,
                    styles.planCourseBlock,
                    {
                      top: startIndex * SLOT_HEIGHT,
                      height: blockHeight,
                      backgroundColor: course.color,
                    },
                  ]}
                >
                  <Text style={styles.courseBlockCode} numberOfLines={1}>
                    {course.name.split(" - ")[0]}
                  </Text>
                  <Text style={styles.courseBlockName} numberOfLines={1}>
                    {course.location}
                  </Text>
                </View>
              );
            })}

            {blocks.map((block) => {
              const startIndex = timeToIndex(block.start);
              const endIndex = timeToIndex(block.end);
              if (startIndex < 0 || endIndex <= startIndex) {
                return null;
              }
              const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;
              return (
                <View
                  key={block.id}
                  style={[
                    styles.planBlock,
                    {
                      top: startIndex * SLOT_HEIGHT,
                      height: blockHeight,
                      backgroundColor: block.color,
                    },
                  ]}
                >
                  <Text style={styles.planBlockTitle}>{block.title}</Text>
                  <Text style={styles.planBlockFocus}>{block.focus}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

type DaySelectorProps = {
  selectedDay: WeekdayKey;
  onSelect: (d: WeekdayKey) => void;
};

const DaySelector: React.FC<DaySelectorProps> = ({ selectedDay, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.daysRow}
  >
    {DAYS.map((d) => {
      const active = d === selectedDay;
      return (
        <Pressable
          key={d}
          style={[styles.dayPill, active && styles.dayPillActive]}
          onPress={() => onSelect(d)}
        >
          <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
            {d}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

function buildTimeSlots(
  startHour: number,
  endHour: number,
  minutes: number,
): string[] {
  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += minutes) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function timeToIndex(time: string) {
  const [hourString, minuteString] = time.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return -1;
  }
  if (hour < START_HOUR || hour > END_HOUR) {
    return -1;
  }
  if (minute % SLOT_MINUTES !== 0) {
    return -1;
  }
  const slotIndex =
    (hour - START_HOUR) * (60 / SLOT_MINUTES) + minute / SLOT_MINUTES;
  if (slotIndex < 0 || slotIndex > TIME_SLOTS.length) {
    return -1;
  }
  return slotIndex;
}

function indexToTime(index: number) {
  const totalMinutes = START_HOUR * 60 + index * SLOT_MINUTES;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0B1220",
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0F1A2B",
    opacity: 0.45,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(109,94,247,0.18)",
    opacity: 0.25,
  },
  wrapper: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    paddingHorizontal: SPACING.lg,
  },
  content: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.lg,
  },
  header: {
    alignItems: "center",
    gap: SPACING.sm,
  },
  section: {
    gap: SPACING.lg,
  },
  sectionHeader: {
    gap: SPACING.xs,
  },
  coursesHeader: {
    gap: SPACING.sm,
  },
  coursesTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  coursesActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    fontFamily: Platform.select({
      ios: "AvenirNext-Heavy",
      android: "serif",
      default: "serif",
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sectionTitleInline: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignSelf: "stretch",
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: COLORS.accent,
  },
  segmentLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "500",
    textAlign: "center",
  },
  segmentLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(2,6,23,0.6)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  clearScheduleButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  importButtonText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  addCourseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
  },
  addCourseText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  panelCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    gap: SPACING.md,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  panelSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  formSection: {
    gap: SPACING.sm,
  },
  formLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  formRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.6)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  descriptionInput: {
    minHeight: 120,
    maxHeight: 200,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  ghostButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  formMessage: {
    fontSize: 12,
    color: COLORS.accentSoft,
  },
  selectionHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  selectionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(2,6,23,0.45)",
  },
  selectionChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  gridWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  planGridWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  gridScroll: {
    paddingBottom: 4,
  },
  gridHeaderRow: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  timeHeaderSpacer: {
    width: 35,
  },
  dayHeaderCell: {
    width: 57,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148,163,184,0.15)",
    alignItems: "center",
  },
  dayHeaderCellSingle: {
    flex: 1,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148,163,184,0.15)",
    alignItems: "center",
  },
  dayHeaderText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  gridBody: {
    backgroundColor: "rgba(2,6,23,0.5)",
  },
  gridRow: {
    flexDirection: "row",
  },
  timeColumn: {
    width: 35,
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  timeSlot: {
    height: SLOT_HEIGHT,
    justifyContent: "center",
    paddingLeft: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.08)",
  },
  timeText: {
    fontSize: 8,
    color: COLORS.textMuted,
  },
  dayColumn: {
    width: 57,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148,163,184,0.15)",
    position: "relative",
  },
  dayColumnSingle: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(148,163,184,0.15)",
    position: "relative",
  },
  gridSlot: {
    height: SLOT_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.08)",
  },
  gridSlotDisabled: {
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  selectionBlock: {
    position: "absolute",
    left: 3,
    right: 3,
    borderRadius: 10,
    backgroundColor: "rgba(109,94,247,0.35)",
    borderWidth: 1,
    borderColor: "rgba(109,94,247,0.5)",
  },
  selectionStart: {
    position: "absolute",
    left: 3,
    right: 3,
    borderRadius: 10,
    backgroundColor: "rgba(109,94,247,0.2)",
    borderWidth: 1,
    borderColor: "rgba(109,94,247,0.4)",
  },
  blockedBlock: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 10,
    opacity: 0.45,
  },
  courseBlock: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 12,
    padding: 6,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  courseBlockCode: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B1220",
    textAlign: "center",
  },
  courseBlockName: {
    fontSize: 10,
    color: "#0B1220",
    textAlign: "center",
  },
  courseBlockMeta: {
    fontSize: 9,
    color: "rgba(11,18,32,0.7)",
  },
  planBlock: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 12,
    padding: 6,
    gap: 4,
  },
  planCourseBlock: {
    opacity: 0.9,
  },
  planBlockTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B1220",
  },
  planBlockFocus: {
    fontSize: 10,
    color: "rgba(11,18,32,0.75)",
  },
  daysRow: {
    marginTop: SPACING.sm,
    paddingVertical: 2,
    gap: SPACING.sm,
  },
  dayPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.85)",
    marginRight: SPACING.sm,
  },
  dayPillActive: {
    backgroundColor: COLORS.accent,
  },
  dayLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  dayLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.7)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "rgba(15,23,42,0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    gap: SPACING.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  modalBody: {
    gap: SPACING.sm,
  },
  modalSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.sm,
  },
  importModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
  },
  importModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(15,23,42,0.95)",
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    gap: SPACING.md,
  },
  importModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  importModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  importModalText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  importModalMessage: {
    fontSize: 12,
    color: COLORS.accentSoft,
  },
  importModalError: {
    fontSize: 12,
    color: COLORS.danger,
  },
  courseCardList: {
    gap: SPACING.sm,
  },
  courseCard: {
    borderRadius: 16,
    padding: SPACING.md,
    backgroundColor: "rgba(2,6,23,0.5)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
  },
  courseCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  courseCardMain: {
    flex: 1,
    gap: 6,
  },
  courseCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  courseCardDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  courseCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    flex: 1,
  },
  courseCardMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  courseCardHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  syllabusButtonCompact: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(109,94,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(109,94,247,0.3)",
  },
});
