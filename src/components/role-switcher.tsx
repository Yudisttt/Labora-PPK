import { router } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import type { User } from '@/types';

export function RoleSwitcher() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, users, selectUser, signOut } = useApp();
  const [visible, setVisible] = useState(false);

  if (!currentUser) {
    return null;
  }

  function handleSelect(user: User) {
    selectUser(user.id);
    setVisible(false);
    router.replace(
      user.role === 'asisten' ? '/asisten/jadwal' : '/praktikan/jadwal',
    );
  }

  function handleSignOut() {
    signOut();
    setVisible(false);
    router.replace('/');
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          pressed && styles.pressed,
        ]}>
        <View style={styles.triggerMeta}>
          <ThemedText type="smallBold">{currentUser.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currentUser.role === 'asisten' ? 'Asisten' : 'Praktikan'} ·{' '}
            {currentUser.identityNumber}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Ganti
        </ThemedText>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />

          <ThemedView
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + Spacing.four },
            ]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />

            <View style={styles.sheetHeader}>
              <ThemedText type="subtitle">Ganti peran</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pilih identitas dummy lain. Perubahan sesi tetap tersimpan selama
                aplikasi berjalan.
              </ThemedText>
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}>
              {users.map((user) => {
                const active = user.id === currentUser.id;

                return (
                  <Pressable
                    key={user.id}
                    accessibilityRole="button"
                    onPress={() => handleSelect(user)}
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
                    <View style={styles.userMeta}>
                      <ThemedText type="smallBold">{user.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {user.role === 'asisten' ? 'Asisten' : 'Praktikan'} ·{' '}
                        {user.identityNumber}
                      </ThemedText>
                    </View>

                    {active ? (
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primary }}>
                        Aktif
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.signOut,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Kembali ke pemilihan peran
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  triggerMeta: {
    flex: 1,
    gap: Spacing.half,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopLeftRadius: Spacing.five,
    borderTopRightRadius: Spacing.five,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHeader: {
    gap: Spacing.one,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: Spacing.two,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  userMeta: {
    flex: 1,
    gap: Spacing.half,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.75,
  },
});
