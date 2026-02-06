import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  Pressable,
} from "react-native";

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
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

type Mode = "courses" | "weekly";

type Course = {
  id: string;
  code: string;
  name: string;
  instructor: string;
  tags: string[];
  credits: number;
};

const COURSES: Course[] = [
  {
    id: "cs201",
    code: "CS201",
    name: "Data Structures",
    instructor: "Dr. Demir",
    tags: ["Assignment"],
    credits: 3,
  },
  {
    id: "cs223",
    code: "CS223",
    name: "Digital Design",
    instructor: "Dr. Kaya",
    tags: ["Assignment", "Midterm"],
    credits: 4,
  },
  {
    id: "phys101",
    code: "PHYS101",
    name: "General Physics I",
    instructor: "Dr. Yılmaz",
    tags: ["Midterm", "Quiz"],
    credits: 4,
  },
  {
    id: "hum110",
    code: "HUM110",
    name: "Cultures & Civilizations",
    instructor: "Dr. Aksoy",
    tags: ["Quiz"],
    credits: 3,
  },
];

type WeekdayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type Event = {
  id: string;
  title: string;
  timeRange: string;
  type: "lecture" | "study" | "review" | "gym";
};

const EVENTS_BY_DAY: Record<WeekdayKey, Event[]> = {
  Mon: [
    {
      id: "cs223-lecture",
      title: "CS223 Lecture",
      timeRange: "08:30 – 10:20",
      type: "lecture",
    },
    {
      id: "math-study",
      title: "Study: Math Problem Set #2",
      timeRange: "11:00 – 12:00",
      type: "study",
    },
    {
      id: "phys-review",
      title: "Review: Physics Quiz Prep",
      timeRange: "14:00 – 15:00",
      type: "review",
    },
    {
      id: "phys101-lecture",
      title: "PHYS101 Lecture",
      timeRange: "16:00 – 17:50",
      type: "lecture",
    },
    {
      id: "gym",
      title: "Gym",
      timeRange: "19:00 – 19:45",
      type: "gym",
    },
  ],
  Tue: [],
  Wed: [],
  Thu: [],
  Fri: [],
  Sat: [],
  Sun: [],
};

const WEEK_RANGES = ["18–24 Nov", "25 Nov – 1 Dec", "2–8 Dec"];

export default function ScheduleScreen() {
  const [mode, setMode] = useState<Mode>("courses");
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState<WeekdayKey>("Mon");

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [mode, selectedDay, weekIndex]);

  const weekLabel = WEEK_RANGES[weekIndex % WEEK_RANGES.length];

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
              {COURSES.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onPress={() => console.log("Open course", course.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.section}>
              <WeekControls
                weekLabel={weekLabel}
                onPrev={() => setWeekIndex((i) => (i + WEEK_RANGES.length - 1) % WEEK_RANGES.length)}
                onNext={() => setWeekIndex((i) => (i + 1) % WEEK_RANGES.length)}
              />

              <WeekdaySelector
                selectedDay={selectedDay}
                onSelect={setSelectedDay}
              />

              <DayTimeline
                day={selectedDay}
                events={EVENTS_BY_DAY[selectedDay] || []}
              />
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
        style={[
          styles.segmentLabel,
          mode === "courses" && styles.segmentLabelActive,
        ]}
      >
        Courses
      </Text>
    </Pressable>

    <Pressable
      style={[
        styles.segmentItem,
        mode === "weekly" && styles.segmentItemActive,
      ]}
      onPress={() => setMode("weekly")}
    >
      <Text
        style={[
          styles.segmentLabel,
          mode === "weekly" && styles.segmentLabelActive,
        ]}
      >
        Weekly Plan
      </Text>
    </Pressable>
  </View>
);

type CourseCardProps = {
  course: Course;
  onPress: () => void;
};

const CourseCard: React.FC<CourseCardProps> = ({ course, onPress }) => (
  <Pressable
    style={({ pressed }) => [
      styles.courseCard,
      pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
    ]}
    onPress={onPress}
  >
    <View style={styles.courseHeaderRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.courseCode}>
          {course.code} - {course.name}
        </Text>
        <Text style={styles.courseInstructor}>{course.instructor}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={COLORS.textSecondary}
      />
    </View>

    <View style={styles.courseFooterRow}>
      <View style={styles.tagRow}>
        {course.tags.map((tag) => (
          <View key={tag} style={[styles.tagChip, getTagStyle(tag)]}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
      <View style={styles.creditsRow}>
        <Ionicons
          name="school-outline"
          size={16}
          color={COLORS.accentSoft}
          style={{ marginRight: 4 }}
        />
        <Text style={styles.creditsText}>{course.credits} credits</Text>
      </View>
    </View>
  </Pressable>
);

function getTagStyle(tag: string) {
  switch (tag) {
    case "Assignment":
      return { backgroundColor: "rgba(251, 191, 36, 0.2)" };
    case "Midterm":
      return { backgroundColor: "rgba(248, 113, 113, 0.24)" };
    case "Quiz":
      return { backgroundColor: "rgba(45, 212, 191, 0.18)" };
    default:
      return { backgroundColor: "rgba(148, 163, 184, 0.25)" };
  }
}

type WeekControlsProps = {
  weekLabel: string;
  onPrev: () => void;
  onNext: () => void;
};

const WeekControls: React.FC<WeekControlsProps> = ({
  weekLabel,
  onPrev,
  onNext,
}) => (
  <View style={styles.weekHeaderRow}>
    <Pressable onPress={onPrev} hitSlop={8} style={styles.weekChevron}>
      <Ionicons name="chevron-back" size={18} color={COLORS.textSecondary} />
    </Pressable>
    <Text style={styles.weekLabel}>{weekLabel}</Text>
    <Pressable onPress={onNext} hitSlop={8} style={styles.weekChevron}>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
    </Pressable>
  </View>
);

type WeekdaySelectorProps = {
  selectedDay: WeekdayKey;
  onSelect: (d: WeekdayKey) => void;
};

const DAYS: WeekdayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WeekdaySelector: React.FC<WeekdaySelectorProps> = ({
  selectedDay,
  onSelect,
}) => (
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
          style={[
            styles.dayPill,
            active && styles.dayPillActive,
          ]}
          onPress={() => onSelect(d)}
        >
          <Text
            style={[
              styles.dayLabel,
              active && styles.dayLabelActive,
            ]}
          >
            {d}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

type DayTimelineProps = {
  day: WeekdayKey;
  events: Event[];
};

const DayTimeline: React.FC<DayTimelineProps> = ({ day, events }) => (
  <View style={styles.timelineCard}>
    <Text style={styles.timelineTitle}>{dayToFullLabel(day)}</Text>

    <View style={styles.timelineContent}>
      <View style={styles.timelineTimes}>
        {events.map((e) => (
          <Text key={e.id} style={styles.timelineTimeLabel}>
            {e.timeRange}
          </Text>
        ))}
      </View>

      <View style={styles.timelineEvents}>
        {events.map((e) => (
          <EventBlock key={e.id} event={e} />
        ))}
      </View>
    </View>
  </View>
);

type EventBlockProps = {
  event: Event;
};

const EventBlock: React.FC<EventBlockProps> = ({ event }) => {
  const { iconName, backgroundColor } = getEventVisual(event.type);

  return (
    <View style={[styles.eventBlock, { backgroundColor }]}>
      <View style={styles.eventLeft}>
        <View style={styles.eventIconWrapper}>
          <Ionicons name={iconName} size={16} color="#020617" />
        </View>
        <Text style={styles.eventTitle}>{event.title}</Text>
      </View>
    </View>
  );
};

function getEventVisual(type: Event["type"]) {
  switch (type) {
    case "lecture":
      return {
        iconName: "book-outline" as const,
        backgroundColor: "rgba(59,130,246,0.28)",
      };
    case "study":
      return {
        iconName: "pencil-outline" as const,
        backgroundColor: "rgba(251,191,36,0.32)",
      };
    case "review":
      return {
        iconName: "refresh-outline" as const,
        backgroundColor: "rgba(34,197,94,0.30)",
      };
    case "gym":
      return {
        iconName: "barbell-outline" as const,
        backgroundColor: "rgba(129,140,248,0.32)",
      };
    default:
      return {
        iconName: "ellipse-outline" as const,
        backgroundColor: "rgba(148,163,184,0.32)",
      };
  }
}

function dayToFullLabel(day: WeekdayKey): string {
  switch (day) {
    case "Mon":
      return "Monday";
    case "Tue":
      return "Tuesday";
    case "Wed":
      return "Wednesday";
    case "Thu":
      return "Thursday";
    case "Fri":
      return "Friday";
    case "Sat":
      return "Saturday";
    case "Sun":
      return "Sunday";
    default:
      return day;
  }
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
    height: "55%",
    backgroundColor: COLORS.background,
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: COLORS.backgroundAlt,
  },
  glow: {
    position: "absolute",
    top: -60,
    left: -40,
    right: -40,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(109,94,247,0.32)",
    opacity: 0.35,
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
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: COLORS.accent,
  },
  segmentLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  segmentLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  section: {
    gap: SPACING.md,
  },
  courseCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    marginBottom: SPACING.sm,
  },
  courseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  courseCode: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  courseInstructor: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  courseFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F9FAFB",
  },
  creditsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  creditsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  weekHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
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
  timelineCard: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  timelineContent: {
    flexDirection: "row",
  },
  timelineTimes: {
    paddingRight: SPACING.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.borderSubtle,
  },
  timelineTimeLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  timelineEvents: {
    flex: 1,
    marginLeft: SPACING.sm,
    gap: SPACING.sm,
  },
  eventBlock: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
  },
  eventLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventIconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#020617",
  },
});

