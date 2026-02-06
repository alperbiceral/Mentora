import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          Manage your account, preferences, and study profile here.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EAF1FF",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B2340",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#5E6A8A",
    textAlign: "center",
  },
});

