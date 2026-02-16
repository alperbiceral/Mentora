import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  // Match Home dark theme
  background: "#0B1220",
  card: "rgba(15,23,42,0.85)",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  shadow: "#000000",
};

const SPACING = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const FOCUS_BAR_HEIGHT = 110;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Profile = {
  profile_id: number;
  username: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  university?: string | null;
  department?: string | null;
  streak_count: number;
  study_hours: number;
  personality?: string | null;
  profile_photo?: string | null;
  created_at: string;
  updated_at: string;
};

type StudySession = {
  session_id: number;
  username: string;
  mode: string;
  duration_minutes: number;
  started_at: string;
  ended_at: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusRange, setFocusRange] = useState<
    "hourly" | "daily" | "weekly" | "monthly"
  >("daily");
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [focusLoading, setFocusLoading] = useState(false);

  const avatarSource = useMemo(() => {
    if (!profile?.profile_photo) {
      return null;
    }
    return { uri: `data:image/jpeg;base64,${profile.profile_photo}` };
  }, [profile]);

  const loadProfile = useCallback(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setFocusLoading(true);
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) {
          if (active) {
            setProfile(null);
            setSessions([]);
          }
          return;
        }

        const response = await fetch(`${API_BASE_URL}/profile/${username}`);
        if (!response.ok) {
          if (response.status === 404) {
            if (active) {
              setProfile(null);
            }
            return;
          }
          throw new Error("Profile fetch failed");
        }

        const data = (await response.json()) as Profile;
        if (active) {
          setProfile(data);
        }

        try {
          const sessionResponse = await fetch(
            `${API_BASE_URL}/study-sessions/${encodeURIComponent(username)}?limit=200`,
          );
          if (!sessionResponse.ok) {
            throw new Error("Session fetch failed");
          }
          const sessionData = (await sessionResponse.json()) as StudySession[];
          if (active) {
            setSessions(sessionData);
          }
        } catch (error) {
          if (active) {
            setSessions([]);
          }
        }
      } catch (error) {
        if (active) {
          setProfile(null);
          setSessions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
          setFocusLoading(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadProfile);

  const focusSeries = useMemo(
    () => buildFocusSeries(sessions, focusRange),
    [sessions, focusRange],
  );
  const maxFocusValue = Math.max(1, ...focusSeries.values);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={COLORS.textPrimary}
            />
          </Pressable>

          <View style={styles.topBarSpacer} />

          <View style={styles.streakPill}>
            <Ionicons
              name="flame"
              size={14}
              color={COLORS.accentSoft}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.streakText}>
              {profile?.streak_count ?? 0} day
            </Text>
          </View>
        </View>

        {/* Profile header card */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.avatar}>
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={30} color={COLORS.textMuted} />
              )}
            </View>

            <View style={styles.profileHeaderText}>
              <Text style={styles.profileName}>
                {loading
                  ? "Loading..."
                  : (profile?.full_name ?? "Create your profile")}
              </Text>
              <Text style={styles.profileSubtitle}>
                {profile?.university ?? "Tap to set up your profile"}
              </Text>
            </View>
          </View>

          <View style={styles.profileActionsRow}>
            <Pressable
              style={styles.editProfileButton}
              onPress={() => router.push("/profile/edit")}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.editProfileButtonText}>
                {profile ? "Edit Profile" : "Create Profile"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.editProfileButton, styles.retakeButton]}
              onPress={async () => {
                await AsyncStorage.removeItem("mentora.personalitySkipped");
                router.push("/ocean/1");
              }}
            >
              <Ionicons
                name="refresh"
                size={16}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.editProfileButtonText}>Retake OCEAN</Text>
            </Pressable>
          </View>
        </View>

        {/* My Profile card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My Profile</Text>

          <View style={styles.divider} />

          <ProfileRow label="NAME" value={profile?.full_name ?? "-"} />
          <ProfileRow label="USERNAME" value={profile?.username ?? "-"} />
          <ProfileRow label="E-MAIL" value={profile?.email ?? "-"} />
          <ProfileRow label="UNIVERSITY" value={profile?.university ?? "-"} />
          <ProfileRow label="PERSONALITY" value={profile?.personality ?? "-"} />
        </View>

        {/* Study Insights card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Study Insights</Text>
          <View style={styles.divider} />

          <InsightRow
            icon="speedometer-outline"
            label="Study Hours"
            value={formatStudyHours(profile?.study_hours ?? 0)}
          />
          <InsightRow
            icon="repeat-outline"
            label="Streak"
            value={`${profile?.streak_count ?? 0} days`}
          />
        </View>

        {/* Focus Level mini chart card */}
        <View style={styles.sectionCard}>
          <View style={styles.focusHeaderRow}>
            <Text style={styles.sectionTitle}>Focus Level</Text>
            <View style={styles.focusToggle}>
              {FOCUS_RANGES.map((range) => (
                <Pressable
                  key={range.value}
                  onPress={() => setFocusRange(range.value)}
                  style={[
                    styles.focusToggleItem,
                    focusRange === range.value && styles.focusToggleItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.focusToggleText,
                      focusRange === range.value &&
                        styles.focusToggleTextActive,
                    ]}
                  >
                    {range.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.focusChart}>
            <View style={styles.focusChartGrid} />
            {focusLoading ? (
              <Text style={styles.focusEmptyText}>Loading...</Text>
            ) : focusSeries.values.every((value) => value === 0) ? (
              <Text style={styles.focusEmptyText}>No study data yet</Text>
            ) : (
              <View style={styles.focusChartBars}>
                {focusSeries.values.map((value, index) => (
                  <View key={`bar-${index}`} style={styles.focusBarItem}>
                    <View
                      style={[
                        styles.focusBar,
                        {
                          height: Math.max(
                            2,
                            Math.round(
                              (value / maxFocusValue) * FOCUS_BAR_HEIGHT,
                            ),
                          ),
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.focusChartLabelsRow}>
              {focusSeries.labels.map((label, index) => (
                <View key={`label-${index}`} style={styles.focusChartLabelItem}>
                  <Text style={styles.focusChartLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const formatStudyHours = (hours: number) => {
  const totalSeconds = Math.round(hours * 3600);
  if (totalSeconds <= 0) {
    return "0 sec";
  }
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }
  if (totalSeconds < 3600) {
    const minutes = Math.round(totalSeconds / 60);
    return `${minutes} min`;
  }
  const rounded = Math.round(hours * 10) / 10;
  const roundedText =
    rounded % 1 === 0 ? String(rounded.toFixed(0)) : String(rounded);
  return `${roundedText} h`;
};

const FOCUS_RANGES: Array<{
  value: "hourly" | "daily" | "weekly" | "monthly";
  label: string;
}> = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const buildFocusSeries = (
  sessions: StudySession[],
  range: "hourly" | "daily" | "weekly" | "monthly",
) => {
  if (range === "hourly") {
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const values = Array.from({ length: 24 }, () => 0);
    sessions.forEach((session) => {
      const ended = parseSessionDate(session.ended_at);
      if (!ended || ended < start) {
        return;
      }
      const hour = ended.getHours();
      values[hour] += session.duration_minutes;
    });
    const labels = Array.from({ length: 24 }, (_, index) =>
      index % 3 === 0 ? String(index) : "",
    );
    return { labels, values };
  }

  if (range === "daily") {
    const days = getDateRange(7);
    const values = days.map(() => 0);
    sessions.forEach((session) => {
      const ended = parseSessionDate(session.ended_at);
      if (!ended) {
        return;
      }
      const index = days.findIndex((day) => isSameDay(day, ended));
      if (index >= 0) {
        values[index] += session.duration_minutes;
      }
    });
    const labels = days.map((day) =>
      day.toLocaleDateString(undefined, { weekday: "short" }),
    );
    return { labels, values };
  }

  if (range === "weekly") {
    const weeks = getWeekRange(4);
    const values = weeks.map(() => 0);
    sessions.forEach((session) => {
      const ended = parseSessionDate(session.ended_at);
      if (!ended) {
        return;
      }
      const index = weeks.findIndex(
        (week) => ended >= week.start && ended <= week.end,
      );
      if (index >= 0) {
        values[index] += session.duration_minutes;
      }
    });
    const labels = weeks.map((week) =>
      week.start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
    return { labels, values };
  }

  const months = getMonthRange(6);
  const values = months.map(() => 0);
  sessions.forEach((session) => {
    const ended = parseSessionDate(session.ended_at);
    if (!ended) {
      return;
    }
    const index = months.findIndex(
      (month) =>
        month.getFullYear() === ended.getFullYear() &&
        month.getMonth() === ended.getMonth(),
    );
    if (index >= 0) {
      values[index] += session.duration_minutes;
    }
  });
  const labels = months.map((month) =>
    month.toLocaleDateString(undefined, { month: "short" }),
  );
  return { labels, values };
};

const getDateRange = (days: number) => {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (days - 1 - index));
    return date;
  });
};

const getWeekRange = (count: number) => {
  const today = new Date();
  const startOfWeek = getWeekStart(today);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(startOfWeek);
    start.setDate(startOfWeek.getDate() - (count - 1 - index) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });
};

const getMonthRange = (count: number) => {
  const today = new Date();
  const months: Date[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
  }
  return months;
};

const getWeekStart = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const parseSessionDate = (value: string) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  const parts = normalized.includes("T")
    ? normalized.split("T")
    : normalized.split(" ");
  if (parts.length < 2) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [datePart, timePart] = parts;
  const [year, month, day] = datePart.split("-").map(Number);
  const [timeOnly] = timePart.split(".");
  const [hour = "0", minute = "0", second = "0"] = timeOnly
    .split(":")
    .map((valuePart) => valuePart.trim());
  const parsed = new Date(
    year,
    Math.max(0, month - 1),
    day,
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

type ProfileRowProps = {
  label: string;
  value: string;
};

const ProfileRow: React.FC<ProfileRowProps> = ({ label, value }) => (
  <View style={styles.profileRow}>
    <Text style={styles.profileRowLabel}>{label}</Text>
    <Text style={styles.profileRowValue}>{value}</Text>
  </View>
);

type InsightRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

const InsightRow: React.FC<InsightRowProps> = ({ icon, label, value }) => (
  <View style={styles.insightRow}>
    <View style={styles.insightLeft}>
      <View style={styles.insightIconWrapper}>
        <Ionicons name={icon} size={18} color={COLORS.accentSoft} />
      </View>
      <Text style={styles.insightLabel}>{label}</Text>
    </View>
    <Text style={styles.insightValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  topBarSpacer: {
    flex: 1,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,41,59,0.95)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 999,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accentSoft,
  },
  profileHeaderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
    marginBottom: SPACING.md,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    // lighter so the avatar circle stands out on dark background
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileHeaderText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  profileSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  editProfileButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  editProfileButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderSubtle,
    marginVertical: SPACING.sm,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  profileRowLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  profileRowValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    maxWidth: "65%",
    textAlign: "right",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  insightLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  insightIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  insightLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  insightValue: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  focusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  focusToggle: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "rgba(15,23,42,0.75)",
  },
  focusToggleItem: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  focusToggleItemActive: {
    backgroundColor: COLORS.accent,
  },
  focusToggleText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  focusToggleTextActive: {
    color: "#FFFFFF",
  },
  focusChart: {
    marginTop: SPACING.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#020617",
    minHeight: 160,
  },
  focusChartGrid: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    bottom: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.35)",
  },
  focusChartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: FOCUS_BAR_HEIGHT,
    marginBottom: SPACING.sm,
  },
  focusBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  focusBar: {
    width: 8,
    borderRadius: 8,
    backgroundColor: COLORS.accentSoft,
  },
  focusChartLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  focusChartLabelItem: {
    flex: 1,
    alignItems: "center",
  },
  focusChartLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  focusEmptyText: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  profileActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: SPACING.sm,
  },
  retakeButton: {
    marginLeft: 12,
    backgroundColor: "rgba(109,94,247,0.85)",
  },
});
