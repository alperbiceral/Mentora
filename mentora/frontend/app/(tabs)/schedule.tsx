import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  Alert,
  FlatList,
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
  type ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "schedule" | "courses";

type ScheduleView = "weekly" | "daily";

type Course = {
  id: string;
  name: string;
  section?: string;
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
  dateStr?: string;
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
  section?: string | null;
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
/** Weekly / draft grid: one row per half-hour (readability). */
const SLOT_HEIGHT = 30;
const DAY_COLUMN_WIDTH = 82;
const TIME_COLUMN_WIDTH = 42;
const GRID_MAX_HEIGHT = 1100;
const DRAFT_GRID_MAX_HEIGHT = 640;
const HOUR_HEIGHT = 80;
const TIMELINE_LEFT_WIDTH = 50;
const COMPLETED_SESSIONS_KEY = "mentora.completedSessions";
const SHORT_DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const TIME_SLOTS = buildTimeSlots(START_HOUR, END_HOUR, SLOT_MINUTES);

/** Subtle elevation for weekly course/study blocks (theme-agnostic shadow). */
const WEEKLY_BLOCK_CARD_EXTRAS = Platform.select<ViewStyle>({
  web: { boxShadow: "0 1px 3px rgba(0,0,0,0.14)" } as ViewStyle,
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  default: { elevation: 2 },
});

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

type StudySessionApi = {
  session_id: number;
  username: string;
  course_id?: number | null;
  title?: string | null;
  timer_type?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  session_date?: string | null;
  duration_minutes?: number | null;
  mode?: string | null;
};

function useScheduleTheme() {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  return { COLORS, styles };
}

export default function ScheduleScreen() {
  const { COLORS, styles } = useScheduleTheme();

  const [mode, setMode] = useState<Mode>("schedule");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("weekly");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState<StudyBlock | null>(
    null,
  );
  const [isSessionSheetOpen, setIsSessionSheetOpen] = useState(false);
  const timelineScrollRef = useRef<ScrollView>(null);
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
    section: "",
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
  const [studyPlan, setStudyPlan] =
    useState<Record<WeekdayKey, StudyBlock[]>>(STUDY_PLAN);
  const [loadingStudyPlan, setLoadingStudyPlan] = useState(false);
  const draftColor = COURSE_COLORS[courses.length % COURSE_COLORS.length];

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [mode, selectedDate, courses.length, blocks.length]);

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
        section: course.section ?? undefined,
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

  useFocusEffect(
    useCallback(() => {
      loadCourses();
    }, []),
  );

  // helpers: parse DB timestamp/ISO to Date, then to HH:MM
  const parseTimestampToDate = (s?: string | null) => {
    if (!s) return null;
    // try direct parse
    let d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    // try to normalize SQL-style "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
    let t = s.replace(" ", "T");
    if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(t)) {
      t = `${t}Z`;
    }
    d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  };

  const pad = (n: number) => String(n).padStart(2, "0");
  const timeFromDate = (d: Date) =>
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const addMinutesToTime = (time: string, minutes: number) => {
    const [hh, mm] = time.split(":").map((v) => Number(v));
    const date = new Date();
    date.setHours(hh, mm + minutes, 0, 0);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  function roundTimeToSlot(time: string, mode: "floor" | "ceil") {
    const [hh, mm] = time.split(":").map((v) => Number(v));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const total = hh * 60 + mm;
    const factor = SLOT_MINUTES;
    const rounded =
      mode === "floor"
        ? Math.floor(total / factor) * factor
        : Math.ceil(total / factor) * factor;
    const rHour = Math.floor(rounded / 60);
    const rMin = rounded % 60;
    if (rHour < START_HOUR || rHour > END_HOUR) return null;
    return `${String(rHour).padStart(2, "0")}:${String(rMin).padStart(2, "0")}`;
  }

  useEffect(() => {
    async function loadStudySessions() {
      setLoadingStudyPlan(true);
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) {
          setStudyPlan(STUDY_PLAN);
          return;
        }

        const res = await fetch(
          `${API_BASE_URL}/study-sessions/${encodeURIComponent(username)}`,
        );
        if (!res.ok) {
          setStudyPlan(STUDY_PLAN);
          return;
        }
        const sessions = (await res.json()) as StudySessionApi[];

        const dayNames = [
          "Sun",
          "Mon",
          "Tue",
          "Wed",
          "Thu",
          "Fri",
          "Sat",
        ] as const;

        const newPlan: Record<WeekdayKey, StudyBlock[]> = {
          Mon: [],
          Tue: [],
          Wed: [],
          Thu: [],
          Fri: [],
          Sat: [],
          Sun: [],
        };

        const AD_HOC_TIMER_TYPES = new Set([
          "countup",
          "countdown",
          "pomodoro",
        ]);

        sessions.forEach((s) => {
          const timerType = (s.timer_type ?? "").toLowerCase().trim();
          const sessionMode = (s.mode ?? "").toLowerCase().trim();
          if (sessionMode === "normal" || sessionMode === "pomodoro") return;
          if (AD_HOC_TIMER_TYPES.has(timerType)) return;

          const dStart = parseTimestampToDate(
            s.started_at ?? s.session_date ?? null,
          );
          const dEnd = parseTimestampToDate(s.ended_at ?? null);
          if (!dStart) return;

          const weekday = dayNames[dStart.getUTCDay()];
          const dayKey = (weekday === "Sun" ? "Sun" : weekday) as WeekdayKey;

          // Convert parsed Dates to slot indices by rounding to the nearest slot.
          // This ensures a 60-minute session maps to exactly 2 slots (not 3).
          const startTotal = dStart.getHours() * 60 + dStart.getMinutes();
          let endTotal: number | null = null;
          if (dEnd) {
            endTotal = dEnd.getHours() * 60 + dEnd.getMinutes();
          } else if (s.duration_minutes) {
            endTotal = startTotal + Math.max(1, Math.round(s.duration_minutes));
          }
          if (endTotal === null) return;

          const startIndex = Math.round(
            (startTotal - START_HOUR * 60) / SLOT_MINUTES,
          );
          let endIndex = Math.round(
            (endTotal - START_HOUR * 60) / SLOT_MINUTES,
          );

          // Ensure at least one slot and clamp to grid bounds
          if (startIndex < 0) return;
          if (endIndex <= startIndex) endIndex = startIndex + 1;
          if (endIndex > TIME_SLOTS.length) endIndex = TIME_SLOTS.length;

          const start = indexToTime(startIndex);
          const end = indexToTime(endIndex);

          const timer = (s.timer_type ?? s.title ?? "").trim();
          let matchedCourse: Course | undefined = undefined;
          if (timer) {
            matchedCourse = courses.find(
              (c) =>
                c.name && (c.name.includes(timer) || timer.includes(c.name)),
            );
          }

          const color = matchedCourse?.color ?? COURSE_COLORS[0];
          const title = (s.title ?? timer ?? "Study").trim();

          const block: StudyBlock = {
            id: String(s.session_id),
            day: dayKey,
            title,
            focus: s.mode ?? s.timer_type ?? "",
            start,
            end,
            color,
            dateStr: formatDateStr(dStart),
          };

          newPlan[dayKey].push(block);
        });

        const toMinutes = (t: string) => {
          const [H, M] = t.split(":").map((v) => Number(v));
          return H * 60 + M;
        };
        (Object.keys(newPlan) as WeekdayKey[]).forEach((k) => {
          newPlan[k].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        });

        setStudyPlan(newPlan);
      } catch (e) {
        setStudyPlan(STUDY_PLAN);
      } finally {
        setLoadingStudyPlan(false);
      }
    }

    if (!loadingCourses) {
      loadStudySessions();
    }
  }, [loadingCourses, courses]);

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
        section: course.section ?? undefined,
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
        section: modalCourseForm.section.trim() || null,
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
        section: savedCourse.section ?? undefined,
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
        section: "",
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
      section: "",
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
    const legacySection = getLegacySectionFromCourseName(course.name);
    setModalCourseForm({
      name: getCourseCodeLabel(course),
      section: (course.section?.trim() || legacySection) ?? "",
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

  useEffect(() => {
    AsyncStorage.getItem(COMPLETED_SESSIONS_KEY).then((raw) => {
      if (raw) {
        try {
          const arr = JSON.parse(raw) as string[];
          setCompletedSessions(new Set(arr));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const selectedDayKey = getWeekdayKey(selectedDate);
  const selectedDateStr = formatDateStr(selectedDate);
  const isSelectedDateToday = isSameDay(selectedDate, new Date());

  const selectedDayStudyBlocks = useMemo(() => {
    const all = Object.values(studyPlan).flat();
    const byDate = all.filter((b) => b.dateStr === selectedDateStr);
    if (byDate.length > 0) return byDate;
    return studyPlan[selectedDayKey] || [];
  }, [studyPlan, selectedDateStr, selectedDayKey]);

  const selectedDayCourseBlocks = useMemo(() => {
    return blocks.filter((b) => b.day === selectedDayKey);
  }, [blocks, selectedDayKey]);

  function handleSelectDate(date: Date) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(date);
    timelineScrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function handleToggleDone(sessionId: string) {
    setCompletedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      AsyncStorage.setItem(COMPLETED_SESSIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function handlePressSession(session: StudyBlock) {
    setSelectedSession(session);
    setIsSessionSheetOpen(true);
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
            <MainModeSegmentedControl mode={mode} setMode={setMode} />
          </View>

          {mode === "schedule" ? (
            <View style={styles.section}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={styles.clearScheduleButton}
                    onPress={handleClearSchedule}
                    disabled={isClearingSchedule}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={COLORS.danger}
                    />
                    <Text style={styles.clearScheduleText}>Clear</Text>
                  </Pressable>
                  <Pressable
                    style={styles.importButton}
                    onPress={() => setIsImportModalOpen(true)}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={15}
                      color={COLORS.accent}
                    />
                    <Text style={styles.importButtonText}>Import</Text>
                  </Pressable>
                </View>
                <ScheduleViewSegmentedControl
                  scheduleView={scheduleView}
                  setScheduleView={setScheduleView}
                />
              </View>
              {scheduleView === "weekly" ? (
                <>
                  <ScheduleCard>
                    <CourseLegend courses={courses} loading={loadingCourses} />
                    <CourseScheduleGrid
                      blocks={blocks}
                      courseLookup={courseLookup}
                      studyPlan={studyPlan}
                    />
                  </ScheduleCard>
                </>
              ) : (
                <View style={{ flexDirection: "column", gap: 8 }}>
                  <DateStrip
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                  />
                  <AIInsightBanner blocks={selectedDayStudyBlocks} />
                  <TimelineView
                    studyBlocks={selectedDayStudyBlocks}
                    courseBlocks={selectedDayCourseBlocks}
                    courseLookup={courseLookup}
                    completedSessions={completedSessions}
                    onToggleDone={handleToggleDone}
                    onPressSession={handlePressSession}
                    isToday={isSelectedDateToday}
                    currentTime={currentTime}
                    scrollRef={timelineScrollRef}
                  />
                  <SessionDetailSheet
                    visible={isSessionSheetOpen}
                    session={selectedSession}
                    isDone={
                      selectedSession
                        ? completedSessions.has(selectedSession.id)
                        : false
                    }
                    onToggleDone={handleToggleDone}
                    onClose={() => setIsSessionSheetOpen(false)}
                  />
                </View>
              )}
              <Modal
                animationType="fade"
                transparent
                visible={isImportModalOpen}
              >
                <View style={styles.importModalBackdrop}>
                  <View style={styles.importModalCard}>
                    <View style={styles.importModalHeader}>
                      <Text style={styles.importModalTitle}>
                        Weekly Schedule Import
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
              <View style={styles.coursesActionRow}>
                <Pressable
                  style={styles.addCourseButton}
                  onPress={handleOpenCourseModal}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={15}
                    color="#FFFFFF"
                  />
                  <Text style={styles.addCourseText}>Add Course</Text>
                </Pressable>
              </View>

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
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// Main mode segmented control (Schedule / Courses)
type MainModeSegmentedProps = {
  mode: Mode;
  setMode: (m: Mode) => void;
};

const MainModeSegmentedControl: React.FC<MainModeSegmentedProps> = ({
  mode,
  setMode,
}) => {
  const { styles } = useScheduleTheme();
  return (
    <View style={styles.segmentContainer}>
      <Pressable
        style={[
          styles.segmentItem,
          mode === "schedule" && styles.segmentItemActive,
        ]}
        onPress={() => setMode("schedule")}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.segmentLabel,
            mode === "schedule" && styles.segmentLabelActive,
          ]}
        >
          Schedule
        </Text>
      </Pressable>
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
    </View>
  );
};

// Segmented control for schedule view (Weekly / Daily)
type ScheduleViewSegmentedProps = {
  scheduleView: ScheduleView;
  setScheduleView: (v: ScheduleView) => void;
};

const ScheduleViewSegmentedControl: React.FC<ScheduleViewSegmentedProps> = ({
  scheduleView,
  setScheduleView,
}) => {
  const { styles } = useScheduleTheme();
  return (
    <View
      style={[styles.segmentContainer, styles.scheduleViewSegmentContainer]}
    >
      <Pressable
        style={[
          styles.segmentItem,
          scheduleView === "weekly" && styles.segmentItemActive,
        ]}
        onPress={() => setScheduleView("weekly")}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.segmentLabel,
            scheduleView === "weekly" && styles.segmentLabelActive,
          ]}
        >
          Weekly
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.segmentItem,
          scheduleView === "daily" && styles.segmentItemActive,
        ]}
        onPress={() => setScheduleView("daily")}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.segmentLabel,
            scheduleView === "daily" && styles.segmentLabelActive,
          ]}
        >
          Daily
        </Text>
      </Pressable>
    </View>
  );
};

type SectionHeaderProps = {
  title: string;
  subtitle: string;
};

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle }) => {
  const { styles } = useScheduleTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
};

type CourseModalProps = {
  visible: boolean;
  mode: "add" | "edit";
  courseForm: {
    name: string;
    section: string;
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
}) => {
  const { styles, COLORS } = useScheduleTheme();

  return (
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

          <ScrollView
            style={styles.modalScrollBody}
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.formRow}>
              <TextInput
                value={courseForm.name}
                onChangeText={(text) =>
                  onChangeCourseForm({ ...courseForm, name: text })
                }
                placeholder="Course code (e.g. CS 458)"
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
                value={courseForm.section}
                onChangeText={(text) =>
                  onChangeCourseForm({ ...courseForm, section: text })
                }
                placeholder="Section (optional)"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
              />
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
          </ScrollView>

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
};

type ScheduleCardProps = {
  title?: string;
  children: React.ReactNode;
};

const ScheduleCard: React.FC<ScheduleCardProps> = ({ title, children }) => {
  const { styles } = useScheduleTheme();

  return (
    <View style={styles.panelCard}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {children}
    </View>
  );
};

type CourseLegendProps = {
  courses: Course[];
  loading: boolean;
};

const CourseLegend: React.FC<CourseLegendProps> = ({ courses, loading }) => {
  const { styles } = useScheduleTheme();

  return (
    <View style={styles.legendRow}>
      {loading ? (
        <Text style={styles.emptyText}>Loading courses...</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.emptyText}>No courses yet.</Text>
      ) : (
        courses.map((course) => (
          <View key={course.id} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: course.color }]}
            />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {getCourseCodeLabel(course)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
};

type CourseScheduleGridProps = {
  blocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  studyPlan?: Record<WeekdayKey, StudyBlock[]>;
};

const CourseScheduleGrid: React.FC<CourseScheduleGridProps> = ({
  blocks,
  courseLookup,
  studyPlan,
}) => {
  const { styles } = useScheduleTheme();
  const gridHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const activeHorizontalSync = useRef<"header" | "body" | null>(null);

  const syncHorizontalScroll = useCallback(
    (source: "header" | "body", x: number) => {
      if (
        activeHorizontalSync.current &&
        activeHorizontalSync.current !== source
      ) {
        return;
      }
      activeHorizontalSync.current = source;
      const targetRef =
        source === "header" ? bodyScrollRef.current : headerScrollRef.current;
      targetRef?.scrollTo({ x, animated: false });
      requestAnimationFrame(() => {
        activeHorizontalSync.current = null;
      });
    },
    [],
  );

  return (
    <View style={styles.gridWrapper}>
      <View style={styles.gridHeaderRow}>
        <View style={styles.timeHeaderSpacer} />
        <ScrollView
          ref={headerScrollRef}
          horizontal
          style={styles.gridHorizontalScroll}
          contentContainerStyle={styles.gridDaysRow}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) =>
            syncHorizontalScroll("header", event.nativeEvent.contentOffset.x)
          }
        >
          {DAYS.map((day) => (
            <View key={`head-${day}`} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        style={[styles.gridBody, { maxHeight: GRID_MAX_HEIGHT }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridRow}>
          <TimeColumn height={gridHeight} />
          <ScrollView
            ref={bodyScrollRef}
            horizontal
            style={styles.gridHorizontalScroll}
            showsHorizontalScrollIndicator
            contentContainerStyle={[styles.gridDaysRow, styles.gridScroll]}
            scrollEventThrottle={16}
            onScroll={(event) =>
              syncHorizontalScroll("body", event.nativeEvent.contentOffset.x)
            }
          >
            {DAYS.map((day) => (
              <CourseDayColumn
                key={day}
                day={day}
                blocks={blocks}
                courseLookup={courseLookup}
                height={gridHeight}
                studyBlocks={studyPlan?.[day] ?? []}
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const TimeColumn: React.FC<{ height: number }> = ({ height }) => {
  const { styles } = useScheduleTheme();

  return (
    <View style={[styles.timeColumn, { height }]}>
      {TIME_SLOTS.map((slot) => {
        const onHour = isTimeSlotOnHour(slot);
        return (
          <View
            key={`time-${slot}`}
            style={[
              styles.timeSlot,
              onHour ? styles.timeSlotHourBoundary : styles.timeSlotHalf,
            ]}
          >
            <Text style={onHour ? styles.timeTextHour : styles.timeTextHalf}>
              {slot}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

type WeeklyStudyLabelsProps = {
  block: StudyBlock;
  slotSpan: number;
};

function WeeklyStudyLabels({ block, slotSpan }: WeeklyStudyLabelsProps) {
  const { styles } = useScheduleTheme();
  const showFocus = shouldShowStudyFocus(block.focus);
  const compact = slotSpan === 1;

  if (compact) {
    const line =
      showFocus && block.focus?.trim()
        ? `${block.title} · ${block.focus.trim()}`
        : block.title;
    return (
      <View style={{ alignItems: "center", width: "100%", gap: 2 }}>
        <Text
          style={styles.planBlockTitleCompact}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {line}
        </Text>
        <Text style={styles.weeklyBlockKind}>Study</Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.planBlockTitle} numberOfLines={2}>
        {block.title}
      </Text>
      {showFocus ? (
        <Text style={styles.planBlockFocus} numberOfLines={1}>
          {block.focus}
        </Text>
      ) : null}
      <Text style={styles.weeklyBlockKind}>Study</Text>
    </>
  );
}

type CourseDayColumnProps = {
  day: WeekdayKey;
  blocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  height: number;
  studyBlocks?: StudyBlock[];
};

const CourseDayColumn: React.FC<CourseDayColumnProps> = ({
  day,
  blocks,
  courseLookup,
  height,
  studyBlocks = [],
}) => {
  const { styles } = useScheduleTheme();
  const dayBlocks = blocks.filter((block) => block.day === day);
  // No special overlap arrangement — render study blocks like plan blocks
  const arrangedStudyBlocks = (studyBlocks || [])
    .map((b) => {
      const startIndex = timeToIndex(b.start);
      const endIndex = timeToIndex(b.end);
      return { ...b, startIndex, endIndex } as StudyBlock & {
        startIndex: number;
        endIndex: number;
      };
    })
    .filter((b) => b.startIndex >= 0 && b.endIndex > b.startIndex)
    .sort((a, c) => a.startIndex - c.startIndex || a.endIndex - c.endIndex);

  return (
    <View style={[styles.dayColumn, { height }]}>
      {TIME_SLOTS.map((slot) => (
        <View
          key={`${day}-${slot}`}
          style={[
            styles.gridSlot,
            isTimeSlotOnHour(slot)
              ? styles.gridSlotHourLine
              : styles.gridSlotHalfLine,
          ]}
        />
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
              {getCourseCodeLabel(course)}
            </Text>
            <Text style={styles.weeklyBlockKind}>Course</Text>
          </View>
        );
      })}

      {arrangedStudyBlocks.map((block) => {
        const { startIndex, endIndex } = block as any;
        if (startIndex < 0 || endIndex <= startIndex) return null;
        const blockHeight = (endIndex - startIndex) * SLOT_HEIGHT;
        const slotSpan = endIndex - startIndex;
        const compact = slotSpan === 1;

        // If no column data (col/cols) exists, render full-width like plan blocks.
        const maybeCol = (block as any).col;
        const maybeCols = (block as any).cols;
        const hasCols =
          typeof maybeCol === "number" &&
          typeof maybeCols === "number" &&
          maybeCols > 1;

        if (!hasCols) {
          return (
            <View
              key={`study-${block.id}`}
              style={[
                styles.planBlock,
                compact && styles.planBlockCompact,
                {
                  top: startIndex * SLOT_HEIGHT,
                  height: blockHeight,
                  backgroundColor: block.color,
                },
              ]}
            >
              <WeeklyStudyLabels block={block} slotSpan={slotSpan} />
            </View>
          );
        }

        const col = maybeCol as number;
        const cols = maybeCols as number;
        const columnTotalPx = DAY_COLUMN_WIDTH;
        const sidePad = 4; // matches left/right padding used elsewhere
        const innerWidth = Math.max(8, columnTotalPx - sidePad * 2);
        const gap = 4; // gap between split columns
        const colWidth = Math.max(
          24,
          Math.floor((innerWidth - gap * (cols - 1)) / cols),
        );
        const leftPx = sidePad + col * (colWidth + gap);

        return (
          <View
            key={`study-${block.id}`}
            style={[
              styles.planBlock,
              compact && styles.planBlockCompact,
              {
                top: startIndex * SLOT_HEIGHT,
                height: blockHeight,
                left: leftPx,
                width: colWidth,
                backgroundColor: block.color,
              },
            ]}
          >
            <WeeklyStudyLabels block={block} slotSpan={slotSpan} />
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
  const { styles } = useScheduleTheme();
  const gridHeight = TIME_SLOTS.length * SLOT_HEIGHT;
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const activeHorizontalSync = useRef<"header" | "body" | null>(null);
  const selectionDay = selection.day;
  const showSelection =
    selection.startIndex !== null && selection.endIndex !== null;
  const showSelectionStart =
    selection.startIndex !== null && selection.endIndex === null;

  const isSlotBlocked = (day: WeekdayKey, slotIndex: number) => {
    const isInBlocks = (items: (DraftBlock | CourseBlock)[]) =>
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

  const syncHorizontalScroll = useCallback(
    (source: "header" | "body", x: number) => {
      if (
        activeHorizontalSync.current &&
        activeHorizontalSync.current !== source
      ) {
        return;
      }
      activeHorizontalSync.current = source;
      const targetRef =
        source === "header" ? bodyScrollRef.current : headerScrollRef.current;
      targetRef?.scrollTo({ x, animated: false });
      requestAnimationFrame(() => {
        activeHorizontalSync.current = null;
      });
    },
    [],
  );

  return (
    <View style={styles.gridWrapper}>
      <View style={styles.gridHeaderRow}>
        <View style={styles.timeHeaderSpacer} />
        <ScrollView
          ref={headerScrollRef}
          horizontal
          style={styles.gridHorizontalScroll}
          contentContainerStyle={styles.gridDaysRow}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) =>
            syncHorizontalScroll("header", event.nativeEvent.contentOffset.x)
          }
        >
          {DAYS.map((day) => (
            <View key={`head-${day}`} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        style={[styles.gridBody, { maxHeight: DRAFT_GRID_MAX_HEIGHT }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridRow}>
          <TimeColumn height={gridHeight} />
          <ScrollView
            ref={bodyScrollRef}
            horizontal
            style={styles.gridHorizontalScroll}
            showsHorizontalScrollIndicator
            contentContainerStyle={[styles.gridDaysRow, styles.gridScroll]}
            scrollEventThrottle={16}
            onScroll={(event) =>
              syncHorizontalScroll("body", event.nativeEvent.contentOffset.x)
            }
          >
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
                        isTimeSlotOnHour(slot)
                          ? styles.gridSlotHourLine
                          : styles.gridSlotHalfLine,
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
  const { styles, COLORS } = useScheduleTheme();

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
                    {getCourseCodeLabel(course)}
                  </Text>
                </View>
                <Text style={styles.courseCardMeta} numberOfLines={1}>
                  Section: {getCourseSectionDisplay(course) || "—"}
                </Text>
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

const DATE_STRIP_ITEMS = generateDateStrip();
const DATE_STRIP_ITEM_WIDTH = 56;

type DateStripProps = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
};

const DateStrip: React.FC<DateStripProps> = ({
  selectedDate,
  onSelectDate,
}) => {
  const { styles, COLORS } = useScheduleTheme();
  const listRef = useRef<FlatList>(null);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    const idx = DATE_STRIP_ITEMS.findIndex((d) => isSameDay(d, selectedDate));
    if (idx >= 0 && listRef.current) {
      listRef.current.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.3,
      });
    }
  }, []);

  const renderDateItem = useCallback(
    ({ item }: { item: Date }) => {
      const isActive = isSameDay(item, selectedDate);
      const isToday = isSameDay(item, today);
      return (
        <Pressable
          style={styles.dateStripItem}
          onPress={() => onSelectDate(item)}
        >
          <Text
            style={[
              styles.dateStripDayName,
              isActive && styles.dateStripDayNameActive,
            ]}
          >
            {SHORT_DAY_NAMES[item.getDay()]}
          </Text>
          <View
            style={[
              styles.dateStripNumberWrap,
              isActive && styles.dateStripNumberWrapActive,
            ]}
          >
            <Text
              style={[
                styles.dateStripNumber,
                isActive && styles.dateStripNumberActive,
              ]}
            >
              {item.getDate()}
            </Text>
          </View>
          {isToday && (
            <View
              style={[
                styles.dateStripTodayDot,
                { backgroundColor: COLORS.accent },
              ]}
            />
          )}
        </Pressable>
      );
    },
    [selectedDate, today, styles, COLORS, onSelectDate],
  );

  return (
    <FlatList
      ref={listRef}
      data={DATE_STRIP_ITEMS}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => formatDateStr(item)}
      renderItem={renderDateItem}
      getItemLayout={(_, index) => ({
        length: DATE_STRIP_ITEM_WIDTH,
        offset: DATE_STRIP_ITEM_WIDTH * index,
        index,
      })}
      contentContainerStyle={styles.dateStripContainer}
    />
  );
};

type AIInsightBannerProps = {
  blocks: StudyBlock[];
};

const AIInsightBanner: React.FC<AIInsightBannerProps> = ({ blocks }) => {
  const { styles, COLORS } = useScheduleTheme();

  const summary = useMemo(() => {
    if (blocks.length === 0) return null;
    let totalMin = 0;
    blocks.forEach((b) => {
      totalMin += timeToMinutes(b.end) - timeToMinutes(b.start);
    });
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const timeStr =
      hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
    return `Today: ${blocks.length} session${blocks.length > 1 ? "s" : ""}, ${timeStr} of focus`;
  }, [blocks]);

  if (!summary) return null;

  return (
    <View style={styles.insightBanner}>
      <Ionicons name="sparkles" size={16} color={COLORS.accent} />
      <Text style={styles.insightText}>{summary}</Text>
    </View>
  );
};

type TimelineViewProps = {
  studyBlocks: StudyBlock[];
  courseBlocks: CourseBlock[];
  courseLookup: Map<string, Course>;
  completedSessions: Set<string>;
  onToggleDone: (id: string) => void;
  onPressSession: (block: StudyBlock) => void;
  isToday: boolean;
  currentTime: Date;
  scrollRef: React.RefObject<ScrollView | null>;
};

const TimelineView: React.FC<TimelineViewProps> = ({
  studyBlocks,
  courseBlocks,
  courseLookup,
  completedSessions,
  onToggleDone,
  onPressSession,
  isToday,
  currentTime,
  scrollRef,
}) => {
  const { styles, COLORS } = useScheduleTheme();
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const currentMinuteOffset = isToday
    ? currentTime.getHours() * 60 + currentTime.getMinutes() - START_HOUR * 60
    : -1;
  const currentTimePx =
    currentMinuteOffset >= 0 ? (currentMinuteOffset / 60) * HOUR_HEIGHT : -1;

  useEffect(() => {
    if (isToday && scrollRef.current && currentTimePx > 0) {
      const scrollTarget = Math.max(0, currentTimePx - 160);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: scrollTarget, animated: true });
      }, 300);
    }
  }, [isToday]);

  return (
    <View style={styles.timelineWrapper}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ height: totalHeight, position: "relative" }}
      >
        {hours.map((h) => {
          const topPx = (h - START_HOUR) * HOUR_HEIGHT;
          const label = `${String(h).padStart(2, "0")}:00`;
          return (
            <View
              key={`hour-${h}`}
              style={[styles.timelineHourRow, { top: topPx }]}
            >
              <Text style={styles.timelineHourLabel}>{label}</Text>
              <View style={styles.timelineHourLine} />
            </View>
          );
        })}

        <View style={[styles.timelineAxis, { height: totalHeight }]} />

        {courseBlocks.map((block) => {
          const course = courseLookup.get(block.courseId);
          if (!course) return null;
          const startMin = timeToMinutes(block.start);
          const endMin = timeToMinutes(block.end);
          const topPx = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
          const heightPx = ((endMin - startMin) / 60) * HOUR_HEIGHT;
          if (heightPx <= 0) return null;
          return (
            <View
              key={`tl-course-${block.id}`}
              style={[
                styles.timelineCourseCard,
                {
                  top: topPx,
                  height: heightPx,
                  borderLeftColor: course.color,
                  backgroundColor: course.color + "18",
                  borderColor: course.color + "30",
                },
              ]}
            >
              <Ionicons name="school-outline" size={14} color={course.color} />
              <View style={styles.timelineCourseCardContent}>
                <Text style={styles.timelineCourseTitle} numberOfLines={1}>
                  {getCourseCodeLabel(course)}
                </Text>
                <Text style={styles.timelineCourseTime}>
                  {block.start} - {block.end}
                </Text>
              </View>
            </View>
          );
        })}

        {studyBlocks.map((block) => {
          const isDone = completedSessions.has(block.id);
          return (
            <SessionCard
              key={`session-${block.id}`}
              block={block}
              isDone={isDone}
              onToggleDone={onToggleDone}
              onPress={onPressSession}
            />
          );
        })}

        {isToday && currentTimePx >= 0 && currentTimePx <= totalHeight && (
          <View style={[styles.currentTimeRow, { top: currentTimePx }]}>
            <View
              style={[
                styles.currentTimeDot,
                { backgroundColor: COLORS.danger },
              ]}
            />
            <View
              style={[
                styles.currentTimeLine,
                { backgroundColor: COLORS.danger },
              ]}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
};

type SessionCardProps = {
  block: StudyBlock;
  isDone: boolean;
  onToggleDone: (id: string) => void;
  onPress: (block: StudyBlock) => void;
};

const SessionCard: React.FC<SessionCardProps> = ({
  block,
  isDone,
  onToggleDone,
  onPress,
}) => {
  const { styles, COLORS } = useScheduleTheme();
  const startMin = timeToMinutes(block.start);
  const endMin = timeToMinutes(block.end);
  const topPx = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const heightPx = Math.max(36, ((endMin - startMin) / 60) * HOUR_HEIGHT);
  const isCompact = heightPx < 56;

  return (
    <Pressable
      onPress={() => onPress(block)}
      style={[
        styles.sessionCard,
        {
          top: topPx,
          height: heightPx,
          borderLeftColor: block.color,
          backgroundColor: block.color + "18",
          borderColor: block.color + "30",
          opacity: isDone ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.sessionCardRow}>
        <Ionicons
          name={getSubjectIcon(block.title)}
          size={isCompact ? 14 : 18}
          color={block.color}
        />
        <View style={styles.sessionCardContent}>
          <Text
            style={[
              styles.sessionCardTitle,
              isDone && styles.sessionCardTitleDone,
              isCompact && { fontSize: 12 },
            ]}
            numberOfLines={1}
          >
            {block.title}
          </Text>
          {!isCompact && (
            <Text style={styles.sessionCardTime}>
              {block.start} - {block.end}
            </Text>
          )}
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleDone(block.id);
          }}
          hitSlop={8}
        >
          <Ionicons
            name={isDone ? "checkmark-circle" : "checkmark-circle-outline"}
            size={20}
            color={isDone ? COLORS.success : COLORS.textMuted}
          />
        </Pressable>
      </View>
      {!isCompact && block.focus ? (
        <View
          style={[styles.sessionTag, { backgroundColor: block.color + "20" }]}
        >
          <Text style={[styles.sessionTagText, { color: block.color }]}>
            #{block.focus}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
};

type SessionDetailSheetProps = {
  visible: boolean;
  session: StudyBlock | null;
  isDone: boolean;
  onToggleDone: (id: string) => void;
  onClose: () => void;
};

const SessionDetailSheet: React.FC<SessionDetailSheetProps> = ({
  visible,
  session,
  isDone,
  onToggleDone,
  onClose,
}) => {
  const { styles, COLORS } = useScheduleTheme();
  if (!session) return null;

  const startMin = timeToMinutes(session.start);
  const endMin = timeToMinutes(session.end);
  const durationMin = endMin - startMin;

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable
          style={styles.sheetCard}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View
              style={[
                styles.sheetIconWrap,
                { backgroundColor: session.color + "20" },
              ]}
            >
              <Ionicons
                name={getSubjectIcon(session.title)}
                size={24}
                color={session.color}
              />
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.sheetTitle}>{session.title}</Text>

          <View style={styles.sheetMetaRow}>
            <Ionicons
              name="time-outline"
              size={16}
              color={COLORS.textSecondary}
            />
            <Text style={styles.sheetMetaText}>
              {session.start} - {session.end} ({durationMin} min)
            </Text>
          </View>

          {session.focus ? (
            <View style={styles.sheetMetaRow}>
              <Ionicons
                name="flash-outline"
                size={16}
                color={COLORS.textSecondary}
              />
              <Text style={styles.sheetMetaText}>{session.focus}</Text>
            </View>
          ) : null}

          <View style={styles.sheetActions}>
            <Pressable
              style={[
                styles.sheetDoneButton,
                isDone && { backgroundColor: COLORS.success + "20" },
              ]}
              onPress={() => onToggleDone(session.id)}
            >
              <Ionicons
                name={isDone ? "checkmark-circle" : "checkmark-circle-outline"}
                size={20}
                color={isDone ? COLORS.success : COLORS.accent}
              />
              <Text
                style={[
                  styles.sheetDoneButtonText,
                  isDone && { color: COLORS.success },
                ]}
              >
                {isDone ? "Completed" : "Mark as Done"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

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

function isTimeSlotOnHour(slot: string): boolean {
  return slot.endsWith(":00");
}

/** Hide low-value second line on tiny weekly study cells. */
function shouldShowStudyFocus(focus: string | undefined): boolean {
  const f = (focus ?? "").trim().toLowerCase();
  if (!f) return false;
  if (f === "study" || f === "normal" || f === "ad_hoc" || f === "ad hoc") {
    return false;
  }
  return true;
}

/** Text after first " - " in legacy `name` (used when `section` column empty). */
function getLegacySectionFromCourseName(name: string): string {
  const parts = name.split(" - ");
  if (parts.length < 2) return "";
  return parts.slice(1).join(" - ").trim();
}

/** Course code for weekly grid / legend (never append section from `name`). */
function getCourseCodeLabel(course: Pick<Course, "name">): string {
  return (course.name.split(" - ")[0] ?? course.name).trim();
}

/** Section for course card: DB field, else legacy suffix from `name`. */
function getCourseSectionDisplay(course: Course): string {
  const s = course.section?.trim();
  if (s) return s;
  return getLegacySectionFromCourseName(course.name);
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

function getSubjectIcon(title: string): keyof typeof Ionicons.glyphMap {
  const lower = title.toLowerCase();
  if (/math|algebra|calculus|geometry|trigonometry/.test(lower))
    return "calculator-outline";
  if (/literature|reading|english|writing|essay/.test(lower))
    return "book-outline";
  if (/science|physics|chemistry|biology/.test(lower)) return "flask-outline";
  if (/history/.test(lower)) return "time-outline";
  if (/programming|code|data.?struct|computer|software/.test(lower))
    return "code-slash-outline";
  if (/music|art|design/.test(lower)) return "color-palette-outline";
  if (/language|spanish|french|german/.test(lower)) return "language-outline";
  return "school-outline";
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateDateStrip(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekdayKey(date: Date): WeekdayKey {
  const dayNames: WeekdayKey[] = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ];
  return dayNames[date.getDay()];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const createStyles = (COLORS: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: COLORS.background,
    },
    backgroundBottom: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "100%",
      backgroundColor: COLORS.backgroundAlt,
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
    headerTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      alignSelf: "stretch",
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
      gap: SPACING.xs,
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
      backgroundColor: COLORS.subtleCard,
      borderRadius: 999,
      padding: 4,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      alignSelf: "stretch",
    },
    scheduleViewSegmentContainer: {
      minWidth: 150,
      alignSelf: "flex-start",
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
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      backgroundColor: COLORS.accent + "14",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.accent + "30",
    },
    clearScheduleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.30)",
      backgroundColor: "rgba(239,68,68,0.08)",
    },
    clearScheduleText: {
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.danger,
    },
    importButtonText: {
      fontSize: 12,
      color: COLORS.accent,
      fontWeight: "600",
    },
    addCourseButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      backgroundColor: COLORS.accent,
      borderRadius: 12,
    },
    addCourseText: {
      fontSize: 12,
      color: "#FFFFFF",
      fontWeight: "600",
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
      backgroundColor: COLORS.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
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
      borderColor: COLORS.borderSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: COLORS.subtleCard,
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
      borderColor: COLORS.borderSoft,
    },
    gridScroll: {
      paddingBottom: 4,
    },
    gridHorizontalScroll: {
      flex: 1,
    },
    gridDaysRow: {
      flexDirection: "row",
    },
    gridHeaderRow: {
      flexDirection: "row",
      backgroundColor: COLORS.subtleCard,
    },
    timeHeaderSpacer: {
      width: TIME_COLUMN_WIDTH,
    },
    dayHeaderCell: {
      width: DAY_COLUMN_WIDTH,
      paddingVertical: 10,
      borderLeftWidth: 1,
      borderLeftColor: COLORS.borderSoft,
      alignItems: "center",
    },
    dayHeaderText: {
      fontSize: 11,
      color: COLORS.textSecondary,
      fontWeight: "600",
    },
    gridBody: {
      backgroundColor: COLORS.inputBg,
    },
    gridRow: {
      flexDirection: "row",
    },
    timeColumn: {
      width: TIME_COLUMN_WIDTH,
      backgroundColor: COLORS.subtleCard,
    },
    timeSlot: {
      height: SLOT_HEIGHT,
      justifyContent: "center",
      paddingLeft: 4,
      paddingRight: 2,
      borderBottomWidth: 1,
    },
    timeSlotHourBoundary: {
      borderBottomColor: COLORS.borderSoft,
      backgroundColor: COLORS.subtleCard,
    },
    timeSlotHalf: {
      borderBottomColor: COLORS.borderSubtle,
      backgroundColor: COLORS.inputBg,
    },
    timeTextHour: {
      fontSize: 10,
      fontWeight: "700",
      color: COLORS.textSecondary,
    },
    timeTextHalf: {
      fontSize: 8,
      fontWeight: "500",
      color: COLORS.textMuted,
      opacity: 0.85,
    },
    dayColumn: {
      width: DAY_COLUMN_WIDTH,
      borderLeftWidth: 1,
      borderLeftColor: COLORS.borderSoft,
      position: "relative",
    },
    gridSlot: {
      height: SLOT_HEIGHT,
      borderBottomWidth: 1,
    },
    gridSlotHourLine: {
      borderBottomColor: COLORS.borderSoft,
      backgroundColor: "transparent",
    },
    gridSlotHalfLine: {
      borderBottomColor: COLORS.borderSubtle,
      backgroundColor: "rgba(148,163,184,0.04)",
    },
    gridSlotDisabled: {
      backgroundColor: COLORS.subtleCard,
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
      borderWidth: 1,
      borderColor: "rgba(11,18,32,0.14)",
      ...WEEKLY_BLOCK_CARD_EXTRAS,
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
    weeklyBlockKind: {
      fontSize: 9,
      fontWeight: "700",
      color: "rgba(11,18,32,0.55)",
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    planBlock: {
      position: "absolute",
      left: 4,
      right: 4,
      borderRadius: 12,
      padding: 6,
      gap: 4,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(11,18,32,0.14)",
      ...WEEKLY_BLOCK_CARD_EXTRAS,
    },
    planBlockCompact: {
      paddingVertical: 3,
      paddingHorizontal: 4,
      gap: 0,
      justifyContent: "center",
    },
    planCourseBlock: {
      opacity: 0.9,
    },
    planBlockTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: "#0B1220",
      textAlign: "center",
    },
    planBlockTitleCompact: {
      fontSize: 11,
      fontWeight: "700",
      color: "#0B1220",
      textAlign: "center",
      width: "100%",
    },
    planBlockFocus: {
      fontSize: 10,
      color: "rgba(11,18,32,0.75)",
      textAlign: "center",
    },
    dateStripContainer: {
      gap: 0,
    },
    dateStripItem: {
      width: DATE_STRIP_ITEM_WIDTH,
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
    },
    dateStripDayName: {
      fontSize: 10,
      fontWeight: "600",
      color: COLORS.textMuted,
      letterSpacing: 0.5,
    },
    dateStripDayNameActive: {
      color: COLORS.accent,
    },
    dateStripNumberWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    dateStripNumberWrapActive: {
      backgroundColor: COLORS.accent,
    },
    dateStripNumber: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    dateStripNumberActive: {
      color: "#FFFFFF",
    },
    dateStripTodayDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    insightBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
      backgroundColor: COLORS.subtleCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    insightText: {
      fontSize: 13,
      color: COLORS.textSecondary,
      fontWeight: "500",
      flex: 1,
    },
    timelineWrapper: {
      backgroundColor: COLORS.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      paddingHorizontal: 0,
      maxHeight: 600,
      overflow: "hidden",
    },
    timelineHourRow: {
      position: "absolute",
      left: 0,
      right: 0,
      height: HOUR_HEIGHT,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    timelineHourLabel: {
      width: TIMELINE_LEFT_WIDTH,
      fontSize: 11,
      color: COLORS.textMuted,
      fontWeight: "500",
      textAlign: "right",
      paddingRight: 10,
      marginTop: -6,
    },
    timelineHourLine: {
      flex: 1,
      height: 1,
      backgroundColor: COLORS.borderSoft,
    },
    timelineAxis: {
      position: "absolute",
      left: TIMELINE_LEFT_WIDTH,
      width: 2,
      backgroundColor: COLORS.borderSubtle,
      borderRadius: 1,
    },
    timelineCourseCard: {
      position: "absolute",
      left: TIMELINE_LEFT_WIDTH + 12,
      right: 8,
      borderRadius: 12,
      backgroundColor: COLORS.card,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    timelineCourseCardContent: {
      flex: 1,
      gap: 2,
    },
    timelineCourseTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    timelineCourseTime: {
      fontSize: 11,
      color: COLORS.textSecondary,
    },
    sessionCard: {
      position: "absolute",
      left: TIMELINE_LEFT_WIDTH + 12,
      right: 8,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderLeftWidth: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    sessionCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sessionCardContent: {
      flex: 1,
      gap: 2,
    },
    sessionCardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    sessionCardTitleDone: {
      textDecorationLine: "line-through",
      color: COLORS.textMuted,
    },
    sessionCardTime: {
      fontSize: 11,
      color: COLORS.textSecondary,
    },
    sessionTag: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginLeft: 26,
    },
    sessionTagText: {
      fontSize: 10,
      fontWeight: "600",
    },
    currentTimeRow: {
      position: "absolute",
      left: TIMELINE_LEFT_WIDTH - 4,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      zIndex: 10,
    },
    currentTimeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    currentTimeLine: {
      flex: 1,
      height: 2,
      marginLeft: -1,
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(2,6,23,0.5)",
      justifyContent: "flex-end",
    },
    sheetCard: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
      paddingTop: SPACING.sm,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      gap: SPACING.md,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.borderSubtle,
      alignSelf: "center",
      marginBottom: SPACING.xs,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: COLORS.textPrimary,
    },
    sheetMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.xs,
    },
    sheetMetaText: {
      fontSize: 14,
      color: COLORS.textSecondary,
    },
    sheetActions: {
      marginTop: SPACING.xs,
      gap: SPACING.sm,
    },
    sheetDoneButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.xs,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      backgroundColor: COLORS.subtleCard,
    },
    sheetDoneButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.accent,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(2,6,23,0.7)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      gap: SPACING.md,
      maxHeight: "90%",
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
    modalScrollBody: {
      flexShrink: 1,
    },
    modalBody: {
      gap: SPACING.sm,
      paddingBottom: SPACING.xs,
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
      backgroundColor: COLORS.card,
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
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
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
