import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

export type SettingsLanguage = "English" | "Turkish";

type Props = {
  visible: boolean;
  onClose: () => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  vibration: boolean;
  setVibration: (v: boolean) => void;
  notifications: boolean;
  setNotifications: (v: boolean) => void;
  language: SettingsLanguage;
  setLanguage: (v: SettingsLanguage) => void;
  onLogout: () => void;
};

export function SettingsModal({
  visible,
  onClose,
  darkMode,
  setDarkMode,
  vibration,
  setVibration,
  notifications,
  setNotifications,
  language,
  setLanguage,
  onLogout,
}: Props) {
  const [languageOpen, setLanguageOpen] = useState(false);

  const languageOptions = useMemo<SettingsLanguage[]>(
    () => ["English", "Turkish"],
    [],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.centerWrap}>
          {/* Prevent backdrop press when interacting with the card */}
          <Pressable
            style={styles.card}
            onPress={() => {
              // noop: keeps taps inside from closing
            }}
          >
            <View style={styles.headerRow}>
              <View style={{ width: 28 }} />
              <Text style={styles.title}>Settings</Text>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#111827" />
              </Pressable>
            </View>

            <View style={styles.rows}>
              <SettingSwitchRow
                label="Dark Mode"
                value={darkMode}
                onValueChange={setDarkMode}
              />
              <SettingSwitchRow
                label="Vibration"
                value={vibration}
                onValueChange={setVibration}
              />
              <SettingSwitchRow
                label="Notifications"
                value={notifications}
                onValueChange={setNotifications}
              />

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Language</Text>
                <View style={styles.languageWrap}>
                  <Pressable
                    style={styles.languageButton}
                    onPress={() => setLanguageOpen((v) => !v)}
                  >
                    <Text style={styles.languageText}>{language}</Text>
                    <Ionicons
                      name={languageOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#6B7280"
                    />
                  </Pressable>

                  {languageOpen ? (
                    <View style={styles.dropdown}>
                      {languageOptions.map((opt) => {
                        const selected = opt === language;
                        return (
                          <Pressable
                            key={opt}
                            style={[
                              styles.dropdownItem,
                              selected && styles.dropdownItemSelected,
                            ]}
                            onPress={() => {
                              setLanguage(opt);
                              setLanguageOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.dropdownItemText,
                                selected && styles.dropdownItemTextSelected,
                              ]}
                            >
                              {opt}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <Pressable style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

type SwitchRowProps = {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};

function SettingSwitchRow({ label, value, onValueChange }: SwitchRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#D1D5DB", true: "#A7B7F3" }}
        thumbColor={value ? "#3B5BA9" : "#FFFFFF"}
      />
    </View>
  );
}

const BORDER = "#3B5BA9";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  centerWrap: {
    width: "100%",
    alignItems: "center",
  },
  card: {
    width: "85%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 6,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
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
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rows: {
    gap: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  languageWrap: {
    alignItems: "flex-end",
  },
  languageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  languageText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
    marginRight: 10,
  },
  dropdown: {
    marginTop: 8,
    width: 132,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.12)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(59,91,169,0.10)",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  dropdownItemTextSelected: {
    color: BORDER,
  },
  logoutButton: {
    marginTop: 18,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#E8EEFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "800",
    color: BORDER,
  },
});

