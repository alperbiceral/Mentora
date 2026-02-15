import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const TOTAL_QUESTIONS = 20;
const OPTIONS = [1, 2, 3, 4, 5];

const COLORS = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)",
  accent: "#6D5EF7",
  accentSoft: "#7C6CF9",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSoft: "rgba(148,163,184,0.22)",
  inputBg: "rgba(2,6,23,0.65)",
  danger: "#F87171",
};

type Status = "idle" | "saving" | "saved" | "error";

const QUESTIONS = [
  "konuşkan",
  "dışa dönük, sosyal",
  "sessiz olmaya eğilimli",
  "enerji dolu",
  "yardımsever, bencil olmayan",
  "şefkatli, yumuşak kalpli",
  "başkalarında hata arama eğiliminde",
  "soğuk ve başkalarını umursamayan",
  "kolay vazgeçmeyen",
  "güvenilir, istikrarlı",
  "etrafını derli toplu tutan",
  "dağınık olma eğiliminde",
  "çok endişelenen",
  "sıkça üzgün hisseden",
  "gergin olabilen",
  "ruh hali inişli çıkışlı",
  "birçok şeye merak duyan",
  "özgün, yeni fikirler üreten",
  "yaratıcı",
  "sanatla çok ilgili",
];

export default function OceanQuestionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawQuestion = params.question;
  const questionNumber = useMemo(() => {
    const questionParam = Array.isArray(rawQuestion)
      ? rawQuestion[0]
      : rawQuestion;
    const parsed = Number(questionParam);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.min(Math.max(parsed, 1), TOTAL_QUESTIONS);
  }, [rawQuestion]);

  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkSkipped = async () => {
      const skipped = await AsyncStorage.getItem("mentora.personalitySkipped");
      if (active && skipped) {
        router.replace("/(tabs)");
      }
    };
    checkSkipped();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    setSelected(null);
    setStatus("idle");
    setError(null);
  }, [questionNumber]);

  const submitAnswer = async (value: number) => {
    if (status === "saving") {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const token = await AsyncStorage.getItem("mentora.token");
      if (!token) {
        throw new Error("Not authenticated. Please log in.");
      }

      const response = await fetch(`${API_BASE_URL}/ocean/${questionNumber}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });

      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Request failed");
      }

      if (isLast) {
        // Save personality profile to database after last question
        try {
          const saveResponse = await fetch(
            `${API_BASE_URL}/ocean/profile/save`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (saveResponse.ok) {
            setStatus("saved");
            // Navigate to main app after profile is saved
            setTimeout(() => {
              router.replace("/(tabs)");
            }, 150);
            return;
          }
        } catch (saveErr) {
          console.error("Failed to save profile:", saveErr);
          // Still mark as saved even if DB save fails
        }
        setStatus("saved");
        // Navigate to main app after completing all questions
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 150);
        return;
      }
      setStatus("saved");
      const next = Math.min(questionNumber + 1, TOTAL_QUESTIONS);
      router.replace(`/ocean/${next}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setStatus("error");
    }
  };
  const isLast = questionNumber >= TOTAL_QUESTIONS;

  const handleSubmit = async () => {
    if (!selected) {
      return;
    }
    await submitAnswer(selected);
  };

  const handleSkipQuestion = async () => {
    await submitAnswer(3);
  };

  const handleSkipTest = async () => {
    await AsyncStorage.setItem("mentora.personalitySkipped", "1");
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Personality Test</Text>
          <Text style={styles.title}>
            Question {questionNumber} of {TOTAL_QUESTIONS}
          </Text>
          <Text style={styles.subtitle}>
            Choose the number that fits you best right now.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.questionText}>
            Kendimi {QUESTIONS[questionNumber - 1]} biri olarak görüyorum.
          </Text>
          <Text style={styles.questionHint}>How true is this statement?</Text>

          <View style={styles.options}>
            {OPTIONS.map((value) => {
              const isSelected = selected === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSelected(value)}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionValue,
                      isSelected && styles.optionValueSelected,
                    ]}
                  >
                    {value}
                  </Text>
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {value === 1
                      ? "Definitely Not"
                      : value === 2
                        ? "Not much"
                        : value === 3
                          ? "Neutral"
                          : value === 4
                            ? "Pretty much"
                            : "Definitely"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {status === "saved" && !error && (
            <Text style={styles.successText}>Saved.</Text>
          )}

          <View style={styles.actions}>
            <Pressable
              style={[
                styles.primaryButton,
                (!selected || status === "saving") && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
            >
              {status === "saving" ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isLast ? "Submit" : "Submit & next"}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                status === "saving" && styles.buttonDisabled,
              ]}
              onPress={handleSkipQuestion}
              disabled={status === "saving"}
            >
              <Text style={styles.secondaryButtonText}>Skip question</Text>
            </Pressable>
            <Pressable
              style={styles.skipLink}
              onPress={handleSkipTest}
              disabled={status === "saving"}
            >
              <Text style={styles.skipLinkText}>Skip test</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    top: 60,
    right: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(109,94,247,0.3)",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: COLORS.accent,
    letterSpacing: 2,
    fontSize: 12,
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 28,
    marginTop: 8,
  },
  subtitle: {
    color: COLORS.textSecondary,
    marginTop: 8,
    fontSize: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  questionText: {
    color: COLORS.textPrimary,
    fontSize: 18,
  },
  questionHint: {
    color: COLORS.textMuted,
    marginTop: 6,
    fontSize: 13,
  },
  answerText: {
    color: COLORS.textSecondary,
    marginTop: 16,
    fontSize: 14,
  },
  options: {
    marginTop: 20,
    gap: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.inputBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accentSoft,
  },
  optionPressed: {
    transform: [{ scale: 0.98 }],
  },
  optionValue: {
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  optionValueSelected: {
    color: COLORS.background,
  },
  optionLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  optionLabelSelected: {
    color: COLORS.background,
  },
  errorText: {
    color: COLORS.danger,
    marginTop: 12,
  },
  successText: {
    color: COLORS.accent,
    marginTop: 12,
  },
  actions: {
    marginTop: 18,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    alignItems: "center",
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 18,
    alignItems: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(2,6,23,0.5)",
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  skipLink: {
    alignItems: "center",
  },
  skipLinkText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
