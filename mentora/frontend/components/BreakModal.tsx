import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BreakModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function BreakRow({ icon, title, subtitle }: BreakRowProps) {
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <View style={styles.iconWrapper}>
            <Ionicons name={icon} size={20} color={colors.accent} />
          </View>
          <View>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowSubtitle}>{subtitle}</Text>
          </View>
        </View>

        <Pressable
          style={styles.rowButton}
          onPress={() => {
            console.log(`Start break: ${title}`);
          }}
        >
          <Text style={styles.rowButtonText}>Start</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={() => {
            // keep taps inside card from closing modal
          }}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Time for a break!</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Choose a quick activity to reset your focus.
          </Text>

          <View style={styles.list}>
            <BreakRow
              icon="walk-outline"
              title="Short walk"
              subtitle="5–10 minutes of movement"
            />
            <BreakRow
              icon="leaf-outline"
              title="Mindful breathing"
              subtitle="3 minutes of calm breathing"
            />
            <BreakRow
              icon="book-outline"
              title="Light reading"
              subtitle="Skim notes or a summary"
            />
          </View>

          <Pressable style={styles.skipButton} onPress={onClose}>
            <Text style={styles.skipText}>Skip Break</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type BreakRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

const createStyles = (colors: {
  card: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSoft: string;
  accent: string;
}) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "90%",
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(109,94,247,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  rowButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(109,94,247,0.14)",
  },
  rowButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
  },
  skipButton: {
    marginTop: 18,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.18)",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});

