import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
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
const NOTIFICATIONS_LAST_SEEN_KEY = "mentora.notificationsLastSeenAt";
const CHAT_LAST_SEEN_KEY = "mentora.chatLastSeenByThread";

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

type ChatThreadItem = {
  thread_id: number;
  is_group: boolean;
  friend_username?: string | null;
  title?: string | null;
  owner_username?: string | null;
  group_photo?: string | null;
  members_count?: number;
  last_message?: string | null;
  last_message_at?: string | null;
};

type NotificationTab = "friends" | "groups" | "chats";

type Range = "today" | "week";

export default function HomeScreen() {
  const { colors: COLORS, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<Range>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vibration, setVibration] = useState(true);
  const [notifications, setNotifications] = useState(true);
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
  const [chatThreads, setChatThreads] = useState<ChatThreadItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
  const [chatLastSeenMap, setChatLastSeenMap] = useState<
    Record<number, number>
  >({});
  const notificationsLastSeenRef = useRef(0);

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

  const toTimestampMs = useCallback((value?: string | null) => {
    if (!value) {
      return 0;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }, []);

  const getStoredNotificationsLastSeen = useCallback(async () => {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY);
    const parsed = stored ? Number(stored) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getStoredChatLastSeen = useCallback(async () => {
    const stored = await AsyncStorage.getItem(CHAT_LAST_SEEN_KEY);
    if (!stored) {
      return {} as Record<number, number>;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, number>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          Number(key),
          Number(value) || 0,
        ]),
      ) as Record<number, number>;
    } catch {
      return {} as Record<number, number>;
    }
  }, []);

  const ensureChatLastSeen = useCallback(
    async (threads: ChatThreadItem[], storedMap: Record<number, number>) => {
      const hasSeen =
        Object.keys(storedMap).length > 0 &&
        Object.values(storedMap).some((value) => value > 0);
      if (hasSeen || threads.length === 0) {
        setChatLastSeenMap(storedMap);
        return storedMap;
      }
      const now = Date.now();
      const seeded = Object.fromEntries(
        threads.map((thread) => [
          thread.thread_id,
          toTimestampMs(thread.last_message_at) || now,
        ]),
      ) as Record<number, number>;
      await AsyncStorage.setItem(CHAT_LAST_SEEN_KEY, JSON.stringify(seeded));
      setChatLastSeenMap(seeded);
      return seeded;
    },
    [toTimestampMs],
  );

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const storedLastSeen = await getStoredNotificationsLastSeen();
      const storedChatLastSeen = await getStoredChatLastSeen();
      notificationsLastSeenRef.current = storedLastSeen;

      let friendUnreadCount = 0;
      let groupUnreadCount = 0;
      let chatUnreadCount = 0;

      const username = await AsyncStorage.getItem("mentora.username");
      if (!username) {
        setCurrentUsername(null);
        setFriendRequests({ incoming: [], outgoing: [] });
        setGroupRequests({
          incoming_invites: [],
          outgoing_invites: [],
          incoming_join_requests: [],
          outgoing_join_requests: [],
        });
        setChatThreads([]);
        setNotificationBadgeCount(0);
        return;
      }
      setCurrentUsername(username);

      const [friendsRes, groupsRes, threadsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/friends/requests/${username}`),
        fetch(
          `${API_BASE_URL}/groups/requests/${encodeURIComponent(username)}`,
        ),
        fetch(`${API_BASE_URL}/chat/threads/${username}`),
      ]);

      if (friendsRes.ok) {
        const data = (await friendsRes.json()) as FriendRequestsList;
        setFriendRequests({
          incoming: data.incoming ?? [],
          outgoing: data.outgoing ?? [],
        });
        const incomingUnread = (data.incoming ?? []).filter(
          (request) => toTimestampMs(request.created_at) > storedLastSeen,
        ).length;
        friendUnreadCount = incomingUnread;
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
        const inviteUnread = (data.incoming_invites ?? []).filter(
          (invite) => toTimestampMs(invite.created_at) > storedLastSeen,
        ).length;
        const joinUnread = (data.incoming_join_requests ?? []).filter(
          (request) => toTimestampMs(request.created_at) > storedLastSeen,
        ).length;
        groupUnreadCount = inviteUnread + joinUnread;
      } else {
        setGroupRequests({
          incoming_invites: [],
          outgoing_invites: [],
          incoming_join_requests: [],
          outgoing_join_requests: [],
        });
      }

      if (threadsRes.ok) {
        const data = await threadsRes.json();
        setChatThreads(data.threads ?? []);
        const chatLastSeen = await ensureChatLastSeen(
          data.threads ?? [],
          storedChatLastSeen,
        );
        const chatUnread = (data.threads ?? []).filter(
          (thread: ChatThreadItem) => {
            const lastMessageAt = toTimestampMs(thread.last_message_at);
            if (!lastMessageAt) {
              return false;
            }
            return lastMessageAt > storedLastSeen;
          },
        ).length;
        chatUnreadCount = chatUnread;
      } else {
        setChatThreads([]);
      }

      setNotificationBadgeCount(
        friendUnreadCount + groupUnreadCount + chatUnreadCount,
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [
    ensureChatLastSeen,
    getStoredChatLastSeen,
    getStoredNotificationsLastSeen,
    toTimestampMs,
  ]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    fetchNotifications();
  }, [notificationsOpen, fetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
      const interval = setInterval(() => {
        fetchNotifications();
      }, 15000);
      return () => clearInterval(interval);
    }, [fetchNotifications]),
  );

  const markNotificationsSeen = useCallback(async () => {
    const now = Date.now();
    await AsyncStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(now));
    notificationsLastSeenRef.current = now;
    setNotificationBadgeCount(0);
  }, []);

  const handleOpenNotifications = async () => {
    setNotificationTab("friends");
    await markNotificationsSeen();
    setNotificationsOpen(true);
  };

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
      await fetchNotifications();
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
      await fetchNotifications();
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
      await fetchNotifications();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request action failed";
      Alert.alert("Error", message);
    }
  };

  const formatNotificationTimestamp = (value?: string | null) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const datePart = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${datePart} ${timePart}`;
  };

  const unreadChatThreads = useMemo(() => {
    return chatThreads.filter((thread) => {
      const lastMessageAt = toTimestampMs(thread.last_message_at);
      if (!lastMessageAt) {
        return false;
      }
      const seenAt = chatLastSeenMap[thread.thread_id] ?? 0;
      return lastMessageAt > seenAt;
    });
  }, [chatLastSeenMap, chatThreads, toTimestampMs]);

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
        if (payload.type !== "message") {
          return;
        }
        const message = payload.message as {
          thread_id: number;
          content: string;
          created_at: string;
        };
        setChatThreads((prev) => {
          const existing = prev.find(
            (thread) => thread.thread_id === message.thread_id,
          );
          const next = existing
            ? prev.map((thread) =>
                thread.thread_id === message.thread_id
                  ? {
                      ...thread,
                      last_message: message.content,
                      last_message_at: message.created_at,
                    }
                  : thread,
              )
            : prev;
          const lastSeen = notificationsLastSeenRef.current;
          const prevLastMessageAt = existing
            ? toTimestampMs(existing.last_message_at)
            : 0;
          const newMessageAt = toTimestampMs(message.created_at);
          const shouldIncrement =
            newMessageAt > lastSeen && prevLastMessageAt <= lastSeen;
          if (shouldIncrement) {
            setNotificationBadgeCount((count) => count + 1);
          }
          return next;
        });
      } catch (error) {
        // ignore
      }
    };

    ws.onerror = () => {
      // ignore
    };

    return () => {
      ws.close();
    };
  }, [currentUsername, toTimestampMs]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      await AsyncStorage.multiRemove([
        "mentora.username",
        "mentora.email",
        "mentora.token",
        "mentora.personalitySkipped",
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fake gradient using two layers to feel like the login page */}
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
            streakCount={profile?.streak_count ?? 0}
            profilePhoto={profile?.profile_photo ?? null}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenNotifications={handleOpenNotifications}
            notificationCount={notificationBadgeCount}
            loading={profileLoading}
            colors={COLORS}
            styles={styles}
          />

          <GreetingCard
            styles={styles}
            onPress={() => router.push("/ai-agent")}
          />

          <ToggleTabs
            selected={selectedRange}
            onSelect={setSelectedRange}
            colors={COLORS}
            styles={styles}
          />

          <ScheduleCard range={selectedRange} colors={COLORS} styles={styles} />

          <QuickActions styles={styles} colors={COLORS} />

          <RecommendationCard styles={styles} colors={COLORS} />

          <CarouselSection styles={styles} colors={COLORS} />
        </ScrollView>
      </View>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        darkMode={mode === "dark"}
        setDarkMode={(v) => setMode(v ? "dark" : "light")}
        vibration={vibration}
        setVibration={setVibration}
        notifications={notifications}
        setNotifications={setNotifications}
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
                onPress={() => setNotificationTab("friends")}
              >
                <Text
                  style={[
                    styles.notificationTabText,
                    notificationTab === "friends" &&
                      styles.notificationTabTextActive,
                  ]}
                >
                  Friend requests
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.notificationTab,
                  notificationTab === "groups" && styles.notificationTabActive,
                ]}
                onPress={() => setNotificationTab("groups")}
              >
                <Text
                  style={[
                    styles.notificationTabText,
                    notificationTab === "groups" &&
                      styles.notificationTabTextActive,
                  ]}
                >
                  Group requests
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.notificationTab,
                  notificationTab === "chats" && styles.notificationTabActive,
                ]}
                onPress={() => setNotificationTab("chats")}
              >
                <Text
                  style={[
                    styles.notificationTabText,
                    notificationTab === "chats" &&
                      styles.notificationTabTextActive,
                  ]}
                >
                  Chat messages
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

              {!notificationsLoading && notificationTab === "chats" ? (
                <View style={styles.notificationSection}>
                  {unreadChatThreads.length === 0 ? (
                    <Text style={styles.emptyText}>No new messages.</Text>
                  ) : (
                    unreadChatThreads.map((thread) => {
                      const title = thread.is_group
                        ? (thread.title ?? "Group chat")
                        : (thread.friend_username ?? "Direct message");
                      return (
                        <Pressable
                          key={thread.thread_id}
                          style={styles.notificationItem}
                          onPress={() => {
                            setNotificationsOpen(false);
                            router.push({
                              pathname: "/chat",
                              params: { thread: String(thread.thread_id) },
                            });
                          }}
                        >
                          <View style={styles.notificationInfo}>
                            <Text style={styles.notificationTitle}>
                              {title}
                            </Text>
                            <Text style={styles.notificationSubtitle}>
                              {thread.last_message ?? "No messages yet"}
                            </Text>
                          </View>
                          <Text style={styles.notificationMeta}>
                            {formatNotificationTimestamp(
                              thread.last_message_at,
                            )}
                          </Text>
                        </Pressable>
                      );
                    })
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
  streakCount: number;
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
  streakCount,
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

          <View>
            <Text style={styles.nameText}>
              {loading ? "Loading..." : title}
            </Text>
            <Text style={styles.subtitleText}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.headerRightRow}>
          <View style={styles.streakBadge}>
            <Ionicons
              name="flame"
              size={16}
              color={colors.accent}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.streakText}>{streakCount} day</Text>
          </View>

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
}: {
  styles: any;
  onPress: () => void;
}) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.92, transform: [{ scale: 0.998 }] },
      ]}
    >
      <Text style={styles.greetingTitle}>Hi Berfin Örtülü!</Text>
      <Text style={styles.greetingSubtitle}>
        Your AI study assistant is here. Ask anything about your studies.
      </Text>
    </Pressable>
  );
};

interface ToggleTabsProps {
  selected: Range;
  onSelect: (value: Range) => void;
}

const ToggleTabs: React.FC<
  ToggleTabsProps & { styles: any; colors: ThemeColors }
> = ({ selected, onSelect, styles, colors }) => {
  return (
    <View style={styles.toggleContainer}>
      <Pressable
        style={[
          styles.togglePill,
          selected === "today" && styles.togglePillActive,
        ]}
        onPress={() => onSelect("today")}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={selected === "today" ? colors.accent : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.toggleText,
            selected === "today" && styles.toggleTextActive,
          ]}
        >
          Today
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.togglePill,
          selected === "week" && styles.togglePillActive,
        ]}
        onPress={() => onSelect("week")}
      >
        <Ionicons
          name="calendar"
          size={16}
          color={selected === "week" ? colors.accent : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.toggleText,
            selected === "week" && styles.toggleTextActive,
          ]}
        >
          This week
        </Text>
      </Pressable>
    </View>
  );
};

interface ScheduleCardProps {
  range: Range;
}

const ScheduleCard: React.FC<
  ScheduleCardProps & { styles: any; colors: ThemeColors }
> = ({ range, styles, colors }) => {
  const isToday = range === "today";

  return (
    <View style={styles.card}>
      <View style={styles.scheduleHeaderRow}>
        <View style={styles.scheduleHeaderLeft}>
          <Ionicons
            name="calendar-clear-outline"
            size={18}
            color={colors.accent}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.scheduleTitleText}>
            {isToday ? "Today" : "This week"}
          </Text>
        </View>
        <Text style={styles.scheduleCountText}>
          {isToday ? "2 sessions" : "Week overview"}
        </Text>
      </View>

      {isToday ? (
        <View style={styles.scheduleList}>
          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleCourseText}>CS-476 MW3</Text>
            <Text style={styles.scheduleTimeText}>Mon 1:30 PM</Text>
          </View>

          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleCourseText}>CS-473 CW1</Text>
            <Text style={styles.scheduleTimeText}>Wed 5:30 PM</Text>
          </View>
        </View>
      ) : (
        <View style={styles.schedulePlaceholder}>
          <Text style={styles.schedulePlaceholderText}>
            Weekly schedule insights will appear here.
          </Text>
        </View>
      )}
    </View>
  );
};

const QuickActions = ({ styles, colors }: { styles: any; colors: ThemeColors }) => {
  const router = useRouter();

  const handlePress = (action: string) => {
    if (action === "Study") {
      router.push("/(tabs)/study");
      return;
    }

    console.log(action);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Pressable hitSlop={8} onPress={() => console.log("See history")}>
          <Text style={styles.linkText}>See history &gt;</Text>
        </Pressable>
      </View>

      <View style={styles.quickActionsRow}>
        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Study plan")}
        >
          <Ionicons
            name="list-outline"
            size={22}
            color={colors.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Study plan</Text>
        </Pressable>

        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Study")}
        >
          <Ionicons
            name="alarm-outline"
            size={22}
            color={colors.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Study</Text>
        </Pressable>

        <Pressable
          style={styles.quickActionCard}
          onPress={() => handlePress("Ask a question")}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={22}
            color={colors.accentSoft}
            style={{ marginBottom: 6 }}
          />
          <Text style={styles.quickActionText}>Ask a question</Text>
        </Pressable>
      </View>
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
  const router = useRouter();

  return (
    <View style={styles.recommendationCard}>
      <View style={styles.recommendationLeft}>
        <View style={styles.recommendationIconWrapper}>
          <Ionicons
            name="notifications-outline"
            size={18}
            color={colors.accent}
          />
        </View>
        <View>
          <Text style={styles.recommendationTitle}>You have a busy day.</Text>
          <Text style={styles.recommendationSubtitle}>
            Want a 25-min study session?
          </Text>
        </View>
      </View>

      <Pressable
        style={styles.recommendationButton}
        onPress={() => router.push("/(tabs)/study")}
      >
        <Text style={styles.recommendationButtonText}>Start study</Text>
      </Pressable>
    </View>
  );
};

const CarouselSection = ({ styles, colors }: { styles: any; colors: ThemeColors }) => {
  const router = useRouter();

  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselRow}>
        <Pressable
          style={styles.carouselCard}
          onPress={() => router.push("/emotion")}
        >
          <View style={styles.carouselHeaderRow}>
            <Ionicons
              name="chevron-back-outline"
              size={18}
              color={colors.textMuted}
            />
            <Text style={styles.carouselTitle}>Daily emotion check</Text>
          </View>
          <Text style={styles.carouselSubtitle}>
            Reflect on how you feel before you start.
          </Text>
        </Pressable>

        <Pressable
          style={[styles.carouselCard, styles.carouselCardSecondary]}
          onPress={() => console.log("Quick study session")}
        >
          <View style={styles.carouselHeaderRow}>
            <Text style={styles.carouselTitle}>Quick study session</Text>
            <Ionicons
              name="chevron-forward-outline"
              size={18}
              color={colors.textMuted}
            />
          </View>
          <Text style={styles.carouselSubtitle}>
            Jump into a focused 25-min block.
          </Text>
        </Pressable>
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: SPACING.sm,
  },
  notificationTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.subtleCard,
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
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
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
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: SPACING.xs,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accent,
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
  greetingTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  greetingSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignSelf: "flex-start",
  },
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
  },
  togglePillActive: {
    backgroundColor: "rgba(148,163,184,0.24)",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  toggleTextActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  scheduleHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  scheduleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  scheduleTitleText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  scheduleCountText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  scheduleList: {
    gap: SPACING.sm,
  },
  scheduleItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  scheduleCourseText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  scheduleTimeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  schedulePlaceholder: {
    backgroundColor: COLORS.subtleCard,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  schedulePlaceholderText: {
    fontSize: 13,
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
    backgroundColor: COLORS.subtleCard,
    borderRadius: 12,
    paddingVertical: SPACING.sm,
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
  quickActionText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  recommendationCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.subtleCard,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  recommendationLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: SPACING.sm,
  },
  recommendationIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(124,58,237,0.22)",
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
  recommendationButton: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.xs,
    borderRadius: 999,
    // exactly same lavender as other accents (See history, icons, etc.)
    backgroundColor: COLORS.accent,
  },
  recommendationButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  carouselSection: {
    marginTop: SPACING.lg,
  },
  carouselRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  carouselCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  carouselCardSecondary: {
    backgroundColor: "rgba(148,163,184,0.15)",
  },
  carouselHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  carouselTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  carouselSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
