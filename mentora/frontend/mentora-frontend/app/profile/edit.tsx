import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  danger: "#EF4444",
};

const SPACING = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export default function EditProfileScreen() {
  const router = useRouter();

  const [firstName, setFirstName] = useState(mockUser.firstName);
  const [lastName, setLastName] = useState(mockUser.lastName);
  const [username, setUsername] = useState(mockUser.username);
  const [email, setEmail] = useState(mockUser.email);
  const [phone, setPhone] = useState(mockUser.phone);
  const [university, setUniversity] = useState(mockUser.university);

  const handleSave = () => {
    Alert.alert("Saved", "Profile updated (mock).");
    router.back();
  };

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

          <Text style={styles.topTitle}>Edit Profile</Text>

          <View style={{ width: 32 }} />
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          <Field
            label="First Name"
            value={firstName}
            onChangeText={setFirstName}
          />

          <Field
            label="Last Name"
            value={lastName}
            onChangeText={setLastName}
          />

          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Field
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {/* University dropdown-like field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>University</Text>
            <Pressable
              style={styles.dropdownInput}
              onPress={() => {
                console.log("Open university picker (mock)");
              }}
            >
              <Text style={styles.dropdownText}>{university}</Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>
          </View>

          {/* Change password */}
          <Pressable
            style={styles.changePasswordButton}
            onPress={() => {
              console.log("Change password (mock)");
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.changePasswordText}>Change Password</Text>
          </Pressable>

          {/* Retake personality test */}
          <Pressable
            style={styles.personalityButton}
            onPress={() => {
              console.log("Retake personality test (mock)");
            }}
          >
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={COLORS.accentSoft}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.personalityButtonText}>
              Retake Personality Test
            </Text>
          </Pressable>
        </View>

        {/* Bottom buttons */}
        <View style={styles.bottomButtonsRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad"
    | "number-pad";
};

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  autoCapitalize = "sentences",
  keyboardType = "default",
}) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={styles.textInput}
      placeholderTextColor={COLORS.textMuted}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
    />
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
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  topTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
  },
  fieldContainer: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
  },
  dropdownInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#020617",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  changePasswordButton: {
    marginTop: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
  },
  changePasswordText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  personalityButton: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  personalityButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.accentSoft,
  },
  bottomButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  saveButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentSoft,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

