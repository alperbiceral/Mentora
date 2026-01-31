import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AuthGuard from "@/components/auth-guard";

export default function HomeScreen() {
  const router = useRouter();

  const handleLogout = () => {
    // Clear token
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("token");
    }
    router.replace("/login");
  };

  return (
    <AuthGuard>
      <View style={styles.container}>
        <LinearGradient colors={["#4facfe", "#00f2fe"]} style={styles.gradient}>
          <View style={styles.topBar}>
            <Text style={styles.title}>Mentora</Text>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => router.push("/profile")}
            >
              <Text style={styles.profileButtonText}>👤 Profile</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.emoji}>👋</Text>
              <Text style={styles.welcomeTitle}>Welcome to Mentora!</Text>
              <Text style={styles.subtitle}>You're successfully logged in</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardText}>
                Your personalized learning journey starts here.
              </Text>
              <Text style={styles.cardSubtext}>
                More features coming soon...
              </Text>
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  profileButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  profileButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#fff",
    opacity: 0.9,
    textAlign: "center",
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    padding: 32,
    marginBottom: 40,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  cardText: {
    fontSize: 18,
    color: "#333",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  cardSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  logoutButton: {
    backgroundColor: "#ff6b6b",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    shadowColor: "#ff6b6b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
