import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";

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
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
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
  onChangePassword,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  type SwitchRowProps = {
    label: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    trackOnColor: string;
    trackOffColor: string;
    thumbOnColor: string;
    thumbOffColor: string;
  };

  function SettingSwitchRow({
    label,
    value,
    onValueChange,
    trackOnColor,
    trackOffColor,
    thumbOnColor,
    thumbOffColor,
  }: SwitchRowProps) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: trackOffColor, true: trackOnColor }}
          thumbColor={value ? thumbOnColor : thumbOffColor}
        />
      </View>
    );
  }

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
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.rows}>
              <SettingSwitchRow
                label="Dark Mode"
                value={darkMode}
                onValueChange={setDarkMode}
                trackOnColor={colors.accentSoft}
                trackOffColor={colors.borderSubtle}
                thumbOnColor={colors.accent}
                thumbOffColor="#FFFFFF"
              />
              <SettingSwitchRow
                label="Vibration"
                value={vibration}
                onValueChange={setVibration}
                trackOnColor={colors.accentSoft}
                trackOffColor={colors.borderSubtle}
                thumbOnColor={colors.accent}
                thumbOffColor="#FFFFFF"
              />
              <SettingSwitchRow
                label="Notifications"
                value={notifications}
                onValueChange={setNotifications}
                trackOnColor={colors.accentSoft}
                trackOffColor={colors.borderSubtle}
                thumbOnColor={colors.accent}
                thumbOffColor="#FFFFFF"
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
                      color={colors.textMuted}
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

            <Pressable
              style={styles.changePasswordButton}
              onPress={() => setPasswordOpen((v) => !v)}
            >
              <Text style={styles.changePasswordText}>
                {passwordOpen ? "Back" : "Change Password"}
              </Text>
            </Pressable>

            {passwordOpen ? (
              <View style={styles.passwordCard}>
                <TextInput
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  style={styles.passwordInput}
                  placeholder="Old password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  style={styles.passwordInput}
                  placeholder="New password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                />
                {passwordError ? (
                  <Text style={styles.passwordErrorText}>{passwordError}</Text>
                ) : null}
                <Pressable
                  style={styles.passwordSubmitButton}
                  onPress={async () => {
                    if (passwordLoading) {
                      return;
                    }
                    if (!oldPassword || !newPassword) {
                      setPasswordError("Please fill all fields.");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      setPasswordError("Passwords do not match.");
                      return;
                    }
                    setPasswordError(null);
                    setPasswordLoading(true);
                    try {
                      await onChangePassword(oldPassword, newPassword);
                      Alert.alert("Password updated");
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordOpen(false);
                    } catch (error) {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Change password failed";
                      setPasswordError(message);
                    } finally {
                      setPasswordLoading(false);
                    }
                  }}
                >
                  <Text style={styles.passwordSubmitText}>
                    {passwordLoading ? "Updating..." : "Update Password"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: {
  accent: string;
  card: string;
  textPrimary: string;
  textMuted: string;
  borderSoft: string;
  borderSubtle: string;
  subtleCard: string;
  danger: string;
}) =>
  StyleSheet.create({
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
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
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
    backgroundColor: colors.subtleCard,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  languageText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "600",
    marginRight: 10,
  },
  dropdown: {
    marginTop: 8,
    width: 132,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(109,94,247,0.12)",
  },
  dropdownItemText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  dropdownItemTextSelected: {
    color: colors.accent,
  },
  logoutButton: {
    marginTop: 18,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(109,94,247,0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accent,
  },
  changePasswordButton: {
    marginTop: 10,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(109,94,247,0.14)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  changePasswordText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.accent,
  },
  passwordCard: {
    marginTop: 10,
    gap: 8,
  },
  passwordInput: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.subtleCard,
    color: colors.textPrimary,
  },
  passwordErrorText: {
    color: colors.danger,
    fontSize: 12,
  },
  passwordSubmitButton: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  passwordSubmitText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
