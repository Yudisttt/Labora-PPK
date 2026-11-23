import { router } from 'expo-router';
import type { Unsubscribe } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoleSwitcher } from '@/components/role-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addParticipant,
  createClassWithSchedule,
  deleteClass,
  deleteSchedule,
  listenClasses,
  listenParticipants,
  listenPraktikanProfiles,
  listenSchedules,
  removeParticipant,
  updateClass,
  updateSchedule,
  type ClassParticipant,
  type PracticumClass,
  type PracticumSchedule,
} from '@/services/practicum-data';
import { useAuth } from '@/state/auth-context';
import type { User } from '@/types';
import { formatDate } from '@/utils/format';
import {
  hasPracticumTimeConflict,
  PRACTICUM_TIME_GROUPS,
  PRACTICUM_TIME_SLOTS,
  type PracticumTimeSlot,
} from '@/utils/practicum-time-slots';

type DataTab = 'classes' | 'participants';
type DeleteTarget =
  | { type: 'class'; id: string; label: string }
  | { type: 'schedule'; id: string; label: string }
  | {
    type: 'participant';
    id: string;
    classId: string;
    userId: string;
    label: string;
  }
  | null;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const TABS: { id: DataTab; label: string }[] = [
  { id: 'classes', label: 'Kelas & Jadwal' },
  { id: 'participants', label: 'Peserta' },
];

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export default function ManagePracticumDataScreen() {
  const theme = useTheme();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<DataTab>('classes');
  const [classes, setClasses] = useState<PracticumClass[]>([]);
  const [participants, setParticipants] = useState<ClassParticipant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<PracticumSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [className, setClassName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [initialScheduleRoom, setInitialScheduleRoom] = useState('');
  const [initialScheduleDate, setInitialScheduleDate] = useState('');
  const [initialStartTime, setInitialStartTime] = useState('');
  const [initialEndTime, setInitialEndTime] = useState('');

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const [allSchedules, setAllSchedules] = useState<PracticumSchedule[]>([]);
  const [scheduleCourse, setScheduleCourse] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );
  const loadedStreams = useRef(new Set<string>());

  const activeClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classes[0]?.id ?? '';
  const activeUserId = users.some((item) => item.id === selectedUserId)
    ? selectedUserId
    : users[0]?.id ?? '';
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leadingBlanks = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array.from(
      { length: leadingBlanks },
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [calendarMonth]);
  const selectedTimeSlot = PRACTICUM_TIME_SLOTS.find(
    (slot) =>
      slot.startTime === (editingScheduleId ? startTime : initialStartTime) &&
      slot.endTime === (editingScheduleId ? endTime : initialEndTime),
  );

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let active = true;
    const subscriptions: Unsubscribe[] = [];
    loadedStreams.current = new Set();

    function markLoaded(stream: string) {
      if (!active) {
        return;
      }

      loadedStreams.current.add(stream);
      if (loadedStreams.current.size === 4) {
        setLoading(false);
      }
    }

    function handleError(listenerError: Error) {
      if (!active) {
        return;
      }

      setError(listenerError.message);
      setLoading(false);
    }

    try {
      subscriptions.push(
        listenClasses((value) => {
          setClasses(
            value.filter((practicumClass) => practicumClass.assistantId === currentUser.id),
          );
          markLoaded('classes');
        }, handleError),
        listenParticipants((value) => {
          setParticipants(value);
          markLoaded('participants');
        }, handleError),
        listenPraktikanProfiles((value) => {
          setUsers(value);
          markLoaded('users');
        }, handleError),
        listenSchedules((value) => {
          setAllSchedules(value);
          setSchedules(
            value.filter((schedule) => schedule.assistantId === currentUser.id),
          );
          markLoaded('schedules');
        }, handleError),
      );
    } catch (subscriptionError) {
      handleError(
        subscriptionError instanceof Error
          ? subscriptionError
          : new Error('Tidak dapat memuat data Firebase.'),
      );
    }

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser]);

  const selectedClassParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => participant.classId === activeClassId,
      ),
    [activeClassId, participants],
  );

  const enrolledUserIds = useMemo(
    () => new Set(selectedClassParticipants.map((participant) => participant.userId)),
    [selectedClassParticipants],
  );

  async function performAction(
    action: () => Promise<unknown>,
    successMessage = 'Perubahan berhasil disimpan.',
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(successMessage);
      return true;
    } catch (actionError) {
      const code =
        actionError instanceof Error && 'code' in actionError
          ? String(actionError.code)
          : '';
      setError(
        code === 'permission-denied' || code === 'firestore/permission-denied'
          ? 'Firestore menolak penyimpanan kelas dan jadwal (permission-denied). Pastikan rules terbaru terbit di project labora-89bf3 dan profil users/{UID} memiliki role asisten.'
          : actionError instanceof Error
            ? `${actionError.message}${code ? ` (${code})` : ''}`
            : 'Tidak dapat menyimpan perubahan ke Firebase.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveClass() {
    const name = className.trim();
    const course = courseName.trim();

    if (!name || !course || !currentUser) {
      setError('Nama kelas dan nama praktikum wajib diisi.');
      return;
    }

    const classInput = {
      name,
      course,
      assistantId: currentUser.id,
    };

    if (editingClassId) {
      const succeeded = await performAction(
        () => updateClass(editingClassId, classInput),
        'Data kelas berhasil diperbarui.',
      );

      if (succeeded) {
        setClassName('');
        setCourseName('');
        setEditingClassId(null);
      }

      return;
    }

    if (!initialScheduleRoom.trim()) {
      setError('Ruang praktikum wajib diisi.');
      return;
    }

    if (!isValidDate(initialScheduleDate)) {
      setError('Tanggal harus menggunakan format YYYY-MM-DD yang valid.');
      return;
    }

    if (initialScheduleDate < todayKey()) {
      setError('Tanggal praktikum tidak boleh di masa lalu.');
      return;
    }

    const selectedSlot = PRACTICUM_TIME_SLOTS.find(
      (slot) =>
        slot.startTime === initialStartTime &&
        slot.endTime === initialEndTime,
    );

    if (!selectedSlot) {
      setError('Pilih salah satu slot praktikum yang tersedia.');
      return;
    }

    if (
      hasPracticumTimeConflict(
        initialScheduleRoom,
        initialScheduleDate,
        selectedSlot,
        allSchedules,
      )
    ) {
      setError('Slot ini bentrok dengan jadwal lain di lab dan tanggal tersebut.');
      return;
    }

    const succeeded = await performAction(
      () =>
        createClassWithSchedule(classInput, {
          praktikum: course,
          ruang: initialScheduleRoom.trim(),
          date: initialScheduleDate,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
        }),
      'Kelas dan jadwal berhasil disimpan.',
    );

    if (succeeded) {
      setClassName('');
      setCourseName('');
      setEditingClassId(null);
      setInitialScheduleRoom('');
      setInitialScheduleDate('');
      setInitialStartTime('');
      setInitialEndTime('');
      setTimeDropdownOpen(false);
    }
  }

  async function saveSchedule() {
    if (!editingScheduleId) {
      setError('Pilih jadwal yang ingin diubah.');
      return;
    }

    const selectedClass = classes.find((item) => item.id === activeClassId);

    if (!selectedClass || !scheduleCourse.trim() || !scheduleRoom.trim()) {
      setError('Pilih kelas, lalu lengkapi nama praktikum dan ruang.');
      return;
    }

    if (!isValidDate(scheduleDate)) {
      setError('Tanggal harus menggunakan format YYYY-MM-DD yang valid.');
      return;
    }

    const originalSchedule = allSchedules.find(
      (item) => item.id === editingScheduleId,
    );
    const dateChanged = originalSchedule
      ? originalSchedule.date !== scheduleDate
      : true;

    if (dateChanged && scheduleDate < todayKey()) {
      setError('Tanggal praktikum tidak boleh di masa lalu.');
      return;
    }

    const selectedSlot = PRACTICUM_TIME_SLOTS.find(
      (slot) => slot.startTime === startTime && slot.endTime === endTime,
    );

    if (!selectedSlot) {
      setError('Pilih salah satu slot praktikum yang tersedia.');
      return;
    }

    if (isTimeSlotDisabled(selectedSlot, editingScheduleId)) {
      setError('Slot ini bentrok dengan jadwal lain di lab dan tanggal tersebut.');
      return;
    }

    if (!currentUser) {
      setError('Sesi login tidak ditemukan. Silakan masuk kembali.');
      return;
    }

    const input = {
      classId: selectedClass.id,
      praktikum: scheduleCourse.trim(),
      kelas: selectedClass.name,
      ruang: scheduleRoom.trim(),
      date: scheduleDate,
      startTime,
      endTime,
      assistantId: currentUser.id,
    };
    const succeeded = await performAction(
      () => updateSchedule(editingScheduleId, input),
      'Jadwal berhasil diperbarui.',
    );

    if (succeeded) {
      resetScheduleForm();
    }
  }

  function resetScheduleForm() {
    setScheduleCourse('');
    setScheduleRoom('');
    setScheduleDate('');
    setStartTime('');
    setEndTime('');
    setTimeDropdownOpen(false);
    setEditingScheduleId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    const succeeded = await performAction(async () => {
      if (target.type === 'class') {
        await deleteClass(target.id);
      } else if (target.type === 'schedule') {
        await deleteSchedule(target.id);
      } else {
        await removeParticipant(target.classId, target.userId);
      }
    });

    if (succeeded) {
      setDeleteTarget(null);
    }
  }

  async function assignParticipant() {
    if (!activeClassId || !activeUserId) {
      setError('Pilih kelas dan praktikan terlebih dahulu.');
      return;
    }

    await performAction(() => addParticipant(activeClassId, activeUserId));
  }

  function beginEditClass(practicumClass: PracticumClass) {
    setClassName(practicumClass.name);
    setCourseName(practicumClass.course);
    setEditingClassId(practicumClass.id);
  }

  function beginEditSchedule(schedule: PracticumSchedule) {
    setSelectedClassId(schedule.classId);
    setScheduleCourse(schedule.praktikum);
    setScheduleRoom(schedule.ruang);
    setScheduleDate(schedule.date);
    setStartTime(schedule.startTime);
    setEndTime(schedule.endTime);
    setTimeDropdownOpen(false);
    setEditingScheduleId(schedule.id);
  }

  function openDatePicker() {
    const activeDate = editingScheduleId ? scheduleDate : initialScheduleDate;
    const dateToShow = isValidDate(activeDate)
      ? new Date(`${activeDate}T00:00:00`)
      : new Date();

    setCalendarMonth(
      new Date(dateToShow.getFullYear(), dateToShow.getMonth(), 1),
    );
    setDatePickerVisible(true);
  }

  function selectScheduleDate(day: number) {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth() + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (editingScheduleId) {
      setScheduleDate(date);
      setStartTime('');
      setEndTime('');
    } else {
      setInitialScheduleDate(date);
      setInitialStartTime('');
      setInitialEndTime('');
    }
    setTimeDropdownOpen(false);
    setDatePickerVisible(false);
    setError(null);
  }

  function isTimeSlotDisabled(
    slot: PracticumTimeSlot,
    excludedScheduleId: string | null = editingScheduleId,
  ) {
    return hasPracticumTimeConflict(
      editingScheduleId ? scheduleRoom : initialScheduleRoom,
      editingScheduleId ? scheduleDate : initialScheduleDate,
      slot,
      allSchedules,
      excludedScheduleId,
    );
  }

  function selectTimeSlot(slot: PracticumTimeSlot) {
    if (editingScheduleId) {
      setStartTime(slot.startTime);
      setEndTime(slot.endTime);
    } else {
      setInitialStartTime(slot.startTime);
      setInitialEndTime(slot.endTime);
    }
    setTimeDropdownOpen(false);
    setError(null);
  }

  function updateScheduleRoom(room: string) {
    const isInitialSchedule = !editingScheduleId;
    const date = isInitialSchedule ? initialScheduleDate : scheduleDate;
    const currentSlot = selectedTimeSlot;
    if (isInitialSchedule) {
      setInitialScheduleRoom(room);
    } else {
      setScheduleRoom(room);
    }

    if (
      currentSlot &&
      hasPracticumTimeConflict(
        room,
        date,
        currentSlot,
        allSchedules,
        editingScheduleId,
      )
    ) {
      if (isInitialSchedule) {
        setInitialStartTime('');
        setInitialEndTime('');
      } else {
        setStartTime('');
        setEndTime('');
      }
    }
  }

  function renderScheduleFields() {
    const isInitialSchedule = !editingScheduleId;
    const room = isInitialSchedule ? initialScheduleRoom : scheduleRoom;
    const date = isInitialSchedule ? initialScheduleDate : scheduleDate;

    return (
      <>
        <DataInput
          label="Ruang"
          value={room}
          onChangeText={updateScheduleRoom}
          placeholder="Contoh: Lab Komputer A"
          theme={theme}
        />
        <View style={styles.inputGroup}>
          <ThemedText type="smallBold" style={styles.inputLabel}>
            Tanggal praktikum
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pilih tanggal praktikum"
            onPress={openDatePicker}
            style={[
              styles.inputContainer,
              {
                backgroundColor: theme.glassInput,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText
              type="small"
              style={{
                color: date ? theme.text : theme.textSecondary,
              }}>
                {date ? formatDate(date) : 'Pilih tanggal'}
            </ThemedText>
          </Pressable>
        </View>
        <View style={styles.inputGroup}>
          <ThemedText type="smallBold" style={styles.inputLabel}>
            Slot praktikum (durasi 100 menit)
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pilih tanggal dan ruang. Slot yang bertabrakan otomatis dinonaktifkan.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: timeDropdownOpen }}
            onPress={() => setTimeDropdownOpen(true)}
            style={[
              styles.inputContainer,
              styles.timeDropdownField,
              {
                backgroundColor: theme.glassInput,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText
              type="small"
              style={{
                color: selectedTimeSlot ? theme.text : theme.textSecondary,
              }}>
              {selectedTimeSlot
                ? `${selectedTimeSlot.startTime}–${selectedTimeSlot.endTime}`
                : 'Pilih slot waktu'}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {timeDropdownOpen ? '▲' : '▼'}
            </ThemedText>
          </Pressable>
        </View>
      </>
    );
  }

  function renderClassForm() {
    return (
      <ThemedView
        type="backgroundElement"
        style={[
          styles.formCard,
          {
            backgroundColor: theme.glassCard,
            borderColor: theme.glassBorder,
          },
        ]}>
        <ThemedText type="smallBold">
          {editingClassId ? 'Ubah kelas' : 'Tambah kelas dan jadwal'}
        </ThemedText>
        <DataInput
          label="Nama kelas"
          value={className}
          onChangeText={setClassName}
          placeholder="Contoh: Kelas A"
          theme={theme}
        />
        <DataInput
          label="Nama praktikum"
          value={courseName}
          onChangeText={setCourseName}
          placeholder="Contoh: Basis Data"
          theme={theme}
        />
        {!editingClassId ? (
          <>
            <ThemedText type="smallBold">Jadwal pertama</ThemedText>
            {renderScheduleFields()}
          </>
        ) : null}
        <View style={styles.buttonRow}>
          <ActionButton
            label={editingClassId ? 'Simpan perubahan' : 'Tambah kelas & jadwal'}
            onPress={saveClass}
            disabled={busy}
            primary
          />
          {editingClassId ? (
            <ActionButton
              label="Batal"
              onPress={() => {
                setClassName('');
                setCourseName('');
                setEditingClassId(null);
                setError(null);
              }}
              disabled={busy}
            />
          ) : null}
        </View>
      </ThemedView>
    );
  }

  function renderClasses() {
    return (
      <View style={styles.section}>
        {editingScheduleId ? renderScheduleEditor() : renderClassForm()}
        {classes.length === 0 ? (
          <EmptyState text="Belum ada kelas. Tambahkan kelas beserta jadwal pertamanya." />
        ) : (
          classes.map((practicumClass) => (
            <ThemedView
              key={practicumClass.id}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <ThemedText type="smallBold">{practicumClass.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {practicumClass.course}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {participants.filter((item) => item.classId === practicumClass.id).length}{' '}
                peserta · {schedules.filter((item) => item.classId === practicumClass.id).length}{' '}
                jadwal
              </ThemedText>
              <View style={styles.buttonRow}>
                <ActionButton
                  label="Ubah"
                  onPress={() => beginEditClass(practicumClass)}
                  disabled={busy || Boolean(editingScheduleId)}
                />
                <ActionButton
                  label="Hapus"
                  onPress={() =>
                    setDeleteTarget({
                      type: 'class',
                      id: practicumClass.id,
                      label: practicumClass.name,
                    })
                  }
                  disabled={busy || Boolean(editingScheduleId)}
                  danger
                />
              </View>
            </ThemedView>
          ))
        )}
        {renderSchedules()}
      </View>
    );
  }

  function renderParticipants() {
    return (
      <View style={styles.section}>
        <ThemedView
          type="backgroundElement"
          style={[
            styles.formCard,
            {
              backgroundColor: theme.glassCard,
              borderColor: theme.glassBorder,
            },
          ]}>
          <ThemedText type="smallBold">Tambahkan peserta ke kelas</ThemedText>
          {classes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Buat kelas terlebih dahulu.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small">Pilih kelas</ThemedText>
              <View style={styles.choiceList}>
                {classes.map((practicumClass) => (
                  <ChoiceChip
                    key={practicumClass.id}
                    label={practicumClass.name}
                    selected={activeClassId === practicumClass.id}
                    onPress={() => setSelectedClassId(practicumClass.id)}
                  />
                ))}
              </View>

              <ThemedText type="small">Pilih praktikan</ThemedText>
              {users.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Belum ada akun praktikan terdaftar.
                </ThemedText>
              ) : (
                <View style={styles.choiceList}>
                  {users.map((user) => {
                    const enrolled = enrolledUserIds.has(user.id);
                    return (
                      <ChoiceChip
                        key={user.id}
                        label={`${user.name}${enrolled ? ' · sudah terdaftar' : ''}`}
                        selected={activeUserId === user.id}
                        disabled={enrolled}
                        onPress={() => setSelectedUserId(user.id)}
                      />
                    );
                  })}
                </View>
              )}
              <ActionButton
                label="Tambahkan peserta"
                onPress={assignParticipant}
                disabled={
                  busy ||
                  !activeClassId ||
                  !activeUserId ||
                  enrolledUserIds.has(activeUserId)
                }
                primary
              />
            </>
          )}
        </ThemedView>

        {classes.map((practicumClass) => {
          const classParticipants = participants.filter(
            (participant) => participant.classId === practicumClass.id,
          );
          return (
            <ThemedView
              key={practicumClass.id}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <ThemedText type="smallBold">{practicumClass.name}</ThemedText>
              {classParticipants.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Belum ada peserta di kelas ini.
                </ThemedText>
              ) : (
                classParticipants.map((participant) => {
                  const user = users.find((item) => item.id === participant.userId);
                  return (
                    <View key={participant.id} style={styles.listRow}>
                      <View style={styles.flex}>
                        <ThemedText type="smallBold">
                          {user?.name ?? 'Praktikan tidak ditemukan'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {user?.identityNumber ?? participant.userId}
                        </ThemedText>
                      </View>
                      <ActionButton
                        label="Hapus"
                        onPress={() =>
                          setDeleteTarget({
                            type: 'participant',
                            id: participant.id,
                            classId: participant.classId,
                            userId: participant.userId,
                            label: user?.name ?? 'peserta',
                          })
                        }
                        disabled={busy}
                        danger
                      />
                    </View>
                  );
                })
              )}
            </ThemedView>
          );
        })}
      </View>
    );
  }

  function renderScheduleEditor() {
    if (!editingScheduleId) {
      return null;
    }

    return (
      <ThemedView
        type="backgroundElement"
        style={[
          styles.formCard,
          {
            backgroundColor: theme.glassCard,
            borderColor: theme.glassBorder,
          },
        ]}>
        <ThemedText type="smallBold">Ubah jadwal</ThemedText>
        <ThemedText type="small">Pilih kelas</ThemedText>
        <View style={styles.choiceList}>
          {classes.map((practicumClass) => (
            <ChoiceChip
              key={practicumClass.id}
              label={practicumClass.name}
              selected={activeClassId === practicumClass.id}
              onPress={() => setSelectedClassId(practicumClass.id)}
            />
          ))}
        </View>
        <DataInput
          label="Nama praktikum"
          value={scheduleCourse}
          onChangeText={setScheduleCourse}
          placeholder="Contoh: Basis Data"
          theme={theme}
        />
        {renderScheduleFields()}
        <View style={styles.buttonRow}>
          <ActionButton
            label="Simpan perubahan"
            onPress={saveSchedule}
            disabled={busy}
            primary
          />
          <ActionButton
            label="Batal"
            onPress={resetScheduleForm}
            disabled={busy}
          />
        </View>
      </ThemedView>
    );
  }

  function renderSchedules() {
    return (
      <>
        <ThemedText type="smallBold">Jadwal tersimpan</ThemedText>
        {schedules.length === 0 ? (
          <EmptyState text="Jadwal pertama akan dibuat saat kelas ditambahkan." />
        ) : (
          schedules.map((schedule) => (
            <ThemedView
              key={schedule.id}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <ThemedText type="smallBold">{schedule.praktikum}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {schedule.kelas} · {schedule.ruang}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(schedule.date)} · {schedule.startTime}–{schedule.endTime}
              </ThemedText>
              <View style={styles.buttonRow}>
                <ActionButton
                  label="Ubah"
                  onPress={() => beginEditSchedule(schedule)}
                  disabled={busy || Boolean(editingScheduleId)}
                />
                <ActionButton
                  label="Hapus"
                  onPress={() =>
                    setDeleteTarget({
                      type: 'schedule',
                      id: schedule.id,
                      label: schedule.praktikum,
                    })
                  }
                  disabled={busy || Boolean(editingScheduleId)}
                  danger
                />
              </View>
            </ThemedView>
          ))
        )}
      </>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <RoleSwitcher />
          {/* Tombol Back Navigasi */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/asisten/jadwal')}
            style={({ pressed }) => [
              styles.backButtonPill,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
              pressed && styles.dimmed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 13 }}>
              ← Kembali ke Jadwal & Presensi
            </ThemedText>
          </Pressable>

          {/* Tinted Green Glass Header Banner */}
          <View
            style={[
              styles.headerGlassCard,
              {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
              },
            ]}>
            <View style={styles.headerBadge}>
              <ThemedText
                type="smallBold"
                style={{ color: '#FFFFFF', letterSpacing: 1.2, fontSize: 11, fontWeight: '700' }}>
                MANAJEMEN AKADEMIK
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={[styles.title, { color: '#FFFFFF' }]}>
              Kelola Data Praktikum
            </ThemedText>
            <ThemedText style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 13 }}>
              Data kelas, peserta, dan jadwal disinkronkan secara real-time.
            </ThemedText>
          </View>

          <View
            style={[
              styles.tabsContainer,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
            ]}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setActiveTab(tab.id);
                    setTimeDropdownOpen(false);
                    setDatePickerVisible(false);
                  }}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: active ? theme.primaryText : theme.text,
                      fontSize: 13,
                    }}>
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={[styles.message, { backgroundColor: theme.dangerSoft }]}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            </View>
          ) : null}
          {notice ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.message, { backgroundColor: theme.successSoft }]}>
              <ThemedText type="small" style={{ color: theme.success }}>
                {notice}
              </ThemedText>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : activeTab === 'classes' ? (
            renderClasses()
          ) : (
            renderParticipants()
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={datePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pemilih tanggal"
            style={StyleSheet.absoluteFill}
            onPress={() => setDatePickerVisible(false)}
          />
          <ThemedView
            type="backgroundElement"
            style={[
              styles.datePickerCard,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText type="smallBold">Pilih tanggal praktikum</ThemedText>
            <View style={styles.calendarNavigation}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bulan sebelumnya"
                onPress={() =>
                  setCalendarMonth(
                    (month) =>
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
                style={styles.calendarNavigationButton}>
                <ThemedText type="smallBold">{'<'}</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" style={styles.calendarMonthLabel}>
                {MONTH_NAMES[calendarMonth.getMonth()]}{' '}
                {calendarMonth.getFullYear()}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bulan berikutnya"
                onPress={() =>
                  setCalendarMonth(
                    (month) =>
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
                style={styles.calendarNavigationButton}>
                <ThemedText type="smallBold">{'>'}</ThemedText>
              </Pressable>
            </View>
            <View style={styles.calendarWeekRow}>
              {WEEKDAY_LABELS.map((day) => (
                <ThemedText
                  key={day}
                  type="smallBold"
                  style={styles.calendarWeekday}>
                  {day}
                </ThemedText>
              ))}
            </View>
            <View style={styles.calendarDaysGrid}>
              {calendarCells.map((day, index) => {
                if (day === null) {
                  return (
                    <View
                      key={`blank-${index}`}
                      style={styles.calendarDayCell}
                    />
                  );
                }

                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth() + 1;
                const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const selected = scheduleDate === date;

                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih ${day} ${MONTH_NAMES[month - 1]} ${year}`}
                    accessibilityState={{ selected }}
                    onPress={() => selectScheduleDate(day)}
                    style={[
                      styles.calendarDayCell,
                      selected && {
                        backgroundColor: theme.primary,
                        borderRadius: 999,
                      },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{
                        color: selected ? theme.primaryText : theme.text,
                      }}>
                      {day}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ActionButton
              label="Batal"
              onPress={() => setDatePickerVisible(false)}
            />
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={timeDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeDropdownOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pilihan waktu"
            style={StyleSheet.absoluteFill}
            onPress={() => setTimeDropdownOpen(false)}
          />
          <ThemedView
            type="backgroundElement"
            style={[
              styles.timePickerCard,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText type="smallBold">Pilih slot praktikum</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Durasi setiap slot 100 menit.
            </ThemedText>
            <ScrollView
              style={styles.timeDropdownList}
              contentContainerStyle={styles.timeDropdownListContent}
              showsVerticalScrollIndicator={false}>
              {PRACTICUM_TIME_GROUPS.map((group) => (
                <View key={group.label} style={styles.timeSlotGroup}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {group.label}
                  </ThemedText>
                  {group.slots.map((slot) => {
                    const disabled = isTimeSlotDisabled(slot);
                    const selected =
                      startTime === slot.startTime &&
                      endTime === slot.endTime;

                    return (
                      <Pressable
                        key={`${slot.startTime}-${slot.endTime}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled || busy}
                        onPress={() => selectTimeSlot(slot)}
                        style={[
                          styles.timeDropdownOption,
                          selected && {
                            backgroundColor: theme.glassCard,
                          },
                          disabled && styles.dimmed,
                        ]}>
                        <ThemedText
                          type="small"
                          style={{
                            color: disabled ? theme.textSecondary : theme.text,
                          }}>
                          {slot.startTime}–{slot.endTime}
                        </ThemedText>
                        {disabled ? (
                          <ThemedText
                            type="small"
                            style={{ color: theme.danger }}>
                            Bentrok
                          </ThemedText>
                        ) : selected ? (
                          <ThemedText
                            type="smallBold"
                            style={{ color: theme.primary }}>
                            Dipilih
                          </ThemedText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <ActionButton
              label="Tutup"
              onPress={() => setTimeDropdownOpen(false)}
            />
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalBackdrop}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.confirmCard,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
            ]}>
            <ThemedText type="smallBold">Hapus data?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Yakin ingin menghapus {deleteTarget?.label}? Tindakan ini tidak
              dapat dibatalkan.
            </ThemedText>
            <View style={styles.buttonRow}>
              <ActionButton
                label="Batal"
                onPress={() => setDeleteTarget(null)}
                disabled={busy}
              />
              <ActionButton
                label={busy ? 'Menghapus…' : 'Hapus'}
                onPress={confirmDelete}
                disabled={busy}
                danger
              />
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

type Theme = ReturnType<typeof useTheme>;

function DataInput({
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

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : primary ? theme.primaryText : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: danger
            ? theme.dangerSoft
            : primary
              ? theme.primary
              : theme.glassCard,
          borderColor: danger
            ? theme.dangerSoft
            : primary
              ? theme.primary
              : theme.glassBorder,
        },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color, fontSize: 13 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ChoiceChip({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choiceChip,
        {
          backgroundColor: selected ? theme.primary : theme.glassCard,
          borderColor: selected ? theme.primary : theme.glassBorder,
        },
        disabled && styles.dimmed,
      ]}>
      <ThemedText
        type="smallBold"
        style={{
          color: selected ? theme.primaryText : theme.text,
          fontSize: 12,
        }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function EmptyState({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.empty,
        {
          backgroundColor: theme.glassCard,
          borderColor: theme.glassBorder,
        },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {text}
      </ThemedText>
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
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  headerGlassCard: {
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    backgroundColor: '#889063',
    borderWidth: 1,
    borderColor: '#AAB18B',
  },
  backButtonPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
  },
  tabsContainer: {
    flexDirection: 'row',
    padding: Spacing.half,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.half,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
    borderRadius: 18,
  },
  section: {
    gap: Spacing.three,
  },
  formCard: {
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.four,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  inputGroup: {
    flex: 1,
    gap: Spacing.one,
  },
  inputLabel: {
    fontSize: 12,
  },
  inputContainer: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 14,
    justifyContent: 'center',
  },
  input: {
    fontSize: 14,
    padding: 0,
  },
  choiceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingVertical: Spacing.half,
  },
  timeSlotGroup: {
    gap: Spacing.one,
  },
  timeDropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePickerCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  timeDropdownList: {
    flexShrink: 1,
  },
  timeDropdownListContent: {
    padding: Spacing.two,
    gap: Spacing.two,
  },
  timeDropdownOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
  },
  choiceChip: {
    maxWidth: '100%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  actionButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136, 144, 99, 0.2)',
  },
  flex: {
    flex: 1,
  },
  message: {
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
  },
  empty: {
    padding: Spacing.five,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  datePickerCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  calendarNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavigationButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: 'center',
  },
  calendarWeekRow: {
    flexDirection: 'row',
  },
  calendarWeekday: {
    width: '14.2857%',
    textAlign: 'center',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    padding: Spacing.five,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.three,
  },
  dimmed: {
    opacity: 0.65,
  },
});
