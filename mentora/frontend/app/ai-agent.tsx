import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme/theme";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: string[];
};

const EXAMPLE_PROMPTS = [
  "Move my Monday study sessions to other days",
  "Reschedule my Friday study sessions",
  "@emotion I'm feeling stressed about my exams",
];

export default function AIAgentScreen() {
  const router = useRouter();
  const { colors: COLORS, mode } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);

  const hasMessages = messages.length > 0;

  const robotColorFilters = useMemo(() => {
    if (mode !== "light") {
      return [];
    }
    // The "FaceDots" fill controls the eye dots; in light mode they are near-white
    // and can disappear against light backgrounds.
    return [
      {
        keypath: "**.FaceDots.Fill 1",
        color: COLORS.textPrimary,
      },
    ];
  }, [mode, COLORS.textPrimary]);

  useEffect(() => {
    (async () => {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) return;
        const res = await fetch(
          `${API_BASE_URL}/ai-assistant/history/${encodeURIComponent(username)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const loaded: Message[] = data.map(
          (m: { message_id: number; role: string; text: string; actions: string[] }) => ({
            id: `hist-${m.message_id}`,
            role: m.role as "user" | "assistant",
            text: m.text,
            actions: m.actions?.length ? m.actions : undefined,
          }),
        );
        setMessages(loaded);
      } catch {
        // silently ignore history load failures
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraft("");
      setLoading(true);

      try {
        const res = await fetch(`${API_BASE_URL}/ai-assistant/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, message: trimmed }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || "Request failed");
        }

        const data = await res.json();
        if (data.force_logout) {
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).catch(() => {});
          await AsyncStorage.multiRemove([
            "mentora.username",
            "mentora.email",
            "mentora.token",
            "mentora.personalitySkipped",
            "mentora.friendsNotifLastSeenAt",
            "mentora.groupsNotifLastSeenAt",
            "mentora.chatsNotifLastSeenAt",
            "mentora.chatLastSeenByThread",
          ]);
          router.replace("/auth");
          return;
        }
        const assistantMsg: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          text: data.reply ?? "Done.",
          actions: data.actions_taken ?? [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "I'm having a little trouble right now. Could you please try again in a moment? If the problem persists, check your internet connection or try restarting the app.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          {!isUser && (
            <View style={styles.aiAvatarRow}>
              <Ionicons name="sparkles" size={14} color={COLORS.accent} />
              <Text style={styles.aiLabel}>Mentora AI</Text>
            </View>
          )}
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.aiMessageText,
            ]}
          >
            {item.text}
          </Text>
          {item.actions && item.actions.length > 0 && (
            <View style={styles.actionsContainer}>
              {item.actions.map((action, idx) => (
                <View key={idx} style={styles.actionChip}>
                  <Ionicons
                    name="checkmark-circle"
                    size={13}
                    color={COLORS.accent}
                  />
                  <Text style={styles.actionText}>{action}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      );
    },
    [styles, COLORS],
  );

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
                <Text style={styles.subtitle}>Schedule Assistant</Text>
              </View>

              <View style={{ width: 32 }} />
            </View>

            {!hasMessages ? (
              <View style={styles.content}>
                <View style={styles.robotWrap}>
                  <LottieView
                    key="mentora_ai_friendly"
                    source={require("../assets/lottie/mentora_ai_friendly.json")}
                    colorFilters={robotColorFilters}
                    autoPlay
                    loop
                    resizeMode="contain"
                    style={styles.robot}
                  />
                </View>

                <Text style={styles.welcome}>
                  How can I help with your study sessions?
                </Text>

                <View style={styles.examples}>
                  {EXAMPLE_PROMPTS.map((label) => (
                    <Pressable
                      key={label}
                      style={styles.promptButton}
                      onPress={() => sendMessage(label)}
                    >
                      <Text style={styles.promptText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() =>
                  flatListRef.current?.scrollToEnd({ animated: true })
                }
                ListFooterComponent={
                  loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={COLORS.accent} />
                      <Text style={styles.loadingText}>Thinking...</Text>
                    </View>
                  ) : null
                }
              />
            )}

            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about your schedule..."
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                multiline
                editable={!loading}
                onSubmitEditing={() => sendMessage(draft)}
                blurOnSubmit={false}
              />
              <Pressable
                style={[
                  styles.sendButton,
                  (!draft.trim() || loading) && styles.sendButtonDisabled,
                ]}
                onPress={() => sendMessage(draft)}
                disabled={!draft.trim() || loading}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
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
      // Light gray card that still contrasts with the screen background.
      backgroundColor:
        COLORS.card === "#FFFFFF" ? "rgba(15,23,42,0.04)" : COLORS.subtleCard,
      borderWidth: 1,
      borderColor:
        COLORS.card === "#FFFFFF" ? "rgba(15,23,42,0.10)" : COLORS.borderSoft,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: COLORS.card === "#FFFFFF" ? 0.08 : 0.18,
      shadowRadius: 12,
      elevation: 4,
    },
    promptText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    messageList: {
      flex: 1,
    },
    messageListContent: {
      paddingBottom: 8,
      gap: 12,
    },
    messageBubble: {
      maxWidth: "85%",
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: COLORS.accent,
      borderBottomRightRadius: 4,
    },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      borderBottomLeftRadius: 4,
    },
    aiAvatarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 4,
    },
    aiLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: COLORS.accent,
    },
    messageText: {
      fontSize: 14,
      lineHeight: 20,
    },
    userMessageText: {
      color: "#FFFFFF",
    },
    aiMessageText: {
      color: COLORS.textPrimary,
    },
    actionsContainer: {
      marginTop: 8,
      gap: 4,
    },
    actionChip: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      paddingVertical: 3,
    },
    actionText: {
      fontSize: 12,
      color: COLORS.textSecondary,
      flex: 1,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    loadingText: {
      fontSize: 13,
      color: COLORS.textSecondary,
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
    sendButtonDisabled: {
      opacity: 0.5,
    },
  });
