import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";

function TabIcon(props: {
  focused: boolean;
  color: string;
  size: number;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
}) {
  const { focused, color, size, activeName, inactiveName } = props;
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Ionicons
        name={focused ? activeName : inactiveName}
        color={color}
        size={size}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: isDark ? "#020617" : colors.backgroundAlt,
          borderTopColor: colors.borderSoft,
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

const styles = StyleSheet.create({});
