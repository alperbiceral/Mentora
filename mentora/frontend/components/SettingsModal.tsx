import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
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
  language: SettingsLanguage;
  setLanguage: (v: SettingsLanguage) => void;
  onLogout: () => void;
  onChangePassword: (
    oldPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>;
};

export function SettingsModal({
  visible,
  onClose,
  darkMode,
  setDarkMode,
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
  const [passwordChangedSuccessfully, setPasswordChangedSuccessfully] =
    useState(false);
  const [languageRowY, setLanguageRowY] = useState(0);

  useEffect(() => {
    if (!visible) {
      setLanguageOpen(false);
      setPasswordOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      setPasswordLoading(false);
      setPasswordChangedSuccessfully(false);
    }
  }, [visible]);

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
      <Pressable
        style={styles.backdrop}
        onPress={
          passwordChangedSuccessfully
            ? undefined
            : () => {
              if (languageOpen) {
                setLanguageOpen(false);
                return;
              }
              onClose();
            }
        }
      >
        <View style={styles.centerWrap}>
          {/* Prevent backdrop press when interacting with the card */}
          <Pressable
            style={styles.card}
            onPress={() => {
              // noop: keeps taps inside from closing
            }}
          >
            <View style={styles.headerRow}>
              {passwordOpen && !passwordChangedSuccessfully ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setPasswordOpen(false);
                    setPasswordError(null);
                    setPasswordLoading(false);
                    setPasswordChangedSuccessfully(false);
                    setOldPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  style={styles.backBtn}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.textPrimary}
                  />
                </Pressable>
              ) : (
                <View style={{ width: 28 }} />
              )}
              <Text style={styles.title}>
                {passwordChangedSuccessfully
                  ? "Password Updated"
                  : passwordOpen
                    ? "Change Password"
                    : "Settings"}
              </Text>
              {passwordChangedSuccessfully ? (
                <View style={{ width: 28 }} />
              ) : (
                <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </Pressable>
              )}
            </View>

            {passwordChangedSuccessfully ? (
              <View style={styles.passwordSuccessCard}>
                <View style={styles.passwordSuccessIconWrap}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.accent} />
                </View>
                <Text style={styles.passwordSuccessTitle}>
                  Password changed successfully
                </Text>
                <Text style={styles.passwordSuccessSubtitle}>
                  For your security, continue by logging in again.
                </Text>
                <Pressable
                  style={styles.passwordSuccessLoginButton}
                  onPress={() => {
                    if (passwordLoading) {
                      return;
                    }
                    setPasswordLoading(true);
                    Promise.resolve(onLogout()).finally(() => {
                      setPasswordLoading(false);
                    });
                  }}
                >
                  <Text style={styles.passwordSuccessLoginText}>
                    {passwordLoading ? "Opening login..." : "Login"}
                  </Text>
                </Pressable>
              </View>
            ) : passwordOpen ? (
              <View style={styles.passwordCard}>
                <TextInput
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  style={styles.passwordInput}
                  placeholder="Old password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="current-password"
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  style={styles.passwordInput}
                  placeholder="New password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="new-password"
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
                    const oldPasswordValue = oldPassword.trim();
                    const newPasswordValue = newPassword.trim();
                    const confirmPasswordValue = confirmPassword.trim();
                    if (!oldPasswordValue || !newPasswordValue || !confirmPasswordValue) {
                      setPasswordError("Please fill all fields.");
                      return;
                    }
                    if (newPasswordValue !== confirmPasswordValue) {
                      setPasswordError("Passwords do not match.");
                      return;
                    }
                    setPasswordError(null);
                    setPasswordLoading(true);
                    try {
                      await onChangePassword(
                        oldPasswordValue,
                        newPasswordValue,
                        confirmPasswordValue,
                      );
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordChangedSuccessfully(true);
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
            ) : (
              <View style={styles.settingsSection}>
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

                  <View
                    style={styles.row}
                    onLayout={(event) => {
                      setLanguageRowY(event.nativeEvent.layout.y);
                    }}
                  >
                    <Text style={styles.rowLabel}>Language</Text>
                    <View style={styles.languageControl}>
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
                    </View>
                  </View>
                </View>

                <Pressable
                  style={styles.changePasswordButton}
                  onPress={() => {
                    setLanguageOpen(false);
                    setPasswordOpen(true);
                  }}
                >
                  <Text style={styles.changePasswordText}>Change Password</Text>
                </Pressable>

                <Pressable
                  style={styles.logoutButton}
                  onPress={() => {
                    setLanguageOpen(false);
                    onLogout();
                  }}
                >
                  <Text style={styles.logoutText}>Log Out</Text>
                </Pressable>

                {languageOpen ? (
                  <View style={styles.dropdownOverlay} pointerEvents="box-none">
                    <Pressable
                      style={styles.dropdownOverlayBackdrop}
                      onPress={() => setLanguageOpen(false)}
                    />
                    <View
                      style={[
                        styles.dropdownFloating,
                        { top: languageRowY + 44 + 6 },
                      ]}
                    >
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
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: {
  accent: string;
  background: string;
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
  backBtn: {
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
  settingsSection: {
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  languageControl: {
    width: 136,
  },
  languageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
  dropdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 30,
  },
  dropdownOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownFloating: {
    position: "absolute",
    right: 0,
    width: 136,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 24,
    zIndex: 3000,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  dropdownItemSelected: {
    backgroundColor: colors.subtleCard,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
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
  passwordSuccessCard: {
    marginTop: 12,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  passwordSuccessIconWrap: {
    marginBottom: 2,
  },
  passwordSuccessTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  passwordSuccessSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 6,
  },
  passwordSuccessLoginButton: {
    marginTop: 2,
    alignSelf: "center",
    minWidth: 148,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  passwordSuccessLoginText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
