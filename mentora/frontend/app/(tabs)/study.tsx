import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

const COLORS = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.9)",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  accent: "#6D5EF7",
  accentSoft: "#A7B7F3",
  borderSubtle: "rgba(148,163,184,0.35)",
  shadow: "#000000",
};

const SPACING = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export default function StudyScreen() {
  const [activeTab, setActiveTab] = useState<"normal" | "pomodoro" | "streak">(
    "normal",
  );
  const [normalMode, setNormalMode] = useState<"countup" | "countdown">(
    "countup",
  );
  const [normalHoursInput, setNormalHoursInput] = useState("0");
  const [normalMinutesInput, setNormalMinutesInput] = useState("30");
  const [pomodoroFocusInput, setPomodoroFocusInput] = useState("25");
  const [pomodoroBreakInput, setPomodoroBreakInput] = useState("5");
  const [pomodoroCyclesInput, setPomodoroCyclesInput] = useState("4");

  const [isRunning, setIsRunning] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [studySeconds, setStudySeconds] = useState(0);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);

  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const studySecondsRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem("mentora.username")
      .then((value) => setCurrentUsername(value))
      .catch(() => setCurrentUsername(null));
  }, []);

  const loadSessions = useCallback(async () => {
    if (!currentUsername) {
      return;
    }
    setLoadingSessions(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/study-sessions/${encodeURIComponent(currentUsername)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }
      const data = (await response.json()) as StudySession[];
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [currentUsername]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const focusMinutes = useMemo(
    () => parsePositiveInt(pomodoroFocusInput, 25),
    [pomodoroFocusInput],
  );
  const breakMinutes = useMemo(
    () => parsePositiveInt(pomodoroBreakInput, 5),
    [pomodoroBreakInput],
  );
  const totalCycles = useMemo(
    () => parsePositiveInt(pomodoroCyclesInput, 4),
    [pomodoroCyclesInput],
  );

  const normalTargetSeconds = useMemo(() => {
    const hours = parseNonNegativeInt(normalHoursInput, 0);
    const minutes = parseNonNegativeInt(normalMinutesInput, 0);
    return hours * 3600 + minutes * 60;
  }, [normalHoursInput, normalMinutesInput]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = setInterval(() => {
      if (activeTab === "normal") {
        if (normalMode === "countup") {
          setElapsedSeconds((value) => value + 1);
          bumpStudySeconds(studySecondsRef, setStudySeconds);
          return;
        }

        bumpStudySeconds(studySecondsRef, setStudySeconds);
        setSecondsLeft((value) => {
          if (value <= 1) {
            finalizeSession();
            return 0;
          }
          return value - 1;
        });
        return;
      }

      if (activeTab === "pomodoro") {
        setSecondsLeft((value) => {
          if (value <= 1) {
            if (isOnBreak) {
              if (currentCycle >= totalCycles) {
                finalizeSession();
                return 0;
              }
              setIsOnBreak(false);
              setCurrentCycle((cycle) => cycle + 1);
              return focusMinutes * 60;
            }
            setIsOnBreak(true);
            return breakMinutes * 60;
          }
          return value - 1;
        });

        if (!isOnBreak) {
          bumpStudySeconds(studySecondsRef, setStudySeconds);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    activeTab,
    breakMinutes,
    currentCycle,
    focusMinutes,
    isOnBreak,
    isRunning,
    normalMode,
    totalCycles,
  ]);

  const displaySeconds =
    activeTab === "normal" && normalMode === "countup"
      ? elapsedSeconds
      : secondsLeft;

  const timerLabel = useMemo(() => {
    if (activeTab === "normal") {
      return normalMode === "countup" ? "Focus time" : "Time left";
    }
    if (activeTab === "pomodoro") {
      return isOnBreak ? "Break" : "Focus";
    }
    return "Coming soon";
  }, [activeTab, isOnBreak, normalMode]);

  const timerHint = useMemo(() => {
    if (activeTab === "pomodoro") {
      return `Pomodoro • ${currentCycle} / ${totalCycles}`;
    }
    if (activeTab === "normal" && normalMode === "countdown") {
      return "Countdown mode";
    }
    if (activeTab === "normal") {
      return "Count up mode";
    }
    return "TO DO";
  }, [activeTab, currentCycle, normalMode, totalCycles]);

  const handleStart = () => {
    if (activeTab === "streak") {
      return;
    }

    if (!sessionStartedAt) {
      setSessionStartedAt(new Date().toISOString());
    }

    if (activeTab === "normal") {
      if (normalMode === "countdown") {
        if (normalTargetSeconds <= 0) {
          Alert.alert("Pick a duration", "Add a valid time first.");
          return;
        }
        if (secondsLeft === 0) {
          setSecondsLeft(normalTargetSeconds);
        }
      }
      setIsRunning(true);
      return;
    }

    if (activeTab === "pomodoro") {
      if (focusMinutes <= 0 || breakMinutes <= 0 || totalCycles <= 0) {
        Alert.alert("Check your settings", "Use positive values.");
        return;
      }
      if (secondsLeft === 0) {
        setCurrentCycle(1);
        setIsOnBreak(false);
        setSecondsLeft(focusMinutes * 60);
      }
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsOnBreak(false);
    setSecondsLeft(0);
    setElapsedSeconds(0);
    setCurrentCycle(1);
    setSessionStartedAt(null);
    studySecondsRef.current = 0;
    setStudySeconds(0);
  };

  const finalizeSession = () => {
    if (studySecondsRef.current <= 0) {
      handleReset();
      return;
    }

    const durationMinutes =
      Math.round((studySecondsRef.current / 60) * 100) / 100;
    const startedAt = sessionStartedAt ?? new Date().toISOString();
    const endedAt = new Date().toISOString();

    if (!currentUsername) {
      handleReset();
      Alert.alert("Missing user", "Please login again.");
      return;
    }

    const payload: StudySessionCreate = {
      username: currentUsername,
      mode: activeTab,
      timer_type: activeTab === "pomodoro" ? "pomodoro" : normalMode,
      duration_minutes: durationMinutes,
      focus_minutes: activeTab === "pomodoro" ? focusMinutes : undefined,
      break_minutes: activeTab === "pomodoro" ? breakMinutes : undefined,
      cycles: activeTab === "pomodoro" ? totalCycles : undefined,
      started_at: startedAt,
      ended_at: endedAt,
    };

    handleReset();

    void recordSession(payload, loadSessions);
  };

  const primaryActionLabel = isRunning
    ? "Pause"
    : displaySeconds > 0 || elapsedSeconds > 0
      ? "Resume"
      : "Start";

  const secondaryActionLabel =
    studySeconds > 0 || elapsedSeconds > 0 ? "Finish" : "Reset";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerText}>
              Study <Text style={styles.headerAccent}>Timer</Text>
            </Text>
            <Text style={styles.headerSubtitle}>
              Track focused time and save every session.
            </Text>
          </View>

          <View style={styles.segmentedControl}>
            <Pressable
              style={[
                styles.segmentButton,
                activeTab === "normal" && styles.segmentButtonActive,
              ]}
              onPress={() => setActiveTab("normal")}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === "normal" && styles.segmentTextActive,
                ]}
              >
                Normal
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentButton,
                activeTab === "pomodoro" && styles.segmentButtonActive,
              ]}
              onPress={() => setActiveTab("pomodoro")}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === "pomodoro" && styles.segmentTextActive,
                ]}
              >
                Pomodoro
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentButton,
                activeTab === "streak" && styles.segmentButtonActive,
              ]}
              onPress={() => setActiveTab("streak")}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === "streak" && styles.segmentTextActive,
                ]}
              >
                Streak Question
              </Text>
            </Pressable>
          </View>

          <View style={styles.timerCard}>
            <Text style={styles.sessionTitle}>
              {activeTab === "normal"
                ? "Focus"
                : activeTab === "pomodoro"
                  ? "Pomodoro"
                  : "Streak Question"}
            </Text>
            <Text style={styles.sessionSubtitle}>
              {activeTab === "normal"
                ? "Count up or set a countdown."
                : activeTab === "pomodoro"
                  ? "Auto-switch between focus and break."
                  : "TO DO"}
            </Text>

            <View style={styles.timerCluster}>
              <View style={styles.timerAura} />
              <View style={styles.timerRingOuter}>
                <View style={styles.timerRingGradient} />
                <View style={styles.timerRingInner}>
                  <Text style={styles.timerLabel}>{timerLabel}</Text>
                  <Text style={styles.timerText}>
                    {formatTime(displaySeconds)}
                  </Text>
                  <Text style={styles.timerHint}>{timerHint}</Text>
                </View>
              </View>
            </View>

            {activeTab === "normal" ? (
              <View style={styles.settingsBlock}>
                <View style={styles.toggleRow}>
                  <Pressable
                    style={[
                      styles.toggleButton,
                      normalMode === "countup" && styles.toggleButtonActive,
                    ]}
                    onPress={() => setNormalMode("countup")}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        normalMode === "countup" && styles.toggleTextActive,
                      ]}
                    >
                      Count up
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.toggleButton,
                      normalMode === "countdown" && styles.toggleButtonActive,
                    ]}
                    onPress={() => setNormalMode("countdown")}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        normalMode === "countdown" && styles.toggleTextActive,
                      ]}
                    >
                      Countdown
                    </Text>
                  </Pressable>
                </View>

                {normalMode === "countdown" ? (
                  <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Hours</Text>
                      <TextInput
                        value={normalHoursInput}
                        onChangeText={setNormalHoursInput}
                        style={styles.inputField}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Minutes</Text>
                      <TextInput
                        value={normalMinutesInput}
                        onChangeText={setNormalMinutesInput}
                        style={styles.inputField}
                        keyboardType="number-pad"
                        placeholder="30"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {activeTab === "pomodoro" ? (
              <View style={styles.settingsBlock}>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Focus</Text>
                    <TextInput
                      value={pomodoroFocusInput}
                      onChangeText={setPomodoroFocusInput}
                      style={styles.inputField}
                      keyboardType="number-pad"
                      placeholder="25"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Break</Text>
                    <TextInput
                      value={pomodoroBreakInput}
                      onChangeText={setPomodoroBreakInput}
                      style={styles.inputField}
                      keyboardType="number-pad"
                      placeholder="5"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Cycles</Text>
                    <TextInput
                      value={pomodoroCyclesInput}
                      onChangeText={setPomodoroCyclesInput}
                      style={styles.inputField}
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {activeTab === "streak" ? (
              <View style={styles.todoCard}>
                <Ionicons name="sparkles" size={18} color={COLORS.accentSoft} />
                <Text style={styles.todoText}>
                  Streak Question is on the roadmap.
                </Text>
              </View>
            ) : (
              <View style={styles.timerButtonsRow}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={isRunning ? handlePause : handleStart}
                >
                  <Text style={styles.primaryButtonText}>
                    {primaryActionLabel}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.secondaryButton}
                  onPress={finalizeSession}
                >
                  <Text style={styles.secondaryButtonText}>
                    {secondaryActionLabel}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.statsSection}>
            <Text style={styles.statsTitle}>Recent sessions</Text>
            {loadingSessions ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : sessions.length === 0 ? (
              <Text style={styles.emptyText}>No sessions yet</Text>
            ) : (
              <View style={styles.sessionList}>
                {sessions.map((session) => (
                  <View key={session.session_id} style={styles.sessionItem}>
                    <View style={styles.sessionIcon}>
                      <Ionicons
                        name={
                          session.mode === "pomodoro"
                            ? "timer-outline"
                            : "hourglass-outline"
                        }
                        size={16}
                        color={COLORS.textPrimary}
                      />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionName}>
                        {session.mode === "pomodoro" ? "Pomodoro" : "Focus"}
                      </Text>
                      <Text style={styles.sessionMeta}>
                        {formatDuration(session.duration_minutes)} •{" "}
                        {formatDateTime(session.started_at)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

type StudySession = {
  session_id: number;
  username: string;
  mode: string;
  timer_type?: string | null;
  duration_minutes: number;
  focus_minutes?: number | null;
  break_minutes?: number | null;
  cycles?: number | null;
  started_at: string;
  ended_at: string;
  created_at: string;
};

type StudySessionCreate = {
  username: string;
  mode: string;
  timer_type?: string;
  duration_minutes: number;
  focus_minutes?: number;
  break_minutes?: number;
  cycles?: number;
  started_at: string;
  ended_at: string;
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minutesText = String(minutes).padStart(2, "0");
  const secondsText = String(seconds).padStart(2, "0");
  return `${minutesText}:${secondsText}`;
};

const formatDuration = (minutes: number) => {
  const totalSeconds = Math.round(minutes * 60);
  if (totalSeconds < 60) {
    return `${Math.max(1, totalSeconds)} sec`;
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  const hoursText = hours % 1 === 0 ? String(hours.toFixed(0)) : String(hours);
  return `${hoursText} h`;
};

const formatDateTime = (value: string) => {
  const parsed = parseDateTime(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const datePart = parsed.toLocaleDateString();
  const timePart = parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
};

const parseDateTime = (value: string) => {
  if (!value) {
    return new Date("invalid");
  }
  const normalized = value.trim();
  const parts = normalized.includes("T")
    ? normalized.split("T")
    : normalized.split(" ");
  if (parts.length < 2) {
    return new Date(normalized);
  }
  const [datePart, timePart] = parts;
  const [year, month, day] = datePart.split("-").map(Number);
  const [timeOnly] = timePart.split(".");
  const [hour = "0", minute = "0", second = "0"] = timeOnly
    .split(":")
    .map((valuePart) => valuePart.trim());
  return new Date(
    year,
    Math.max(0, month - 1),
    day,
    Number(hour),
    Number(minute),
    Number(second),
  );
};

const parsePositiveInt = (value: string, fallback: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseNonNegativeInt = (value: string, fallback: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const bumpStudySeconds = (
  ref: React.MutableRefObject<number>,
  setter: React.Dispatch<React.SetStateAction<number>>,
) => {
  ref.current += 1;
  setter(ref.current);
};

const recordSession = async (
  payload: StudySessionCreate,
  onComplete: () => void,
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/study-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.json().catch(() => null);
      throw new Error(message?.detail ?? "Failed to save session");
    }
    onComplete();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    Alert.alert("Error", message);
  }
};

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
    height: "100%",
    backgroundColor: "#0B1220",
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0F1A2B",
    opacity: 0.45,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(109,94,247,0.18)",
    opacity: 0.25,
  },
  wrapper: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    paddingHorizontal: SPACING.lg,
  },
  content: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.lg,
  },
  header: {
    alignItems: "center",
  },
  headerText: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  headerAccent: {
    color: COLORS.accent,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  timerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  sessionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: SPACING.lg,
  },
  timerCluster: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  timerAura: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(109,94,247,0.18)",
    opacity: 0.7,
  },
  timerRingOuter: {
    width: 210,
    height: 210,
    borderRadius: 105,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    elevation: 12,
    overflow: "hidden",
  },
  timerRingGradient: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 10,
    borderColor: "rgba(167,183,243,0.16)",
  },
  timerRingInner: {
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 8,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
  },
  timerLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  timerText: {
    fontSize: 38,
    fontWeight: "900",
    color: COLORS.textPrimary,
  },
  timerHint: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  timerButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  statsSection: {
    marginTop: SPACING.lg,
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: 999,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: COLORS.accent,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  settingsBlock: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  toggleRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.75)",
  },
  toggleButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(109,94,247,0.2)",
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  toggleTextActive: {
    color: COLORS.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  inputField: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    backgroundColor: "rgba(15,23,42,0.7)",
    fontSize: 14,
    fontWeight: "600",
  },
  todoCard: {
    marginTop: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  todoText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  sessionList: {
    gap: SPACING.sm,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(109,94,247,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sessionMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
