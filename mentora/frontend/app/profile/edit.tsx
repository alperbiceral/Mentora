import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

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

export default function EditProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isOnboarding =
    params.onboarding === "1" || params.onboarding === "true";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({
    fullName: "",
    university: "",
    department: "",
  });

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const storedUsername = await AsyncStorage.getItem("mentora.username");
        const storedEmail = await AsyncStorage.getItem("mentora.email");
        if (active) {
          setUsername(storedUsername ?? "");
          setEmail(storedEmail ?? "");
        }
        if (!storedUsername) {
          return;
        }

        const response = await fetch(
          `${API_BASE_URL}/profile/${storedUsername}`,
        );
        if (!response.ok) {
          if (response.status === 404) {
            return;
          }
          throw new Error("Profile fetch failed");
        }

        const data = (await response.json()) as Profile;
        if (!active) {
          return;
        }
        setProfile(data);
        setUsername(data.username);
        setFullName(data.full_name);
        setEmail(data.email);
        setPhone(data.phone_number ?? "");
        setUniversity(data.university ?? "");
        setDepartment(data.department ?? "");
        setProfilePhoto(data.profile_photo ?? "");
      } catch (error) {
        if (active) {
          setProfile(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    const nextErrors = {
      fullName: fullName.trim() ? "" : "Required",
      university: university.trim() ? "" : "Required",
      department: department.trim() ? "" : "Required",
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some((value) => value.length > 0)) {
      return;
    }

    const payload = {
      username,
      full_name: fullName,
      email,
      phone_number: phone || null,
      university: university || null,
      department: department || null,
      profile_photo: profilePhoto || null,
    };

    try {
      const url = profile
        ? `${API_BASE_URL}/profile/${username}`
        : `${API_BASE_URL}/profile`;
      const body = profile
        ? {
            full_name: payload.full_name,
            email: payload.email,
            phone_number: payload.phone_number,
            university: payload.university,
            department: payload.department,
            profile_photo: payload.profile_photo,
          }
        : payload;
      const response = await fetch(url, {
        method: profile ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Save failed");
      }

      const data = (await response.json()) as Profile;
      setProfile(data);
      Alert.alert("Saved", "Profile updated.");
      if (isOnboarding) {
        const skipped = await AsyncStorage.getItem(
          "mentora.personalitySkipped",
        );
        router.replace(skipped ? "/(tabs)" : "/ocean/1");
        return;
      }
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      Alert.alert("Error", message);
    }
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
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={false}
          />

          <Field
            label="Full Name"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              if (fieldErrors.fullName) {
                setFieldErrors((prev) => ({ ...prev, fullName: "" }));
              }
            }}
            error={fieldErrors.fullName}
          />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={false}
          />

          <Field
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Field
            label="University"
            value={university}
            onChangeText={(text) => {
              setUniversity(text);
              if (fieldErrors.university) {
                setFieldErrors((prev) => ({ ...prev, university: "" }));
              }
            }}
            error={fieldErrors.university}
          />

          <Field
            label="Department"
            value={department}
            onChangeText={(text) => {
              setDepartment(text);
              if (fieldErrors.department) {
                setFieldErrors((prev) => ({ ...prev, department: "" }));
              }
            }}
            error={fieldErrors.department}
          />

          <View style={styles.photoRow}>
            <View style={styles.photoPreview}>
              {profilePhoto ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${profilePhoto}` }}
                  style={styles.photoImage}
                />
              ) : (
                <Ionicons name="person" size={24} color={COLORS.textMuted} />
              )}
            </View>
            <Pressable
              style={styles.photoButton}
              onPress={async () => {
                const permission =
                  await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted) {
                  Alert.alert(
                    "Permission required",
                    "Please allow photo library access.",
                  );
                  return;
                }

                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  base64: true,
                  quality: 0.7,
                });

                if (!result.canceled && result.assets?.[0]?.base64) {
                  setProfilePhoto(result.assets[0].base64);
                }
              }}
            >
              <Ionicons
                name="image-outline"
                size={18}
                color={COLORS.textPrimary}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.photoButtonText}>Upload Photo</Text>
            </Pressable>
          </View>
        </View>

        {/* Bottom buttons */}
        <View style={styles.bottomButtonsRow}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {loading ? "Loading..." : "Save"}
            </Text>
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
  error?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad"
    | "number-pad";
  editable?: boolean;
  multiline?: boolean;
};

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  error,
  autoCapitalize = "sentences",
  keyboardType = "default",
  editable = true,
  multiline = false,
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
      editable={editable}
      multiline={multiline}
    />
    {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
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
  fieldErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 6,
  },
  textInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
    textAlignVertical: "top",
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  photoImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  photoButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "#020617",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
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
