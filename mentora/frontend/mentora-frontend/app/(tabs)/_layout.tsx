import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
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
  const [badgeCount, setBadgeCount] = useState(0);

  const loadBadge = useCallback(() => {
    let active = true;
    const run = async () => {
      const username = await AsyncStorage.getItem("mentora.username");
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
              setBadgeCount(Number(count ?? 0));
            }
            return;
          }
        } catch (error) {
          // Fall back to stored count.
        }
      }

      const stored = await AsyncStorage.getItem("mentora.friendRequestsCount");
      if (active) {
        setBadgeCount(Number(stored ?? "0"));
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadBadge);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "friendRequestsCount",
      (count: number) => {
        setBadgeCount(Number(count ?? 0));
      },
    );
    return () => {
      sub.remove();
    };
  }, []);

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
              badgeCount={badgeCount}
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
