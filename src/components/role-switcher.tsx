import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
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

  const roleText = currentUser.role === 'asisten' ? 'Asisten' : 'Praktikan';

  return (
    <>
      <View style={styles.headerBar}>
        {/* Left: Cloud Icon + Greeting Meta */}
        <View style={styles.leftContainer}>
          <View style={styles.cloudIconBox}>
            <Ionicons name="cloud-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.greetingMeta}>
            <ThemedText style={styles.greetingSmall}>
              Halo {roleText},
            </ThemedText>
            <ThemedText style={styles.greetingName}>
              {currentUser.name}
            </ThemedText>
          </View>
        </View>

        {/* Right: Pill Menu Burger Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Menu Akun"
          onPress={() => setVisible(true)}
          style={({ pressed }) => [
            styles.menuPillButton,
            pressed && styles.pressed,
          ]}>
          <View style={styles.burgerIcon}>
            <View style={styles.burgerLine} />
            <View style={styles.burgerLine} />
            <View style={styles.burgerLine} />
          </View>
        </Pressable>
      </View>

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
            <View style={[styles.handle, { backgroundColor: '#C8B995' }]} />

            <View style={styles.sheetHeader}>
              <ThemedText type="subtitle" style={{ fontSize: 20 }}>
                Keluar dari akun?
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Kamu sedang login sebagai {currentUser.name} ({currentUser.identityNumber}).
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
                Keluar dari Aplikasi
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                Batal
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 16,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cloudIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  greetingMeta: {
    gap: 1,
  },
  greetingSmall: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: Fonts.regular,
  },
  greetingName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Fonts.bold,
    letterSpacing: 0.3,
  },
  menuPillButton: {
    width: 44,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        } as unknown as object)
      : {}),
  },
  burgerIcon: {
    width: 18,
    height: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  burgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1.5,
    borderColor: '#C8B995',
    backgroundColor: '#FAF5EE',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  sheetHeader: {
    gap: 4,
  },
  signOut: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECDCA',
    marginTop: Spacing.one,
  },
  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
});
