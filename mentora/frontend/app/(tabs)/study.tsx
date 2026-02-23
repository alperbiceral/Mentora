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
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/theme";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

const SPACING = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export default function StudyScreen() {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

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

  // Streak Question state
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestion | null>(
    null,
  );
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [showQuestionUI, setShowQuestionUI] = useState(false);
  const [questionTimer, setQuestionTimer] = useState(15);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [streakCount, setStreakCount] = useState(0);

  const studySecondsRef = useRef(0);
  const questionStartTimeRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (activeTab === "streak" && currentUsername) {
      loadDailyQuestion();
      loadStreak();
    }
  }, [activeTab, currentUsername]);

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

  // Timer for streak question
  useEffect(() => {
    if (showQuestionUI && questionTimer > 0 && !answerResult) {
      const timer = setInterval(() => {
        setQuestionTimer((prev) => {
          if (prev <= 1) {
            // Time's up - auto submit wrong answer
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [showQuestionUI, questionTimer, answerResult]);

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

  // Streak Question Functions
  const loadDailyQuestion = async () => {
    if (!currentUsername) return;

    setLoadingQuestion(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/daily-question/${encodeURIComponent(currentUsername)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load question");
      }
      const data = (await response.json()) as DailyQuestion;
      setDailyQuestion(data);

      // If already answered, show result immediately
      if (data.answered) {
        setAnswerResult({
          correct: data.is_correct ?? false,
          correct_answer: "",
          streak_updated: false,
          new_streak: streakCount,
          response_time: 0,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to load daily question");
    } finally {
      setLoadingQuestion(false);
    }
  };

  const loadStreak = async () => {
    if (!currentUsername) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/daily-question/streak/${encodeURIComponent(currentUsername)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load streak");
      }
      const data = await response.json();
      setStreakCount(data.streak_count);
    } catch (error) {
      // Silent fail
    }
  };

  const handleStartQuestion = () => {
    if (!dailyQuestion || dailyQuestion.answered) return;

    setShowQuestionUI(true);
    setQuestionTimer(15);
    setSelectedOption(null);
    setAnswerResult(null);
    questionStartTimeRef.current = Date.now();
  };

  const handleSelectOption = (option: string) => {
    if (answerResult) return; // Already answered
    setSelectedOption(option);
  };

  const handleSubmitAnswer = async () => {
    if (!selectedOption || !dailyQuestion || !questionStartTimeRef.current)
      return;

    const responseTime = (Date.now() - questionStartTimeRef.current) / 1000;

    setIsAnswering(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/daily-question/${dailyQuestion.question_id}/answer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selected_answer: selectedOption,
            response_time_seconds: responseTime,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to submit answer");
      }

      const result = (await response.json()) as AnswerResult;
      setAnswerResult(result);
      setStreakCount(result.new_streak);

      // Show result message
      if (result.correct && responseTime <= 15) {
        Alert.alert("🎉 Correct!", `Great job! Streak: ${result.new_streak}`);
      } else if (result.correct) {
        Alert.alert(
          "⏱️ Too Slow",
          "Correct answer, but time's up! Streak reset.",
        );
      } else {
        Alert.alert(
          "❌ Wrong Answer",
          `Correct answer was ${result.correct_answer}. Streak reset.`,
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to submit answer");
    } finally {
      setIsAnswering(false);
    }
  };

  const handleTimeUp = () => {
    if (!dailyQuestion || answerResult) return;

    // Auto-select wrong answer to reset streak
    const wrongAnswer = selectedOption || "A";
    const responseTime = 16; // Over time limit

    setIsAnswering(true);
    fetch(
      `${API_BASE_URL}/daily-question/${dailyQuestion.question_id}/answer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_answer: wrongAnswer,
          response_time_seconds: responseTime,
        }),
      },
    )
      .then((response) => response.json())
      .then((result: AnswerResult) => {
        setAnswerResult(result);
        setStreakCount(result.new_streak);
        Alert.alert(
          "⏱️ Time's Up!",
          `Streak reset. Correct answer was ${result.correct_answer}`,
        );
      })
      .catch(() => {
        Alert.alert("Error", "Failed to submit answer");
      })
      .finally(() => {
        setIsAnswering(false);
      });
  };

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
            {activeTab !== "streak" && (
              <>
                <Text style={styles.sessionTitle}>
                  {activeTab === "normal" ? "Focus" : "Pomodoro"}
                </Text>
                <Text style={styles.sessionSubtitle}>
                  {activeTab === "normal"
                    ? "Count up or set a countdown."
                    : "Auto-switch between focus and break."}
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
              </>
            )}

            {activeTab === "streak" && (
              <>
                <Text style={styles.sessionTitle}>Daily Question</Text>
                <Text style={styles.sessionSubtitle}>
                  Answer correctly in 15 seconds to keep your streak!
                </Text>
              </>
            )}

            {activeTab === "streak" ? (
              loadingQuestion ? (
                <View style={styles.questionLoadingContainer}>
                  <Text style={styles.questionLoadingText}>Loading...</Text>
                </View>
              ) : !dailyQuestion ? (
                <View style={styles.questionLoadingContainer}>
                  <Text style={styles.questionLoadingText}>
                    No question available
                  </Text>
                </View>
              ) : dailyQuestion.answered ? (
                <View style={styles.questionResultContainer}>
                  <Ionicons
                    name={
                      dailyQuestion.is_correct
                        ? "checkmark-circle"
                        : "close-circle"
                    }
                    size={48}
                    color={dailyQuestion.is_correct ? "#10B981" : "#EF4444"}
                  />
                  <Text style={styles.questionResultTitle}>
                    {dailyQuestion.is_correct
                      ? "Correct! ✅"
                      : "Wrong Answer ❌"}
                  </Text>
                  <Text style={styles.questionResultSubtitle}>
                    Come back tomorrow for next question! 🌟
                  </Text>
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame" size={20} color="#F59E0B" />
                    <Text style={styles.streakText}>Streak: {streakCount}</Text>
                  </View>
                </View>
              ) : !showQuestionUI ? (
                <View style={styles.streakMainContainer}>
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame" size={20} color="#F59E0B" />
                    <Text style={styles.streakText}>Streak: {streakCount}</Text>
                  </View>
                  <Pressable
                    style={[
                      styles.bigAnswerButton,
                      loadingQuestion && styles.bigAnswerButtonDisabled,
                    ]}
                    onPress={handleStartQuestion}
                    disabled={loadingQuestion}
                  >
                    <Text style={styles.bigAnswerButtonText}>
                      {loadingQuestion ? "Loading..." : "Answer"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.questionContainer}>
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame" size={16} color="#F59E0B" />
                    <Text style={styles.streakText}>Streak: {streakCount}</Text>
                  </View>

                  <View style={styles.timerBadge}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={
                        questionTimer <= 5 ? "#EF4444" : COLORS.textPrimary
                      }
                    />
                    <Text
                      style={[
                        styles.questionTimerText,
                        questionTimer <= 5 && styles.timerTextUrgent,
                      ]}
                    >
                      {questionTimer}s
                    </Text>
                  </View>

                  <Text style={styles.questionText}>
                    {dailyQuestion.question_text}
                  </Text>

                  <View style={styles.optionsContainer}>
                    {[
                      { key: "A", label: dailyQuestion.option_a },
                      { key: "B", label: dailyQuestion.option_b },
                      { key: "C", label: dailyQuestion.option_c },
                      { key: "D", label: dailyQuestion.option_d },
                    ].map((option) => (
                      <Pressable
                        key={option.key}
                        style={[
                          styles.optionButton,
                          selectedOption === option.key &&
                            styles.optionButtonSelected,
                          answerResult &&
                            answerResult.correct_answer === option.key &&
                            styles.optionButtonCorrect,
                          answerResult &&
                            selectedOption === option.key &&
                            !answerResult.correct &&
                            styles.optionButtonWrong,
                        ]}
                        onPress={() => handleSelectOption(option.key)}
                        disabled={!!answerResult}
                      >
                        <View style={styles.optionKeyCircle}>
                          <Text style={styles.optionKeyText}>{option.key}</Text>
                        </View>
                        <Text style={styles.optionLabel}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {!answerResult && (
                    <Pressable
                      style={[
                        styles.submitButton,
                        (!selectedOption || isAnswering) &&
                          styles.submitButtonDisabled,
                      ]}
                      onPress={handleSubmitAnswer}
                      disabled={!selectedOption || isAnswering}
                    >
                      <Text style={styles.submitButtonText}>
                        {isAnswering ? "Submitting..." : "Submit Answer"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )
            ) : activeTab === "normal" ? (
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

            {activeTab === "streak" ? null : (
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

          {activeTab !== "streak" && (
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
          )}
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

type DailyQuestion = {
  question_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  answered: boolean;
  is_correct: boolean | null;
  selected_answer: string | null;
};

type AnswerResult = {
  correct: boolean;
  correct_answer: string;
  streak_updated: boolean;
  new_streak: number;
  response_time: number;
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

const createStyles = (COLORS: ThemeColors) =>
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
    height: "100%",
    backgroundColor: COLORS.background,
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: COLORS.backgroundAlt,
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
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.subtleCard,
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
    backgroundColor: COLORS.subtleCard,
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
    backgroundColor: COLORS.subtleCard,
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
    backgroundColor: COLORS.subtleCard,
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
    backgroundColor: COLORS.inputBg,
    fontSize: 14,
    fontWeight: "600",
  },
  todoCard: {
    marginTop: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.card,
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
  questionLoadingContainer: {
    marginTop: SPACING.lg,
    padding: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  questionLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  questionResultContainer: {
    marginTop: SPACING.lg,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.sm,
  },
  questionResultTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  questionResultSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  streakMainContainer: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
  },
  bigAnswerButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 8,
    borderColor: "rgba(109,94,247,0.3)",
  },
  bigAnswerButtonText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  bigAnswerButtonDisabled: {
    opacity: 0.6,
  },
  answerButton: {
    marginTop: SPACING.lg,
    height: 56,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  answerButtonText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  questionContainer: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  streakText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F59E0B",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(109,94,247,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  questionTimerText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  timerTextUrgent: {
    color: "#EF4444",
  },
  questionText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    lineHeight: 22,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  optionsContainer: {
    gap: SPACING.sm,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderSubtle,
    backgroundColor: COLORS.card,
  },
  optionButtonSelected: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(109,94,247,0.15)",
  },
  optionButtonCorrect: {
    borderColor: COLORS.success,
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  optionButtonWrong: {
    borderColor: COLORS.danger,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  optionKeyCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  optionKeyText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: SPACING.sm,
    height: 48,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
