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
  Animated,
  InteractionManager,
  Modal,
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

  // Helper functions for input validation and conversion
  const formatNumericInput = (value: string): string => {
    // Remove all non-digit characters
    return value.replace(/[^0-9]/g, "");
  };

  const handleNormalMinutesBlur = (value: string) => {
    const numericValue = parseInt(value, 10);
    if (isNaN(numericValue)) {
      setNormalMinutesInput("0");
      return;
    }

    if (numericValue >= 60) {
      const extraHours = Math.floor(numericValue / 60);
      const remainingMinutes = numericValue % 60;

      // Update hours
      const currentHours = parseInt(normalHoursInput, 10) || 0;
      setNormalHoursInput(String(currentHours + extraHours));

      // Update minutes to the remainder
      setNormalMinutesInput(String(remainingMinutes));
    }
  };

  const handleNumericInput = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    setter(formatNumericInput(value));
  };

  const [isRunning, setIsRunning] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [sessionListContentHeight, setSessionListContentHeight] = useState(0);
  const [sessionListVisibleHeight, setSessionListVisibleHeight] = useState(0);
  const styles = useMemo(
    () => createStyles(COLORS, isOnBreak),
    [COLORS, isOnBreak],
  );
  const secondsLeftRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const studySecondsRef = useRef(0);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [loadingTodaySessions, setLoadingTodaySessions] = useState(false);

  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<StudySession | null>(null);

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
    } else if ((activeTab === "normal" || activeTab === "pomodoro") && currentUsername) {
      loadSessions();
    }
  }, [activeTab, currentUsername, loadSessions]);

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

  // Pulse animation effect when timer is running
  useEffect(() => {
    if (!isRunning) {
      pulseAnim.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      pulseAnim.setValue(0);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = setInterval(() => {
      if (activeTab === "normal") {
        if (normalMode === "countup") {
          elapsedSecondsRef.current += 1;
          bumpStudySeconds(studySecondsRef, () => {});
          setDisplaySeconds(elapsedSecondsRef.current);
          return;
        }

        bumpStudySeconds(studySecondsRef, () => {});
        secondsLeftRef.current -= 1;
        
        if (secondsLeftRef.current <= 0) {
          finalizeSession();
          return;
        }
        
        setDisplaySeconds(secondsLeftRef.current);
        return;
      }

      if (activeTab === "pomodoro") {
        secondsLeftRef.current -= 1;
        
        if (secondsLeftRef.current <= 0) {
          setIsOnBreak((onBreak) => {
            if (onBreak) {
              // Break ended, start next focus cycle
              setCurrentCycle((cycle) => cycle + 1);
              secondsLeftRef.current = focusMinutes * 60;
              return false;
            }
            // Focus ended
            setCurrentCycle((cycle) => {
              if (cycle >= totalCycles) {
                // Last cycle completed, finalize session
                finalizeSession();
              }
              return cycle;
            });
            secondsLeftRef.current = breakMinutes * 60;
            return true;
          });
        } else if (!isOnBreak) {
          bumpStudySeconds(studySecondsRef, () => {});
        }
        
        setDisplaySeconds(secondsLeftRef.current);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab, isRunning, normalMode, focusMinutes, breakMinutes, totalCycles, isOnBreak]);

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

  const timerLabel = useMemo(() => {
    if (activeTab === "normal") {
      return normalMode === "countup" ? "Focus" : "Time left";
    }
    if (activeTab === "pomodoro") {
      return isOnBreak ? "Break" : "Focus";
    }
    return "Coming soon";
  }, [activeTab, isOnBreak, normalMode]);

  const timerHint = useMemo(() => {
    if (activeTab === "pomodoro") {
      return `Round • ${currentCycle} / ${totalCycles}`;
    }
    if (activeTab === "normal" && normalMode === "countdown") {
      return "Countdown mode";
    }
    if (activeTab === "normal") {
      return "Count up mode";
    }
    return "TO DO";
  }, [activeTab, currentCycle, normalMode, totalCycles]);

  const finishedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.mode === "normal" || s.mode === "pomodoro")
        .sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        ),
    [sessions],
  );

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
        if (secondsLeftRef.current === 0) {
          secondsLeftRef.current = normalTargetSeconds;
          setDisplaySeconds(normalTargetSeconds);
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
      if (secondsLeftRef.current === 0) {
        setCurrentCycle(1);
        setIsOnBreak(false);
        secondsLeftRef.current = focusMinutes * 60;
        setDisplaySeconds(focusMinutes * 60);
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
    secondsLeftRef.current = 0;
    elapsedSecondsRef.current = 0;
    setDisplaySeconds(0);
    setCurrentCycle(1);
    setSessionStartedAt(null);
    studySecondsRef.current = 0;
  };

  const applySelectedSessionToTimer = (session: StudySession) => {
    const selectedMinutes = Math.max(
      1,
      Math.round(session.focus_minutes ?? session.duration_minutes),
    );

    if (session.mode === "pomodoro") {
      setActiveTab("pomodoro");
      setPomodoroFocusInput(String(selectedMinutes));
      if ((session.break_minutes ?? 0) > 0) {
        setPomodoroBreakInput(String(session.break_minutes));
      }
      if ((session.cycles ?? 0) > 0) {
        setPomodoroCyclesInput(String(session.cycles));
      }

      // Apply directly to live timer so selection is reflected immediately.
      setIsOnBreak(false);
      setCurrentCycle(1);
      secondsLeftRef.current = selectedMinutes * 60;
      setDisplaySeconds(selectedMinutes * 60);
      return;
    }

    setActiveTab("normal");
    setNormalMode("countdown");
    const hours = Math.floor(selectedMinutes / 60);
    const minutes = selectedMinutes % 60;
    setNormalHoursInput(String(hours));
    setNormalMinutesInput(String(minutes));

    // Apply directly to live timer so selection is reflected immediately.
    secondsLeftRef.current = selectedMinutes * 60;
    setDisplaySeconds(selectedMinutes * 60);
  };

  const startFromSelectedSession = () => {
    if (!sessionStartedAt) {
      setSessionStartedAt(new Date().toISOString());
    }
    setIsRunning(true);
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

    const today = new Date().toISOString().split("T")[0];
    const timerType =
      selectedSession?.timer_type ??
      selectedSession?.course_name ??
      (activeTab === "pomodoro" ? "pomodoro" : normalMode);

    // If the user studied a selected scheduled session, log elapsed study time directly to history.
    if (selectedSession) {
      handleReset();
      createStudyHistory({
        course_name: timerType.charAt(0).toUpperCase() + timerType.slice(1),
        study_duration: durationMinutes,
        date: today,
        study_session_id: selectedSession.session_id,
      });
      setSelectedSession(null);
      return;
    }

    const payload: StudySessionCreate = {
      username: currentUsername,
      course_name: timerType,
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

    recordSession(payload, () => {
      createStudyHistory({
        course_name: timerType.charAt(0).toUpperCase() + timerType.slice(1),
        study_duration: durationMinutes,
        date: today,
      });
      loadSessions();
    });
  };

  const primaryActionLabel = isRunning
    ? "Pause"
    : displaySeconds > 0
      ? "Resume"
      : "Start";

  const hasSessionActivity = studySecondsRef.current > 0 || elapsedSecondsRef.current > 0;
  const secondaryActionLabel = "Finish";

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
          <View style={styles.segmentedControl}>
            <Pressable
              style={[
                styles.segmentButton,
                activeTab === "normal" && styles.segmentButtonActive,
                isRunning &&
                  activeTab !== "normal" &&
                  styles.segmentButtonDisabled,
              ]}
              onPress={() => setActiveTab("normal")}
              disabled={isRunning && activeTab !== "normal"}
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
                isRunning &&
                  activeTab !== "pomodoro" &&
                  styles.segmentButtonDisabled,
              ]}
              onPress={() => setActiveTab("pomodoro")}
              disabled={isRunning && activeTab !== "pomodoro"}
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
                isRunning && styles.segmentButtonDisabled,
              ]}
              onPress={() => setActiveTab("streak")}
              disabled={isRunning}
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

          {/* Course selection modal shown when starting a fresh session */}
          <Modal
            visible={courseModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCourseModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select a course</Text>

                <ScrollView style={{ maxHeight: 320 }}>
                  <Pressable
                    style={styles.optionItem}
                    onPress={() => {
                      setCourseModalVisible(false);
                      setSelectedSession(null); // free session
                      InteractionManager.runAfterInteractions(() => {
                        handleStart();
                      });
                    }}
                  >
                    <Text style={styles.optionText}>Free session</Text>
                    <Text style={styles.optionMeta}>No course • Free</Text>
                  </Pressable>

                  {loadingTodaySessions ? (
                    <Text style={[styles.emptyText, { padding: 12 }]}>Loading...</Text>
                  ) : todaySessions.length === 0 ? (
                    <Text style={[styles.emptyText, { padding: 12 }]}>No sessions today</Text>
                  ) : (
                    todaySessions
                      .sort((a, b) =>
                        new Date(b.started_at).getTime() -
                        new Date(a.started_at).getTime(),
                      )
                      .map((session) => (
                        <Pressable
                          key={session.session_id}
                          style={styles.optionItem}
                          onPress={() => {
                            setCourseModalVisible(false);
                            setSelectedSession(session);
                            applySelectedSessionToTimer(session);
                            InteractionManager.runAfterInteractions(() => {
                              // Avoid stale-state countdown validation after switching from count up.
                              startFromSelectedSession();
                            });
                          }}
                        >
                          <Text style={styles.optionText}>
                            {(session.timer_type ?? session.course_name ?? "")
                              ? (session.timer_type ?? session.course_name ?? "")
                                  .charAt(0)
                                  .toUpperCase() +
                                (session.timer_type ?? session.course_name ?? "").slice(1)
                              : session.mode === "pomodoro"
                              ? "Pomodoro"
                              : "Focus"}
                          </Text>
                          <Text style={styles.optionMeta}>
                            {session.focus_minutes
                              ? `${session.focus_minutes} min focus`
                              : `${Math.round(session.duration_minutes)} min`}
                          </Text>
                        </Pressable>
                      ))
                  )}
                </ScrollView>

                <Pressable
                  style={styles.modalCloseButton}
                  onPress={() => setCourseModalVisible(false)}
                >
                  <Text style={styles.modalCloseButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

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
                  <Animated.View
                    style={[
                      styles.timerPulseRing,
                      {
                        transform: [
                          {
                            scale: pulseAnim.interpolate({
                              inputRange: [0, 1.5],
                              outputRange: [0.8, 1.6],
                            }),
                          },
                        ],
                        opacity: pulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.45, 0],
                        }),
                      },
                    ]}
                  />
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
                      isRunning &&
                        activeTab === "normal" &&
                        styles.toggleButtonDisabled,
                    ]}
                    onPress={() => setNormalMode("countup")}
                    disabled={isRunning && activeTab === "normal"}
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
                      isRunning &&
                        activeTab === "normal" &&
                        styles.toggleButtonDisabled,
                    ]}
                    onPress={() => setNormalMode("countdown")}
                    disabled={isRunning && activeTab === "normal"}
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
                        onChangeText={(value) =>
                          handleNumericInput(value, setNormalHoursInput)
                        }
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
                        onChangeText={(value) =>
                          handleNumericInput(value, setNormalMinutesInput)
                        }
                        onBlur={() =>
                          handleNormalMinutesBlur(normalMinutesInput)
                        }
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
                      onChangeText={(value) =>
                        handleNumericInput(value, setPomodoroFocusInput)
                      }
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
                      onChangeText={(value) =>
                        handleNumericInput(value, setPomodoroBreakInput)
                      }
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
                      onChangeText={(value) =>
                        handleNumericInput(value, setPomodoroCyclesInput)
                      }
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
                  onPress={async () => {
                    if (isRunning) {
                      handlePause();
                      return;
                    }

                    // If we already have time on the clock, treat as resume
                    if (displaySeconds > 0) {
                      handleStart();
                      return;
                    }

                    // Starting a fresh session -> fetch today's sessions from DB and show modal
                    if (!currentUsername) {
                      Alert.alert("Missing user", "Please login again.");
                      return;
                    }
                    setLoadingTodaySessions(true);
                    setCourseModalVisible(true);
                    try {
                      const resp = await fetch(
                        `${API_BASE_URL}/study-sessions/${encodeURIComponent(currentUsername)}/scheduled-today`,
                      );
                      if (!resp.ok) throw new Error("Failed to load sessions");
                      const data = (await resp.json()) as StudySession[];
                      setTodaySessions(data);
                    } catch (e) {
                      setTodaySessions([]);
                    } finally {
                      setLoadingTodaySessions(false);
                    }
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {primaryActionLabel}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.secondaryButton,
                    !hasSessionActivity ? styles.secondaryButtonDisabled : null,
                  ]}
                  onPress={finalizeSession}
                  disabled={!hasSessionActivity}
                >
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      !hasSessionActivity
                        ? styles.secondaryButtonTextDisabled
                        : null,
                    ]}
                  >
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
              ) : finishedSessions.length === 0 ? (
                <Text style={styles.emptyText}>No finished sessions yet</Text>
              ) : (
                <View style={styles.sessionListContainer}>
                  <Animated.ScrollView
                    style={styles.sessionListScroll}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                      {
                        useNativeDriver: false,
                        listener: (event) => {
                          const {
                            layoutMeasurement,
                            contentOffset,
                            contentSize,
                          } = event.nativeEvent as {
                            layoutMeasurement: { height: number };
                            contentOffset: { y: number };
                            contentSize: { height: number };
                          };
                          setSessionListVisibleHeight(layoutMeasurement.height);
                          setSessionListContentHeight(contentSize.height);
                        },
                      },
                    )}
                    onLayout={(event) => {
                      setSessionListVisibleHeight(
                        event.nativeEvent.layout.height,
                      );
                    }}
                    scrollEventThrottle={16}
                  >
                    <View
                      onLayout={(event) => {
                        setSessionListContentHeight(
                          event.nativeEvent.layout.height,
                        );
                      }}
                    >
                      {finishedSessions.map((session) => (
                          <Pressable
                            key={session.session_id}
                            onPress={() => {
                              if (selectedSession?.session_id === session.session_id) {
                                setSelectedSession(null);
                                return;
                              }
                              setSelectedSession(session);
                              applySelectedSessionToTimer(session);
                            }}
                            style={[
                              styles.sessionItem,
                              selectedSession?.session_id === session.session_id &&
                                styles.sessionItemSelected,
                            ]}
                          >
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
                              <Text
                                style={[styles.sessionName]}
                              >
                                {session.timer_type || session.course_name
                                  ? (session.timer_type ?? session.course_name ?? "")
                                      .charAt(0)
                                      .toUpperCase() +
                                    (session.timer_type ?? session.course_name ?? "").slice(1)
                                  : session.mode === "pomodoro"
                                    ? "Pomodoro"
                                    : "Focus"}
                              </Text>
                              <Text style={styles.sessionMeta}>
                                {formatDuration(session.duration_minutes)} •{" "}
                                {formatDateTime(session.started_at)}
                              </Text>
                              {session.focus_minutes && (
                                <Text style={styles.sessionMeta}>
                                  Focus: {session.focus_minutes} min
                                </Text>
                              )}
                              {selectedSession?.session_id === session.session_id && (
                                <Text style={styles.sessionSelectedText}>
                                  Selected for timer
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        ))}
                    </View>
                  </Animated.ScrollView>
                  {sessionListContentHeight > sessionListVisibleHeight && (
                    <View style={styles.scrollbarTrack}>
                      <Animated.View
                        style={[
                          styles.scrollbarThumb,
                          {
                            top: scrollY.interpolate({
                              inputRange: [
                                0,
                                sessionListContentHeight -
                                  sessionListVisibleHeight,
                              ],
                              outputRange: [0, sessionListVisibleHeight - 30],
                              extrapolate: "clamp",
                            }),
                          },
                        ]}
                      />
                    </View>
                  )}
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
  course_name?: string | null;
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
  course_name?: string;
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

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

const isSessionToday = (session: StudySession): boolean => {
  const sessionDate = session.started_at.split("T")[0];
  const todayDate = getTodayDate();
  return sessionDate === todayDate;
};

const createStudyHistory = async (payload: {
  course_name: string;
  study_duration: number;
  date: string;
  study_session_id?: number;
}) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/study-sessions/history`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to create study history");
    }
  } catch (error) {
    console.error("Error creating study history:", error);
  }
};

const createStyles = (COLORS: ThemeColors, isOnBreak: boolean) =>
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
      backgroundColor: isOnBreak
        ? "rgba(119,221,119,0.18)"
        : "rgba(109,94,247,0.18)",
      opacity: 0.7,
    },
    timerPulseRing: {
      position: "absolute",
      width: 210,
      height: 210,
      borderRadius: 105,
      borderWidth: 4,
      borderColor: isOnBreak ? "#77dd77" : COLORS.accent,
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
      borderColor: isOnBreak
        ? "rgba(119,221,119,0.3)"
        : "rgba(167,183,243,0.16)",
    },
    timerRingInner: {
      width: 178,
      height: 178,
      borderRadius: 89,
      borderWidth: 8,
      borderColor: isOnBreak ? "#77dd77" : COLORS.accent,
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
    secondaryButtonDisabled: {
      opacity: 0.45,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    secondaryButtonTextDisabled: {
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
    segmentButtonDisabled: {
      opacity: 0.5,
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
    toggleButtonDisabled: {
      opacity: 0.5,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: "700",
      color: COLORS.textSecondary,
    },
    toggleTextActive: {
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
    emptyText: {
      fontSize: 13,
      color: COLORS.textMuted,
    },
    sessionList: {
      gap: SPACING.sm,
    },
    sessionListContainer: {
      position: "relative",
      maxHeight: 300,
      minHeight: 40,
    },
    sessionListScroll: {
      maxHeight: 300,
    },
    scrollbarTrack: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 10,
      borderRadius: 3,
      opacity: 0.3,
    },
    scrollbarThumb: {
      position: "absolute",
      right: 0,
      width: 10,
      backgroundColor: COLORS.accent,
      borderRadius: 6,
      minHeight: 30,
      maxHeight: 100,
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
    sessionItemSelected: {
      borderColor: COLORS.accent,
      backgroundColor: "rgba(109,94,247,0.12)",
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
    sessionSelectedText: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: "700",
      color: COLORS.accent,
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
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    modalContent: {
      width: "100%",
      maxWidth: 480,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: COLORS.textPrimary,
      marginBottom: SPACING.sm,
    },
    optionItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      backgroundColor: COLORS.card,
      marginBottom: SPACING.sm,
    },
    optionText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    optionMeta: {
      fontSize: 12,
      color: COLORS.textSecondary,
    },
    modalCloseButton: {
      marginTop: SPACING.sm,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.subtleCard,
    },
    modalCloseButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
  });
