import { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const API_URL =
  Platform.OS === "web" ? "http://localhost:8000" : "http://192.168.1.118:8000";

// Email validation
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    // Validation
    if (!email || !username || !password || !confirmPassword) {
      if (Platform.OS === "web") {
        alert("⚠️ Please fill in all required fields");
      } else {
        Alert.alert("⚠️ Error", "Please fill in all required fields");
      }
      return;
    }

    if (!isValidEmail(email)) {
      if (Platform.OS === "web") {
        alert("⚠️ Please enter a valid email address");
      } else {
        Alert.alert("⚠️ Invalid Email", "Please enter a valid email address");
      }
      return;
    }

    if (username.length < 3) {
      if (Platform.OS === "web") {
        alert("⚠️ Username must be at least 3 characters");
      } else {
        Alert.alert(
          "⚠️ Username Too Short",
          "Username must be at least 3 characters",
        );
      }
      return;
    }

    if (password.length < 6) {
      if (Platform.OS === "web") {
        alert("⚠️ Password must be at least 6 characters");
      } else {
        Alert.alert(
          "⚠️ Password Too Short",
          "Password must be at least 6 characters",
        );
      }
      return;
    }

    if (password !== confirmPassword) {
      if (Platform.OS === "web") {
        alert("⚠️ Passwords don't match");
      } else {
        Alert.alert(
          "⚠️ Passwords Don't Match",
          "Please make sure both passwords are the same",
        );
      }
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.detail || "Registration failed. Please try again";
        setLoading(false);
        if (Platform.OS === "web") {
          alert(`❌ Registration Failed\n${errorMsg}`);
        } else {
          Alert.alert("❌ Registration Failed", errorMsg);
        }
        return;
      }

      console.log("Registration successful:", data.user);
      setLoading(false);
      // Save token
      if (Platform.OS === "web") {
        localStorage.setItem("token", data.access_token);
        alert("✅ Account created! Logging in...");
        router.replace("/home");
      } else {
        Alert.alert("✅ Success", "Account created! Logging in...", [
          { text: "OK", onPress: () => router.replace("/home") },
        ]);
      }
    } catch (error) {
      console.error(error);
      setLoading(false);
      if (Platform.OS === "web") {
        alert("❌ Failed to connect to server");
      } else {
        Alert.alert("❌ Error", "Failed to connect to server");
      }
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#f093fb", "#f5576c", "#4facfe"]}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.logo}>✨</Text>
              <Text style={styles.title}>Join Mentora</Text>
              <Text style={styles.subtitle}>
                Create your account and start learning
              </Text>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#a0a0a0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Username *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Choose a username (min 3 chars)"
                  value={username}
                  onChangeText={setUsername}
                  editable={!loading}
                  autoCapitalize="none"
                  placeholderTextColor="#a0a0a0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a password (min 6 chars)"
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  secureTextEntry
                  placeholderTextColor="#a0a0a0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                  secureTextEntry
                  placeholderTextColor="#a0a0a0"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/login")}>
                  <Text style={styles.link}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  content: {
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#fff",
    opacity: 0.9,
    textAlign: "center",
  },
  formContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#000",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  button: {
    backgroundColor: "#f5576c",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#f5576c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: {
    color: "#666",
    fontSize: 14,
  },
  link: {
    color: "#f5576c",
    fontWeight: "bold",
    fontSize: 14,
  },
});
