import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, type ThemeColors } from "../../context/ThemeContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export default function EmotionScreen() {
  const { colors: COLORS, isDark } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, isDark), [COLORS, isDark]);
  const [text, setText] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<Array<{ label: string; score: number }>>([]);

  useEffect(() => {
    AsyncStorage.getItem("mentora.username").then((u) => {
      if (u) setUsername(u);
    });
  }, []);

  const submit = async () => {
    if (!text.trim()) {
      Alert.alert("Please enter some text to analyze.");
      return;
    }
    setLoading(true);
    setScores([]);
    try {
      const payload: any = { text };
      if (username) payload.username = username;

      const res = await fetch(`${API_BASE_URL}/emotion/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Request failed");
      }

      const data = await res.json();
      setScores(data.scores ?? []);
    } catch (err) {
      Alert.alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Emotion Analyzer</Text>

        <Text style={styles.label}>Text to analyze</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type how you feel..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          style={styles.input}
        />

        <Text style={styles.helper}>Sending as: {username ?? "anonymous"}</Text>

        <Pressable style={styles.button} onPress={submit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Text style={styles.buttonText}>Analyze</Text>
          )}
        </Pressable>

        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Results</Text>
          {scores.length === 0 && <Text style={styles.helper}>No results yet.</Text>}
          {scores.map((s) => (
            <View key={s.label} style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>{s.label}</Text>
              <Text style={styles.scoreValue}>{(s.score * 100).toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (COLORS: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLORS.background },
    container: { padding: 20 },
    title: {
      color: COLORS.textPrimary,
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 12,
    },
    label: {
      color: COLORS.textSecondary,
      marginBottom: 6,
      textTransform: "uppercase",
      fontSize: 12,
    },
    input: {
      minHeight: 120,
      backgroundColor: isDark ? "rgba(2,6,23,0.65)" : "rgba(2,6,23,0.04)",
      color: COLORS.textPrimary,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      marginBottom: 8,
    },
    helper: { color: COLORS.textSecondary, marginBottom: 12 },
    button: {
      backgroundColor: COLORS.accent,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 16,
    },
    buttonText: { color: "#0B1020", fontWeight: "700" },
    resultsCard: {
      backgroundColor: COLORS.card,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    resultsTitle: {
      color: COLORS.textPrimary,
      fontWeight: "700",
      marginBottom: 8,
    },
    scoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    scoreLabel: { color: COLORS.textPrimary },
    scoreValue: { color: COLORS.textSecondary },
  });
