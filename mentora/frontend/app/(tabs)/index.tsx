import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LottieView from "lottie-react-native";
import {
  SettingsLanguage,
  SettingsModal,
} from "../../components/SettingsModal";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/theme";

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const FRIENDS_LAST_SEEN_KEY = "mentora.friendsNotifLastSeenAt";
const GROUPS_LAST_SEEN_KEY = "mentora.groupsNotifLastSeenAt";
const CHATS_LAST_SEEN_KEY = "mentora.chatsNotifLastSeenAt";
const CHAT_LAST_SEEN_KEY = "mentora.chatLastSeenByThread";
const AI_ROBOT_ANIMATION = require("../../assets/lottie/mentora_ai_friendly.json");

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

type LeaderboardEntry = {
  rank: number;
  username: string;
  full_name: string;
  university?: string | null;
  study_hours: number;
  streak_count: number;
  profile_photo?: string | null;
};

type FriendRequest = {
  request_id: number;
  from_username: string;
  to_username: string;
  status: string;
  created_at: string;
};

type FriendRequestsList = {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

type GroupInviteItem = {
  invite_id: number;
  group_id: number;
  group_name: string;
  group_photo?: string | null;
  from_username: string;
  to_username: string;
  status: string;
  created_at: string;
};

type GroupJoinRequestItem = {
  request_id: number;
  group_id: number;
  group_name: string;
  group_photo?: string | null;
  username: string;
  status: string;
  created_at: string;
};

type GroupRequestsList = {
  incoming_invites: GroupInviteItem[];
  outgoing_invites: GroupInviteItem[];
  incoming_join_requests: GroupJoinRequestItem[];
  outgoing_join_requests: GroupJoinRequestItem[];
};

type NotificationTab = "friends" | "groups";

export default function HomeScreen() {
  const { colors: COLORS, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [language, setLanguage] = useState<SettingsLanguage>("English");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] =
    useState<NotificationTab>("friends");
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequestsList>({
    incoming: [],
    outgoing: [],
  });
  const [groupRequests, setGroupRequests] = useState<GroupRequestsList>({
    incoming_invites: [],
    outgoing_invites: [],
    incoming_join_requests: [],
    outgoing_join_requests: [],
  });
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
  const [streakRank, setStreakRank] = useState<number | null>(null);
  const [hoursRank, setHoursRank] = useState<number | null>(null);

  const headerTitle = useMemo(() => {
    if (!profile) {
      return "Create your profile";
    }
    return profile.full_name || profile.username;
  }, [profile]);

  const headerSubtitle = useMemo(() => {
    if (!profile) {
      return "Tap to set up your profile";
    }
    return profile.university || `@${profile.username}`;
  }, [profile]);

  const loadProfile = useCallback(() => {
    let active = true;
    const run = async () => {
      setProfileLoading(true);
      try {
        const storedUsername = await AsyncStorage.getItem("mentora.username");
        if (!storedUsername) {
          if (active) {
            setProfile(null);
          }
          return;
        }

        const response = await fetch(
          `${API_BASE_URL}/profile/${storedUsername}`,
        );
        if (!response.ok) {
          if (response.status === 404) {
            if (active) {
              setProfile(null);
            }
            return;
          }
          throw new Error("Profile fetch failed");
        }

        const data = (await response.json()) as Profile;
        if (active) {
          setProfile(data);
        }
      } catch (error) {
        if (active) {
          setProfile(null);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadProfile);

  useEffect(() => {
    async function loadRanks() {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) return;

        const [streakRes, hoursRes] = await Promise.all([
          fetch(`${API_BASE_URL}/profile/leaderboard?metric=streak&limit=50`),
          fetch(`${API_BASE_URL}/profile/leaderboard?metric=hours&limit=50`),
        ]);

        if (streakRes.ok) {
          const data = (await streakRes.json()) as LeaderboardEntry[];
          const me = data.find((e) => e.username === username);
          setStreakRank(me?.rank ?? null);
        }
        if (hoursRes.ok) {
          const data = (await hoursRes.json()) as LeaderboardEntry[];
          const me = data.find((e) => e.username === username);
          setHoursRank(me?.rank ?? null);
        }
      } catch { /* ignore */ }
    }
    loadRanks();
  }, [profile]);

  const toTimestampMs = useCallback((value?: string | null) => {
    if (!value) {
      return 0;
    }
    const hasTimezone = /[Zz]|[+-]\d{2}:\d{2}$/.test(value);
    const date = new Date(hasTimezone ? value : value + "Z");
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }, []);

  const fetchBadgeCount = useCallback(async () => {
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setCurrentUsername(null);
        setNotificationBadgeCount(0);
        return;
      }
      setCurrentUsername(username);
      const [friendSince, groupSince, chatSince] = await Promise.all([
        AsyncStorage.getItem(FRIENDS_LAST_SEEN_KEY).then((v) => Number(v) || 0),
        AsyncStorage.getItem(GROUPS_LAST_SEEN_KEY).then((v) => Number(v) || 0),
        AsyncStorage.getItem(CHATS_LAST_SEEN_KEY).then((v) => Number(v) || 0),
      ]);
      const res = await fetch(
        `${API_BASE_URL}/notifications/counts/${encodeURIComponent(username)}?friend_since=${friendSince}&group_since=${groupSince}&chat_since=${chatSince}`,
      );
      if (res.ok) {
        const data = await res.json();
        setNotificationBadgeCount(
          (data.friend_requests ?? 0) + (data.group_invites ?? 0),
        );
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchNotificationDetails = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setFriendRequests({ incoming: [], outgoing: [] });
        setGroupRequests({
          incoming_invites: [],
          outgoing_invites: [],
          incoming_join_requests: [],
          outgoing_join_requests: [],
        });
        return;
      }

      const [friendsRes, groupsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/friends/requests/${username}`),
        fetch(
          `${API_BASE_URL}/groups/requests/${encodeURIComponent(username)}`,
        ),
      ]);

      if (friendsRes.ok) {
        const data = (await friendsRes.json()) as FriendRequestsList;
        setFriendRequests({
          incoming: data.incoming ?? [],
          outgoing: data.outgoing ?? [],
        });
      } else {
        setFriendRequests({ incoming: [], outgoing: [] });
      }

      if (groupsRes.ok) {
        const data = (await groupsRes.json()) as GroupRequestsList;
        setGroupRequests({
          incoming_invites: data.incoming_invites ?? [],
          outgoing_invites: data.outgoing_invites ?? [],
          incoming_join_requests: data.incoming_join_requests ?? [],
          outgoing_join_requests: data.outgoing_join_requests ?? [],
        });
      } else {
        setGroupRequests({
          incoming_invites: [],
          outgoing_invites: [],
          incoming_join_requests: [],
          outgoing_join_requests: [],
        });
      }

    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }
    fetchNotificationDetails();
  }, [notificationsOpen, fetchNotificationDetails]);

  useFocusEffect(
    useCallback(() => {
      fetchBadgeCount();
    }, [fetchBadgeCount]),
  );

  const markTabSeen = useCallback(
    async (tab: NotificationTab) => {
      const keyMap: Record<NotificationTab, string> = {
        friends: FRIENDS_LAST_SEEN_KEY,
        groups: GROUPS_LAST_SEEN_KEY,
      };
      await AsyncStorage.setItem(keyMap[tab], String(Date.now()));
      await fetchBadgeCount();
    },
    [fetchBadgeCount],
  );

  const handleOpenNotifications = async () => {
    setNotificationTab("friends");
    setNotificationsOpen(true);
    await markTabSeen("friends");
  };

  const friendTabCount = useMemo(
    () => friendRequests.incoming.length + friendRequests.outgoing.length,
    [friendRequests.incoming.length, friendRequests.outgoing.length],
  );
  const groupTabCount = useMemo(
    () =>
      groupRequests.incoming_invites.length +
      groupRequests.incoming_join_requests.length +
      groupRequests.outgoing_invites.length +
      groupRequests.outgoing_join_requests.length,
    [
      groupRequests.incoming_invites.length,
      groupRequests.incoming_join_requests.length,
      groupRequests.outgoing_invites.length,
      groupRequests.outgoing_join_requests.length,
    ],
  );

  const handleFriendRequestAction = async (
    requestId: number,
    action: "accept" | "decline" | "cancel",
  ) => {
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/friends/requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Request failed");
      }
      await fetchNotificationDetails();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      Alert.alert("Error", message);
    }
  };

  const handleGroupInviteAction = async (
    inviteId: number,
    action: "accept" | "decline",
  ) => {
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/groups/invites/${inviteId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Invite action failed");
      }
      await fetchNotificationDetails();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invite action failed";
      Alert.alert("Error", message);
    }
  };

  const handleJoinRequestAction = async (
    requestId: number,
    action: "approve" | "decline",
  ) => {
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/groups/requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Request action failed");
      }
      await fetchNotificationDetails();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request action failed";
      Alert.alert("Error", message);
    }
  };

  useEffect(() => {
    if (!currentUsername) {
      return;
    }

    const wsUrl = API_BASE_URL.replace(/^http/, "ws").concat(
      `/chat/ws/${currentUsername}`,
    );
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "notification") {
          setNotificationBadgeCount((count) => count + 1);
          return;
        }

        if (payload.type !== "message") {
          return;
        }
        const message = payload.message as {
          thread_id: number;
          sender: string;
          content: string;
          created_at: string;
        };
        if (message.sender === currentUsername) {
          return;
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      // ignore
    };

    return () => {
      ws.close();
    };
  }, [currentUsername]);

  const handleLogout = async () => {
    try {
      const logoutUsername = await AsyncStorage.getItem("mentora.username");
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (logoutUsername) {
        await fetch(
          `${API_BASE_URL}/ai-assistant/history/${encodeURIComponent(logoutUsername)}`,
          { method: "DELETE" },
        ).catch(() => { });
      }
      await AsyncStorage.multiRemove([
        "mentora.username",
        "mentora.email",
        "mentora.token",
        "mentora.personalitySkipped",
        FRIENDS_LAST_SEEN_KEY,
        GROUPS_LAST_SEEN_KEY,
        CHATS_LAST_SEEN_KEY,
        CHAT_LAST_SEEN_KEY,
      ]);
    } catch (error) {
      Alert.alert("Logout failed", "Please try again.");
      return;
    } finally {
      setSettingsOpen(false);
    }

    router.replace("/auth");
  };

  const handleChangePassword = async (
    oldPassword: string,
    newPassword: string,
  ) => {
    const username = await AsyncStorage.getItem("mentora.username");
    if (!username) {
      throw new Error("Missing username");
    }

    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const message = await response.json().catch(() => null);
      throw new Error(message?.detail ?? "Change password failed");
    }
  };

  const [upcomingBlocks, setUpcomingBlocks] = useState<
    { courseName: string; color: string; start: string; end: string; day: string }[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const username = await AsyncStorage.getItem("mentora.username");
          if (!username) return;
          const res = await fetch(`${API_BASE_URL}/courses/${encodeURIComponent(username)}`);
          if (!res.ok) return;
          const courses = await res.json();
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const now = new Date();
          const todayDay = dayNames[now.getDay()];
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const upcoming: typeof upcomingBlocks = [];
          for (const c of courses) {
            for (const b of c.blocks || []) {
              if (b.day !== todayDay) continue;
              const [sh, sm] = b.start.split(":").map(Number);
              const [eh, em] = b.end.split(":").map(Number);
              const startMins = sh * 60 + sm;
              const endMins = eh * 60 + em;
              if (endMins > nowMins && startMins < nowMins + 180) {
                upcoming.push({
                  courseName: (c.name as string).split(" - ")[0]?.trim() || c.name,
                  color: c.color || "#6D5EF7",
                  start: b.start,
                  end: b.end,
                  day: b.day,
                });
              }
            }
          }
          upcoming.sort((a, b2) => {
            const [ah, am] = a.start.split(":").map(Number);
            const [bh, bm] = b2.start.split(":").map(Number);
            return ah * 60 + am - (bh * 60 + bm);
          });
          setUpcomingBlocks(upcoming);
        } catch { /* ignore */ }
      })();
    }, []),
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <HeaderCard
            title={headerTitle}
            subtitle={headerSubtitle}
            profilePhoto={profile?.profile_photo ?? null}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenNotifications={handleOpenNotifications}
            notificationCount={notificationBadgeCount}
            loading={profileLoading}
            colors={COLORS}
            styles={styles}
          />

          <StudyStatsCard profile={profile} streakRank={streakRank} hoursRank={hoursRank} styles={styles} colors={COLORS} />

          <UpcomingSection blocks={upcomingBlocks} styles={styles} colors={COLORS} />

          <QuickActions styles={styles} colors={COLORS} />

          <GreetingCard
            styles={styles}
            colors={COLORS}
            onPress={() => router.push("/ai-agent")}
            displayName={profile?.full_name || profile?.username}
          />

          <RecommendationCard styles={styles} colors={COLORS} />
        </ScrollView>
      </View>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        darkMode={mode === "dark"}
        setDarkMode={(v) => setMode(v ? "dark" : "light")}
        language={language}
        setLanguage={setLanguage}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
      />

      <Modal
        visible={notificationsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNotificationsOpen(false)}
        >
          <Pressable
            style={styles.notificationsCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <Pressable
                style={styles.modalClose}
                onPress={() => setNotificationsOpen(false)}
              >
                <Ionicons name="close" size={16} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.notificationTabsRow}>
              <Pressable
                style={[
                  styles.notificationTab,
                  notificationTab === "friends" && styles.notificationTabActive,
                ]}
                onPress={() => {
                  setNotificationTab("friends");
                  markTabSeen("friends");
                }}
              >
                <Text
                  style={[
                    styles.notificationTabText,
                    notificationTab === "friends" &&
                    styles.notificationTabTextActive,
                  ]}
                >
                  {`Friend requests (${friendTabCount})`}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.notificationTab,
                  notificationTab === "groups" && styles.notificationTabActive,
                ]}
                onPress={() => {
                  setNotificationTab("groups");
                  markTabSeen("groups");
                }}
              >
                <Text
                  style={[
                    styles.notificationTabText,
                    notificationTab === "groups" &&
                    styles.notificationTabTextActive,
                  ]}
                >
                  {`Group requests (${groupTabCount})`}
                </Text>
              </Pressable>

            </View>

            <ScrollView
              style={styles.notificationsScroll}
              contentContainerStyle={styles.notificationsContent}
              showsVerticalScrollIndicator={false}
            >
              {notificationsLoading ? (
                <Text style={styles.emptyText}>Loading notifications...</Text>
              ) : null}

              {!notificationsLoading && notificationTab === "friends" ? (
                <View style={styles.notificationSection}>
                  <Text style={styles.sectionTitle}>Incoming</Text>
                  {friendRequests.incoming.length === 0 ? (
                    <Text style={styles.emptyText}>No incoming requests.</Text>
                  ) : (
                    friendRequests.incoming.map((request) => (
                      <View
                        key={request.request_id}
                        style={styles.notificationItem}
                      >
                        <View style={styles.notificationInfo}>
                          <Text style={styles.notificationTitle}>
                            @{request.from_username}
                          </Text>
                          <Text style={styles.notificationSubtitle}>
                            sent you a friend request
                          </Text>
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable
                            style={styles.actionButtonPrimary}
                            onPress={() =>
                              handleFriendRequestAction(
                                request.request_id,
                                "accept",
                              )
                            }
                          >
                            <Text style={styles.actionButtonTextPrimary}>
                              Accept
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.actionButton}
                            onPress={() =>
                              handleFriendRequestAction(
                                request.request_id,
                                "decline",
                              )
                            }
                          >
                            <Text style={styles.actionButtonText}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}

                  <Text style={styles.sectionTitle}>Outgoing</Text>
                  {friendRequests.outgoing.length === 0 ? (
                    <Text style={styles.emptyText}>No outgoing requests.</Text>
                  ) : (
                    friendRequests.outgoing.map((request) => (
                      <View
                        key={request.request_id}
                        style={styles.notificationItem}
                      >
                        <View style={styles.notificationInfo}>
                          <Text style={styles.notificationTitle}>
                            @{request.to_username}
                          </Text>
                          <Text style={styles.notificationSubtitle}>
                            pending request
                          </Text>
                        </View>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() =>
                            handleFriendRequestAction(
                              request.request_id,
                              "cancel",
                            )
                          }
                        >
                          <Text style={styles.actionButtonText}>Cancel</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : null}

              {!notificationsLoading && notificationTab === "groups" ? (
                <View style={styles.notificationSection}>
                  <Text style={styles.sectionTitle}>Group invites</Text>
                  {groupRequests.incoming_invites.length === 0 ? (
                    <Text style={styles.emptyText}>No group invites.</Text>
                  ) : (
                    groupRequests.incoming_invites.map((invite) => (
                      <View
                        key={invite.invite_id}
                        style={styles.notificationItem}
                      >
                        <View style={styles.notificationInfo}>
                          <Text style={styles.notificationTitle}>
                            {invite.group_name}
                          </Text>
                          <Text style={styles.notificationSubtitle}>
                            Invite from @{invite.from_username}
                          </Text>
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable
                            style={styles.actionButtonPrimary}
                            onPress={() =>
                              handleGroupInviteAction(
                                invite.invite_id,
                                "accept",
                              )
                            }
                          >
                            <Text style={styles.actionButtonTextPrimary}>
                              Accept
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.actionButton}
                            onPress={() =>
                              handleGroupInviteAction(
                                invite.invite_id,
                                "decline",
                              )
                            }
                          >
                            <Text style={styles.actionButtonText}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}

                  <Text style={styles.sectionTitle}>Join requests</Text>
                  {groupRequests.incoming_join_requests.length === 0 ? (
                    <Text style={styles.emptyText}>No join requests.</Text>
                  ) : (
                    groupRequests.incoming_join_requests.map((request) => (
                      <View
                        key={request.request_id}
                        style={styles.notificationItem}
                      >
                        <View style={styles.notificationInfo}>
                          <Text style={styles.notificationTitle}>
                            {request.group_name}
                          </Text>
                          <Text style={styles.notificationSubtitle}>
                            Request from @{request.username}
                          </Text>
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable
                            style={styles.actionButtonPrimary}
                            onPress={() =>
                              handleJoinRequestAction(
                                request.request_id,
                                "approve",
                              )
                            }
                          >
                            <Text style={styles.actionButtonTextPrimary}>
                              Approve
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.actionButton}
                            onPress={() =>
                              handleJoinRequestAction(
                                request.request_id,
                                "decline",
                              )
                            }
                          >
                            <Text style={styles.actionButtonText}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}

                  <Text style={styles.sectionTitle}>Pending outgoing</Text>
                  {groupRequests.outgoing_invites.length === 0 &&
                    groupRequests.outgoing_join_requests.length === 0 ? (
                    <Text style={styles.emptyText}>No pending outgoing.</Text>
                  ) : (
                    <View style={styles.notificationSectionList}>
                      {groupRequests.outgoing_invites.map((invite) => (
                        <View
                          key={`invite-${invite.invite_id}`}
                          style={styles.notificationItem}
                        >
                          <View style={styles.notificationInfo}>
                            <Text style={styles.notificationTitle}>
                              {invite.group_name}
                            </Text>
                            <Text style={styles.notificationSubtitle}>
                              Invite sent to @{invite.to_username}
                            </Text>
                          </View>
                          <Text style={styles.notificationMeta}>Pending</Text>
                        </View>
                      ))}
                      {groupRequests.outgoing_join_requests.map((request) => (
                        <View
                          key={`join-${request.request_id}`}
                          style={styles.notificationItem}
                        >
                          <View style={styles.notificationInfo}>
                            <Text style={styles.notificationTitle}>
                              {request.group_name}
                            </Text>
                            <Text style={styles.notificationSubtitle}>
                              Join request sent
                            </Text>
                          </View>
                          <Text style={styles.notificationMeta}>Pending</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const HeaderCard: React.FC<{
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  notificationCount: number;
  title: string;
  subtitle: string;
  profilePhoto: string | null;
  loading: boolean;
  styles: any;
  colors: ThemeColors;
}> = ({
  onOpenSettings,
  onOpenNotifications,
  notificationCount,
  title,
  subtitle,
  profilePhoto,
  loading,
  styles,
  colors,
}) => {
    const router = useRouter();

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
        ]}
        onPress={() => router.push("/profile")}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeftRow}>
            <View style={styles.avatar}>
              {profilePhoto ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${profilePhoto}` }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="person" size={26} color={colors.textMuted} />
              )}
            </View>

            <View style={styles.headerTextWrap}>
              <Text
                style={styles.nameText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {loading ? "Loading..." : title}
              </Text>
              <Text
                style={styles.subtitleText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {subtitle}
              </Text>
            </View>
          </View>

          <View style={styles.headerRightRow}>
            <Pressable
              hitSlop={12}
              style={styles.notificationButton}
              onPress={onOpenNotifications}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.textSecondary}
              />
              {notificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {notificationCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              hitSlop={12}
              style={styles.settingsButton}
              onPress={() => {
                onOpenSettings();
              }}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

const GreetingCard = ({
  styles,
  onPress,
  displayName,
  colors,
}: {
  styles: any;
  onPress: () => void;
  displayName?: string;
  colors: ThemeColors;
}) => {
  const name = displayName?.trim() ? displayName.trim() : "there";
  const robotColorFilters = useMemo(
    () => [
      {
        keypath: "**.Body.Fill 1",
        color: "#8B5CF6",
      },
      {
        keypath: "**.Head.Fill 1",
        color: "#8B5CF6",
      },
      {
        keypath: "**.Antenna.Fill 1",
        color: "#A78BFA",
      },
      {
        keypath: "**.FaceDots.Fill 1",
        color: "#5B21B6",
      },
    ],
    [],
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.aiCard,
        pressed && { opacity: 0.92, transform: [{ scale: 0.998 }] },
      ]}
    >
      <View style={styles.aiCardHeader}>
        <View style={styles.aiCardIconWrap}>
          <LottieView
            key="home_greeting_ai_robot"
            source={AI_ROBOT_ANIMATION}
            colorFilters={robotColorFilters}
            autoPlay
            loop
            resizeMode="contain"
            style={styles.aiRobotAnimation}
          />
        </View>
        <View style={styles.aiCardHeaderText}>
          <Text
            style={styles.greetingTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Hi {name}!
          </Text>
          <Text style={styles.aiCardBadge}>Mentora AI</Text>
        </View>
      </View>
      <Text style={styles.greetingSubtitle}>
        Move classes, swap time slots, or clear a day with natural language.
      </Text>
      <View style={styles.aiFeatureRow}>
        <View style={styles.aiFeatureChip}>
          <Ionicons name="calendar-outline" size={12} color={colors.accent} />
          <Text style={styles.aiFeatureChipText}>Schedule</Text>
        </View>
        <View style={styles.aiFeatureChip}>
          <Ionicons name="heart-outline" size={12} color={colors.accent} />
          <Text style={styles.aiFeatureChipText}>@emotion</Text>
        </View>
        <View style={styles.aiFeatureChip}>
          <Ionicons name="swap-horizontal-outline" size={12} color={colors.accent} />
          <Text style={styles.aiFeatureChipText}>Swap</Text>
        </View>
      </View>
      <View style={styles.aiCardFooter}>
        <Text style={styles.aiCardCta}>Tap to start a conversation</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
};

const UpcomingSection = ({
  blocks,
  styles,
  colors,
}: {
  blocks: { courseName: string; color: string; start: string; end: string; day: string }[];
  styles: any;
  colors: ThemeColors;
}) => {
  const router = useRouter();

  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  return (
    <View style={styles.upcomingSection}>
      <View style={styles.upcomingSectionHeader}>
        <View style={styles.upcomingSectionLeft}>
          <Ionicons name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.upcomingSectionTitle}>Coming Up</Text>
        </View>
        <Pressable hitSlop={8} onPress={() => router.push("/(tabs)/schedule")}>
          <Text style={styles.upcomingSeeAll}>See schedule</Text>
        </Pressable>
      </View>
      {blocks.length === 0 ? (
        <View style={styles.upcomingEmpty}>
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
          <Text style={styles.upcomingEmptyText}>No classes in the next 3 hours</Text>
          <Text style={styles.upcomingEmptyHint}>Enjoy your free time or start studying!</Text>
        </View>
      ) : (
        <View style={styles.upcomingList}>
          {blocks.slice(0, 3).map((block, idx) => {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const [sH, sM] = block.start.split(":").map(Number);
            const isNow = nowMins >= sH * 60 + sM;

            return (
              <View key={`${block.courseName}-${idx}`} style={styles.upcomingItem}>
                <View style={[styles.upcomingDot, { backgroundColor: block.color }]} />
                <View style={styles.upcomingItemContent}>
                  <Text style={styles.upcomingCourseName} numberOfLines={1}>
                    {block.courseName}
                  </Text>
                  <Text style={styles.upcomingTime}>
                    {formatTime(block.start)} - {formatTime(block.end)}
                  </Text>
                </View>
                {isNow && (
                  <View style={styles.upcomingNowBadge}>
                    <Text style={styles.upcomingNowText}>NOW</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const StudyStatsCard = ({
  profile,
  streakRank,
  hoursRank,
  styles,
  colors,
}: {
  profile: Profile | null;
  streakRank: number | null;
  hoursRank: number | null;
  styles: any;
  colors: ThemeColors;
}) => {
  const hours = profile?.study_hours ?? 0;
  const streak = profile?.streak_count ?? 0;

  const formatStudyTime = (h: number) => {
    const totalSeconds = h * 3600;
    if (totalSeconds < 60) return `${Math.round(totalSeconds)}sec`;
    const totalMinutes = h * 60;
    if (totalMinutes < 60) return `${Math.round(totalMinutes)}min`;
    return `${h.toFixed(1)}h`;
  };

  return (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <Ionicons name="flame" size={20} color="#F59E0B" />
        <Text style={styles.statValue}>{streak}</Text>
        <Text style={styles.statLabel}>Streak</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="time" size={20} color={colors.accent} />
        <Text style={styles.statValue}>{formatStudyTime(hours)}</Text>
        <Text style={styles.statLabel}>Study</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="podium-outline" size={20} color="#F59E0B" />
        <Text style={styles.statValue}>{streakRank != null ? `#${streakRank}` : "—"}</Text>
        <Text style={styles.statLabel}>Streak#</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="trophy-outline" size={20} color={colors.success} />
        <Text style={styles.statValue}>{hoursRank != null ? `#${hoursRank}` : "—"}</Text>
        <Text style={styles.statLabel}>Hours#</Text>
      </View>
    </View>
  );
};

const QuickActions = ({ styles, colors }: { styles: any; colors: ThemeColors }) => {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSchedule = async () => {
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        Alert.alert("Not signed in", "Please sign in to generate a schedule.");
        return;
      }

      setIsGenerating(true);

      const res = await fetch(
        `${API_BASE_URL}/scheduler/${encodeURIComponent(username)}`,
        { method: "POST" },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to generate schedule");
      }

      const data = await res.json().catch(() => null);
      const created = data?.created ?? 0;
      Alert.alert("Schedule generated", `Created ${created} sessions.`);
      router.push("/(tabs)/schedule");
    } catch (err: any) {
      Alert.alert("Error", err?.message || String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const actions = [
    {
      icon: "calendar-outline" as const,
      label: "Generate\nSchedule",
      color: colors.accent,
      bg: colors.accent + "18",
      onPress: handleGenerateSchedule,
    },
    {
      icon: "book-outline" as const,
      label: "Study\nSession",
      color: colors.success,
      bg: colors.success + "18",
      onPress: () => router.push("/(tabs)/study"),
    },
    {
      icon: "chatbubble-outline" as const,
      label: "Message\nFriends",
      color: "#3B82F6",
      bg: "rgba(59,130,246,0.12)",
      onPress: () => router.push("/(tabs)/chat"),
    },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <View style={styles.quickActionsRow}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            style={({ pressed }) => [
              styles.quickActionCard,
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
            onPress={action.onPress}
            disabled={isGenerating}
          >
            <View style={[styles.quickActionIconWrap, { backgroundColor: action.bg }]}>
              <Ionicons name={action.icon} size={22} color={action.color} />
            </View>
            <Text style={styles.quickActionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <Modal transparent animationType="fade" visible={isGenerating}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.card, { alignItems: "center", padding: 20 }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ marginTop: 12, color: colors.textSecondary }}>
              Generating schedule...
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const RecommendationCard = ({
  styles,
  colors,
}: {
  styles: any;
  colors: ThemeColors;
}) => {
  const tips = [
    { text: "Try the Pomodoro technique: 25 min focus, 5 min break.", icon: "timer-outline" as const },
    { text: "Use @emotion in the AI chat to track how you feel today.", icon: "heart-outline" as const },
    { text: "Ask the AI to rearrange your schedule before a busy week.", icon: "sparkles-outline" as const },
    { text: "Short study sessions beat long cramming. Stay consistent!", icon: "trending-up-outline" as const },
  ];
  const tip = tips[new Date().getDay() % tips.length];

  return (
    <View style={styles.recommendationCard}>
      <View style={styles.recommendationIconWrapper}>
        <Ionicons name={tip.icon} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.recommendationTitle}>Daily Tip</Text>
        <Text style={styles.recommendationSubtitle}>{tip.text}</Text>
      </View>
    </View>
  );
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
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(2,6,23,0.6)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: SPACING.lg,
    },
    notificationsCard: {
      width: "100%",
      maxWidth: 420,
      maxHeight: "82%",
      backgroundColor: COLORS.card,
      borderRadius: 20,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    modalHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    modalClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.subtleCard,
    },
    notificationTabsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: SPACING.sm,
    },
    notificationTab: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      backgroundColor: COLORS.subtleCard,
      alignItems: "center",
      justifyContent: "center",
    },
    notificationTabActive: {
      backgroundColor: COLORS.accent,
      borderColor: COLORS.accent,
    },
    notificationTabText: {
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.textSecondary,
    },
    notificationTabTextActive: {
      color: "#FFFFFF",
    },
    notificationsScroll: {
      marginTop: SPACING.xs,
    },
    notificationsContent: {
      paddingBottom: SPACING.lg,
      gap: SPACING.md,
    },
    notificationSection: {
      gap: SPACING.sm,
    },
    notificationSectionList: {
      gap: SPACING.sm,
    },
    notificationItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.subtleCard,
      borderRadius: 12,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    notificationInfo: {
      flex: 1,
    },
    notificationTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    notificationSubtitle: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    notificationMeta: {
      fontSize: 11,
      color: COLORS.textMuted,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
    },
    actionButtonPrimary: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: COLORS.accent,
    },
    actionButtonTextPrimary: {
      fontSize: 12,
      fontWeight: "600",
      color: "#0B1020",
    },
    actionButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
    },
    actionButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.textPrimary,
    },
    emptyText: {
      fontSize: 12,
      color: COLORS.textSecondary,
    },
    scrollContent: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xl * 2,
      gap: SPACING.md,
    },
    card: {
      backgroundColor: COLORS.card,
      borderRadius: 16,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeftRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
    },
    headerTextWrap: {
      flex: 1,
      minWidth: 0,
      marginRight: SPACING.sm,
    },
    headerRightRow: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COLORS.subtleCard,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.sm,
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    nameText: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    subtitleText: {
      marginTop: 2,
      fontSize: 13,
      color: COLORS.textSecondary,
    },
    notificationButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.subtleCard,
      marginRight: SPACING.xs,
      position: "relative",
    },
    notificationBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EF4444",
    },
    notificationBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    settingsButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.subtleCard,
    },
    aiCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: COLORS.accent + "30",
      shadowColor: COLORS.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 5,
    },
    aiCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    aiCardIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    aiRobotAnimation: {
      width: 40,
      height: 40,
    },
    aiCardHeaderText: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minWidth: 0,
    },
    aiCardBadge: {
      fontSize: 11,
      fontWeight: "700",
      color: COLORS.accent,
      backgroundColor: COLORS.accent + "18",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: "hidden",
      flexShrink: 0,
    },
    aiFeatureRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: SPACING.sm,
    },
    aiFeatureChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: COLORS.accent + "14",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    aiFeatureChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: COLORS.accent,
    },
    aiCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: COLORS.borderSubtle,
    },
    aiCardCta: {
      fontSize: 13,
      fontWeight: "600",
      color: COLORS.accent,
    },
    greetingTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: COLORS.textPrimary,
      flex: 1,
      minWidth: 0,
      marginRight: 10,
    },
    greetingSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: COLORS.textSecondary,
    },
    section: {
      marginTop: SPACING.xs,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: SPACING.sm,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: COLORS.textPrimary,
      marginBottom: SPACING.sm,
    },
    linkText: {
      fontSize: 12,
      color: COLORS.accentSoft,
      fontWeight: "500",
    },
    quickActionsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: SPACING.sm,
    },
    quickActionCard: {
      flex: 1,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    quickActionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    quickActionText: {
      fontSize: 12,
      color: COLORS.textPrimary,
      fontWeight: "600",
      textAlign: "center",
      lineHeight: 16,
    },

    upcomingSection: {
      marginTop: SPACING.sm,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    upcomingSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: SPACING.sm,
    },
    upcomingSectionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    upcomingSectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    upcomingSeeAll: {
      fontSize: 12,
      fontWeight: "600",
      color: COLORS.accent,
    },
    upcomingEmpty: {
      alignItems: "center",
      paddingVertical: SPACING.md,
      gap: 6,
    },
    upcomingEmptyText: {
      fontSize: 14,
      fontWeight: "600",
      color: COLORS.textPrimary,
      marginTop: 4,
    },
    upcomingEmptyHint: {
      fontSize: 12,
      color: COLORS.textSecondary,
    },
    upcomingList: {
      gap: SPACING.xs,
    },
    upcomingItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.subtleCard,
      borderRadius: 12,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    upcomingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    upcomingItemContent: {
      flex: 1,
    },
    upcomingCourseName: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
    },
    upcomingTime: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 2,
    },
    upcomingNowBadge: {
      backgroundColor: COLORS.success + "22",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    upcomingNowText: {
      fontSize: 10,
      fontWeight: "800",
      color: COLORS.success,
      letterSpacing: 0.5,
    },

    statsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: COLORS.card,
      borderRadius: 14,
      paddingVertical: SPACING.md,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    statValue: {
      fontSize: 17,
      fontWeight: "800",
      color: COLORS.textPrimary,
      marginTop: 4,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "500",
      color: COLORS.textSecondary,
      marginTop: 2,
    },

    recommendationCard: {
      marginTop: SPACING.xs,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.accent,
    },
    recommendationIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: COLORS.accent + "22",
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.sm,
    },
    recommendationTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: COLORS.textPrimary,
      marginBottom: 2,
    },
    recommendationSubtitle: {
      fontSize: 13,
      color: COLORS.textSecondary,
    },
  });
