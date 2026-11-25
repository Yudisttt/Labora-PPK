import { router, usePathname } from 'expo-router';
import { StyleSheet, View, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/use-theme';

export type TabItem = {
  key: string;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  route: string;
  isCenter?: boolean;
  onPress?: () => void;
};

type FloatingNavBarProps = {
  tabs: TabItem[];
};

export function FloatingNavBar({ tabs }: FloatingNavBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatingContainer, { bottom: bottomInset }]}>
      <BlurView
        intensity={56}
        tint="light"
        style={[
          styles.navBarShell,
          {
            backgroundColor: 'rgba(255, 255, 255, 0.28)',
            borderColor: 'rgba(255, 255, 255, 0.78)',
          },
        ]}>
        <View style={styles.tabsRow}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.route;

            if (tab.isCenter) {
              return (
                <View key={tab.key} style={styles.centerAnchor}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tab.label}
                    onPress={tab.onPress ?? (() => router.push(tab.route as Parameters<typeof router.push>[0]))}
                    style={({ pressed }) => [
                      tab.onPress ? styles.backButton : styles.diamondButton,
                      {
                        backgroundColor: theme.primary,
                        borderColor: theme.glassBorderHighlight,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <View
                      style={tab.onPress ? styles.backIcon : styles.diamondInner}>
                      <Ionicons
                        name={tab.iconName}
                        size={22}
                        color={theme.primaryText}
                      />
                    </View>
                  </Pressable>
                </View>
              );
            }

            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                onPress={() => router.push(tab.route as Parameters<typeof router.push>[0])}
                style={({ pressed }) => [
                  styles.tabItem,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.iconWrapper}>
                  <Ionicons
                    name={tab.iconName}
                    size={22}
                    color={isActive ? theme.primary : '#9E9481'}
                  />
                  {isActive && (
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: theme.primary },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 9999,
  },
  navBarShell: {
    width: '100%',
    maxWidth: 360,
    minHeight: 62,
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: '#3A2E12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 10,
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        } as unknown as object)
      : {}),
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    position: 'relative',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 48,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    bottom: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  centerAnchor: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    marginTop: -18,
  },
  diamondButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  diamondInner: {
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 9,
    elevation: 7,
  },
  backIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
});
