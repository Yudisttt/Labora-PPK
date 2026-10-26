import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import type { Role } from '@/types';
import { initials } from '@/utils/format';

const ROLE_OPTIONS: { role: Role; title: string; description: string }[] = [
  {
    role: 'praktikan',
    title: 'Praktikan',
    description:
      'Lihat jadwal, lakukan presensi, dan pantau riwayat kehadiran.',
  },
  {
    role: 'asisten',
    title: 'Asisten',
    description:
      'Buka tutup sesi dan pantau rekap kehadiran praktikan.',
  },
];

export default function RoleSelectionScreen() {
  const theme = useTheme();
  const { users, selectUser } = useApp();
  const [role, setRole] = useState<Role>('praktikan');
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
      selectedUser.role === 'asisten'
        ? '/asisten/jadwal'
        : '/praktikan/jadwal',
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <ThemedText type="title" style={styles.heroTitle}>
              Labora
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.heroSubtitle}>
              Pilih peran dan identitas dummy untuk mendemonstrasikan alur
              praktikum.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">1. Pilih peran</ThemedText>

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
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                        borderColor: active ? theme.primary : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold">{option.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.description}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">2. Pilih identitas</ThemedText>

            {roleUsers.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.empty}>
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
                          backgroundColor: active
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          borderColor: active ? theme.primary : theme.border,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: theme.background },
                        ]}>
                        <ThemedText type="smallBold">
                          {initials(user.name)}
                        </ThemedText>
                      </View>

                      <View style={styles.userMeta}>
                        <ThemedText type="smallBold">{user.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {user.identityNumber} · {user.program}
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
                        ]}>
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
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
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
            ]}>
            <ThemedText
              type="smallBold"
              style={{
                color: selectedUser
                  ? theme.primaryText
                  : theme.textSecondary,
              }}>
              Masuk sebagai {role === 'asisten' ? 'Asisten' : 'Praktikan'}
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
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.five,
  },
  hero: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 46,
  },
  heroSubtitle: {
    maxWidth: 420,
  },
  section: {
    gap: Spacing.two,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  roleCard: {
    flexGrow: 1,
    flexBasis: 220,
    gap: Spacing.one,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  userList: {
    gap: Spacing.two,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    borderTopWidth: 1,
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.75,
  },
});
