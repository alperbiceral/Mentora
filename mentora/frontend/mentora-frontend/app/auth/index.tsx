import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, type ThemeColors } from "../../context/ThemeContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "login" | "register";

export default function AuthScreen() {
  const router = useRouter();
  const { colors: COLORS, isDark } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, isDark), [COLORS, isDark]);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";
  const title = isRegister ? "Create your account" : "Welcome back";
  const subtitle = isRegister
    ? "Use a unique username to stand out in Mentora."
    : "Log in to continue your study flow.";

  const payload = useMemo(() => {
    if (isRegister) {
      return { email, username, password };
    }
    return { email, password };
  }, [email, password, username, isRegister]);

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (!isRegister || username.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/${isRegister ? "register" : "login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Request failed");
      }

      const data = await response.json();
      if (data?.user?.username) {
        await AsyncStorage.setItem("mentora.username", data.user.username);
      }
      if (data?.user?.email) {
        await AsyncStorage.setItem("mentora.email", data.user.email);
      }
      Alert.alert(isRegister ? "Registered" : "Logged in");
      router.replace("/(tabs)");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>Mentora</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.togglePill,
              mode === "login" && styles.togglePillActive,
            ]}
            onPress={() => setMode("login")}
          >
            <Text
              style={[
                styles.toggleText,
                mode === "login" && styles.toggleTextActive,
              ]}
            >
              Login
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.togglePill,
              mode === "register" && styles.togglePillActive,
            ]}
            onPress={() => setMode("register")}
          >
            <Text
              style={[
                styles.toggleText,
                mode === "register" && styles.toggleTextActive,
              ]}
            >
              Register
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          {isRegister && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Unique username"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="name@domain.com"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
              textContentType={isRegister ? "newPassword" : "password"}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? "Please wait..."
                : isRegister
                  ? "Create account"
                  : "Log in"}
            </Text>
          </Pressable>

          <Text style={styles.helperText}>
            {isRegister
              ? "By registering you agree to Mentora terms."
              : "Welcome back. Keep your streak alive."}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (COLORS: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: COLORS.background,
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: COLORS.backgroundAlt,
  },
  glow: {
    position: "absolute",
    top: 70,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(77,163,255,0.35)",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  header: {
    marginBottom: 24,
  },
  brand: {
    color: COLORS.accent,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 8,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: isDark ? "rgba(2,6,23,0.6)" : "rgba(77,163,255,0.06)",
    borderRadius: 999,
    padding: 6,
    marginBottom: 18,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  togglePillActive: {
    backgroundColor: COLORS.accent,
  },
  toggleText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#0B1020",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: isDark ? "rgba(2,6,23,0.65)" : "rgba(77,163,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#0B1020",
    fontSize: 16,
    fontWeight: "700",
  },
  helperText: {
    marginTop: 12,
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  errorText: {
    color: COLORS.danger,
    marginBottom: 10,
  },
});
