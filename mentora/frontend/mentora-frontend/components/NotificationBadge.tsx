import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Variant = "corner" | "inline";

type Props = {
  count: number;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function NotificationBadge({
  count,
  variant = "corner",
  style,
  textStyle,
}: Props) {
  const { colors } = useTheme();
  if (count <= 0) {
    return null;
  }

  const label = count >= 10 ? "9+" : String(count);

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.danger, borderColor: colors.backgroundAlt },
        variant === "corner" ? styles.corner : styles.inline,
        style,
      ]}
    >
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#0B1220",
    zIndex: 10,
  },
  corner: {
    position: "absolute",
    top: -4,
    right: -4,
  },
  inline: {
    position: "relative",
    borderWidth: 0,
    height: 16,
    minWidth: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 12,
  },
});

