import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth-context';

export default function AuthScreen() {
  const theme = useTheme();
  const { currentUser, loading, error, signIn, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identityNumber, setIdentityNumber] = useState('');
  const [program, setProgram] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace(
        currentUser.role === 'asisten' ? '/asisten/jadwal' : '/praktikan/jadwal',
      );
    }
  }, [currentUser, loading]);

  async function handleSubmit() {
    setFormError(null);
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setFormError('Email dan kata sandi wajib diisi.');
      return;
    }

    if (isRegistering) {
      if (!name.trim() || !identityNumber.trim() || !program.trim()) {
        setFormError('Lengkapi nama, nomor identitas, dan program studi.');
        return;
      }

      if (password.length < 6) {
        setFormError('Kata sandi harus terdiri dari minimal 6 karakter.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (isRegistering) {
        await register({
          name,
          email: normalizedEmail,
          password,
          identityNumber,
          program,
        });
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Tidak dapat menyelesaikan autentikasi. Coba lagi.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {/* Tinted Green Glass Hero Banner */}
            <View
              style={[
                styles.heroGlassCard,
                {
                  backgroundColor: theme.primary,
                  borderColor: theme.primary,
                },
              ]}>
              <View style={styles.heroBadge}>
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.primaryText, letterSpacing: 1.5, fontSize: 11 }}>
                  LABORA
                </ThemedText>
              </View>
              <ThemedText
                type="title"
                style={[styles.heroTitle, { color: theme.primaryText }]}>
                Platform Praktikum
              </ThemedText>
              <ThemedText
                style={[styles.heroSubtitle, { color: theme.primaryText }]}>
                Masuk ke akunmu untuk mengelola jadwal dan kehadiran praktikum.
              </ThemedText>
            </View>

            {/* Tinted Glass Form Card */}
            <View
              style={[
                styles.glassFormCard,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.cardTopHighlight} />
              <View style={styles.heading}>
                <ThemedText type="subtitle" style={styles.headingTitle}>
                  {isRegistering ? 'Buat Akun Praktikan' : 'Selamat Datang'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isRegistering
                    ? 'Lengkapi data identitas untuk mendaftar praktikum.'
                    : 'Masuk menggunakan email dan kata sandi.'}
                </ThemedText>
              </View>

              {error || formError ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.errorBox,
                    { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                  ]}>
                  <ThemedText type="small" style={{ color: theme.danger, fontWeight: '600' }}>
                    {formError ?? error}
                  </ThemedText>
                </View>
              ) : null}

              {isRegistering ? (
                <>
                  <AuthInput
                    label="Nama lengkap"
                    value={name}
                    onChangeText={setName}
                    placeholder="Nama sesuai identitas"
                    autoCapitalize="words"
                    theme={theme}
                  />
                  <AuthInput
                    label="Nomor identitas"
                    value={identityNumber}
                    onChangeText={setIdentityNumber}
                    placeholder="NIM"
                    autoCapitalize="characters"
                    theme={theme}
                  />
                  <AuthInput
                    label="Program studi"
                    value={program}
                    onChangeText={setProgram}
                    placeholder="Contoh: Informatika"
                    autoCapitalize="words"
                    theme={theme}
                  />
                </>
              ) : null}

              <AuthInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="nama@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                theme={theme}
              />
              <AuthInput
                label="Kata sandi"
                value={password}
                onChangeText={setPassword}
                placeholder="Minimal 6 karakter"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isRegistering ? 'new-password' : 'password'}
                theme={theme}
              />

              <Pressable
                accessibilityRole="button"
                disabled={submitting || loading}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.submit,
                  { backgroundColor: theme.primary },
                  (pressed || submitting || loading) && styles.dimmed,
                ]}>
                {submitting || loading ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.primaryText }}>
                    {isRegistering ? 'Daftar sebagai praktikan' : 'Masuk'}
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => {
                  setIsRegistering((previous) => !previous);
                  setFormError(null);
                }}
                style={styles.modeToggle}>
                <ThemedText type="small" themeColor="textSecondary">
                  {isRegistering ? 'Sudah punya akun? ' : 'Belum punya akun? '}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {isRegistering ? 'Masuk' : 'Daftar'}
                </ThemedText>
              </Pressable>

              {isRegistering ? (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.assistantNote}>
                  Akun asisten disiapkan oleh pengelola agar peran tidak dapat
                  diklaim sendiri.
                </ThemedText>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

type Theme = ReturnType<typeof useTheme>;

function AuthInput({
  label,
  theme,
  ...props
}: {
  label: string;
  theme: Theme;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputGroup}>
      <ThemedText type="smallBold" style={styles.inputLabel}>{label}</ThemedText>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.glassInput,
            borderColor: theme.glassBorder,
          },
        ]}>
        <TextInput
          {...props}
          placeholderTextColor="#7F735B"
          style={[styles.input, { color: theme.text }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  heroGlassCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    backgroundColor: '#889063',
    borderWidth: 1,
    borderColor: '#AAB18B',
  },
  heroTitle: {
    maxWidth: 520,
    fontSize: 34,
    lineHeight: 42,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  glassFormCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
    borderRadius: 28,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  cardTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1.5,
    backgroundColor: '#F7F1E7',
  },
  heading: {
    gap: Spacing.one,
    paddingBottom: Spacing.one,
  },
  headingTitle: {
    fontSize: 26,
    lineHeight: 34,
  },
  errorBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  inputGroup: {
    gap: Spacing.one,
  },
  inputLabel: {
    fontSize: 13,
  },
  inputContainer: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 16,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', background: 'transparent' } as unknown as object)
      : {}),
  },
  submit: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginTop: Spacing.two,
    borderWidth: 1.5,
    borderColor: '#889063',
  },
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: Spacing.one,
  },
  assistantNote: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing.one,
  },
  dimmed: {
    opacity: 0.65,
  },
});
