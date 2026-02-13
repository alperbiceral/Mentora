import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  children: React.ReactNode;
};

export function AppContainer({ children }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.background },
        Platform.OS === "web" && styles.webConstraints,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
  webConstraints: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 16,
  },
});

