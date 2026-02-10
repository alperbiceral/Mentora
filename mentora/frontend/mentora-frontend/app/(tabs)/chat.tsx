import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
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
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const COLORS = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)",
  subtleCard: "rgba(15,23,42,0.85)",
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  borderSoft: "rgba(148,163,184,0.18)",
  shadow: "#000000",
  danger: "#EF4444",
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const CHAT_LAST_SEEN_KEY = "mentora.chatLastSeenByThread";

type FriendProfile = {
  username: string;
  full_name: string;
  university?: string | null;
  streak_count: number;
  study_hours: number;
  profile_photo?: string | null;
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

type ChatMessage = {
  message_id: number;
  thread_id: number;
  sender: string;
  content: string;
  created_at: string;
};

type Profile = {
  full_name: string;
  profile_photo?: string | null;
};

const EMOJI_SET = ["🙂", "😂", "😍", "🥳", "👍", "🔥", "👏", "😮", "😢", "🙏"];

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const [username, setUsername] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messagesByThread, setMessagesByThread] = useState<
    Record<number, ChatMessage[]>
  >({});
  const [inputValue, setInputValue] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSelected, setGroupSelected] = useState<string[]>([]);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [groupPhotoDraft, setGroupPhotoDraft] = useState("");
  const [groupAddSelected, setGroupAddSelected] = useState<string[]>([]);
  const [groupRemoveSelected, setGroupRemoveSelected] = useState<string[]>([]);
  const [groupParticipants, setGroupParticipants] = useState<
    Record<number, string[]>
  >({});
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastFriendOpenRef = useRef<string | null>(null);
  const lastThreadOpenRef = useRef<number | null>(null);
  const isChatFocusedRef = useRef(false);
  const activeThreadIdRef = useRef<number | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.thread_id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  const friendMap = useMemo(
    () => new Map(friends.map((friend) => [friend.username, friend])),
    [friends],
  );
  const friendParam = typeof params.friend === "string" ? params.friend : null;
  const threadParam = typeof params.thread === "string" ? params.thread : null;
  const threadParamId = threadParam ? Number(threadParam) : null;
  const normalizedThreadParamId =
    threadParamId && Number.isFinite(threadParamId) ? threadParamId : null;
  const isGroupThread = activeThread?.is_group ?? false;
  const activeFriend =
    !isGroupThread && activeThread?.friend_username
      ? (friendMap.get(activeThread.friend_username) ?? null)
      : null;
  const privateThreads = useMemo(
    () => threads.filter((thread) => !thread.is_group),
    [threads],
  );
  const groupThreads = useMemo(
    () => threads.filter((thread) => thread.is_group),
    [threads],
  );
  const activeGroupMembers =
    activeThreadId && groupParticipants[activeThreadId]
      ? groupParticipants[activeThreadId]
      : [];
  const isGroupOwner =
    isGroupThread && activeThread?.owner_username === username;
  const availableGroupAdds = useMemo(() => {
    const memberSet = new Set(activeGroupMembers);
    return friends.filter((friend) => !memberSet.has(friend.username));
  }, [activeGroupMembers, friends]);

  const fetchThreads = useCallback(async (user: string) => {
    setLoadingThreads(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat/threads/${user}`);
      if (!response.ok) {
        throw new Error("Threads failed");
      }
      const data = await response.json();
      setThreads(data.threads ?? []);
    } catch (error) {
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const fetchFriends = useCallback(async (user: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/friends/list/${user}`);
      if (!response.ok) {
        throw new Error("Friends failed");
      }
      const data = await response.json();
      setFriends(data.friends ?? []);
    } catch (error) {
      setFriends([]);
    }
  }, []);

  const fetchMessages = useCallback(async (threadId: number) => {
    setLoadingMessages(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat/messages/${threadId}`);
      if (!response.ok) {
        throw new Error("Messages failed");
      }
      const data = (await response.json()) as ChatMessage[];
      setMessagesByThread((prev) => ({ ...prev, [threadId]: data }));
    } catch (error) {
      setMessagesByThread((prev) => ({ ...prev, [threadId]: [] }));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const fetchGroupParticipants = useCallback(async (threadId: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/chat/groups/${threadId}/participants`,
      );
      if (!response.ok) {
        throw new Error("Participants failed");
      }
      const data = (await response.json()) as string[];
      setGroupParticipants((prev) => ({ ...prev, [threadId]: data }));
    } catch (error) {
      setGroupParticipants((prev) => ({ ...prev, [threadId]: [] }));
    }
  }, []);

  const markThreadSeen = useCallback(async (threadId: number) => {
    const stored = await AsyncStorage.getItem(CHAT_LAST_SEEN_KEY);
    let parsed: Record<string, number> = {};
    if (stored) {
      try {
        parsed = JSON.parse(stored) as Record<string, number>;
      } catch {
        parsed = {};
      }
    }
    const next = {
      ...parsed,
      [String(threadId)]: Date.now(),
    };
    await AsyncStorage.setItem(CHAT_LAST_SEEN_KEY, JSON.stringify(next));
  }, []);

  const refreshAll = useCallback(() => {
    let active = true;
    const run = async () => {
      const stored = await AsyncStorage.getItem("mentora.username");
      if (!active) {
        return;
      }
      setUsername(stored);
      if (stored) {
        await Promise.all([
          fetchThreads(stored),
          fetchFriends(stored),
          (async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/profile/${stored}`);
              if (!response.ok) {
                throw new Error("Profile failed");
              }
              const data = (await response.json()) as Profile;
              if (active) {
                setCurrentProfile(data);
              }
            } catch (error) {
              if (active) {
                setCurrentProfile(null);
              }
            }
          })(),
        ]);
      } else {
        setThreads([]);
        setFriends([]);
        setCurrentProfile(null);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [fetchThreads, fetchFriends]);

  useFocusEffect(refreshAll);

  useFocusEffect(
    useCallback(() => {
      isChatFocusedRef.current = true;
      return () => {
        isChatFocusedRef.current = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!username) {
      return;
    }

    const wsUrl = API_BASE_URL.replace(/^http/, "ws").concat(
      `/chat/ws/${username}`,
    );
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "message") {
          const message = payload.message as ChatMessage;
          setMessagesByThread((prev) => {
            const existing = prev[message.thread_id] ?? [];
            return {
              ...prev,
              [message.thread_id]: [...existing, message],
            };
          });
          setThreads((prev) => {
            const updated = prev.map((thread) =>
              thread.thread_id === message.thread_id
                ? {
                    ...thread,
                    last_message: message.content,
                    last_message_at: message.created_at,
                  }
                : thread,
            );
            return updated.sort((a, b) =>
              String(b.last_message_at ?? "").localeCompare(
                String(a.last_message_at ?? ""),
              ),
            );
          });
        }
      } catch (error) {
        // ignore
      }
    };

    ws.onerror = () => {
      // ignore
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [username]);

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId);
      if (activeThread?.is_group) {
        fetchGroupParticipants(activeThreadId);
      }
      markThreadSeen(activeThreadId);
    }
  }, [
    activeThreadId,
    activeThread?.is_group,
    fetchMessages,
    fetchGroupParticipants,
    markThreadSeen,
  ]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!username || !friendParam) {
      return;
    }
    if (lastFriendOpenRef.current === friendParam) {
      return;
    }
    lastFriendOpenRef.current = friendParam;
    handleStartChat(friendParam);
  }, [friendParam, username]);

  useEffect(() => {
    if (!normalizedThreadParamId || threads.length === 0) {
      return;
    }
    if (lastThreadOpenRef.current === normalizedThreadParamId) {
      return;
    }
    const exists = threads.some(
      (thread) => thread.thread_id === normalizedThreadParamId,
    );
    if (!exists) {
      return;
    }
    lastThreadOpenRef.current = normalizedThreadParamId;
    setActiveThreadId(normalizedThreadParamId);
  }, [normalizedThreadParamId, threads]);

  const handleStartChat = async (friendUsername: string) => {
    if (!username) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/chat/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          friend_username: friendUsername,
        }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Start chat failed");
      }
      const thread = (await response.json()) as ChatThreadItem;
      setThreads((prev) => {
        const exists = prev.some((item) => item.thread_id === thread.thread_id);
        const updated = exists ? prev : [thread, ...prev];
        return updated;
      });
      setActiveThreadId(thread.thread_id);
      setNewChatOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Start chat failed";
      Alert.alert("Error", message);
    }
  };

  const handleCreateGroup = async () => {
    if (!username) {
      return;
    }
    const title = groupTitle.trim();
    if (!title) {
      Alert.alert("Missing info", "Group title is required.");
      return;
    }
    if (groupSelected.length === 0) {
      Alert.alert("Missing members", "Select at least one member.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/chat/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          title,
          member_usernames: groupSelected,
          group_photo: groupPhotoDraft || undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Create group failed");
      }
      const thread = (await response.json()) as ChatThreadItem;
      setThreads((prev) => [thread, ...prev]);
      setActiveThreadId(thread.thread_id);
      setGroupCreateOpen(false);
      setGroupTitle("");
      setGroupPhotoDraft("");
      setGroupSelected([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Create group failed";
      Alert.alert("Error", message);
    }
  };

  const handleUpdateGroup = async () => {
    if (!username || !activeThreadId) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/chat/groups/${activeThreadId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            title: groupTitleDraft.trim() || undefined,
            group_photo: groupPhotoDraft || undefined,
            add_members: groupAddSelected,
            remove_members: groupRemoveSelected,
          }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Update group failed");
      }
      const updated = (await response.json()) as ChatThreadItem;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.thread_id === updated.thread_id
            ? { ...thread, ...updated }
            : thread,
        ),
      );
      await fetchGroupParticipants(activeThreadId);
      setGroupSettingsOpen(false);
      setGroupPhotoDraft("");
      setGroupAddSelected([]);
      setGroupRemoveSelected([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Update group failed";
      Alert.alert("Error", message);
    }
  };

  const toggleSelection = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  };

  const pickGroupPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.[0]?.base64) {
      setGroupPhotoDraft(result.assets[0].base64);
    }
  };

  const handleSend = async () => {
    if (!username || !activeThreadId) {
      return;
    }
    const content = inputValue.trim();
    if (!content) {
      return;
    }
    setInputValue("");
    setEmojiOpen(false);

    const payload = {
      thread_id: activeThreadId,
      content,
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: activeThreadId,
          sender: username,
          content,
        }),
      });
      if (!response.ok) {
        throw new Error("Send failed");
      }
      const message = (await response.json()) as ChatMessage;
      setMessagesByThread((prev) => {
        const existing = prev[message.thread_id] ?? [];
        return {
          ...prev,
          [message.thread_id]: [...existing, message],
        };
      });
    } catch (error) {
      Alert.alert("Error", "Message failed to send.");
    }
  };

  const handleDeleteThread = async (threadId: number) => {
    if (!username) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/chat/threads/${threadId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      setThreads((prev) => prev.filter((item) => item.thread_id !== threadId));
      setMessagesByThread((prev) => {
        const updated = { ...prev };
        delete updated[threadId];
        return updated;
      });
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
      }
    } catch (error) {
      Alert.alert("Error", "Delete failed.");
    }
  };

  const activeMessages = activeThreadId
    ? (messagesByThread[activeThreadId] ?? [])
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        {activeThreadId ? (
          <View style={styles.chatPane}>
            <View style={styles.chatHeader}>
              <Pressable
                hitSlop={10}
                style={styles.backButton}
                onPress={() => setActiveThreadId(null)}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={COLORS.textPrimary}
                />
              </Pressable>
              <View style={styles.chatTitleRow}>
                {isGroupThread ? (
                  <View style={styles.groupTitleRow}>
                    <View style={styles.chatHeaderAvatar}>
                      {activeThread?.group_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${activeThread.group_photo}`,
                          }}
                          style={styles.chatHeaderAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="people"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <Text style={styles.chatTitle}>
                      {activeThread?.title || "Group chat"}
                    </Text>
                    {isGroupOwner ? (
                      <Pressable
                        hitSlop={8}
                        style={styles.groupSettingsButton}
                        onPress={() => {
                          setGroupTitleDraft(activeThread?.title ?? "");
                          setGroupPhotoDraft(activeThread?.group_photo ?? "");
                          setGroupAddSelected([]);
                          setGroupRemoveSelected([]);
                          setGroupSettingsOpen(true);
                        }}
                      >
                        <Ionicons
                          name="settings-outline"
                          size={18}
                          color={COLORS.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <View style={styles.chatHeaderAvatar}>
                      {activeFriend?.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${activeFriend.profile_photo}`,
                          }}
                          style={styles.chatHeaderAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <Text style={styles.chatTitle}>
                      {activeFriend?.full_name ||
                        activeThread?.friend_username ||
                        "Chat"}
                    </Text>
                  </>
                )}
              </View>
              <Pressable
                hitSlop={10}
                style={styles.deleteButton}
                onPress={() => {
                  if (activeThreadId) {
                    handleDeleteThread(activeThreadId);
                  }
                }}
              >
                <Ionicons name="trash" size={18} color={COLORS.danger} />
              </Pressable>
            </View>

            <View style={styles.chatSurface}>
              <ScrollView
                style={styles.messagesScroll}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {loadingMessages ? (
                  <Text style={styles.emptyText}>Loading messages...</Text>
                ) : activeMessages.length === 0 ? (
                  <Text style={styles.emptyText}>Start the conversation.</Text>
                ) : (
                  activeMessages.map((message) => {
                    const isMine = message.sender === username;
                    const senderName =
                      message.sender === username
                        ? currentProfile?.full_name || message.sender
                        : friendMap.get(message.sender)?.full_name ||
                          message.sender;
                    return (
                      <View
                        key={message.message_id}
                        style={[
                          styles.messageRow,
                          isMine
                            ? styles.messageRowMine
                            : styles.messageRowOther,
                        ]}
                      >
                        <View
                          style={[
                            styles.messageAvatar,
                            isMine
                              ? styles.messageAvatarMine
                              : styles.messageAvatarOther,
                          ]}
                        >
                          {isMine ? (
                            currentProfile?.profile_photo ? (
                              <Image
                                source={{
                                  uri: `data:image/jpeg;base64,${currentProfile.profile_photo}`,
                                }}
                                style={styles.messageAvatarImage}
                              />
                            ) : (
                              <Ionicons
                                name="person"
                                size={14}
                                color={COLORS.textMuted}
                              />
                            )
                          ) : isGroupThread ? (
                            friendMap.get(message.sender)?.profile_photo ? (
                              <Image
                                source={{
                                  uri: `data:image/jpeg;base64,${friendMap.get(message.sender)?.profile_photo}`,
                                }}
                                style={styles.messageAvatarImage}
                              />
                            ) : (
                              <Ionicons
                                name="person"
                                size={14}
                                color={COLORS.textMuted}
                              />
                            )
                          ) : activeFriend?.profile_photo ? (
                            <Image
                              source={{
                                uri: `data:image/jpeg;base64,${activeFriend.profile_photo}`,
                              }}
                              style={styles.messageAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="person"
                              size={14}
                              color={COLORS.textMuted}
                            />
                          )}
                        </View>
                        <View
                          style={[
                            styles.messageBubble,
                            isMine
                              ? styles.messageBubbleMine
                              : styles.messageBubbleOther,
                          ]}
                        >
                          {isGroupThread && !isMine ? (
                            <Text style={styles.messageSender}>
                              {senderName}
                            </Text>
                          ) : null}
                          <Text style={styles.messageText}>
                            {message.content}
                          </Text>
                          <Text style={styles.messageTime}>
                            {new Date(message.created_at).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {emojiOpen ? (
                <View style={styles.emojiBar}>
                  {EMOJI_SET.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => setInputValue((prev) => prev + emoji)}
                      style={styles.emojiButton}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.inputRow}>
                <Pressable
                  hitSlop={8}
                  style={styles.emojiToggle}
                  onPress={() => setEmojiOpen((prev) => !prev)}
                >
                  <Ionicons
                    name="happy-outline"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder="Write a message"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.textInput}
                  multiline
                />
                <Pressable style={styles.sendButton} onPress={handleSend}>
                  <Ionicons name="send" size={18} color="#0B1020" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.listPane}>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>Chat</Text>
            </View>

            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Private chats</Text>
                <Pressable
                  hitSlop={8}
                  style={styles.sectionAction}
                  onPress={() => setNewChatOpen(true)}
                >
                  <Ionicons name="add" size={16} color="#0B1020" />
                  <Text style={styles.sectionActionText}>New</Text>
                </Pressable>
              </View>

              {loadingThreads ? (
                <Text style={styles.emptyText}>Loading chats...</Text>
              ) : privateThreads.length === 0 ? (
                <Text style={styles.emptyText}>No private chats yet.</Text>
              ) : (
                privateThreads.map((thread) => (
                  <Pressable
                    key={thread.thread_id}
                    style={styles.threadCard}
                    onPress={() => setActiveThreadId(thread.thread_id)}
                  >
                    <View style={styles.threadAvatar}>
                      {thread.friend_username &&
                      friendMap.get(thread.friend_username)?.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${friendMap.get(thread.friend_username)?.profile_photo}`,
                          }}
                          style={styles.threadAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.threadInfo}>
                      <Text style={styles.threadTitle}>
                        {(thread.friend_username &&
                          friendMap.get(thread.friend_username)?.full_name) ||
                          thread.friend_username ||
                          "Private chat"}
                      </Text>
                      <Text style={styles.threadPreview}>
                        {thread.last_message ?? "New conversation"}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      style={styles.threadDelete}
                      onPress={() => handleDeleteThread(thread.thread_id)}
                    >
                      <Ionicons name="trash" size={16} color={COLORS.danger} />
                    </Pressable>
                  </Pressable>
                ))
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Group chats</Text>
                <Pressable
                  hitSlop={8}
                  style={styles.sectionAction}
                  onPress={() => setGroupCreateOpen(true)}
                >
                  <Ionicons name="add" size={16} color="#0B1020" />
                  <Text style={styles.sectionActionText}>New</Text>
                </Pressable>
              </View>

              {groupThreads.length === 0 ? (
                <Text style={styles.emptyText}>No group chats yet.</Text>
              ) : (
                groupThreads.map((thread) => (
                  <Pressable
                    key={thread.thread_id}
                    style={styles.threadCard}
                    onPress={() => setActiveThreadId(thread.thread_id)}
                  >
                    <View style={styles.threadAvatar}>
                      {thread.group_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${thread.group_photo}`,
                          }}
                          style={styles.threadAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="people"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.threadInfo}>
                      <Text style={styles.threadTitle}>
                        {thread.title || "Group chat"}
                      </Text>
                      <Text style={styles.threadPreview}>
                        {thread.members_count ?? 0} members
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <Modal
        visible={newChatOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewChatOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNewChatOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start a chat</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={() => setNewChatOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends to chat yet.</Text>
              ) : (
                friends.map((friend) => (
                  <Pressable
                    key={friend.username}
                    style={styles.friendRow}
                    onPress={() => handleStartChat(friend.username)}
                  >
                    <View style={styles.friendAvatar}>
                      {friend.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${friend.profile_photo}`,
                          }}
                          style={styles.friendAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>
                        {friend.full_name || friend.username}
                      </Text>
                      <Text style={styles.friendMeta}>{friend.username}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={groupCreateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupCreateOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setGroupCreateOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create group</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={() => setGroupCreateOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            <View style={styles.groupPhotoRow}>
              <View style={styles.groupPhotoPreview}>
                {groupPhotoDraft ? (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${groupPhotoDraft}`,
                    }}
                    style={styles.groupPhotoImage}
                  />
                ) : (
                  <Ionicons name="people" size={20} color={COLORS.textMuted} />
                )}
              </View>
              <Pressable
                style={styles.groupPhotoButton}
                onPress={pickGroupPhoto}
              >
                <Ionicons
                  name="image-outline"
                  size={18}
                  color={COLORS.textPrimary}
                />
                <Text style={styles.groupPhotoButtonText}>Upload photo</Text>
              </Pressable>
            </View>
            <TextInput
              value={groupTitle}
              onChangeText={setGroupTitle}
              placeholder="Group title"
              placeholderTextColor={COLORS.textMuted}
              style={styles.groupInput}
            />
            <Text style={styles.modalSectionLabel}>Members</Text>
            <ScrollView
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends to add yet.</Text>
              ) : (
                friends.map((friend) => {
                  const selected = groupSelected.includes(friend.username);
                  return (
                    <Pressable
                      key={friend.username}
                      style={styles.memberRow}
                      onPress={() =>
                        toggleSelection(friend.username, setGroupSelected)
                      }
                    >
                      <View style={styles.memberInfo}>
                        <Text style={styles.friendName}>
                          {friend.full_name || friend.username}
                        </Text>
                        <Text style={styles.friendMeta}>{friend.username}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkBadge,
                          selected && styles.checkBadgeActive,
                        ]}
                      >
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color="#0B1020"
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={styles.primaryButton} onPress={handleCreateGroup}>
              <Text style={styles.primaryButtonText}>Create group</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={groupSettingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupSettingsOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setGroupSettingsOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group settings</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={() => setGroupSettingsOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            <View style={styles.groupPhotoRow}>
              <View style={styles.groupPhotoPreview}>
                {groupPhotoDraft ? (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${groupPhotoDraft}`,
                    }}
                    style={styles.groupPhotoImage}
                  />
                ) : (
                  <Ionicons name="people" size={20} color={COLORS.textMuted} />
                )}
              </View>
              <Pressable
                style={styles.groupPhotoButton}
                onPress={pickGroupPhoto}
              >
                <Ionicons
                  name="image-outline"
                  size={18}
                  color={COLORS.textPrimary}
                />
                <Text style={styles.groupPhotoButtonText}>Update photo</Text>
              </Pressable>
            </View>
            <TextInput
              value={groupTitleDraft}
              onChangeText={setGroupTitleDraft}
              placeholder="Group title"
              placeholderTextColor={COLORS.textMuted}
              style={styles.groupInput}
            />
            <Text style={styles.modalSectionLabel}>Members</Text>
            <ScrollView
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {activeGroupMembers.length === 0 ? (
                <Text style={styles.emptyText}>No members yet.</Text>
              ) : (
                activeGroupMembers.map((member) => {
                  const isOwner = member === username;
                  const selected = groupRemoveSelected.includes(member);
                  const displayName =
                    member === username
                      ? currentProfile?.full_name || member
                      : friendMap.get(member)?.full_name || member;
                  return (
                    <Pressable
                      key={member}
                      style={styles.memberRow}
                      onPress={() => {
                        if (isOwner) {
                          return;
                        }
                        toggleSelection(member, setGroupRemoveSelected);
                      }}
                    >
                      <View style={styles.memberInfo}>
                        <Text style={styles.friendName}>{displayName}</Text>
                        <Text style={styles.friendMeta}>
                          {isOwner ? "Owner" : member}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkBadge,
                          selected && styles.checkBadgeRemove,
                        ]}
                      >
                        {selected ? (
                          <Ionicons name="close" size={14} color="#0B1020" />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}

              <Text style={styles.modalSectionLabel}>Add members</Text>
              {availableGroupAdds.length === 0 ? (
                <Text style={styles.emptyText}>No available friends.</Text>
              ) : (
                availableGroupAdds.map((friend) => {
                  const selected = groupAddSelected.includes(friend.username);
                  return (
                    <Pressable
                      key={friend.username}
                      style={styles.memberRow}
                      onPress={() =>
                        toggleSelection(friend.username, setGroupAddSelected)
                      }
                    >
                      <View style={styles.memberInfo}>
                        <Text style={styles.friendName}>
                          {friend.full_name || friend.username}
                        </Text>
                        <Text style={styles.friendMeta}>{friend.username}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkBadge,
                          selected && styles.checkBadgeActive,
                        ]}
                      >
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color="#0B1020"
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={styles.primaryButton} onPress={handleUpdateGroup}>
              <Text style={styles.primaryButtonText}>Save changes</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  listPane: {
    flex: 1,
  },
  chatPane: {
    flex: 1,
    gap: SPACING.md,
  },
  chatSurface: {
    flex: 1,
    backgroundColor: "rgba(9,16,28,0.85)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  sectionHeader: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    gap: 6,
  },
  sectionActionText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 12,
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
  },
  newChatText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 12,
  },
  listContent: {
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
  },
  threadCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  threadAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    marginRight: SPACING.sm,
  },
  threadAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  threadInfo: {
    flex: 1,
  },
  threadTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  threadPreview: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  threadDelete: {
    padding: 6,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACING.sm,
  },
  chatTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupSettingsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  chatHeaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  chatHeaderAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageRowMine: {
    flexDirection: "row-reverse",
  },
  messageRowOther: {
    flexDirection: "row",
  },
  messageAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  messageAvatarMine: {
    marginLeft: 6,
  },
  messageAvatarOther: {
    marginRight: 6,
  },
  messageAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  messageBubble: {
    maxWidth: "78%",
    padding: SPACING.sm,
    borderRadius: 16,
  },
  messageBubbleMine: {
    backgroundColor: COLORS.accent,
  },
  messageBubbleOther: {
    backgroundColor: "rgba(15,23,42,0.9)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  messageSender: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  messageText: {
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  messageTime: {
    marginTop: 4,
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  emojiToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: SPACING.sm,
  },
  emojiButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 18,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: SPACING.lg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "75%",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  modalHeader: {
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
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  modalList: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  groupPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  groupPhotoPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  groupPhotoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  groupPhotoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "#020617",
  },
  groupPhotoButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  groupInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
    marginBottom: SPACING.sm,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 12,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  memberInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  checkBadgeActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkBadgeRemove: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  primaryButton: {
    marginTop: SPACING.sm,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 14,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 14,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    marginRight: SPACING.sm,
  },
  friendAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  friendMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
