import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SettingsLanguage,
  SettingsModal,
} from "../../components/SettingsModal";

const COLORS = {
  // Dark navy theme to match the login screen
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)", // glassy dark card
  subtleCard: "rgba(15,23,42,0.85)",
  // Use the same lavender as "See history >" everywhere
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  borderSoft: "rgba(148,163,184,0.18)",
  shadow: "#000000",
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

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

type Range = "today" | "week";

export default function HomeScreen() {
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<Range>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [vibration, setVibration] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState<SettingsLanguage>("English");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const headerTitle = useMemo(() => {
    if (!profile) {
      return "Create your profile";
    }
    return profile.full_name || profile.username;
  }, [profile]);

  const headerSubtitle = useMemo(() => {
    if (!profile) {
      return "Tap to set up your profile";
    }
    return profile.university || `@${profile.username}`;
  }, [profile]);

  const loadProfile = useCallback(() => {
    let active = true;
    const run = async () => {
      setProfileLoading(true);
      try {
        const storedUsername = await AsyncStorage.getItem("mentora.username");
        if (!storedUsername) {
          if (active) {
            setProfile(null);
          }
          return;
        }

        const response = await fetch(
          `${API_BASE_URL}/profile/${storedUsername}`,
        );
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
      } catch (error) {
        if (active) {
          setProfile(null);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadProfile);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      await AsyncStorage.multiRemove(["mentora.username", "mentora.email"]);
    } catch (error) {
      Alert.alert("Logout failed", "Please try again.");
      return;
    } finally {
      setSettingsOpen(false);
    }

    router.replace("/auth");
  };

  const handleChangePassword = async (
    oldPassword: string,
    newPassword: string,
  ) => {
    const username = await AsyncStorage.getItem("mentora.username");
    if (!username) {
      throw new Error("Missing username");
    }

    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const message = await response.json().catch(() => null);
      throw new Error(message?.detail ?? "Change password failed");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fake gradient using two layers to feel like the login page */}
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <HeaderCard
            title={headerTitle}
            subtitle={headerSubtitle}
            streakCount={profile?.streak_count ?? 0}
            profilePhoto={profile?.profile_photo ?? null}
            onOpenSettings={() => setSettingsOpen(true)}
            loading={profileLoading}
          />

          <GreetingCard name={profile?.full_name ?? profile?.username} />

          <ToggleTabs selected={selectedRange} onSelect={setSelectedRange} />

          <ScheduleCard range={selectedRange} />

          <QuickActions />

          <RecommendationCard />

          <CarouselSection />
        </ScrollView>
      </View>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        vibration={vibration}
        setVibration={setVibration}
        notifications={notifications}
        setNotifications={setNotifications}
        language={language}
        setLanguage={setLanguage}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
      />
    </SafeAreaView>
  );
}

const HeaderCard: React.FC<{
  onOpenSettings: () => void;
  title: string;
  subtitle: string;
  streakCount: number;
  profilePhoto: string | null;
  loading: boolean;
}> = ({
  onOpenSettings,
  title,
  subtitle,
  streakCount,
  profilePhoto,
  loading,
}) => {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
      ]}
      onPress={() => router.push("/profile")}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeftRow}>
          <View style={styles.avatar}>
            {profilePhoto ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${profilePhoto}` }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons name="person" size={26} color={COLORS.textMuted} />
            )}
          </View>

          <View>
            <Text style={styles.nameText}>
              {loading ? "Loading..." : title}
            </Text>
            <Text style={styles.subtitleText}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.headerRightRow}>
          <View style={styles.streakBadge}>
            <Ionicons
              name="flame"
              size={16}
              color={COLORS.accent}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.streakText}>{streakCount} day</Text>
          </View>

          <Pressable
            hitSlop={12}
            style={styles.settingsButton}
            onPress={() => {
              onOpenSettings();
            }}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={COLORS.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

const GreetingCard = ({ name }: { name?: string }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.greetingTitle}>Hi {name ?? "there"} !</Text>
      <Text style={styles.greetingSubtitle}>
        Ready to get some studying done? How can I assist you today?
      </Text>
    </View>
  );
};

interface ToggleTabsProps {
  selected: Range;
  onSelect: (value: Range) => void;
}

const ToggleTabs: React.FC<ToggleTabsProps> = ({ selected, onSelect }) => {
  return (
    <View style={styles.toggleContainer}>
      <Pressable
        style={[
          styles.togglePill,
          selected === "today" && styles.togglePillActive,
        ]}
        onPress={() => onSelect("today")}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={selected === "today" ? COLORS.accent : COLORS.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.toggleText,
            selected === "today" && styles.toggleTextActive,
          ]}
        >
          Today
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.togglePill,
          selected === "week" && styles.togglePillActive,
        ]}
        onPress={() => onSelect("week")}
      >
        <Ionicons
          name="calendar"
          size={16}
          color={selected === "week" ? COLORS.accent : COLORS.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.toggleText,
            selected === "week" && styles.toggleTextActive,
          ]}
        >
          This week
        </Text>
      </Pressable>
    </View>
  );
};

interface ScheduleCardProps {
  range: Range;
}

const ScheduleCard: React.FC<ScheduleCardProps> = ({ range }) => {
  const isToday = range === "today";

  return (
    <View style={styles.card}>
      <View style={styles.scheduleHeaderRow}>
        <View style={styles.scheduleHeaderLeft}>
          <Ionicons
            name="calendar-clear-outline"
            size={18}
            color={COLORS.accent}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.scheduleTitleText}>
            {isToday ? "Today" : "This week"}
          </Text>
        </View>
        <Text style={styles.scheduleCountText}>
          {isToday ? "2 sessions" : "Week overview"}
        </Text>
      </View>

      {isToday ? (
        <View style={styles.scheduleList}>
          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleCourseText}>CS-476 MW3</Text>
            <Text style={styles.scheduleTimeText}>Mon 1:30 PM</Text>
          </View>

          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleCourseText}>CS-473 CW1</Text>
            <Text style={styles.scheduleTimeText}>Wed 5:30 PM</Text>
          </View>
        </View>
      ) : (
        <View style={styles.schedulePlaceholder}>
          <Text style={styles.schedulePlaceholderText}>
            Weekly schedule insights will appear here.
          </Text>
        </View>
      )}
    </View>
  );
};

const QuickActions = () => {
  const router = useRouter();

  const handlePress = (action: string) => {
    if (action === "Study") {
      router.push("/(tabs)/study");
      return;
    }

    console.log(action);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Pressable hitSlop={8} onPress={() => console.log("See history")}>
          <Text style={styles.linkText}>See history &gt;</Text>
        </Pressable>
      </View>

      <View style={styles.quickActionsRow}>
        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Study plan")}
        >
          <Ionicons
            name="list-outline"
            size={22}
            color={COLORS.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Study plan</Text>
        </Pressable>

        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Study")}
        >
          <Ionicons
            name="alarm-outline"
            size={22}
            color={COLORS.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Study</Text>
        </Pressable>

        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Ask a question")}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={22}
            color={COLORS.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Ask a question</Text>
        </Pressable>
      </View>
    </View>
  );
};

const RecommendationCard = () => {
  const router = useRouter();

  return (
    <View style={styles.recommendationCard}>
      <View style={styles.recommendationLeft}>
        <View style={styles.recommendationIconWrapper}>
          <Ionicons
            name="notifications-outline"
            size={18}
            color={COLORS.accent}
          />
        </View>
        <View>
          <Text style={styles.recommendationTitle}>You have a busy day.</Text>
          <Text style={styles.recommendationSubtitle}>
            Want a 25-min study session?
          </Text>
        </View>
      </View>

      <Pressable
        style={styles.recommendationButton}
        onPress={() => router.push("/(tabs)/study")}
      >
        <Text style={styles.recommendationButtonText}>Start study</Text>
      </Pressable>
    </View>
  );
};

const CarouselSection = () => {
  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselRow}>
        <Pressable
          style={styles.carouselCard}
          onPress={() => console.log("Daily emotion check")}
        >
          <View style={styles.carouselHeaderRow}>
            <Ionicons
              name="chevron-back-outline"
              size={18}
              color={COLORS.textMuted}
            />
            <Text style={styles.carouselTitle}>Daily emotion check</Text>
          </View>
          <Text style={styles.carouselSubtitle}>
            Reflect on how you feel before you start.
          </Text>
        </Pressable>

        <Pressable
          style={[styles.carouselCard, styles.carouselCardSecondary]}
          onPress={() => console.log("Quick study session")}
        >
          <View style={styles.carouselHeaderRow}>
            <Text style={styles.carouselTitle}>Quick study session</Text>
            <Ionicons
              name="chevron-forward-outline"
              size={18}
              color={COLORS.textMuted}
            />
          </View>
          <Text style={styles.carouselSubtitle}>
            Jump into a focused 25-min block.
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

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
  scrollContent: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  nameText: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  subtitleText: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    // match tile background for a consistent pill look
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: SPACING.xs,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accent,
  },
  settingsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  greetingSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignSelf: "flex-start",
  },
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
  },
  togglePillActive: {
    backgroundColor: "rgba(148,163,184,0.24)",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  toggleTextActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  scheduleHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  scheduleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  scheduleTitleText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  scheduleCountText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  scheduleList: {
    gap: SPACING.sm,
  },
  scheduleItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // match Quick Actions tile background (slightly lighter navy)
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  scheduleCourseText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  scheduleTimeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  schedulePlaceholder: {
    backgroundColor: "rgba(15,23,42,0.9)",
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  schedulePlaceholderText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  section: {
    marginTop: SPACING.xs,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  linkText: {
    fontSize: 12,
    color: COLORS.accentSoft,
    fontWeight: "500",
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  quickActionCard: {
    flex: 1,
    // slightly lighter than main cards for more contrast
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  quickActionText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  recommendationCard: {
    marginTop: SPACING.md,
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  recommendationLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: SPACING.sm,
  },
  recommendationIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(124,58,237,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  recommendationSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  recommendationButton: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.xs,
    borderRadius: 999,
    // exactly same lavender as other accents (See history, icons, etc.)
    backgroundColor: COLORS.accent,
  },
  recommendationButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  carouselSection: {
    marginTop: SPACING.lg,
  },
  carouselRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  carouselCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  carouselCardSecondary: {
    backgroundColor: "rgba(148,163,184,0.15)",
  },
  carouselHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  carouselTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  carouselSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
