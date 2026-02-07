import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { BreakModal } from "../../components/BreakModal";

const COLORS = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.9)",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  accent: "#6D5EF7",
  accentSoft: "#A7B7F3",
  borderSubtle: "rgba(148,163,184,0.35)",
  shadow: "#000000",
};

const SPACING = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export default function PomodoroScreen() {
  const [breakOpen, setBreakOpen] = useState(false);

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
            <Text style={styles.headerText}>
              Stay <Text style={styles.headerAccent}>Focused</Text>!
            </Text>
            <Text style={styles.headerSubtitle}>
              One intense block. No distractions.
            </Text>
          </View>

          {/* Main timer card */}
          <View style={styles.timerCard}>
            <Text style={styles.sessionTitle}>Quiz study for CS 202!</Text>
            <Text style={styles.sessionSubtitle}>
              25-minute focused pomodoro session
            </Text>

            <View style={styles.timerCluster}>
              <View style={styles.timerAura} />
              <View style={styles.timerRingOuter}>
                <View style={styles.timerRingGradient} />
                <View style={styles.timerRingInner}>
                  <Text style={styles.timerLabel}>Next block</Text>
                  <Text style={styles.timerText}>20:00</Text>
                  <Text style={styles.timerHint}>Pomodoro • 1 / 4</Text>
                </View>
              </View>
            </View>

            <View style={styles.timerButtonsRow}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  console.log("Start pomodoro (mock)");
                }}
              >
                <Text style={styles.primaryButtonText}>START</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => setBreakOpen(true)}
              >
                <Text style={styles.secondaryButtonText}>COMPLETE</Text>
              </Pressable>
            </View>
          </View>

          {/* Statistics */}
          <View style={styles.statsSection}>
            <Text style={styles.statsTitle}>Statistics</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Today</Text>
                <Text style={styles.statValue}>45 mins</Text>
                <Text style={styles.statMeta}>2 sessions</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>This Week</Text>
                <Text style={styles.statValue}>2h 15 mins</Text>
                <Text style={styles.statMeta}>5 sessions</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>

      <BreakModal visible={breakOpen} onClose={() => setBreakOpen(false)} />
    </SafeAreaView>
  );
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
  },
  headerText: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  headerAccent: {
    color: COLORS.accent,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  timerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  sessionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: SPACING.lg,
  },
  timerCluster: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  timerAura: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(109,94,247,0.18)",
    opacity: 0.7,
  },
  timerRingOuter: {
    width: 210,
    height: 210,
    borderRadius: 105,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    elevation: 12,
    overflow: "hidden",
  },
  timerRingGradient: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 10,
    borderColor: "rgba(167,183,243,0.16)",
  },
  timerRingInner: {
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 8,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
  },
  timerLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  timerText: {
    fontSize: 38,
    fontWeight: "900",
    color: COLORS.textPrimary,
  },
  timerHint: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  timerButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  statsSection: {
    marginTop: SPACING.lg,
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderRadius: 18,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  statMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
});
