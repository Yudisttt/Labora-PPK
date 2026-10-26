import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useApp } from "@/state/app-context";
import type { Role } from "@/types";
import { initials } from "@/utils/format";

const ROLE_OPTIONS: { role: Role; title: string }[] = [
  {
    role: "praktikan",
    title: "Praktikan",
  },
  {
    role: "asisten",
    title: "Asisten",
  },
];

export default function RoleSelectionScreen() {
  const theme = useTheme();
  const { users, selectUser } = useApp();
  const [role, setRole] = useState<Role>("praktikan");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const roleUsers = useMemo(
    () => users.filter((user) => user.role === role),
    [role, users],
  );

  const selectedUser =
    roleUsers.find((user) => user.id === selectedUserId) ??
    roleUsers[0] ??
    null;

  function handleSubmit() {
    if (!selectedUser) {
      return;
    }

    selectUser(selectedUser.id);
    router.replace(
      selectedUser.role === "asisten" ? "/asisten/jadwal" : "/praktikan/jadwal",
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          style={[styles.scrollView, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.hero, { backgroundColor: theme.primary }]}>
            <ThemedText
              type="smallBold"
              style={[styles.heroEyebrow, { color: theme.backgroundElement }]}
            >
              PRAKTIKUM
            </ThemedText>
            <ThemedText
              type="title"
              style={[styles.heroTitle, { color: theme.background }]}
            >
              Presensi{"\n"}Praktikum
            </ThemedText>
            <ThemedText
              style={[styles.heroSubtitle, { color: theme.backgroundElement }]}
            >
              Pilih peran dan identitas untuk masuk.
            </ThemedText>
          </View>

          <View style={[styles.form, { backgroundColor: theme.background }]}>
            <View style={styles.section}>
              <ThemedText type="smallBold">Peran</ThemedText>

              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((option) => {
                  const active = option.role === role;

                  return (
                    <Pressable
                      key={option.role}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setRole(option.role)}
                      style={({ pressed }) => [
                        styles.roleCard,
                        {
                          backgroundColor: active
                            ? theme.primary
                            : theme.background,
                          borderColor: active ? theme.primary : theme.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: active ? theme.primaryText : theme.text,
                        }}
                      >
                        {option.title}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">Identitas</ThemedText>

              {roleUsers.length === 0 ? (
                <ThemedView type="background" style={styles.empty}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Belum ada akun dummy untuk peran ini.
                  </ThemedText>
                </ThemedView>
              ) : (
                <View style={styles.userList}>
                  {roleUsers.map((user) => {
                    const active = user.id === selectedUser?.id;

                    return (
                      <Pressable
                        key={user.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setSelectedUserId(user.id)}
                        style={({ pressed }) => [
                          styles.userRow,
                          {
                            backgroundColor: theme.background,
                            borderColor: active ? theme.primary : theme.border,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.avatar,
                            { backgroundColor: theme.successSoft },
                          ]}
                        >
                          <ThemedText type="smallBold">
                            {initials(user.name)}
                          </ThemedText>
                        </View>

                        <View style={styles.userMeta}>
                          <ThemedText type="default">{user.name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {user.identityNumber}
                          </ThemedText>
                        </View>

                        <View
                          style={[
                            styles.radio,
                            {
                              borderColor: active
                                ? theme.primary
                                : theme.border,
                            },
                          ]}
                        >
                          {active ? (
                            <View
                              style={[
                                styles.radioDot,
                                { backgroundColor: theme.primary },
                              ]}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.background }]}>
          <Pressable
            accessibilityRole="button"
            disabled={!selectedUser}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: selectedUser
                  ? theme.primary
                  : theme.backgroundSelected,
              },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText
              type="smallBold"
              style={{
                color: selectedUser ? theme.primaryText : theme.textSecondary,
              }}
            >
              Masuk
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  hero: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
    borderBottomWidth: 8,
    borderBottomColor: "#889063",
  },
  heroEyebrow: {
    fontFamily: Fonts.bold,
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: 56,
    lineHeight: 64,
  },
  heroSubtitle: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    lineHeight: 27,
  },
  form: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  roleRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  roleCard: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  userList: {
    gap: Spacing.two,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  userMeta: {
    flex: 1,
    gap: Spacing.half,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  empty: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  footer: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  submit: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
    paddingVertical: Spacing.three,
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.75,
  },
});
