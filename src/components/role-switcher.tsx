import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth-context';

export function RoleSwitcher() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, signOut } = useAuth();
  const [visible, setVisible] = useState(false);

  if (!currentUser) {
    return null;
  }

  async function handleSignOut() {
    try {
      await signOut();
      setVisible(false);
      router.replace('/');
    } catch (error) {
      Alert.alert(
        'Gagal keluar',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
      );
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: theme.glassCard,
            borderColor: theme.glassBorder,
          },
          pressed && styles.pressed,
        ]}>
        <View style={styles.avatarMini}>
          <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 13 }}>
            {currentUser.name ? currentUser.name[0]?.toUpperCase() : 'U'}
          </ThemedText>
        </View>
        <View style={styles.triggerMeta}>
          <ThemedText type="smallBold">{currentUser.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currentUser.role === 'asisten' ? 'Asisten Lab' : 'Praktikan'} ·{' '}
            {currentUser.identityNumber}
          </ThemedText>
        </View>
        <View style={[styles.logoutPill, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 11 }}>
            Keluar
          </ThemedText>
        </View>
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
              <ThemedText type="subtitle">Keluar dari akun?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Kamu akan keluar dari akun {currentUser.name}.
              </ThemedText>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.signOut,
                { backgroundColor: theme.dangerSoft },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Keluar
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
    borderWidth: 1.5,
    borderRadius: 22,
  },
  avatarMini: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F7F1E7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C8B995',
  },
  triggerMeta: {
    flex: 1,
    gap: 2,
  },
  logoutPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1.5,
    borderColor: '#C8B995',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
  },
  sheetHeader: {
    gap: Spacing.one,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#B42318',
  },
  pressed: {
    opacity: 0.75,
  },
});
