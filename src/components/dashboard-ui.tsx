import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useId, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { RoleSwitcher } from '@/components/role-switcher';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';

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
  stats,
  tone = 'default',
  showGreeting = true,
  backAction,
  style,
  statsContainerStyle,
  statStyle,
}: {
  title: string;
  subtitle: string;
  actions?: DashboardAction[];
  stats?: DashboardStat[];
  tone?: 'default' | 'light' | 'pastel';
  showGreeting?: boolean;
  backAction?: { label: string; onPress: () => void };
  style?: ViewStyle;
  statsContainerStyle?: ViewStyle;
  statStyle?: ViewStyle;
}) {
  const theme = useTheme();
  const isPastel = tone === 'pastel';
  const sweepBase = isPastel ? '#FAF7F2' : tone === 'light' ? '#64714C' : '#40502C';
  const sweepHighlight = isPastel ? '#FFFFFF' : tone === 'light' ? '#ADB598' : '#919B6E';
  const headerTextColor = isPastel ? '#354024' : theme.primaryText;
  const { currentUser, schedules, sessions, attendance } = useApp();
  const assignedSchedules = currentUser?.role === 'asisten'
    ? schedules.filter((schedule) => schedule.assistantId === currentUser.id)
    : schedules;
  const assignedScheduleIds = new Set(assignedSchedules.map((schedule) => schedule.id));
  const assignedSessions = sessions.filter((session) => assignedScheduleIds.has(session.scheduleId));
  const openSessionCount = assignedSessions.filter((session) => session.status === 'open').length;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const myAttendance = currentUser?.role === 'praktikan'
    ? attendance.filter((record) => record.userId === currentUser.id)
    : attendance.filter((record) => assignedSessions.some((session) => session.id === record.sessionId));
  const alphaCount = currentUser?.role === 'praktikan'
    ? assignedSchedules.filter((schedule) => {
      const session = sessions.find((item) => item.scheduleId === schedule.id);
      return Boolean(session && !myAttendance.some((record) => record.sessionId === session.id)
        && (session.status === 'closed' || schedule.date < todayKey));
    }).length
    : myAttendance.filter((record) => record.status === 'present').length;
  const visibleStats = stats ?? [
    {
      label: 'Semua Jadwal',
      value: assignedSchedules.length,
      onPress: () => router.navigate(currentUser?.role === 'asisten' ? '/asisten/jadwal' : '/praktikan/jadwal'),
    },
    {
      label: 'Sesi Dibuka',
      value: openSessionCount,
      onPress: () => router.navigate(currentUser?.role === 'asisten' ? '/asisten/jadwal' : '/praktikan/presensi'),
    },
    {
      label: 'Absensi',
      value: alphaCount,
      onPress: () => currentUser?.role === 'asisten'
        ? router.navigate('/asisten/riwayat-presensi')
        : router.navigate({ pathname: '/praktikan/jadwal', params: { view: 'alpha' } }),
    },
  ];

  return (
    <SweepingHeader baseColor={sweepBase} highlightColor={sweepHighlight}>
      <View
      style={[
        dashboardStyles.capsule,
        {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        },
        !showGreeting && { paddingTop: Spacing.four + Spacing.one },
        style,
      ]}>
      {showGreeting ? <RoleSwitcher /> : null}
      {backAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAction.label}
          onPress={backAction.onPress}
          style={({ pressed }) => [
            dashboardStyles.backAction,
            {
              backgroundColor: 'rgba(255,255,255,0.42)',
              borderColor: isPastel ? 'rgba(53,64,36,0.24)' : theme.glassBorderHighlight,
            },
            pressed && dashboardStyles.pressed,
          ]}>
          <Ionicons name="arrow-back" size={19} color={headerTextColor} />
          <ThemedText type="smallBold" style={{ color: headerTextColor }}>Kembali</ThemedText>
        </Pressable>
      ) : null}
      <View
        style={[
          dashboardStyles.titleCard,
          tone === 'light' && dashboardStyles.titleCardInset,
          {
            backgroundColor: isPastel ? 'rgba(240, 230, 216, 0.36)' : theme.glassGreen,
            backgroundImage: isPastel
              ? 'linear-gradient(135deg, rgba(240, 230, 216, 0.5) 0%, rgba(229, 215, 196, 0.24) 88%)'
              : `linear-gradient(135deg, ${theme.moss} 0%, ${sweepBase} 88%)`,
            borderColor: isPastel ? 'rgba(200, 185, 149, 0.58)' : theme.glassBorderHighlight,
            ...(Platform.OS === 'web'
              ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object)
              : {}),
          },
        ]}>
        <ThemedText
          style={[dashboardStyles.title, { color: headerTextColor }]}>
          {title}
        </ThemedText>
          <ThemedText
            style={[dashboardStyles.subtitle, { color: headerTextColor }]}>
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
                style={{ color: headerTextColor }}>
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {visibleStats.length > 0 ? (
        <View style={[dashboardStyles.stats, statsContainerStyle]}>
          {visibleStats.map((stat) => (
            <Pressable
              key={stat.label}
              accessibilityRole="button"
              onPress={stat.onPress}
              style={({ pressed }) => [
                dashboardStyles.stat,
                statStyle,
                {
                  backgroundColor: stat.active
                    ? theme.moss
                    : isPastel
                      ? 'rgba(240, 230, 216, 0.36)'
                      : 'rgba(255, 255, 255, 0.14)',
                  ...(isPastel && !stat.active
                    ? ({
                        backgroundImage:
                          'linear-gradient(135deg, rgba(240, 230, 216, 0.5) 0%, rgba(229, 215, 196, 0.24) 88%)',
                      } as object)
                    : {}),
                  borderColor: stat.active
                    ? 'rgba(255, 255, 255, 0.76)'
                    : isPastel
                      ? 'rgba(200, 185, 149, 0.58)'
                      : 'rgba(255, 255, 255, 0.48)',
                  ...(Platform.OS === 'web'
                    ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object)
                    : {}),
                },
                pressed && dashboardStyles.pressed,
              ]}>
              <ThemedText
                style={[dashboardStyles.statValue, { color: headerTextColor }]}>
                {stat.value}
              </ThemedText>
              <ThemedText
                style={[
                  dashboardStyles.statLabel,
                  { color: headerTextColor },
                ]}>
                {stat.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
      </View>
    </SweepingHeader>
  );
}

const SWEEP_PATH = 'M0 0 L100 0 L100 100 C100 94.2 96.3 90.4 75 90.1 L12.9 91.7 C4.1 92.2 0 87.8 0 82.7 Z';

function SweepingHeader({
  children,
  baseColor,
  highlightColor,
}: {
  children: ReactNode;
  baseColor: string;
  highlightColor: string;
}) {
  const gradientId = `dashboardSweep-${useId().replace(/:/g, '')}`;

  return (
    <View style={dashboardStyles.sweepWrap}>
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="50%" y1="100%" x2="50%" y2="0%">
            <Stop offset="0" stopColor={highlightColor} />
            <Stop offset="0.42" stopColor={baseColor} />
          </LinearGradient>
        </Defs>
        <Path d={SWEEP_PATH} fill="#354024" opacity={0.22} transform="translate(0 1.5)" />
        <Path d={SWEEP_PATH} fill={`url(#${gradientId})`} />
      </Svg>
      {children}
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
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            ellipsizeMode="clip"
            style={{
              color: tab.active ? theme.primaryText : theme.text,
              textAlign: 'center',
              fontSize: 12,
              lineHeight: 16,
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
          backgroundColor: '#FAF7F2',
          borderColor: highlighted ? theme.primary : 'rgba(255, 255, 255, 0.9)',
        },
        highlighted && dashboardStyles.highlighted,
        style,
      ]}>
      {children}
    </View>
  );
}

const dashboardStyles = StyleSheet.create({
  sweepWrap: {
    marginTop: -Spacing.four,
    marginHorizontal: -Spacing.three,
    marginBottom: -Spacing.five - Spacing.two,
    paddingBottom: 78 + Spacing.two,
  },
  capsule: {
    width: '100%',
    borderTopLeftRadius: 42,
    borderTopRightRadius: 42,
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 92,
    borderWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  titleCard: {
    minHeight: 112,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 56,
    borderBottomLeftRadius: 56,
    borderBottomRightRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: 6,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
  titleCardInset: {
    paddingHorizontal: Spacing.four,
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
  backAction: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
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
    justifyContent: 'center',
    gap: Spacing.five,
    marginTop: Spacing.two + Spacing.one,
    zIndex: 1,
  },
  stat: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 88,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    gap: 5,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  card: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 64,
    borderBottomLeftRadius: 64,
    borderBottomRightRadius: 2,
    borderWidth: 1.5,
    padding: Spacing.three,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 4,
  },
  highlighted: {
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.82,
  },
});