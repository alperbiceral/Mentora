import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AuthGuard from "@/components/auth-guard";

const API_URL =
  Platform.OS === "web" ? "http://localhost:8000" : "http://192.168.1.118:8000";

interface Profile {
  id: number;
  user_id: number;
  full_name: string | null;
  school: string | null;
  description: string | null;
  age: number | null;
  department: string | null;
  created_at: string;
  updated_at: string;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [description, setDescription] = useState("");
  const [age, setAge] = useState("");
  const [department, setDepartment] = useState("");

  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token"); // For web

      const response = await fetch(`${API_URL}/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 404) {
        // Profile doesn't exist - show creation form
        setIsEditing(true);
        setProfile(null);
      } else if (response.ok) {
        const data = await response.json();
        setProfile(data);
        setFullName(data.full_name || "");
        setSchool(data.school || "");
        setDescription(data.description || "");
        setAge(data.age ? data.age.toString() : "");
        setDepartment(data.department || "");
      } else {
        const error = await response.json();
        if (Platform.OS === "web") {
          alert(`❌ ${error.detail || "Failed to fetch profile"}`);
        } else {
          Alert.alert("Error", error.detail || "Failed to fetch profile");
        }
      }
    } catch (error) {
      console.error(error);
      if (Platform.OS === "web") {
        alert("❌ Failed to connect to server");
      } else {
        Alert.alert("Error", "Failed to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName || !school || !description || !age || !department) {
      if (Platform.OS === "web") {
        alert("⚠️ Please fill in all fields");
      } else {
        Alert.alert("Error", "Please fill in all fields");
      }
      return;
    }

    if (isNaN(parseInt(age))) {
      if (Platform.OS === "web") {
        alert("⚠️ Age must be a number");
      } else {
        Alert.alert("Error", "Age must be a number");
      }
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem("token");

      const method = profile ? "PUT" : "POST";
      const response = await fetch(`${API_URL}/profile`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          school,
          description,
          age: parseInt(age),
          department,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
        setIsEditing(false);
        if (Platform.OS === "web") {
          alert("✅ Profile saved successfully!");
        } else {
          Alert.alert("Success", "Profile saved successfully!");
        }
      } else {
        const error = await response.json();
        if (Platform.OS === "web") {
          alert(`❌ ${error.detail || "Failed to save profile"}`);
        } else {
          Alert.alert("Error", error.detail || "Failed to save profile");
        }
      }
    } catch (error) {
      console.error(error);
      if (Platform.OS === "web") {
        alert("❌ Failed to connect to server");
      } else {
        Alert.alert("Error", "Failed to connect to server");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <View style={styles.container}>
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            style={styles.gradient}
          >
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
          </LinearGradient>
        </View>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <View style={styles.container}>
        <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.gradient}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              {!isEditing && profile ? (
                // View Mode
                <View style={styles.profileCard}>
                  <View style={styles.profileHeader}>
                    <Text style={styles.profileEmoji}>👤</Text>
                    <Text style={styles.nameText}>{profile.full_name}</Text>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.label}>School</Text>
                    <Text style={styles.value}>{profile.school}</Text>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Department</Text>
                    <Text style={styles.value}>{profile.department}</Text>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Age</Text>
                    <Text style={styles.value}>{profile.age}</Text>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.label}>Description</Text>
                    <Text style={styles.value}>{profile.description}</Text>
                  </View>

                  {/* TODO: Profile Photo */}
                  <View style={styles.todoSection}>
                    <Text style={styles.todoText}>
                      📷 TODO: Profile Photo Upload
                    </Text>
                  </View>

                  {/* TODO: Streak */}
                  <View style={styles.todoSection}>
                    <Text style={styles.todoText}>🔥 TODO: Streak Counter</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => setIsEditing(true)}
                  >
                    <Text style={styles.editButtonText}>Edit Profile</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Edit/Create Mode
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>
                    {profile ? "Edit Profile" : "Create Your Profile"}
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your full name"
                      value={fullName}
                      onChangeText={setFullName}
                      editable={!saving}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>School *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your school/university"
                      value={school}
                      onChangeText={setSchool}
                      editable={!saving}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Department *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your department/major"
                      value={department}
                      onChangeText={setDepartment}
                      editable={!saving}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Age *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your age"
                      value={age}
                      onChangeText={setAge}
                      keyboardType="numeric"
                      editable={!saving}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Description *</Text>
                    <TextInput
                      style={[styles.input, styles.descriptionInput]}
                      placeholder="Tell us about yourself"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                      editable={!saving}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      saving && styles.saveButtonDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Profile</Text>
                    )}
                  </TouchableOpacity>

                  {profile && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setIsEditing(false)}
                      disabled={saving}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  content: {
    marginTop: 16,
  },
  profileCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 24,
    padding: 24,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  profileEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  nameText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  infoSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    color: "#333",
  },
  todoSection: {
    backgroundColor: "#fff3cd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#ffc107",
  },
  todoText: {
    fontSize: 14,
    color: "#856404",
    fontWeight: "600",
  },
  editButton: {
    backgroundColor: "#667eea",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  editButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  formCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 24,
    padding: 24,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 24,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 20,
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
  descriptionInput: {
    height: 100,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#667eea",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "#e0e0e0",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "bold",
  },
});
