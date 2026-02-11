import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BreakModal({ visible, onClose }: Props) {
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
              <Ionicons name="close" size={20} color="#111827" />
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

function BreakRow({ icon, title, subtitle }: BreakRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconWrapper}>
          <Ionicons name={icon} size={20} color="#6D5EF7" />
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

const styles = StyleSheet.create({
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
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
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
    color: "#111827",
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
    color: "#6B7280",
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
    color: "#111827",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  rowButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  rowButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B5BA9",
  },
  skipButton: {
    marginTop: 18,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
});

