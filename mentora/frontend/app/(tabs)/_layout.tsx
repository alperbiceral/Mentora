import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const CHAT_UNREAD_TOTAL_KEY = "mentora.chatUnreadTotal";

function normalizeUsername(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function scopedStorageKey(base: string, username?: string | null) {
  return `${base}:${normalizeUsername(username)}`;
}

function TabIcon(props: {
  focused: boolean;
  color: string;
  size: number;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
  badgeCount?: number;
}) {
  const { focused, color, size, activeName, inactiveName, badgeCount = 0 } = props;
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Ionicons
        name={focused ? activeName : inactiveName}
        color={color}
        size={size}
      />
      {badgeCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: "#EF4444",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const currentUsernameRef = useRef<string | null>(null);

  useEffect(() => {
    currentUsernameRef.current = currentUsername;
  }, [currentUsername]);

  useEffect(() => {
    let active = true;
    (async () => {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!active) {
        return;
      }
      setCurrentUsername(username);
      const stored = username
        ? await AsyncStorage.getItem(scopedStorageKey(CHAT_UNREAD_TOTAL_KEY, username))
        : null;
      if (!active) {
        return;
      }
      setChatUnreadTotal(Number(stored) || 0);
    })();

    const refreshUnreadFromBackend = async () => {
      const username = await AsyncStorage.getItem("mentora.username");
      if (!active || !username) {
        return;
      }
      const normalized = normalizeUsername(username);
      try {
        const response = await fetch(
          `${API_BASE_URL}/chat/unread/${encodeURIComponent(username)}`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { total_unread?: number };
        const totalUnread = Number(data.total_unread ?? 0);
        await AsyncStorage.setItem(
          scopedStorageKey(CHAT_UNREAD_TOTAL_KEY, username),
          String(totalUnread),
        );
        if (normalized === normalizeUsername(currentUsernameRef.current)) {
          setChatUnreadTotal(totalUnread);
        }
      } catch {
        // keep last known badge value
      }
    };

    // Keep tab badge fresh even when Chat screen isn't active.
    void refreshUnreadFromBackend();
    const intervalId = setInterval(() => {
      void refreshUnreadFromBackend();
    }, 5000);

    const sub = DeviceEventEmitter.addListener(
      "chatUnreadTotalChanged",
      (payload: { username?: string; total?: number } | number) => {
        if (typeof payload === "number") {
          setChatUnreadTotal(Number(payload) || 0);
          return;
        }
        if (
          normalizeUsername(payload?.username) ===
          normalizeUsername(currentUsernameRef.current)
        ) {
          setChatUnreadTotal(Number(payload?.total) || 0);
        }
      },
    );
    return () => {
      active = false;
      clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
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
              badgeCount={chatUnreadTotal}
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
        name="study"
        options={{
          title: "Study",
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
            />
          ),
        }}
      />
    </Tabs>
  );
}
