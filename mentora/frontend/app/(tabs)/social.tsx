import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const COLORS = {
  // Dark navy theme to match the login screen
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)", // glassy dark card
  subtleCard: "rgba(15,23,42,0.85)",
  // Use the same lavender as "See history >" everywhere
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  borderSoft: "rgba(148,163,184,0.18)",
  shadow: "#000000",
  online: "#10B981",
  offline: "#6B7280",
};

const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

type LeaderboardMetric = "hours" | "streak";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type Profile = {
  profile_id: number;
  username: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  university?: string | null;
  department?: string | null;
  streak_count: number;
  study_hours: number;
  personality?: string | null;
  profile_photo?: string | null;
  created_at: string;
  updated_at: string;
};

type FriendProfile = {
  username: string;
  full_name: string;
  university?: string | null;
  streak_count: number;
  study_hours: number;
  profile_photo?: string | null;
};

type LeaderboardEntry = {
  rank: number;
  username: string;
  full_name: string;
  university?: string | null;
  study_hours: number;
  streak_count: number;
  profile_photo?: string | null;
};

type FriendRequest = {
  request_id: number;
  from_username: string;
  to_username: string;
  status: string;
  created_at: string;
};

type GroupListItem = {
  group_id: number;
  name: string;
  description?: string | null;
  group_photo?: string | null;
  is_public: boolean;
  owner_username: string;
  members_count: number;
  chat_thread_id: number;
  is_member: boolean;
  is_owner: boolean;
};

type GroupInviteItem = {
  invite_id: number;
  group_id: number;
  group_name: string;
  group_photo?: string | null;
  from_username: string;
  to_username: string;
  status: string;
  created_at: string;
};

type GroupJoinRequestItem = {
  request_id: number;
  group_id: number;
  group_name: string;
  group_photo?: string | null;
  username: string;
  status: string;
  created_at: string;
};

type GroupRequestsList = {
  incoming_invites: GroupInviteItem[];
  outgoing_invites: GroupInviteItem[];
  incoming_join_requests: GroupJoinRequestItem[];
  outgoing_join_requests: GroupJoinRequestItem[];
};

type GroupMemberItem = {
  username: string;
  role: string;
};

type GroupLeaderboardEntry = {
  rank: number;
  username: string;
  full_name: string;
  university?: string | null;
  study_hours: number;
  streak_count: number;
  profile_photo?: string | null;
};

export default function SocialScreen() {
  const router = useRouter();
  const [leaderboardMetric, setLeaderboardMetric] =
    useState<LeaderboardMetric>("hours");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [groupRequests, setGroupRequests] = useState<GroupRequestsList>({
    incoming_invites: [],
    outgoing_invites: [],
    incoming_join_requests: [],
    outgoing_join_requests: [],
  });
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupPhoto, setGroupPhoto] = useState("");
  const [groupIsPublic, setGroupIsPublic] = useState(false);
  const [groupInvitees, setGroupInvitees] = useState<string[]>([]);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupListItem | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([]);
  const [groupLeaderboardOpen, setGroupLeaderboardOpen] = useState(false);
  const [groupLeaderboardEntries, setGroupLeaderboardEntries] = useState<
    GroupLeaderboardEntry[]
  >([]);
  const [groupLeaderboardLoading, setGroupLeaderboardLoading] = useState(false);
  const [activeLeaderboardGroupId, setActiveLeaderboardGroupId] = useState<
    number | null
  >(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<
    LeaderboardEntry[]
  >([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupPhotoDraft, setGroupPhotoDraft] = useState("");
  const [groupIsPublicDraft, setGroupIsPublicDraft] = useState(false);
  const [groupAddMembers, setGroupAddMembers] = useState<string[]>([]);
  const [groupRemoveMembers, setGroupRemoveMembers] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [transferOwnerUsername, setTransferOwnerUsername] = useState<
    string | null
  >(null);

  const loadSocialData = useCallback(() => {
    let active = true;
    const run = async () => {
      try {
        const username = await AsyncStorage.getItem("mentora.username");
        if (!username) {
          return;
        }
        if (active) {
          setCurrentUsername(username);
        }

        const [profileRes, friendsRes, requestsRes, groupsRes, groupReqsRes] =
          await Promise.all([
            fetch(`${API_BASE_URL}/profile/${username}`),
            fetch(`${API_BASE_URL}/friends/list/${username}`),
            fetch(`${API_BASE_URL}/friends/requests/${username}`),
            fetch(
              `${API_BASE_URL}/groups?username=${encodeURIComponent(username)}`,
            ),
            fetch(
              `${API_BASE_URL}/groups/requests/${encodeURIComponent(username)}`,
            ),
          ]);

        if (profileRes.ok) {
          const data = (await profileRes.json()) as Profile;
          if (active) {
            setProfile(data);
          }
        }

        if (friendsRes.ok) {
          const data = await friendsRes.json();
          if (active) {
            setFriends(data.friends ?? []);
          }
        }

        if (requestsRes.ok) {
          const data = await requestsRes.json();
          if (active) {
            setIncomingRequests(data.incoming ?? []);
            setOutgoingRequests(data.outgoing ?? []);
          }
        }

        if (groupsRes.ok) {
          const data = await groupsRes.json();
          if (active) {
            setGroups(data.groups ?? []);
          }
        }

        if (groupReqsRes.ok) {
          const data = await groupReqsRes.json();
          if (active) {
            setGroupRequests({
              incoming_invites: data.incoming_invites ?? [],
              outgoing_invites: data.outgoing_invites ?? [],
              incoming_join_requests: data.incoming_join_requests ?? [],
              outgoing_join_requests: data.outgoing_join_requests ?? [],
            });
          }
        }
      } catch (error) {
        if (active) {
          setFriends([]);
          setIncomingRequests([]);
          setOutgoingRequests([]);
          setGroups([]);
          setGroupRequests({
            incoming_invites: [],
            outgoing_invites: [],
            incoming_join_requests: [],
            outgoing_join_requests: [],
          });
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadSocialData);

  useEffect(() => {
    const run = async () => {
      setLeaderboardLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/profile/leaderboard?metric=${leaderboardMetric}`,
        );
        if (!response.ok) {
          throw new Error("Leaderboard fetch failed");
        }
        const data = (await response.json()) as LeaderboardEntry[];
        setLeaderboardEntries(data);
      } catch (error) {
        setLeaderboardEntries([]);
      } finally {
        setLeaderboardLoading(false);
      }
    };

    run();
  }, [leaderboardMetric]);

  useEffect(() => {
    if (!addFriendOpen) {
      return;
    }
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (!currentUsername) {
      return;
    }

    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/friends/search?query=${encodeURIComponent(
            searchQuery.trim(),
          )}&requester=${encodeURIComponent(currentUsername)}`,
        );
        if (!response.ok) {
          throw new Error("Search failed");
        }
        const data = await response.json();
        setSearchResults(data.results ?? []);
      } catch (error) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [addFriendOpen, searchQuery, currentUsername]);

  const onlineFriendsCount = 0;
  const currentUserStreak = profile?.streak_count ?? 0;
  const friendUsernames = new Set(friends.map((friend) => friend.username));
  const outgoingPending = new Set(
    outgoingRequests.map((request) => request.to_username),
  );
  const incomingGroupInvites = groupRequests.incoming_invites;
  const outgoingGroupInvites = groupRequests.outgoing_invites;
  const incomingJoinRequests = groupRequests.incoming_join_requests;
  const outgoingJoinRequests = groupRequests.outgoing_join_requests;
  const incomingInviteGroupIds = new Set(
    incomingGroupInvites.map((invite) => invite.group_id),
  );
  const outgoingJoinGroupIds = new Set(
    outgoingJoinRequests.map((request) => request.group_id),
  );
  const filteredSearchResults = searchResults.filter(
    (result) => !friendUsernames.has(result.username),
  );
  const isGroupOwner = activeGroup?.is_owner ?? false;
  const memberUsernames = new Set(
    groupMembers.map((member) => member.username),
  );
  const addableFriends = friends.filter(
    (friend) => !memberUsernames.has(friend.username),
  );

  const resetGroupForm = () => {
    setGroupName("");
    setGroupDescription("");
    setGroupPhoto("");
    setGroupIsPublic(false);
    setGroupInvitees([]);
  };

  const closeGroupCreate = () => {
    setGroupCreateOpen(false);
    resetGroupForm();
  };

  const handlePickGroupPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }
    const [asset] = result.assets;
    if (!asset.base64) {
      Alert.alert("Photo error", "Could not read the image.");
      return;
    }
    setGroupPhoto(asset.base64);
  };

  const handleCreateGroup = async () => {
    if (!currentUsername) {
      Alert.alert("Missing user", "Please login again.");
      return;
    }
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      Alert.alert("Missing info", "Group name is required.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUsername,
          name: trimmedName,
          description: groupDescription.trim() || undefined,
          is_public: groupIsPublic,
          group_photo: groupPhoto || undefined,
          invitees: groupInvitees,
        }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Create group failed");
      }
      setGroupCreateOpen(false);
      resetGroupForm();
      loadSocialData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Create group failed";
      Alert.alert("Error", message);
    }
  };

  const handleRequestJoin = async (groupId: number) => {
    if (!currentUsername) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/groups/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          username: currentUsername,
        }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Request failed");
      }
      loadSocialData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      Alert.alert("Error", message);
    }
  };

  const handleOpenGroupChat = (threadId: number) => {
    router.push({
      pathname: "/(tabs)/chat",
      params: { thread: String(threadId) },
    });
  };

  const toggleInvitee = (username: string) => {
    setGroupInvitees((prev) =>
      prev.includes(username)
        ? prev.filter((item) => item !== username)
        : [...prev, username],
    );
  };

  const closeGroupSettings = () => {
    setGroupSettingsOpen(false);
    setActiveGroup(null);
    setGroupMembers([]);
    setGroupNameDraft("");
    setGroupDescriptionDraft("");
    setGroupPhotoDraft("");
    setGroupIsPublicDraft(false);
    setGroupAddMembers([]);
    setGroupRemoveMembers([]);
    setTransferOwnerUsername(null);
  };

  const openGroupSettings = async (group: GroupListItem) => {
    setActiveGroup(group);
    setGroupNameDraft(group.name);
    setGroupDescriptionDraft(group.description ?? "");
    setGroupPhotoDraft(group.group_photo ?? "");
    setGroupIsPublicDraft(group.is_public);
    setGroupAddMembers([]);
    setGroupRemoveMembers([]);
    setTransferOwnerUsername(null);
    setGroupSettingsOpen(true);

    setLoadingMembers(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/groups/${group.group_id}/members`,
      );
      if (response.ok) {
        const data = await response.json();
        setGroupMembers(data.members ?? []);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const openGroupLeaderboard = (groupId: number) => {
    setActiveLeaderboardGroupId(groupId);
    setGroupLeaderboardOpen(true);
    void loadGroupLeaderboard(groupId);
  };

  const loadGroupLeaderboard = async (groupId: number) => {
    setGroupLeaderboardLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/groups/${groupId}/leaderboard?metric=hours`,
      );
      if (!response.ok) {
        throw new Error("Leaderboard fetch failed");
      }
      const data = (await response.json()) as GroupLeaderboardEntry[];
      setGroupLeaderboardEntries(data);
    } catch (error) {
      setGroupLeaderboardEntries([]);
    } finally {
      setGroupLeaderboardLoading(false);
    }
  };

  const toggleAddMember = (username: string) => {
    setGroupAddMembers((prev) =>
      prev.includes(username)
        ? prev.filter((item) => item !== username)
        : [...prev, username],
    );
  };

  const toggleRemoveMember = (username: string) => {
    setGroupRemoveMembers((prev) =>
      prev.includes(username)
        ? prev.filter((item) => item !== username)
        : [...prev, username],
    );
  };

  const handlePickSettingsPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }
    const [asset] = result.assets;
    if (!asset.base64) {
      Alert.alert("Photo error", "Could not read the image.");
      return;
    }
    setGroupPhotoDraft(asset.base64);
  };

  const handleSaveGroupSettings = async () => {
    if (!currentUsername || !activeGroup) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/groups/${activeGroup.group_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUsername,
            name: groupNameDraft.trim() || undefined,
            description: groupDescriptionDraft.trim() || undefined,
            group_photo: groupPhotoDraft || undefined,
            is_public: groupIsPublicDraft,
            add_members: groupAddMembers,
            remove_members: groupRemoveMembers,
          }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Update failed");
      }
      closeGroupSettings();
      loadSocialData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      Alert.alert("Error", message);
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentUsername || !activeGroup) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/groups/${activeGroup.group_id}/leave`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: currentUsername }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Leave failed");
      }
      closeGroupSettings();
      loadSocialData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Leave failed";
      Alert.alert("Error", message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!currentUsername || !activeGroup) {
      return;
    }
    const groupId = activeGroup.group_id;
    const username = currentUsername;

    const runDelete = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/groups/${groupId}/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          },
        );
        if (!response.ok) {
          const message = await response.json().catch(() => null);
          throw new Error(message?.detail ?? "Delete failed");
        }
        closeGroupSettings();
        loadSocialData();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Delete failed";
        Alert.alert("Error", message);
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "This will remove the group for everyone. Continue?",
      );
      if (confirmed) {
        await runDelete();
      }
      return;
    }

    Alert.alert("Delete group", "This will remove the group for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: runDelete,
      },
    ]);
  };

  const handleTransferOwner = async () => {
    if (!currentUsername || !activeGroup || !transferOwnerUsername) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/groups/${activeGroup.group_id}/transfer-owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUsername,
            new_owner_username: transferOwnerUsername,
          }),
        },
      );
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.detail ?? "Transfer failed");
      }
      closeGroupSettings();
      loadSocialData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transfer failed";
      Alert.alert("Error", message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fake gradient using two layers to feel like the login page */}
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <View style={styles.glow} />

      <View style={styles.wrapper}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          {/* Header (this will be sticky) */}
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Social</Text>
            <View style={styles.headerStatsRow}>
              <View style={styles.statItem}>
                <Ionicons name="wifi" size={16} color={COLORS.online} />
                <Text style={styles.statText}>
                  Online: {onlineFriendsCount}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="flame" size={16} color={COLORS.accent} />
                <Text style={styles.statText}>
                  {currentUserStreak} day streak
                </Text>
              </View>
            </View>
          </View>

          {/* Friends Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Friends</Text>
              <View style={styles.headerTabs}>
                <Pressable
                  hitSlop={8}
                  style={[
                    styles.headerTab,
                    addFriendOpen && styles.headerTabActive,
                  ]}
                  onPress={() => {
                    setAddFriendOpen(true);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                >
                  <Text
                    style={[
                      styles.headerTabText,
                      addFriendOpen && styles.headerTabTextActive,
                    ]}
                  >
                    Add friend +
                  </Text>
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.friendsList}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends yet</Text>
              ) : (
                friends.map((friend) => (
                  <View key={friend.username} style={styles.friendItem}>
                    <View style={styles.friendAvatar}>
                      {friend.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${friend.profile_photo}`,
                          }}
                          style={styles.friendAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>
                        {friend.full_name || friend.username}
                      </Text>
                      <Text style={styles.friendStats}>
                        {friend.university ?? `@${friend.username}`} •{" "}
                        {friend.streak_count} day streak
                      </Text>
                    </View>
                    <Pressable
                      style={styles.messageButton}
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/chat",
                          params: { friend: friend.username },
                        })
                      }
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={16}
                        color={COLORS.accent}
                      />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </View>

          {/* Study Groups Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Study Groups</Text>
              <View style={styles.headerTabs}>
                <Pressable
                  hitSlop={8}
                  style={styles.headerTab}
                  onPress={() => {
                    resetGroupForm();
                    setGroupCreateOpen(true);
                  }}
                >
                  <Text style={styles.headerTabText}>Create group +</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.groupsList}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {groups.length === 0 ? (
                <Text style={styles.emptyText}>No groups yet</Text>
              ) : (
                groups.map((group) => {
                  const hasInvite = incomingInviteGroupIds.has(group.group_id);
                  const hasRequest = outgoingJoinGroupIds.has(group.group_id);
                  return (
                    <Pressable
                      key={group.group_id}
                      style={styles.groupCard}
                      onPress={() =>
                        group.is_member
                          ? handleOpenGroupChat(group.chat_thread_id)
                          : null
                      }
                    >
                      <View style={styles.groupHeader}>
                        <View style={styles.groupAvatar}>
                          {group.group_photo ? (
                            <Image
                              source={{
                                uri: `data:image/jpeg;base64,${group.group_photo}`,
                              }}
                              style={styles.groupAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="people-outline"
                              size={18}
                              color={COLORS.textMuted}
                            />
                          )}
                        </View>
                        <View style={styles.groupInfo}>
                          <View style={styles.groupTitleRow}>
                            <Text style={styles.groupName}>{group.name}</Text>
                            <View
                              style={
                                group.is_public
                                  ? styles.groupBadgePublic
                                  : styles.groupBadgePrivate
                              }
                            >
                              <Text style={styles.groupBadgeText}>
                                {group.is_public ? "Public" : "Private"}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.groupMembers}>
                            {group.members_count} members
                          </Text>
                        </View>
                        {group.is_member ? (
                          <Pressable
                            hitSlop={8}
                            style={styles.groupSettingsButton}
                            onPress={() => openGroupSettings(group)}
                          >
                            <Ionicons
                              name="settings-outline"
                              size={18}
                              color={COLORS.textSecondary}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      {group.description ? (
                        <Text style={styles.groupDescription}>
                          {group.description}
                        </Text>
                      ) : null}
                      <View style={styles.groupActionsRow}>
                        {group.is_member ? (
                          <View style={styles.groupActionButtons}>
                            <Pressable
                              style={styles.groupActionPrimary}
                              onPress={() =>
                                handleOpenGroupChat(group.chat_thread_id)
                              }
                            >
                              <Text style={styles.groupActionPrimaryText}>
                                Chat
                              </Text>
                            </Pressable>
                            <Pressable
                              style={styles.groupActionSecondary}
                              onPress={() =>
                                openGroupLeaderboard(group.group_id)
                              }
                            >
                              <Ionicons
                                name="podium-outline"
                                size={14}
                                color={COLORS.accent}
                              />
                              <Text style={styles.groupActionSecondaryText}>
                                Leaderboard
                              </Text>
                            </Pressable>
                          </View>
                        ) : group.is_public ? (
                          hasRequest ? (
                            <View style={styles.groupActionMuted}>
                              <Text style={styles.groupActionMutedText}>
                                Requested
                              </Text>
                            </View>
                          ) : hasInvite ? (
                            <View style={styles.groupActionMuted}>
                              <Text style={styles.groupActionMutedText}>
                                Invited
                              </Text>
                            </View>
                          ) : (
                            <Pressable
                              style={styles.groupActionPrimary}
                              onPress={() => handleRequestJoin(group.group_id)}
                            >
                              <Text style={styles.groupActionPrimaryText}>
                                Request to join
                              </Text>
                            </Pressable>
                          )
                        ) : hasInvite ? (
                          <View style={styles.groupActionMuted}>
                            <Text style={styles.groupActionMutedText}>
                              Invited
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.groupActionMuted}>
                            <Text style={styles.groupActionMutedText}>
                              Invite only
                            </Text>
                          </View>
                        )}
                        {group.is_owner ? (
                          <Text style={styles.groupOwnerTag}>Owner</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* Leaderboards Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Leaderboards</Text>
              <View style={styles.leaderboardToggle}>
                <Pressable
                  style={[
                    styles.toggleButton,
                    leaderboardMetric === "hours" && styles.toggleButtonActive,
                  ]}
                  onPress={() => setLeaderboardMetric("hours")}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      leaderboardMetric === "hours" && styles.toggleTextActive,
                    ]}
                  >
                    Study hours
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.toggleButton,
                    leaderboardMetric === "streak" && styles.toggleButtonActive,
                  ]}
                  onPress={() => setLeaderboardMetric("streak")}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      leaderboardMetric === "streak" && styles.toggleTextActive,
                    ]}
                  >
                    Streak
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.leaderboardList}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {leaderboardLoading ? (
                <Text style={styles.emptyText}>Loading...</Text>
              ) : leaderboardEntries.length === 0 ? (
                <Text style={styles.emptyText}>No leaderboard data yet</Text>
              ) : (
                leaderboardEntries.map((entry) => (
                  <View
                    key={`${entry.username}-${entry.rank}`}
                    style={styles.leaderboardItem}
                  >
                    <View style={styles.rankContainer}>
                      <Text style={styles.rankNumber}>{entry.rank}</Text>
                      {entry.rank <= 3 && (
                        <Ionicons
                          name={
                            entry.rank === 1
                              ? "trophy"
                              : entry.rank === 2
                                ? "medal-outline"
                                : "medal"
                          }
                          size={18}
                          color={
                            entry.rank === 1
                              ? "#FBBF24"
                              : entry.rank === 2
                                ? "#9CA3AF"
                                : "#A0744F"
                          }
                        />
                      )}
                    </View>
                    <View style={styles.friendAvatar}>
                      {entry.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${entry.profile_photo}`,
                          }}
                          style={styles.friendAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.leaderboardInfo}>
                      <Text style={styles.leaderboardName}>
                        {entry.full_name || entry.username}
                      </Text>
                      <Text style={styles.leaderboardStats}>
                        {entry.university ?? `@${entry.username}`}
                      </Text>
                    </View>
                    {leaderboardMetric === "hours" ? (
                      <Text style={styles.leaderboardValue}>
                        {formatLeaderboardHours(entry.study_hours ?? 0)}
                      </Text>
                    ) : (
                      <View style={styles.leaderboardStreak}>
                        <Ionicons
                          name="flame"
                          size={16}
                          color={COLORS.accent}
                        />
                        <Text style={styles.leaderboardStreakValue}>
                          {entry.streak_count ?? 0}
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={groupLeaderboardOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupLeaderboardOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setGroupLeaderboardOpen(false)}
        >
          <Pressable
            style={styles.groupLeaderboardModal}
            onPress={() => {
              // noop
            }}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Group leaderboard</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={() => setGroupLeaderboardOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupLeaderboardTabs}
            >
              {groups.map((group) => (
                <Pressable
                  key={group.group_id}
                  style={[
                    styles.groupLeaderboardTab,
                    activeLeaderboardGroupId === group.group_id &&
                      styles.groupLeaderboardTabActive,
                  ]}
                  onPress={() => {
                    setActiveLeaderboardGroupId(group.group_id);
                    void loadGroupLeaderboard(group.group_id);
                  }}
                >
                  <Text
                    style={[
                      styles.groupLeaderboardTabText,
                      activeLeaderboardGroupId === group.group_id &&
                        styles.groupLeaderboardTabTextActive,
                    ]}
                  >
                    {group.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView showsVerticalScrollIndicator={false}>
              {groupLeaderboardLoading ? (
                <Text style={styles.emptyText}>Loading...</Text>
              ) : groupLeaderboardEntries.length === 0 ? (
                <Text style={styles.emptyText}>No group data yet</Text>
              ) : (
                <View style={styles.leaderboardList}>
                  {groupLeaderboardEntries.map((entry) => (
                    <View
                      key={`${entry.username}-${entry.rank}`}
                      style={styles.leaderboardItem}
                    >
                      <View style={styles.rankContainer}>
                        <Text style={styles.rankNumber}>{entry.rank}</Text>
                        {entry.rank <= 3 && (
                          <Ionicons
                            name={
                              entry.rank === 1
                                ? "trophy"
                                : entry.rank === 2
                                  ? "medal-outline"
                                  : "medal"
                            }
                            size={18}
                            color={
                              entry.rank === 1
                                ? "#FBBF24"
                                : entry.rank === 2
                                  ? "#9CA3AF"
                                  : "#A0744F"
                            }
                          />
                        )}
                      </View>
                      <View style={styles.friendAvatar}>
                        {entry.profile_photo ? (
                          <Image
                            source={{
                              uri: `data:image/jpeg;base64,${entry.profile_photo}`,
                            }}
                            style={styles.friendAvatarImage}
                          />
                        ) : (
                          <Ionicons
                            name="person"
                            size={18}
                            color={COLORS.textMuted}
                          />
                        )}
                      </View>
                      <View style={styles.leaderboardInfo}>
                        <Text style={styles.leaderboardName}>
                          {entry.full_name || entry.username}
                        </Text>
                        <Text style={styles.leaderboardStats}>
                          {entry.university ?? `@${entry.username}`}
                        </Text>
                      </View>
                      <Text style={styles.leaderboardValue}>
                        {formatLeaderboardHours(entry.study_hours ?? 0)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={addFriendOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddFriendOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAddFriendOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={() => {
              // noop
            }}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Add Friend</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={() => setAddFriendOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholder="Type a username"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {searchLoading ? (
              <Text style={styles.searchStatus}>Searching...</Text>
            ) : null}

            {searchQuery.trim().length > 0 &&
            filteredSearchResults.length === 0 &&
            !searchLoading ? (
              <Text style={styles.searchStatus}>No matches</Text>
            ) : null}

            <View style={styles.searchResults}>
              {filteredSearchResults.map((result) => {
                const isPending = outgoingPending.has(result.username);
                return (
                  <View key={result.username} style={styles.searchItem}>
                    <View style={styles.searchAvatar}>
                      {result.profile_photo ? (
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${result.profile_photo}`,
                          }}
                          style={styles.searchAvatarImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.textMuted}
                        />
                      )}
                    </View>
                    <View style={styles.searchInfo}>
                      <Text style={styles.friendName}>
                        {result.full_name || result.username}
                      </Text>
                      <Text style={styles.friendStats}>@{result.username}</Text>
                    </View>
                    {isPending ? (
                      <View style={styles.pendingButton}>
                        <Text style={styles.pendingButtonText}>Pending</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.addButton}
                        onPress={async () => {
                          if (!currentUsername) {
                            Alert.alert("Missing user", "Please login again.");
                            return;
                          }
                          try {
                            const response = await fetch(
                              `${API_BASE_URL}/friends/request`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  from_username: currentUsername,
                                  to_username: result.username,
                                }),
                              },
                            );
                            if (!response.ok) {
                              const message = await response
                                .json()
                                .catch(() => null);
                              throw new Error(
                                message?.detail ?? "Request failed",
                              );
                            }
                            const created =
                              (await response.json()) as FriendRequest;
                            setOutgoingRequests((prev) => [created, ...prev]);
                            Alert.alert("Request sent");
                            loadSocialData();
                          } catch (error) {
                            const message =
                              error instanceof Error
                                ? error.message
                                : "Request failed";
                            Alert.alert("Error", message);
                          }
                        }}
                      >
                        <Text style={styles.addButtonText}>Add</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={groupCreateOpen}
        transparent
        animationType="fade"
        onRequestClose={closeGroupCreate}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeGroupCreate}>
          <Pressable
            style={styles.groupModalCard}
            onPress={() => {
              // noop
            }}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Create group</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={closeGroupCreate}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              style={styles.groupInput}
              placeholder="Group name"
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              value={groupDescription}
              onChangeText={setGroupDescription}
              style={styles.groupTextArea}
              placeholder="Description"
              placeholderTextColor={COLORS.textMuted}
              multiline
            />

            <View style={styles.groupPhotoRow}>
              <View style={styles.groupPhotoPreview}>
                {groupPhoto ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${groupPhoto}` }}
                    style={styles.groupPhotoImage}
                  />
                ) : (
                  <Ionicons
                    name="image-outline"
                    size={18}
                    color={COLORS.textMuted}
                  />
                )}
              </View>
              <View style={styles.groupPhotoActions}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handlePickGroupPhoto}
                >
                  <Text style={styles.secondaryButtonText}>Upload photo</Text>
                </Pressable>
                {groupPhoto ? (
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setGroupPhoto("")}
                  >
                    <Text style={styles.secondaryButtonText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.privacyRow}>
              <Text style={styles.privacyLabel}>Privacy</Text>
              <View style={styles.privacyToggle}>
                <Pressable
                  style={[
                    styles.privacyOption,
                    groupIsPublic && styles.privacyOptionActive,
                  ]}
                  onPress={() => setGroupIsPublic(true)}
                >
                  <Text
                    style={[
                      styles.privacyOptionText,
                      groupIsPublic && styles.privacyOptionTextActive,
                    ]}
                  >
                    Public
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.privacyOption,
                    !groupIsPublic && styles.privacyOptionActive,
                  ]}
                  onPress={() => setGroupIsPublic(false)}
                >
                  <Text
                    style={[
                      styles.privacyOptionText,
                      !groupIsPublic && styles.privacyOptionTextActive,
                    ]}
                  >
                    Private
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inviteSection}>
              <Text style={styles.inviteTitle}>Invite friends</Text>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends to invite</Text>
              ) : (
                <ScrollView
                  style={styles.inviteList}
                  showsVerticalScrollIndicator={false}
                >
                  {friends.map((friend) => {
                    const selected = groupInvitees.includes(friend.username);
                    return (
                      <Pressable
                        key={friend.username}
                        style={[
                          styles.inviteItem,
                          selected && styles.inviteItemSelected,
                        ]}
                        onPress={() => toggleInvitee(friend.username)}
                      >
                        <View style={styles.inviteAvatar}>
                          {friend.profile_photo ? (
                            <Image
                              source={{
                                uri: `data:image/jpeg;base64,${friend.profile_photo}`,
                              }}
                              style={styles.inviteAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="person"
                              size={16}
                              color={COLORS.textMuted}
                            />
                          )}
                        </View>
                        <View style={styles.inviteInfo}>
                          <Text style={styles.friendName}>
                            {friend.full_name || friend.username}
                          </Text>
                          <Text style={styles.friendStats}>
                            @{friend.username}
                          </Text>
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={18}
                          color={selected ? COLORS.accent : COLORS.borderSubtle}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <Pressable style={styles.primaryButton} onPress={handleCreateGroup}>
              <Text style={styles.primaryButtonText}>Create group</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={groupSettingsOpen}
        transparent
        animationType="fade"
        onRequestClose={closeGroupSettings}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeGroupSettings}>
          <Pressable
            style={styles.groupModalCard}
            onPress={() => {
              // noop
            }}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Group settings</Text>
              <Pressable
                hitSlop={8}
                style={styles.modalClose}
                onPress={closeGroupSettings}
              >
                <Ionicons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            {!activeGroup ? (
              <Text style={styles.emptyText}>No group selected</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <TextInput
                  value={groupNameDraft}
                  onChangeText={setGroupNameDraft}
                  style={styles.groupInput}
                  placeholder="Group name"
                  placeholderTextColor={COLORS.textMuted}
                  editable={isGroupOwner}
                />
                <TextInput
                  value={groupDescriptionDraft}
                  onChangeText={setGroupDescriptionDraft}
                  style={styles.groupTextArea}
                  placeholder="Description"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  editable={isGroupOwner}
                />

                <View style={styles.groupPhotoRow}>
                  <View style={styles.groupPhotoPreview}>
                    {groupPhotoDraft ? (
                      <Image
                        source={{
                          uri: `data:image/jpeg;base64,${groupPhotoDraft}`,
                        }}
                        style={styles.groupPhotoImage}
                      />
                    ) : (
                      <Ionicons
                        name="image-outline"
                        size={18}
                        color={COLORS.textMuted}
                      />
                    )}
                  </View>
                  <View style={styles.groupPhotoActions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={handlePickSettingsPhoto}
                      disabled={!isGroupOwner}
                    >
                      <Text style={styles.secondaryButtonText}>
                        Update photo
                      </Text>
                    </Pressable>
                    {groupPhotoDraft ? (
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setGroupPhotoDraft("")}
                        disabled={!isGroupOwner}
                      >
                        <Text style={styles.secondaryButtonText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.privacyRow}>
                  <Text style={styles.privacyLabel}>Privacy</Text>
                  <View style={styles.privacyToggle}>
                    <Pressable
                      style={[
                        styles.privacyOption,
                        groupIsPublicDraft && styles.privacyOptionActive,
                      ]}
                      onPress={() => setGroupIsPublicDraft(true)}
                      disabled={!isGroupOwner}
                    >
                      <Text
                        style={[
                          styles.privacyOptionText,
                          groupIsPublicDraft && styles.privacyOptionTextActive,
                        ]}
                      >
                        Public
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.privacyOption,
                        !groupIsPublicDraft && styles.privacyOptionActive,
                      ]}
                      onPress={() => setGroupIsPublicDraft(false)}
                      disabled={!isGroupOwner}
                    >
                      <Text
                        style={[
                          styles.privacyOptionText,
                          !groupIsPublicDraft && styles.privacyOptionTextActive,
                        ]}
                      >
                        Private
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.settingsSection}>
                  <Text style={styles.settingsTitle}>Members</Text>
                  {loadingMembers ? (
                    <Text style={styles.emptyText}>Loading members...</Text>
                  ) : groupMembers.length === 0 ? (
                    <Text style={styles.emptyText}>No members yet</Text>
                  ) : (
                    groupMembers.map((member) => {
                      const isOwner =
                        member.username === activeGroup.owner_username;
                      const selected = groupRemoveMembers.includes(
                        member.username,
                      );
                      return (
                        <Pressable
                          key={member.username}
                          style={styles.memberRow}
                          onPress={() =>
                            isGroupOwner && !isOwner
                              ? toggleRemoveMember(member.username)
                              : null
                          }
                        >
                          <Text style={styles.memberName}>
                            @{member.username}
                          </Text>
                          {isOwner ? (
                            <Text style={styles.ownerPill}>Owner</Text>
                          ) : isGroupOwner ? (
                            <View style={styles.memberActions}>
                              <Pressable
                                style={styles.ownerActionButton}
                                onPress={() =>
                                  setTransferOwnerUsername(member.username)
                                }
                              >
                                <Text style={styles.ownerActionText}>
                                  Make owner
                                </Text>
                              </Pressable>
                              <Ionicons
                                name={selected ? "checkbox" : "square-outline"}
                                size={18}
                                color={
                                  selected ? COLORS.accent : COLORS.borderSubtle
                                }
                              />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>

                {isGroupOwner && transferOwnerUsername ? (
                  <View style={styles.ownerTransferRow}>
                    <Text style={styles.ownerTransferText}>
                      New owner: @{transferOwnerUsername}
                    </Text>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleTransferOwner}
                    >
                      <Text style={styles.primaryButtonText}>
                        Transfer owner
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {isGroupOwner ? (
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsTitle}>Add members</Text>
                    {addableFriends.length === 0 ? (
                      <Text style={styles.emptyText}>No friends to add</Text>
                    ) : (
                      addableFriends.map((friend) => {
                        const selected = groupAddMembers.includes(
                          friend.username,
                        );
                        return (
                          <Pressable
                            key={friend.username}
                            style={styles.memberRow}
                            onPress={() => toggleAddMember(friend.username)}
                          >
                            <Text style={styles.memberName}>
                              @{friend.username}
                            </Text>
                            <Ionicons
                              name={selected ? "checkbox" : "square-outline"}
                              size={18}
                              color={
                                selected ? COLORS.accent : COLORS.borderSubtle
                              }
                            />
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}

                <View style={styles.settingsActions}>
                  {isGroupOwner ? (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleSaveGroupSettings}
                    >
                      <Text style={styles.primaryButtonText}>Save changes</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.secondaryDangerButton}
                    onPress={handleLeaveGroup}
                  >
                    <Text style={styles.secondaryDangerText}>Leave group</Text>
                  </Pressable>
                  {isGroupOwner ? (
                    <Pressable
                      style={styles.dangerButton}
                      onPress={handleDeleteGroup}
                    >
                      <Text style={styles.dangerButtonText}>Delete group</Text>
                    </Pressable>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const formatLeaderboardHours = (hours: number) => {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded}h`;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0B1220",
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: "#0F1A2B",
    opacity: 0.45,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(109,94,247,0.18)",
    opacity: 0.25,
  },
  wrapper: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    paddingHorizontal: SPACING.lg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  requestsModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "78%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  groupModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  scrollContent: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.md,
  },
  headerCard: {
    marginTop: 10,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  headerStatsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: "rgba(15,23,42,0.8)",
    borderRadius: 12,
  },
  statText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: "600",
    marginLeft: SPACING.xs,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.borderSubtle,
    marginHorizontal: SPACING.sm,
  },
  section: {
    marginTop: SPACING.xs,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
  },
  headerTabs: {
    flexDirection: "row",
    gap: 8,
  },
  headerTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  headerTabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  headerTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  headerTabTextActive: {
    color: "#0B1020",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  linkText: {
    fontSize: 12,
    color: COLORS.accentSoft,
    fontWeight: "500",
  },
  friendsList: {
    gap: SPACING.sm,
  },
  listScroll: {
    maxHeight: 320,
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
  },
  groupInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
    marginBottom: SPACING.sm,
  },
  groupTextArea: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    backgroundColor: "#020617",
    marginBottom: SPACING.sm,
    textAlignVertical: "top",
  },
  searchStatus: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  searchResults: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  searchItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 14,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  searchAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(2,6,23,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  searchAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  searchInfo: {
    flex: 1,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  addButtonText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 12,
  },
  pendingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.18)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  pendingButtonText: {
    color: COLORS.textSecondary,
    fontWeight: "700",
    fontSize: 12,
  },
  groupPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  groupPhotoPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupPhotoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  groupPhotoActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: SPACING.sm,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 13,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  privacyLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  privacyToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  privacyOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  privacyOptionActive: {
    backgroundColor: COLORS.accent,
  },
  privacyOptionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  privacyOptionTextActive: {
    color: "#0B1020",
    fontWeight: "700",
  },
  inviteSection: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  inviteTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  inviteList: {
    maxHeight: 200,
  },
  inviteItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 14,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: SPACING.sm,
  },
  inviteItemSelected: {
    borderColor: COLORS.accent,
  },
  inviteAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(2,6,23,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  inviteAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  inviteInfo: {
    flex: 1,
  },
  requestsPanel: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  requestsScroll: {
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  requestsSection: {
    gap: SPACING.sm,
  },
  requestsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 14,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  requestItemWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
  },
  acceptButtonText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 12,
  },
  declineButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  declineButtonText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 12,
  },
  cancelButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 12,
  },
  requestStatus: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  requestInfo: {
    flex: 1,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
    position: "relative",
  },
  friendAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  friendStats: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  messageButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: "rgba(15,23,42,0.8)",
  },
  groupsList: {
    gap: SPACING.sm,
  },
  groupCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  groupSettingsButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  groupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
    backgroundColor: "rgba(2,6,23,0.7)",
  },
  groupAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  groupInfo: {
    flex: 1,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  groupName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  groupBadgePublic: {
    backgroundColor: "rgba(16,185,129,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgePrivate: {
    backgroundColor: "rgba(148,163,184,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  groupMembers: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  groupDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  groupActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  groupActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupActionPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  groupActionPrimaryText: {
    color: "#0B1020",
    fontWeight: "700",
    fontSize: 12,
  },
  groupActionSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  groupActionSecondaryText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 12,
  },
  groupActionMuted: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  groupActionMutedText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 12,
  },
  groupOwnerTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.accent,
  },
  settingsSection: {
    marginTop: SPACING.sm,
  },
  settingsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.subtleCard,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: SPACING.xs,
  },
  memberName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  ownerPill: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.accent,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownerActionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  ownerActionText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  ownerTransferRow: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  ownerTransferText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  settingsActions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  dangerButton: {
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.14)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.5)",
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#FCA5A5",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryDangerButton: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    alignItems: "center",
  },
  secondaryDangerText: {
    color: "#FCA5A5",
    fontWeight: "700",
    fontSize: 13,
  },
  leaderboardToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignSelf: "flex-start",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
  },
  toggleButtonActive: {
    backgroundColor: "rgba(148,163,184,0.24)",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  toggleTextActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  leaderboardContainer: {
    gap: SPACING.sm,
  },
  leaderboardList: {
    gap: SPACING.sm,
  },
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  leaderboardStats: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  leaderboardValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  leaderboardStreak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  leaderboardStreakValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  groupLeaderboardModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  groupLeaderboardTabs: {
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  groupLeaderboardTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  groupLeaderboardTabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  groupLeaderboardTabText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  groupLeaderboardTabTextActive: {
    color: "#FFFFFF",
  },
});
