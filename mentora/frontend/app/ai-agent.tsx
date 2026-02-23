import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import LottieView from "lottie-react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme/theme";

export default function AIAgentScreen() {
  const router = useRouter();
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [draft, setDraft] = useState("");

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.wrapper}>
            <View style={styles.header}>
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

              <View style={styles.headerText}>
                <Text style={styles.title}>Mentora AI</Text>
                <Text style={styles.subtitle}>Your AI study assistant</Text>
              </View>

              <View style={{ width: 32 }} />
            </View>

            <View style={styles.content}>
              <View style={styles.robotWrap}>
                <LottieView
                  key="mentora_ai_friendly"
                  source={require("../assets/lottie/mentora_ai_friendly.json")}
                  autoPlay
                  loop
                  resizeMode="contain"
                  style={styles.robot}
                />
              </View>

              <Text style={styles.welcome}>What can I help you with today?</Text>

              <View style={styles.examples}>
                <ExamplePrompt label="Create a study plan" styles={styles} />
                <ExamplePrompt label="Explain a topic" styles={styles} />
                <ExamplePrompt label="Quiz me" styles={styles} />
              </View>
            </View>

            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask Mentora AI..."
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                multiline
              />
              <Pressable style={styles.sendButton} onPress={() => {}}>
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ExamplePrompt({ label, styles }: { label: string; styles: any }) {
  return (
    <Pressable style={styles.promptButton} onPress={() => {}}>
      <Text style={styles.promptText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (COLORS: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    safeArea: {
      flex: 1,
    },
    screen: {
      flex: 1,
    },
    wrapper: {
      flex: 1,
      alignSelf: "center",
      width: "100%",
      maxWidth: 430,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 16,
      zIndex: 2,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    backButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.subtleCard,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    headerText: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "800",
      color: COLORS.textPrimary,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
    content: {
      flex: 1,
      justifyContent: "flex-start",
    },
    welcome: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.textPrimary,
      marginTop: 6,
      marginBottom: 14,
    },
    examples: {
      gap: 10,
    },
    robotWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
      marginBottom: 12,
    },
    robot: {
      width: 172,
      height: 172,
    },
    promptButton: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    promptText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingTop: 10,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 110,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: COLORS.textPrimary,
      backgroundColor: COLORS.inputBg,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COLORS.accent,
      alignItems: "center",
      justifyContent: "center",
    },
  });

