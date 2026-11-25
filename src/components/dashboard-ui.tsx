import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { RoleSwitcher } from '@/components/role-switcher';

export type DashboardAction = {
  label: string;
  onPress: () => void;
};

export type DashboardStat = {
  label: string;
  value: number | string;
  active?: boolean;
  onPress?: () => void;
};

export type DashboardTab = {
  key: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

export function DashboardCapsule({
  title,
  subtitle,
  actions = [],
  stats = [],
}: {
  title: string;
  subtitle: string;
  actions?: DashboardAction[];
  stats?: DashboardStat[];
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        dashboardStyles.capsule,
        {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
        },
      ]}>
      <RoleSwitcher />
      <View
        style={[
          dashboardStyles.titleCard,
          {
            backgroundColor: theme.glassGreen,
            backgroundImage: `linear-gradient(135deg, ${theme.moss} 0%, ${theme.primary} 88%)`,
            borderColor: theme.glassBorderHighlight,
          },
        ]}>
        <ThemedText
          style={[dashboardStyles.title, { color: theme.primaryText }]}>
          {title}
        </ThemedText>
          <ThemedText
            style={[dashboardStyles.subtitle, { color: theme.primaryText }]}>
          {subtitle}
        </ThemedText>
      </View>

      {actions.length > 0 ? (
        <View style={dashboardStyles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={action.onPress}
              style={({ pressed }) => [
                dashboardStyles.action,
                {
                  backgroundColor: theme.glassGreenLight,
                  borderColor: theme.glassBorderHighlight,
                },
                pressed && dashboardStyles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: theme.primaryText }}>
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {stats.length > 0 ? (
        <View style={dashboardStyles.stats}>
          {stats.map((stat) => (
            <Pressable
              key={stat.label}
              accessibilityRole="button"
              onPress={stat.onPress}
              style={({ pressed }) => [
                dashboardStyles.stat,
                {
                  backgroundColor: stat.active
                    ? theme.moss
                    : 'rgba(255, 255, 255, 0.14)',
                  borderColor: stat.active
                    ? 'rgba(255, 255, 255, 0.76)'
                    : 'rgba(255, 255, 255, 0.48)',
                  ...(Platform.OS === 'web'
                    ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object)
                    : {}),
                },
                pressed && dashboardStyles.pressed,
              ]}>
              <ThemedText
                style={[dashboardStyles.statValue, { color: theme.primaryText }]}>
                {stat.value}
              </ThemedText>
              <ThemedText
                style={[
                  dashboardStyles.statLabel,
                  { color: theme.primaryText },
                ]}>
                {stat.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function DashboardTabs({
  tabs,
}: {
  tabs: DashboardTab[];
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        dashboardStyles.tabs,
        {
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          borderColor: 'rgba(255, 255, 255, 0.64)',
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as object)
            : {}),
        },
      ]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.active }}
          onPress={tab.onPress}
          style={({ pressed }) => [
            dashboardStyles.tab,
            tab.active
              ? { backgroundColor: theme.primary }
              : { backgroundColor: 'rgba(255, 255, 255, 0.12)' },
            pressed && dashboardStyles.pressed,
          ]}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={{
              color: tab.active ? theme.primaryText : theme.text,
              textAlign: 'center',
            }}>
            {tab.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function DashboardCard({
  children,
  style,
  highlighted = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  highlighted?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        dashboardStyles.card,
        {
          backgroundColor: theme.glassCard,
          borderColor: highlighted ? theme.primary : theme.glassBorder,
        },
        highlighted && dashboardStyles.highlighted,
        style,
      ]}>
      {children}
    </View>
  );
}

const dashboardStyles = StyleSheet.create({
  capsule: {
    width: '100%',
    borderTopLeftRadius: 42,
    borderTopRightRadius: 42,
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 92,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  titleCard: {
    minHeight: 112,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 54,
    borderBottomLeftRadius: 54,
    borderBottomRightRadius: 24,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: 6,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    minHeight: 94,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: 22,
  },
  statLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 10,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 72,
    borderWidth: 1.5,
    gap: 5,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  card: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 64,
    borderBottomLeftRadius: 64,
    borderBottomRightRadius: 2,
    borderWidth: 1.5,
    padding: Spacing.three,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  highlighted: {
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.82,
  },
});
