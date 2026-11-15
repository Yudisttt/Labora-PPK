import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: ActionButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      color: theme.primaryText,
    },
    secondary: {
      backgroundColor: theme.backgroundElement,
      borderColor: theme.border,
      color: theme.text,
    },
    danger: {
      backgroundColor: theme.dangerSoft,
      borderColor: theme.danger,
      color: theme.danger,
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}>
      <ThemedText type="smallBold" style={{ color: palette.color }}>
        {loading ? 'Memproses...' : label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
  },
  inactive: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
