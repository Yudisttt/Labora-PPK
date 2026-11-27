import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BackButtonProps = {
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  style?: ViewStyle;
};

/** Pill back button placed at the top-left of screens. */
export function BackButton({
  label = 'Kembali',
  accessibilityLabel = 'Kembali',
  onPress,
  style,
}: BackButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: 'rgba(255, 255, 255, 0.52)',
          borderColor: 'rgba(53, 64, 36, 0.22)',
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object)
            : {}),
        },
        pressed && styles.pressed,
        style,
      ]}>
      <Ionicons name="arrow-back" size={18} color={theme.primary} />
      <ThemedText type="smallBold" style={{ color: theme.primary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.78,
  },
});
