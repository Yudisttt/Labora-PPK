import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/services/firebase';
import type { Schedule, User } from '@/types';

export type PracticumClass = {
  id: string;
  name: string;
  course: string;
  assistantId: string;
};

export type ClassParticipant = {
  id: string;
  classId: string;
  userId: string;
};

export type PracticumSchedule = Omit<Schedule, 'status' | 'originalScheduleId' | 'replacementScheduleId'> & {
  classId: string;
  status: 'scheduled' | 'rescheduled' | 'cancelled';
  originalScheduleId?: string;
  replacementScheduleId?: string;
};

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function deleteDocumentRefs(db: ReturnType<typeof getFirebaseDb>, refs: DocumentReference[]) {
  for (const group of chunkItems(refs, 8)) {
    const batch = writeBatch(db);
    group.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

type ClassInput = Omit<PracticumClass, 'id'>;
type ScheduleInput = Omit<
  PracticumSchedule,
  'id' | 'status' | 'originalScheduleId' | 'replacementScheduleId'
>;
type InitialScheduleInput = Omit<ScheduleInput, 'classId' | 'kelas' | 'assistantId'>;

function parseClass(id: string, value: Record<string, unknown>) {
  if (
    typeof value.name !== 'string' ||
    typeof value.course !== 'string' ||
    typeof value.assistantId !== 'string'
  ) {
    return null;
  }

  return {
    id,
    name: value.name,
    course: value.course,
    assistantId: value.assistantId,
  } satisfies PracticumClass;
}

function parseParticipant(id: string, value: Record<string, unknown>) {
  if (typeof value.classId !== 'string' || typeof value.userId !== 'string') {
    return null;
  }

  return {
    id,
    classId: value.classId,
    userId: value.userId,
  } satisfies ClassParticipant;
}

function parseSchedule(id: string, value: Record<string, unknown>) {
  if (
    typeof value.classId !== 'string' ||
    typeof value.praktikum !== 'string' ||
    typeof value.kelas !== 'string' ||
    typeof value.ruang !== 'string' ||
    typeof value.date !== 'string' ||
    typeof value.startTime !== 'string' ||
    typeof value.endTime !== 'string' ||
    typeof value.assistantId !== 'string'
  ) {
    return null;
  }

  const schedule: PracticumSchedule = {
    id,
    classId: value.classId,
    praktikum: value.praktikum,
    kelas: value.kelas,
    ruang: value.ruang,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
    assistantId: value.assistantId,
    status:
      value.status === 'rescheduled'
        ? 'rescheduled'
        : value.status === 'cancelled'
          ? 'cancelled'
          : 'scheduled',
  };
  if (typeof value.seriesId === 'string') schedule.seriesId = value.seriesId;
  if (typeof value.seriesActive === 'boolean') schedule.seriesActive = value.seriesActive;
  if (typeof value.seriesIndex === 'number') schedule.seriesIndex = value.seriesIndex;
  if (typeof value.seriesCount === 'number') schedule.seriesCount = value.seriesCount;
  if (typeof value.originalScheduleId === 'string') {
    schedule.originalScheduleId = value.originalScheduleId;
  }
  if (typeof value.replacementScheduleId === 'string') {
    schedule.replacementScheduleId = value.replacementScheduleId;
  }
  return schedule;
}

function parseUser(id: string, value: Record<string, unknown>) {
  if (
    value.role !== 'praktikan' ||
    typeof value.name !== 'string' ||
    typeof value.identityNumber !== 'string' ||
    typeof value.program !== 'string'
  ) {
    return null;
  }

  return {
    id,
    name: value.name,
    email: typeof value.email === 'string' ? value.email : undefined,
    role: 'praktikan',
    identityNumber: value.identityNumber,
    program: value.program,
  } satisfies User;
}

function parseAssistant(id: string, value: Record<string, unknown>) {
  if (
    value.role !== 'asisten' ||
    typeof value.name !== 'string' ||
    typeof value.identityNumber !== 'string' ||
    typeof value.program !== 'string'
  ) {
    return null;
  }

  return {
    id,
    name: value.name,
    email: typeof value.email === 'string' ? value.email : undefined,
    role: 'asisten',
    identityNumber: value.identityNumber,
    program: value.program,
  } satisfies User;
}

export function listenClasses(
  onData: (classes: PracticumClass[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(getFirebaseDb(), 'classes'),
    (snapshot) => {
      const classes = snapshot.docs
        .map((item) => parseClass(item.id, item.data()))
        .filter((item): item is PracticumClass => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      onData(classes);
    },
    onError,
  );
}

export function listenParticipants(
  onData: (participants: ClassParticipant[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(getFirebaseDb(), 'participants'),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => parseParticipant(item.id, item.data()))
          .filter((item): item is ClassParticipant => item !== null),
      );
    },
    onError,
  );
}

export function listenPraktikanProfiles(
  onData: (users: User[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(getFirebaseDb(), 'users'), where('role', '==', 'praktikan')),
    (snapshot) => {
      const users = snapshot.docs.flatMap((item) => {
        const user = parseUser(item.id, item.data());
        return user ? [user] : [];
      });

      onData(users.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError,
  );
}

export function listenAssistantProfiles(
  onData: (users: User[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(getFirebaseDb(), 'users'), where('role', '==', 'asisten')),
    (snapshot) => {
      const users = snapshot.docs.flatMap((item) => {
        const user = parseAssistant(item.id, item.data());
        return user ? [user] : [];
      });

      onData(users.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError,
  );
}

export function listenSchedules(
  onData: (schedules: PracticumSchedule[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(getFirebaseDb(), 'schedules'),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((item) => parseSchedule(item.id, item.data()))
          .filter((item): item is PracticumSchedule => item !== null)
          .sort((a, b) =>
            `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
          ),
      );
    },
    onError,
  );
}

export function listenSchedulesForUser(
  userId: string,
  onData: (schedules: PracticumSchedule[]) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  let generation = 0;
  let scheduleUnsubscribes: Unsubscribe[] = [];

  const participantUnsubscribe = onSnapshot(
    query(collection(db, 'participants'), where('userId', '==', userId)),
    (snapshot) => {
      generation += 1;
      const currentGeneration = generation;
      scheduleUnsubscribes.forEach((unsubscribe) => unsubscribe());
      scheduleUnsubscribes = [];

      const participantRows = snapshot.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            classId: data.classId,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Number.MAX_SAFE_INTEGER,
          };
        })
        .filter((item): item is { id: string; classId: string; createdAt: number } => typeof item.classId === 'string')
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const classIds = [...new Set(participantRows.map((item) => item.classId))];

      if (classIds.length === 0) {
        onData([]);
        return;
      }

      void Promise.all(classIds.map(async (classId) => ({
        classId,
        snapshot: await getDoc(doc(db, 'classes', classId)),
      }))).then((classSnapshots) => {
        if (currentGeneration !== generation) return;

        const courseByClassId = new Map(classSnapshots.map(({ classId, snapshot }) => [
          classId,
          snapshot.exists() && typeof snapshot.data().course === 'string'
            ? snapshot.data().course.trim().toLocaleLowerCase()
            : classId,
        ]));
        const selectedCourseIds = new Set<string>();
        const uniqueCourseClassIds = participantRows
          .filter(({ classId }) => {
            const courseId = courseByClassId.get(classId) ?? classId;
            if (selectedCourseIds.has(courseId)) return false;
            selectedCourseIds.add(courseId);
            return true;
          })
          .map(({ classId }) => classId);

      const groups: string[][] = [];
      for (let index = 0; index < uniqueCourseClassIds.length; index += 30) {
        groups.push(uniqueCourseClassIds.slice(index, index + 30));
      }

      const schedulesByGroup = new Map<number, PracticumSchedule[]>();

      scheduleUnsubscribes = groups.map((group, groupIndex) =>
        onSnapshot(
          query(
            collection(db, 'schedules'),
            where('classId', 'in', group),
          ),
          (scheduleSnapshot) => {
            if (currentGeneration !== generation) {
              return;
            }

            schedulesByGroup.set(
              groupIndex,
              scheduleSnapshot.docs
                .map((item) => parseSchedule(item.id, item.data()))
                .filter((item): item is PracticumSchedule => item !== null),
            );

            if (schedulesByGroup.size === groups.length) {
              const schedules = [...new Map(
                [...schedulesByGroup.values()]
                  .flat()
                  .map((schedule) => [schedule.id, schedule]),
              ).values()].sort((a, b) =>
                `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
              );

              onData(schedules);
            }
          },
          onError,
        ),
      );
      }).catch((error: unknown) => {
        if (currentGeneration === generation) {
          onError(error instanceof Error ? error : new Error('Tidak dapat memeriksa pendaftaran praktikan.'));
        }
      });
    },
    onError,
  );

  return () => {
    generation += 1;
    participantUnsubscribe();
    scheduleUnsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export async function createClass(input: ClassInput) {
  return addDoc(collection(getFirebaseDb(), 'classes'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createClassWithSchedule(
  classInput: ClassInput,
  scheduleInput: InitialScheduleInput,
) {
  const db = getFirebaseDb();
  const classRef = doc(collection(db, 'classes'));
  const scheduleRef = doc(collection(db, 'schedules'));
  const batch = writeBatch(db);

  batch.set(classRef, {
    ...classInput,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(scheduleRef, {
    ...scheduleInput,
    classId: classRef.id,
    kelas: classInput.name,
    assistantId: classInput.assistantId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { classId: classRef.id, scheduleId: scheduleRef.id };
}

export async function updateClass(id: string, input: ClassInput) {
  await updateDoc(doc(getFirebaseDb(), 'classes', id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClass(id: string) {
  const db = getFirebaseDb();
  const [participants, schedules] = await Promise.all([
    getDocs(query(collection(db, 'participants'), where('classId', '==', id))),
    getDocs(query(collection(db, 'schedules'), where('classId', '==', id))),
  ]);
  const scheduleIds = schedules.docs.map((item) => item.id);
  const sessionSnapshots = await Promise.all(chunkItems(scheduleIds, 30).map((group) =>
    getDocs(query(collection(db, 'sessions'), where('scheduleId', 'in', group))),
  ));
  const sessionDocs = sessionSnapshots.flatMap((snapshot) => snapshot.docs);
  const sessionIdGroups = chunkItems(sessionDocs.map((item) => item.id), 30);
  const [attendanceSnapshots, permissionSnapshots, codeSnapshots] = await Promise.all([
    Promise.all(sessionIdGroups.map((group) =>
      getDocs(query(collection(db, 'attendance'), where('sessionId', 'in', group))),
    )),
    Promise.all(sessionIdGroups.map((group) =>
      getDocs(query(collection(db, 'permissionRequests'), where('sessionId', 'in', group))),
    )),
    Promise.all(sessionDocs.map((session) =>
      getDocs(collection(db, 'sessions', session.id, 'attendanceCodes')),
    )),
  ]);

  // Delete dependants first so each Firestore delete rule can still verify ownership.
  await deleteDocumentRefs(db, codeSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)));
  await deleteDocumentRefs(db, attendanceSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)));
  await deleteDocumentRefs(db, permissionSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)));
  await deleteDocumentRefs(db, sessionDocs.map((item) => item.ref));
  await deleteDocumentRefs(db, schedules.docs.map((item) => item.ref));
  await deleteDocumentRefs(db, participants.docs.map((item) => item.ref));
  await deleteDoc(doc(db, 'classes', id));
}

export async function createSchedule(input: ScheduleInput) {
  return addDoc(collection(getFirebaseDb(), 'schedules'), {
    ...input,
    status: 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createWeeklyScheduleSeries(
  input: ScheduleInput,
  meetingCount: number,
) {
  const db = getFirebaseDb();
  const count = Math.max(1, Math.min(200, Math.floor(meetingCount)));
  const seriesId = doc(collection(db, 'schedules')).id;
  const schedules = Array.from({ length: count }, (_, index) => {
    const date = new Date(`${input.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index * 7);
    const dateKey = date.toISOString().slice(0, 10);
    const scheduleRef = doc(collection(db, 'schedules'));
    return {
      ref: scheduleRef,
      date: dateKey,
      data: {
        ...input,
        date: dateKey,
        status: 'scheduled' as const,
        seriesId,
        seriesActive: true,
        seriesIndex: index + 1,
        seriesCount: count,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    };
  });

  for (let offset = 0; offset < schedules.length; offset += 450) {
    const batch = writeBatch(db);
    schedules.slice(offset, offset + 450).forEach(({ ref, data }) => {
      batch.set(ref, data);
    });
    await batch.commit();
  }

  for (let offset = 0; offset < schedules.length; offset += 450) {
    const batch = writeBatch(db);
    schedules.slice(offset, offset + 450).forEach(({ ref }) => {
      batch.set(doc(db, 'sessions', `session_${ref.id}`), {
        scheduleId: ref.id,
        status: 'scheduled',
        openedAt: null,
        closedAt: null,
      });
    });
    await batch.commit();
  }

  return { seriesId, meetingCount: count };
}

export async function createSeriesMeeting(
  input: ScheduleInput,
  seriesId: string,
  seriesIndex: number,
) {
  const db = getFirebaseDb();
  const scheduleRef = doc(collection(db, 'schedules'));
  await setDoc(scheduleRef, {
    ...input,
    status: 'scheduled',
    seriesId,
    seriesActive: true,
    seriesIndex,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'sessions', `session_${scheduleRef.id}`), {
    scheduleId: scheduleRef.id,
    status: 'scheduled',
    openedAt: null,
    closedAt: null,
  });
  return scheduleRef.id;
}

export async function endScheduleSeries(seriesId: string) {
  const db = getFirebaseDb();
  const snapshot = await getDocs(
    query(collection(db, 'schedules'), where('seriesId', '==', seriesId)),
  );
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const schedules = snapshot.docs;

  for (let offset = 0; offset < schedules.length; offset += 450) {
    const batch = writeBatch(db);
    schedules.slice(offset, offset + 450).forEach((item) => {
      const data = item.data();
      batch.update(item.ref, {
        seriesActive: false,
        ...(typeof data.date === 'string' && data.date > todayKey
          ? { status: 'cancelled' }
          : {}),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

export async function updateSchedule(id: string, input: ScheduleInput) {
  await updateDoc(doc(getFirebaseDb(), 'schedules', id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function rescheduleMeeting(
  originalScheduleId: string,
  input: ScheduleInput,
) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const originalRef = doc(db, 'schedules', originalScheduleId);
  const replacementRef = doc(collection(db, 'schedules'));
  const originalSnapshot = await getDoc(originalRef);
  if (!originalSnapshot.exists()) {
    throw new Error('Pertemuan yang ingin dipindahkan tidak ditemukan.');
  }
  const originalData = originalSnapshot.data();

  batch.update(originalRef, {
    status: 'rescheduled',
    replacementScheduleId: replacementRef.id,
    updatedAt: serverTimestamp(),
  });
  batch.set(replacementRef, {
    ...input,
    status: 'scheduled',
    ...(typeof originalData.seriesId === 'string'
      ? {
          seriesId: originalData.seriesId,
          seriesActive: originalData.seriesActive !== false,
          seriesIndex: originalData.seriesIndex,
          seriesCount: originalData.seriesCount,
        }
      : {}),
    originalScheduleId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return replacementRef.id;
}

export async function deleteSchedule(id: string) {
  await deleteDoc(doc(getFirebaseDb(), 'schedules', id));
}

export async function addParticipant(classId: string, userId: string) {
  const db = getFirebaseDb();
  const participantId = `${classId}_${userId}`;
  const participantRef = doc(db, 'participants', participantId);
  const [targetClass, enrollments] = await Promise.all([
    getDoc(doc(db, 'classes', classId)),
    getDocs(query(collection(db, 'participants'), where('userId', '==', userId))),
  ]);

  if (!targetClass.exists() || typeof targetClass.data().course !== 'string') {
    throw new Error('Praktikum yang dipilih tidak ditemukan.');
  }

  const targetCourse = targetClass.data().course.trim().toLocaleLowerCase();
  const otherClassIds = [...new Set(enrollments.docs
    .map((item) => item.data().classId)
    .filter((enrolledClassId): enrolledClassId is string =>
      typeof enrolledClassId === 'string' && enrolledClassId !== classId,
    ))];
  const otherClasses = await Promise.all(otherClassIds.map((otherClassId) =>
    getDoc(doc(db, 'classes', otherClassId)),
  ));
  const alreadyEnrolledInSameCourse = otherClasses.some((item) =>
    item.exists() && typeof item.data().course === 'string' &&
    item.data().course.trim().toLocaleLowerCase() === targetCourse,
  );

  if (alreadyEnrolledInSameCourse) {
    throw new Error('Praktikan sudah terdaftar di kelas lain untuk praktikum ini. Hapus pendaftaran sebelumnya terlebih dahulu.');
  }

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(participantRef);

    if (!existing.exists()) {
      transaction.set(participantRef, {
        classId,
        userId,
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function removeParticipant(classId: string, userId: string) {
  await deleteDoc(
    doc(getFirebaseDb(), 'participants', `${classId}_${userId}`),
  );
}
