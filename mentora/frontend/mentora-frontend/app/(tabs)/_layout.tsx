import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, StyleSheet, Text, View } from "react-native";

const ACTIVE_COLOR = "#6D5EF7";
const INACTIVE_COLOR = "#9BA5C9";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

function TabIcon(props: {
  focused: boolean;
  color: string;
  size: number;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
  badgeCount?: number;
}) {
  const { focused, color, size, activeName, inactiveName, badgeCount } = props;
  const showBadge = (badgeCount ?? 0) > 0;
  const badgeText =
    badgeCount && badgeCount > 9 ? "9+" : String(badgeCount ?? "");
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Ionicons
        name={focused ? activeName : inactiveName}
        color={color}
        size={size}
      />
      {showBadge ? (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const [friendBadgeCount, setFriendBadgeCount] = useState(0);
  const [chatBadgeCount, setChatBadgeCount] = useState(0);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [isChatActive, setIsChatActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadBadges = useCallback(() => {
    let active = true;
    const run = async () => {
      const username = await AsyncStorage.getItem("mentora.username");
      if (active) {
        setCurrentUsername(username);
      }
      if (username) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/friends/requests/${username}`,
          );
          if (response.ok) {
            const data = await response.json();
            const count = (data.incoming ?? []).length;
            await AsyncStorage.setItem(
              "mentora.friendRequestsCount",
              String(count),
            );
            if (active) {
              setFriendBadgeCount(Number(count ?? 0));
            }
          }
        } catch (error) {
          // Fall back to stored count.
        }
      }

      const stored = await AsyncStorage.getItem("mentora.friendRequestsCount");
      const storedChats = await AsyncStorage.getItem("mentora.chatUnreadCount");
      if (active) {
        setFriendBadgeCount(Number(stored ?? "0"));
        setChatBadgeCount(Number(storedChats ?? "0"));
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadBadges);

  useEffect(() => {
    const friendSub = DeviceEventEmitter.addListener(
      "friendRequestsCount",
      (count: number) => {
        setFriendBadgeCount(Number(count ?? 0));
      },
    );
    const chatSub = DeviceEventEmitter.addListener(
      "chatUnreadCount",
      (count: number) => {
        setChatBadgeCount(Number(count ?? 0));
      },
    );
    const chatFocusSub = DeviceEventEmitter.addListener(
      "chatFocus",
      (isActive: boolean) => {
        setIsChatActive(Boolean(isActive));
      },
    );
    return () => {
      friendSub.remove();
      chatSub.remove();
      chatFocusSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!currentUsername) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const wsUrl = API_BASE_URL.replace(/^http/, "ws").concat(
      `/chat/ws/${currentUsername}`,
    );
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const incrementUnread = async () => {
      const stored = await AsyncStorage.getItem("mentora.chatUnreadCount");
      const nextCount = Number(stored ?? "0") + 1;
      await AsyncStorage.setItem("mentora.chatUnreadCount", String(nextCount));
      DeviceEventEmitter.emit("chatUnreadCount", nextCount);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "message") {
          const message = payload.message as { sender?: string };
          if (message.sender && message.sender === currentUsername) {
            return;
          }
          if (!isChatActive) {
            incrementUnread();
          }
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
  }, [currentUsername, isChatActive]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: "#020617",
          borderTopColor: "#0B1120",
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeName="chatbubble-ellipses"
              inactiveName="chatbubble-ellipses-outline"
              badgeCount={chatBadgeCount}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeName="calendar"
              inactiveName="calendar-outline"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeName="home"
              inactiveName="home-outline"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="pomodoro"
        options={{
          title: "Pomodoro",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeName="time"
              inactiveName="time-outline"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeName="people"
              inactiveName="people-outline"
              badgeCount={friendBadgeCount}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badgeDot: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
