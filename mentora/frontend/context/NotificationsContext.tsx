import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const CHAT_LAST_SEEN_KEY = "mentora.chatLastSeenByThread";

type FriendRequest = {
  request_id: number;
  from_username: string;
  to_username: string;
  status?: string;
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
  status?: string;
  created_at: string;
};

type GroupJoinRequestItem = {
  request_id: number;
  group_id: number;
  group_name: string;
  group_photo?: string | null;
  username: string;
  status?: string;
  created_at: string;
};

type GroupRequestsList = {
  incoming_invites: GroupInviteItem[];
  outgoing_invites: GroupInviteItem[];
  incoming_join_requests: GroupJoinRequestItem[];
  outgoing_join_requests: GroupJoinRequestItem[];
};

export type ChatThreadItem = {
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

type NotificationsContextValue = {
  loading: boolean;
  friendRequests: FriendRequestsList;
  groupRequests: GroupRequestsList;
  chatThreads: ChatThreadItem[];
  unreadChatThreads: ChatThreadItem[];

  friendPendingCount: number;
  groupPendingCount: number;
  chatUnreadCount: number;
  totalBadgeCount: number;

  refresh: () => Promise<void>;

  friendRequestAction: (
    requestId: number,
    action: "accept" | "decline" | "cancel",
  ) => Promise<void>;
  groupInviteAction: (
    inviteId: number,
    action: "accept" | "decline",
  ) => Promise<void>;
  groupJoinRequestAction: (
    requestId: number,
    action: "approve" | "decline",
  ) => Promise<void>;

  markChatThreadSeen: (threadId: number) => Promise<void>;
  markAllChatsSeen: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

function toTimestampMs(value?: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function getStoredChatLastSeen() {
  const stored = await AsyncStorage.getItem(CHAT_LAST_SEEN_KEY);
  if (!stored) return {} as Record<number, number>;
  try {
    const parsed = JSON.parse(stored) as Record<string, number>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, val]) => [Number(key), Number(val) || 0]),
    ) as Record<number, number>;
  } catch {
    return {} as Record<number, number>;
  }
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
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
  const [chatLastSeenMap, setChatLastSeenMap] = useState<Record<number, number>>(
    {},
  );

  const wsRef = useRef<WebSocket | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  const unreadChatThreads = useMemo(() => {
    return (chatThreads ?? []).filter((t) => {
      const lastAt = toTimestampMs(t.last_message_at);
      if (!lastAt) return false;
      const seenAt = chatLastSeenMap[t.thread_id] ?? 0;
      return lastAt > seenAt;
    });
  }, [chatLastSeenMap, chatThreads]);

  // Backend endpoints already return pending-only incoming lists.
  const friendPendingCount = friendRequests.incoming?.length ?? 0;
  const groupPendingCount =
    (groupRequests.incoming_invites?.length ?? 0) +
    (groupRequests.incoming_join_requests?.length ?? 0);
  const chatUnreadCount = unreadChatThreads.length;
  const totalBadgeCount = friendPendingCount + groupPendingCount + chatUnreadCount;

  const seedChatLastSeenIfEmpty = useCallback(
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
        threads.map((t) => [t.thread_id, toTimestampMs(t.last_message_at) || now]),
      ) as Record<number, number>;
      await AsyncStorage.setItem(CHAT_LAST_SEEN_KEY, JSON.stringify(seeded));
      setChatLastSeenMap(seeded);
      return seeded;
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const username = await AsyncStorage.getItem("mentora.username");
      setCurrentUsername(username);

      if (!username) {
        setFriendRequests({ incoming: [], outgoing: [] });
        setGroupRequests({
          incoming_invites: [],
          outgoing_invites: [],
          incoming_join_requests: [],
          outgoing_join_requests: [],
        });
        setChatThreads([]);
        setChatLastSeenMap({});
        return;
      }

      const storedChatLastSeen = await getStoredChatLastSeen();
      const [friendsRes, groupsRes, threadsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/friends/requests/${username}`),
        fetch(`${API_BASE_URL}/groups/requests/${encodeURIComponent(username)}`),
        fetch(`${API_BASE_URL}/chat/threads/${username}`),
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

      if (threadsRes.ok) {
        const data = await threadsRes.json();
        const threads = (data.threads ?? []) as ChatThreadItem[];
        setChatThreads(threads);
        await seedChatLastSeenIfEmpty(threads, storedChatLastSeen);
      } else {
        setChatThreads([]);
      }
    } finally {
      setLoading(false);
    }
  }, [seedChatLastSeenIfEmpty]);

  // Poll globally so badges update even without reopening modal.
  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Keep websocket in sync with current username.
  useEffect(() => {
    if (!currentUsername) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = API_BASE_URL.replace(/^http/, "ws").concat(
      `/chat/ws/${currentUsername}`,
    );
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "message") return;
        const message = payload.message as {
          thread_id: number;
          content: string;
          created_at: string;
        };
        setChatThreads((prev) =>
          (prev ?? []).map((t) =>
            t.thread_id === message.thread_id
              ? { ...t, last_message: message.content, last_message_at: message.created_at }
              : t,
          ),
        );
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      // ignore
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [currentUsername]);

  const persistChatLastSeen = useCallback(async (next: Record<number, number>) => {
    setChatLastSeenMap(next);
    await AsyncStorage.setItem(CHAT_LAST_SEEN_KEY, JSON.stringify(next));
  }, []);

  const markChatThreadSeen = useCallback(
    async (threadId: number) => {
      const thread = chatThreads.find((t) => t.thread_id === threadId);
      const seenAt = toTimestampMs(thread?.last_message_at) || Date.now();
      const next = { ...chatLastSeenMap, [threadId]: seenAt };
      await persistChatLastSeen(next);
    },
    [chatLastSeenMap, chatThreads, persistChatLastSeen],
  );

  const markAllChatsSeen = useCallback(async () => {
    if (!chatThreads.length) return;
    const next: Record<number, number> = { ...chatLastSeenMap };
    const now = Date.now();
    for (const t of chatThreads) {
      next[t.thread_id] = toTimestampMs(t.last_message_at) || now;
    }
    await persistChatLastSeen(next);
  }, [chatLastSeenMap, chatThreads, persistChatLastSeen]);

  const friendRequestAction = useCallback(
    async (requestId: number, action: "accept" | "decline" | "cancel") => {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) return;

        const res = await fetch(`${API_BASE_URL}/friends/requests/${requestId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        if (!res.ok) {
          const message = await res.json().catch(() => null);
          throw new Error(message?.detail ?? "Request failed");
        }

        setFriendRequests((prev) => ({
          incoming: (prev.incoming ?? []).filter((r) => r.request_id !== requestId),
          outgoing: (prev.outgoing ?? []).filter((r) => r.request_id !== requestId),
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed";
        Alert.alert("Error", msg);
      }
    },
    [],
  );

  const groupInviteAction = useCallback(
    async (inviteId: number, action: "accept" | "decline") => {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) return;

        const res = await fetch(`${API_BASE_URL}/groups/invites/${inviteId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        if (!res.ok) {
          const message = await res.json().catch(() => null);
          throw new Error(message?.detail ?? "Invite action failed");
        }

        setGroupRequests((prev) => ({
          ...prev,
          incoming_invites: (prev.incoming_invites ?? []).filter((i) => i.invite_id !== inviteId),
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invite action failed";
        Alert.alert("Error", msg);
      }
    },
    [],
  );

  const groupJoinRequestAction = useCallback(
    async (requestId: number, action: "approve" | "decline") => {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) return;

        const res = await fetch(`${API_BASE_URL}/groups/requests/${requestId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        if (!res.ok) {
          const message = await res.json().catch(() => null);
          throw new Error(message?.detail ?? "Request action failed");
        }

        setGroupRequests((prev) => ({
          ...prev,
          incoming_join_requests: (prev.incoming_join_requests ?? []).filter(
            (r) => r.request_id !== requestId,
          ),
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request action failed";
        Alert.alert("Error", msg);
      }
    },
    [],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      loading,
      friendRequests,
      groupRequests,
      chatThreads,
      unreadChatThreads,
      friendPendingCount,
      groupPendingCount,
      chatUnreadCount,
      totalBadgeCount,
      refresh,
      friendRequestAction,
      groupInviteAction,
      groupJoinRequestAction,
      markChatThreadSeen,
      markAllChatsSeen,
    }),
    [
      chatThreads,
      chatUnreadCount,
      friendPendingCount,
      friendRequests,
      groupPendingCount,
      groupRequests,
      loading,
      markAllChatsSeen,
      markChatThreadSeen,
      refresh,
      friendRequestAction,
      groupInviteAction,
      groupJoinRequestAction,
      totalBadgeCount,
      unreadChatThreads,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

