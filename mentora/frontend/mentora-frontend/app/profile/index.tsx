import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { mockUser } from "../../mock/user";

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

export default function ProfileScreen() {
  const router = useRouter();

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
            <Text style={styles.streakText}>{mockUser.streakDays} day</Text>
          </View>
        </View>

        {/* Profile header card */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.avatar}>
              <Ionicons
                name="person"
                size={30}
                color={COLORS.textMuted}
              />
            </View>

            <View style={styles.profileHeaderText}>
              <Text style={styles.profileName}>
                {mockUser.firstName} {mockUser.lastName}
              </Text>
              <Text style={styles.profileSubtitle}>
                {mockUser.university}
              </Text>
            </View>
          </View>

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
            <Text style={styles.editProfileButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* My Profile card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My Profile</Text>

          <View style={styles.divider} />

          <ProfileRow
            label="NAME"
            value={`${mockUser.firstName} ${mockUser.lastName}`}
          />
          <ProfileRow label="USERNAME" value={mockUser.username} />
          <ProfileRow label="E-MAIL" value={mockUser.email} />
          <ProfileRow label="UNIVERSITY" value={mockUser.university} />
          <ProfileRow label="PERSONALITY" value={mockUser.personality} />
        </View>

        {/* Study Insights card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Study Insights</Text>
          <View style={styles.divider} />

          <InsightRow
            icon="speedometer-outline"
            label="Focus Level"
            value={mockUser.focusLevel}
          />
          <InsightRow
            icon="time-outline"
            label="Most Productive Time"
            value={mockUser.mostProductiveTime}
          />
          <InsightRow
            icon="repeat-outline"
            label="Consistency"
            value={mockUser.consistency}
          />
        </View>

        {/* Focus Level mini chart card */}
        <View style={styles.sectionCard}>
          <View style={styles.focusHeaderRow}>
            <Text style={styles.sectionTitle}>Focus Level</Text>
          </View>

          <View style={styles.fakeChart}>
            <View style={styles.fakeChartGrid} />
            <View style={styles.fakeChartLine} />

            <View style={styles.fakeChartDotsRow}>
              <View style={styles.fakeChartDot} />
              <View style={[styles.fakeChartDot, styles.fakeChartDotHigh]} />
              <View style={styles.fakeChartDot} />
              <View style={[styles.fakeChartDot, styles.fakeChartDotHigh]} />
              <View style={styles.fakeChartDot} />
            </View>

            <View style={styles.fakeChartLabelsRow}>
              <Text style={styles.fakeChartLabel}>Mon</Text>
              <Text style={styles.fakeChartLabel}>Tue</Text>
              <Text style={styles.fakeChartLabel}>Wed</Text>
              <Text style={styles.fakeChartLabel}>Thu</Text>
              <Text style={styles.fakeChartLabel}>Fri</Text>
            </View>
          </View>

          <Pressable
            hitSlop={10}
            onPress={() => {
              console.log("View focus details");
            }}
            style={styles.viewDetailsRow}
          >
            <Text style={styles.viewDetailsText}>View details &gt;</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  fakeChart: {
    marginTop: SPACING.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#020617",
  },
  fakeChartGrid: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    bottom: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.35)",
  },
  fakeChartLine: {
    position: "absolute",
    top: "35%",
    left: SPACING.md,
    right: SPACING.md,
    borderTopWidth: 1,
    borderColor: "rgba(109, 94, 247, 0.7)",
  },
  fakeChartDotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: SPACING.sm,
  },
  fakeChartDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4B5563",
  },
  fakeChartDotHigh: {
    height: 10,
    backgroundColor: COLORS.accentSoft,
  },
  fakeChartLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  fakeChartLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  viewDetailsRow: {
    marginTop: SPACING.sm,
    alignItems: "flex-end",
  },
  viewDetailsText: {
    fontSize: 12,
    color: COLORS.accentSoft,
    fontWeight: "500",
  },
});

