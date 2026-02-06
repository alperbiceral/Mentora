import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Index() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Gradient Background Layers */}
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />
      
      {/* PHONE-LIKE WRAPPER (helps on web) */}
      <View style={styles.wrapper}>
        {/* TOP CONTENT */}
        <View style={styles.content}>
          {/* Glass Card Container */}
          <View style={styles.glassCard}>
            {/* Radial Glow behind Illustration */}
            <View style={styles.radialGlow} />
            
            {/* Illustration */}
            <View style={styles.illustrationContainer}>
              <View style={styles.illustrationPlaceholder}>
                <Ionicons name="laptop" size={78} color="#7AA2FF" />
                <Ionicons
                  name="library"
                  size={56}
                  color="#93B5FF"
                  style={styles.bookIcon}
                />
              </View>
            </View>

            {/* Title */}
            <View style={styles.titleContainer}>
              <Text style={styles.title}>Welcome to</Text>
              <Text style={styles.brand}>MENTORA!</Text>
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              Build healthier study habits with personalized schedules, emotion
              tracking, and weekly guidance.
            </Text>
          </View>
        </View>

        {/* BOTTOM BUTTONS */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              pressed && styles.loginButtonPressed,
            ]}
            onPress={() => {}}
          >
            <Text style={styles.loginButtonText}>Login</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.createAccountButton,
              pressed && styles.createAccountButtonPressed,
            ]}
            onPress={() => {}}
          >
            <Text style={styles.createAccountButtonText}>Create Account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
    position: "relative",
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#0B1220",
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#101B2E",
  },

  // Makes web preview feel like a phone screen
  wrapper: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 34,
  },

  glassCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  radialGlow: {
    position: "absolute",
    top: 20,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(122,162,255,0.12)",
    opacity: 0.6,
  },

  illustrationContainer: {
    marginBottom: 26,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  illustrationPlaceholder: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(122,162,255,0.15)",
    borderRadius: 999,
    position: "relative",
  },
  bookIcon: {
    position: "absolute",
    bottom: 22,
    right: 26,
  },

  titleContainer: {
    alignItems: "center",
    marginBottom: 10,
    zIndex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#EAF0FF",
    textAlign: "center",
    letterSpacing: 0.3,
    lineHeight: 36,
  },
  brand: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: "800",
    color: "#7AA2FF",
    textAlign: "center",
    letterSpacing: 0.6,
    lineHeight: 38,
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(234,240,255,0.75)",
    textAlign: "center",
    paddingHorizontal: 8,
    maxWidth: 320,
    zIndex: 1,
  },

  buttonContainer: {
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 10 : 8,
    gap: 12,
  },

  loginButton: {
    backgroundColor: "#7AA2FF",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7AA2FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  loginButtonPressed: {
    opacity: 0.9,
  },
  loginButtonText: {
    color: "#0B1220",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  createAccountButton: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(234,240,255,0.35)",
    backgroundColor: "transparent",
  },
  createAccountButtonPressed: {
    opacity: 0.7,
  },
  createAccountButtonText: {
    color: "#EAF0FF",
    fontSize: 16,
    fontWeight: "700",
  },
});