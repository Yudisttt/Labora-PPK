import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { getFirebaseAuth, getFirebaseConfigurationError, getFirebaseDb } from '@/services/firebase';
import type { User } from '@/types';

type RegistrationDetails = {
  name: string;
  email: string;
  password: string;
  identityNumber: string;
  program: string;
};

type AuthContextValue = {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (details: RegistrationDetails) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const firebaseConfigurationError = getFirebaseConfigurationError();

function parseProfile(uid: string, value: Record<string, unknown>): User | null {
  if (
    (value.role !== 'praktikan' && value.role !== 'asisten') ||
    typeof value.name !== 'string' ||
    typeof value.identityNumber !== 'string' ||
    typeof value.program !== 'string'
  ) {
    return null;
  }

  return {
    id: uid,
    name: value.name,
    email: typeof value.email === 'string' ? value.email : undefined,
    role: value.role,
    identityNumber: value.identityNumber,
    program: value.program,
  };
}

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error && 'code' in error) {
    const code = error.code;

    if (code === 'auth/email-already-in-use') {
      return 'Email ini sudah terdaftar. Silakan masuk.';
    }
    if (code === 'auth/invalid-email') {
      return 'Format email tidak valid.';
    }
    if (code === 'auth/weak-password') {
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
      return 'Email atau kata sandi salah.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Tidak dapat terhubung. Periksa koneksi internet lalu coba lagi.';
    }
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return 'Akses Firestore ditolak. Periksa Firebase Security Rules.';
    }
  }

  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan saat menghubungi Firebase.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigurationError === null);
  const [error, setError] = useState<string | null>(
    firebaseConfigurationError,
  );
  const registrationInProgress = useRef(false);

  useEffect(() => {
    if (firebaseConfigurationError) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      try {
        unsubscribe = onAuthStateChanged(
          getFirebaseAuth(),
          async (firebaseUser) => {
            if (!active || registrationInProgress.current) {
              return;
            }

            setLoading(true);
            setError(null);

            if (!firebaseUser) {
              setCurrentUser(null);
              setLoading(false);
              return;
            }

            try {
              const profile = await loadProfile(firebaseUser);
              if (!active) {
                return;
              }

              setCurrentUser(profile);

              if (!profile) {
                setError(
                  'Profil akun tidak ditemukan atau tidak valid. Hubungi pengelola untuk menyiapkan peran akun.',
                );
              }
            } catch (loadError) {
              if (!active) {
                return;
              }

              setCurrentUser(null);
              setError(getAuthErrorMessage(loadError));
            } finally {
              if (active) {
                setLoading(false);
              }
            }
          },
          (authError) => {
            if (!active) {
              return;
            }

            setCurrentUser(null);
            setError(getAuthErrorMessage(authError));
            setLoading(false);
          },
        );
      } catch (initializationError) {
        if (active) {
          setCurrentUser(null);
          setError(getAuthErrorMessage(initializationError));
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email.trim(),
        password,
      );
      const profile = await loadProfile(credential.user);

      if (!profile) {
        throw new Error(
          'Profil asisten tidak ditemukan atau tidak valid. Periksa dokumen users/{UID} dan pastikan nama, peran, nomor identitas, serta program studi sudah diisi.',
        );
      }

      setCurrentUser(profile);
    } catch (signInError) {
      setCurrentUser(null);
      const message = getAuthErrorMessage(signInError);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (details: RegistrationDetails) => {
    const name = details.name.trim();
    const email = details.email.trim().toLowerCase();
    const identityNumber = details.identityNumber.trim();
    const program = details.program.trim();

    if (
      !name ||
      !email ||
      !identityNumber ||
      !program ||
      details.password.length < 6
    ) {
      throw new Error(
        'Lengkapi semua data. Kata sandi harus terdiri dari minimal 6 karakter.',
      );
    }

    registrationInProgress.current = true;
    setError(null);
    setLoading(true);
    let createdUser: FirebaseUser | null = null;

    try {
      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        details.password,
      );
      createdUser = credential.user;

      await updateProfile(credential.user, { displayName: name });

      const profile: User = {
        id: credential.user.uid,
        name,
        email,
        role: 'praktikan',
        identityNumber,
        program,
      };

      await setDoc(doc(getFirebaseDb(), 'users', credential.user.uid), {
        name,
        email,
        role: 'praktikan',
        identityNumber,
        program,
        createdAt: new Date().toISOString(),
      });

      setCurrentUser(profile);
    } catch (registrationError) {
      const registrationMessage = getAuthErrorMessage(registrationError);

      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (cleanupError) {
          const message = `${registrationMessage} Akun Authentication berhasil dibuat, tetapi gagal dibersihkan: ${getAuthErrorMessage(cleanupError)}`;
          setError(message);
          throw new Error(message);
        }
      }

      setError(registrationMessage);
      throw new Error(registrationMessage);
    } finally {
      registrationInProgress.current = false;
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setCurrentUser(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ currentUser, loading, error, signIn, register, signOut }),
    [currentUser, error, loading, register, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function loadProfile(firebaseUser: FirebaseUser) {
  const profileSnapshot = await getDoc(
    doc(getFirebaseDb(), 'users', firebaseUser.uid),
  );

  if (!profileSnapshot.exists()) {
    return null;
  }

  return parseProfile(firebaseUser.uid, profileSnapshot.data());
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth harus dipakai di dalam AuthProvider');
  }

  return context;
}
