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

import {
  DashboardCapsule,
  DashboardTabs,
} from '@/components/dashboard-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addParticipant,
  createClass,
  createSeriesMeeting,
  createSchedule,
  createWeeklyScheduleSeries,
  deleteClass,
  deleteSchedule,
  listenClasses,
  listenParticipants,
  listenPraktikanProfiles,
  listenSchedules,
  removeParticipant,
  rescheduleMeeting,
  updateClass,
  updateSchedule,
  endScheduleSeries,
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

type DataTab = 'labs' | 'schedules' | 'meetings' | 'participants';
type DeleteTarget =
  | { type: 'class'; id: string; label: string }
  | { type: 'schedule'; id: string; label: string }
  | { type: 'series'; id: string; label: string }
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
  { id: 'labs', label: 'Lab' },
  { id: 'schedules', label: 'Jadwal' },
  { id: 'meetings', label: 'Pertemuan' },
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
  const [activeTab, setActiveTab] = useState<DataTab>('labs');
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
  const [labDropdownOpen, setLabDropdownOpen] = useState(false);
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const [participantUserDropdownOpen, setParticipantUserDropdownOpen] =
    useState(false);
  const [participantOfferingDropdownOpen, setParticipantOfferingDropdownOpen] =
    useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [className, setClassName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const [allSchedules, setAllSchedules] = useState<PracticumSchedule[]>([]);
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );
  const [reschedulingScheduleId, setReschedulingScheduleId] = useState<string | null>(
    null,
  );
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [meetingCount, setMeetingCount] = useState('16');
  const [addingMeetingToSeriesId, setAddingMeetingToSeriesId] = useState<string | null>(null);
  const [meetingQuery, setMeetingQuery] = useState('');
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const loadedStreams = useRef(new Set<string>());

  const activeClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classes[0]?.id ?? '';
  const activeClass = classes.find((item) => item.id === activeClassId);
  const activeUserId = users.some((item) => item.id === selectedUserId)
    ? selectedUserId
    : users[0]?.id ?? '';
  const activeUser = users.find((item) => item.id === activeUserId);
  const labGroups = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; offerings: PracticumClass[] }
    >();

    classes.forEach((practicumClass) => {
      const key = practicumClass.name.trim().toLocaleLowerCase();
      const group = groups.get(key);
      if (group) {
        group.offerings.push(practicumClass);
      } else {
        groups.set(key, {
          name: practicumClass.name,
          offerings: [practicumClass],
        });
      }
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        offerings: group.offerings.sort((a, b) =>
          a.course.localeCompare(b.course),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);
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
      slot.startTime === startTime &&
      slot.endTime === endTime,
  );
  const scheduleSeries = useMemo(() => {
    const groups = new Map<string, PracticumSchedule[]>();
    schedules.forEach((schedule) => {
      if (!schedule.seriesId) return;
      const group = groups.get(schedule.seriesId) ?? [];
      group.push(schedule);
      groups.set(schedule.seriesId, group);
    });
    return [...groups.entries()].map(([id, meetings]) => ({
      id,
      meetings: meetings.sort((a, b) => a.date.localeCompare(b.date)),
      template: [...meetings].sort((a, b) => a.date.localeCompare(b.date))[0],
      active: meetings.some((meeting) => meeting.seriesActive !== false) &&
        meetings.some((meeting) => meeting.status !== 'cancelled'),
    }));
  }, [schedules]);

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
          ? 'Firestore menolak perubahan data Lab (permission-denied). Pastikan rules terbaru terbit di project labora-89bf3 dan profil users/{UID} memiliki role asisten.'
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
      setError('Nama Lab dan nama praktikum wajib diisi.');
      return;
    }

    const duplicateOffering = classes.some(
      (item) =>
        item.id !== editingClassId &&
        item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() &&
        item.course.trim().toLocaleLowerCase() === course.toLocaleLowerCase(),
    );
    if (duplicateOffering) {
      setNotice(null);
      setError('Praktikum tersebut sudah terdaftar di Lab ini.');
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
        'Data Lab berhasil diperbarui.',
      );

      if (succeeded) {
        setClassName('');
        setCourseName('');
        setEditingClassId(null);
      }

      return;
    }

    const labAlreadyExists = classes.some(
      (item) =>
        item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const succeeded = await performAction(
      () => createClass(classInput),
      labAlreadyExists
        ? 'Praktikum berhasil ditambahkan ke Lab.'
        : 'Lab dan praktikum berhasil ditambahkan.',
    );

    if (succeeded) {
      setClassName('');
      setCourseName('');
      setEditingClassId(null);
    }
  }

  async function saveSchedule() {
    const selectedClass = classes.find((item) => item.id === activeClassId);

    if (!selectedClass) {
      setNotice(null);
      setError('Pilih Lab yang akan dijadwalkan.');
      return;
    }

    if (!scheduleRoom.trim()) {
      setNotice(null);
      setError('Ruang laboratorium wajib diisi.');
      return;
    }

    if (!isValidDate(scheduleDate)) {
      setNotice(null);
      setError('Tanggal harus menggunakan format YYYY-MM-DD yang valid.');
      return;
    }

    const originalSchedule = editingScheduleId
      ? allSchedules.find((item) => item.id === editingScheduleId)
      : null;
    const dateChanged = originalSchedule
      ? originalSchedule.date !== scheduleDate
      : true;

    if (dateChanged && scheduleDate < todayKey()) {
      setNotice(null);
      setError('Tanggal praktikum tidak boleh di masa lalu.');
      return;
    }

    const selectedSlot = PRACTICUM_TIME_SLOTS.find(
      (slot) => slot.startTime === startTime && slot.endTime === endTime,
    );

    if (!selectedSlot) {
      setNotice(null);
      setError('Pilih salah satu slot praktikum yang tersedia.');
      return;
    }

    const parsedMeetingCount = Number(meetingCount);
    if (
      repeatWeekly &&
      (!Number.isInteger(parsedMeetingCount) || parsedMeetingCount < 1 || parsedMeetingCount > 200)
    ) {
      setNotice(null);
      setError('Jumlah pertemuan mingguan harus antara 1 dan 200.');
      return;
    }

    if (isTimeSlotDisabled(selectedSlot, editingScheduleId)) {
      setNotice(null);
      setError('Slot ini bentrok dengan jadwal lain di ruang laboratorium tersebut.');
      return;
    }

    if (!currentUser) {
      setNotice(null);
      setError('Sesi login tidak ditemukan. Silakan masuk kembali.');
      return;
    }

    const input = {
      classId: selectedClass.id,
      praktikum: selectedClass.course,
      kelas: selectedClass.name,
      ruang: scheduleRoom.trim(),
      date: scheduleDate,
      startTime,
      endTime,
      assistantId: currentUser.id,
    };
    if (repeatWeekly) {
      for (let index = 1; index < parsedMeetingCount; index += 1) {
        const occurrence = new Date(`${scheduleDate}T12:00:00Z`);
        occurrence.setUTCDate(occurrence.getUTCDate() + index * 7);
        const occurrenceDate = occurrence.toISOString().slice(0, 10);
        if (
          hasPracticumTimeConflict(
            scheduleRoom,
            occurrenceDate,
            selectedSlot,
            allSchedules,
          )
        ) {
          setNotice(null);
          setError(`Ada bentrok ruang atau waktu pada ${formatDate(occurrenceDate)}.`);
          return;
        }
      }
    }
    const succeeded = await performAction(
      async () => {
        if (reschedulingScheduleId) {
          return rescheduleMeeting(reschedulingScheduleId, input);
        }
        if (editingScheduleId) {
          return updateSchedule(editingScheduleId, input);
        }
        if (addingMeetingToSeriesId) {
          const nextIndex = Math.max(
            0,
            ...schedules
              .filter((schedule) => schedule.seriesId === addingMeetingToSeriesId)
              .map((schedule) => schedule.seriesIndex ?? 0),
          ) + 1;
          return createSeriesMeeting(input, addingMeetingToSeriesId, nextIndex);
        }
        if (repeatWeekly) {
          return createWeeklyScheduleSeries(input, parsedMeetingCount);
        }
        return createSchedule(input);
      },
      reschedulingScheduleId
        ? 'Pertemuan berhasil dipindahkan. Jadwal lama tetap tersimpan.'
        : editingScheduleId
          ? 'Jadwal berhasil diperbarui.'
            : addingMeetingToSeriesId
              ? 'Pertemuan berhasil ditambahkan ke jadwal rutin.'
              : repeatWeekly
                ? `Jadwal rutin berhasil dibuat dengan ${parsedMeetingCount} pertemuan.`
                : 'Pertemuan berhasil ditambahkan.',
    );

    if (succeeded) {
      resetScheduleForm();
    }
  }

  function resetScheduleForm() {
    setScheduleRoom('');
    setScheduleDate('');
    setStartTime('');
    setEndTime('');
    setTimeDropdownOpen(false);
    setEditingScheduleId(null);
    setReschedulingScheduleId(null);
    setRepeatWeekly(true);
    setAddingMeetingToSeriesId(null);
    setLabDropdownOpen(false);
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
      } else if (target.type === 'series') {
        await endScheduleSeries(target.id);
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
      setError('Pilih Lab dan praktikan terlebih dahulu.');
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
    setScheduleRoom(schedule.ruang);
    setScheduleDate(schedule.date);
    setStartTime(schedule.startTime);
    setEndTime(schedule.endTime);
    setTimeDropdownOpen(false);
    setLabDropdownOpen(false);
    setEditingScheduleId(schedule.id);
    setReschedulingScheduleId(null);
    setRepeatWeekly(false);
    setExpandedSeriesId(null);
    setActiveTab('meetings');
  }

  function beginReschedule(schedule: PracticumSchedule) {
    setSelectedClassId(schedule.classId);
    setScheduleRoom('');
    setScheduleDate('');
    setStartTime('');
    setEndTime('');
    setTimeDropdownOpen(false);
    setLabDropdownOpen(false);
    setEditingScheduleId(schedule.id);
    setReschedulingScheduleId(schedule.id);
    setRepeatWeekly(false);
    setExpandedSeriesId(null);
    setActiveTab('meetings');
  }

  function beginAddSeriesMeeting(seriesId: string) {
    const series = scheduleSeries.find((item) => item.id === seriesId);
    if (!series) return;
    setActiveTab('meetings');
    setSelectedClassId(series.template.classId);
    setScheduleRoom(series.template.ruang);
    setScheduleDate('');
    setStartTime(series.template.startTime);
    setEndTime(series.template.endTime);
    setEditingScheduleId(null);
    setReschedulingScheduleId(null);
    setRepeatWeekly(false);
    setAddingMeetingToSeriesId(seriesId);
    setError(null);
    setNotice(null);
  }

  function openDatePicker() {
    const dateToShow = isValidDate(scheduleDate)
      ? new Date(`${scheduleDate}T00:00:00`)
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

    setScheduleDate(date);
    setStartTime('');
    setEndTime('');
    setTimeDropdownOpen(false);
    setDatePickerVisible(false);
    setError(null);
  }

  function isTimeSlotDisabled(
    slot: PracticumTimeSlot,
    excludedScheduleId: string | null = editingScheduleId,
  ) {
    return hasPracticumTimeConflict(
      scheduleRoom,
      scheduleDate,
      slot,
      allSchedules,
      excludedScheduleId,
    );
  }

  function selectTimeSlot(slot: PracticumTimeSlot) {
    setStartTime(slot.startTime);
    setEndTime(slot.endTime);
    setTimeDropdownOpen(false);
    setError(null);
  }

  function updateScheduleRoom(room: string) {
    const currentSlot = selectedTimeSlot;
    setScheduleRoom(room);

    if (
      currentSlot &&
      hasPracticumTimeConflict(
        room,
        scheduleDate,
        currentSlot,
        allSchedules,
        editingScheduleId,
      )
    ) {
      setStartTime('');
      setEndTime('');
    }
  }

  function renderScheduleFields() {
    return (
      <>
        <View style={styles.inputGroup}>
          <ThemedText type="smallBold" style={styles.inputLabel}>
            Ruang Laboratorium
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: roomDropdownOpen }}
            onPress={() => setRoomDropdownOpen(true)}
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
              style={{ color: scheduleRoom ? theme.text : theme.textSecondary }}>
              {scheduleRoom || 'Pilih ruang'}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {roomDropdownOpen ? '▲' : '▼'}
            </ThemedText>
          </Pressable>
        </View>
        <View style={styles.inputGroup}>
          <ThemedText type="smallBold" style={styles.inputLabel}>
            {addingMeetingToSeriesId ? 'Tanggal pertemuan' : 'Tanggal pertemuan pertama'}
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
                color: scheduleDate ? theme.text : theme.textSecondary,
              }}>
                {scheduleDate ? formatDate(scheduleDate) : 'Pilih tanggal'}
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
            accessibilityState={{
              expanded: timeDropdownOpen,
              disabled: !scheduleRoom.trim() || !scheduleDate,
            }}
            disabled={!scheduleRoom.trim() || !scheduleDate}
            onPress={() => setTimeDropdownOpen(true)}
            style={[
              styles.inputContainer,
              styles.timeDropdownField,
              {
                backgroundColor: theme.glassInput,
                borderColor: theme.glassBorder,
              },
              (!scheduleRoom.trim() || !scheduleDate) && styles.dimmed,
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
          {editingClassId
            ? 'Ubah praktikum di Lab'
            : className.trim()
              ? `Tambah praktikum di ${className.trim()}`
              : 'Tambah Lab dan praktikum'}
        </ThemedText>
        <DataInput
          label="Nama Lab"
          value={className}
          onChangeText={setClassName}
          placeholder="Contoh: Lab B2"
          theme={theme}
        />
        <DataInput
          label="Nama praktikum"
          value={courseName}
          onChangeText={setCourseName}
          placeholder="Contoh: Basis Data"
          theme={theme}
        />
        <View style={styles.buttonRow}>
          <ActionButton
            label={
              editingClassId
                ? 'Simpan perubahan'
                : className.trim()
                  ? 'Tambah praktikum'
                  : 'Tambah'
            }
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
        {renderClassForm()}
        {classes.length === 0 ? (
          <EmptyState text="Belum ada Lab dan praktikum. Tambahkan keduanya untuk mulai mengelola peserta dan jadwal." />
        ) : (
          labGroups.map((lab) => (
            <ThemedView
              key={lab.name.trim().toLocaleLowerCase()}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <ThemedText type="smallBold">{lab.name}</ThemedText>
              {lab.offerings.map((practicumClass) => (
                <View
                  key={practicumClass.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.glassInput,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <ThemedText type="smallBold">{practicumClass.course}</ThemedText>
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
                      label="Hapus praktikum"
                      onPress={() =>
                        setDeleteTarget({
                          type: 'class',
                          id: practicumClass.id,
                          label: `${lab.name} · ${practicumClass.course}`,
                        })
                      }
                      disabled={busy || Boolean(editingScheduleId)}
                      danger
                    />
                  </View>
                </View>
              ))}
            </ThemedView>
          ))
        )}
      </View>
    );
  }

  function renderScheduleTab() {
    return (
      <View style={styles.section}>
        {classes.length === 0 ? (
          <EmptyState text="Buat Lab terlebih dahulu sebelum menambah jadwal." />
        ) : (
          renderScheduleEditor()
        )}
        {renderSchedules()}
      </View>
    );
  }

  function renderMeetingTab() {
    return (
      <View style={styles.section}>
        {classes.length === 0 ? (
          <EmptyState text="Buat jadwal rutin di tab Jadwal terlebih dahulu." />
        ) : (
          renderMeetings()
        )}
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
          <ThemedText type="smallBold">Tambahkan peserta ke praktikum</ThemedText>
          {classes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Tambahkan Lab dan praktikum terlebih dahulu.
            </ThemedText>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <ThemedText type="smallBold" style={styles.inputLabel}>
                  Pilih praktikum
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: participantOfferingDropdownOpen,
                  }}
                  onPress={() => setParticipantOfferingDropdownOpen(true)}
                  style={[
                    styles.inputContainer,
                    styles.timeDropdownField,
                    {
                      backgroundColor: theme.glassInput,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <ThemedText type="small">
                    {activeClass
                      ? `${activeClass.course} · ${activeClass.name}`
                      : 'Pilih praktikum'}
                  </ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    {participantOfferingDropdownOpen ? '▲' : '▼'}
                  </ThemedText>
                </Pressable>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="smallBold" style={styles.inputLabel}>
                  Pilih praktikan
                </ThemedText>
                {users.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Belum ada akun praktikan terdaftar.
                  </ThemedText>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      expanded: participantUserDropdownOpen,
                    }}
                    onPress={() => setParticipantUserDropdownOpen(true)}
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
                        color: activeUser
                          ? theme.text
                          : theme.textSecondary,
                      }}>
                      {activeUser
                        ? `${activeUser.name} · ${activeUser.identityNumber}`
                        : 'Pilih praktikan'}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      style={{ color: theme.primary }}>
                      {participantUserDropdownOpen ? '▲' : '▼'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
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

        {labGroups.map((lab) => {
          return (
            <ThemedView
              key={`participants-${lab.name.trim().toLocaleLowerCase()}`}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <ThemedText type="smallBold">{lab.name}</ThemedText>
              {lab.offerings.map((practicumClass) => {
                const classParticipants = participants.filter(
                  (participant) => participant.classId === practicumClass.id,
                );
                return (
                  <View
                    key={practicumClass.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: theme.glassInput,
                        borderColor: theme.glassBorder,
                      },
                    ]}>
                    <ThemedText type="smallBold">
                      {practicumClass.course}
                    </ThemedText>
                    {classParticipants.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Belum ada peserta untuk praktikum ini.
                      </ThemedText>
                    ) : (
                      classParticipants.map((participant) => {
                        const user = users.find(
                          (item) => item.id === participant.userId,
                        );
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
                  </View>
                );
              })}
            </ThemedView>
          );
        })}
      </View>
    );
  }

  function renderScheduleEditor() {
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
          {addingMeetingToSeriesId
            ? 'Tambah pertemuan'
            : reschedulingScheduleId
            ? 'Pindahkan satu pertemuan'
            : editingScheduleId
              ? 'Ubah jadwal'
              : 'Tambah jadwal rutin atau pertemuan'}
        </ThemedText>
        <View style={styles.inputGroup}>
          <ThemedText type="smallBold" style={styles.inputLabel}>
            Lab dan praktikum
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: labDropdownOpen }}
            onPress={() => setLabDropdownOpen(true)}
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
              style={{ color: activeClass ? theme.text : theme.textSecondary }}>
              {activeClass
                ? `${activeClass.name} · ${activeClass.course}`
                : 'Pilih Lab'}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {labDropdownOpen ? '▲' : '▼'}
            </ThemedText>
          </Pressable>
        </View>
        {renderScheduleFields()}
        {repeatWeekly && !editingScheduleId && !reschedulingScheduleId && !addingMeetingToSeriesId ? (
          <DataInput
            label="Jumlah pertemuan mingguan"
            value={meetingCount}
            onChangeText={setMeetingCount}
            keyboardType="number-pad"
            placeholder="Contoh: 16"
            theme={theme}
          />
        ) : null}
        <View style={styles.buttonRow}>
          <ActionButton
            label={
              addingMeetingToSeriesId
                ? 'Tambah pertemuan'
                : reschedulingScheduleId
                ? 'Simpan jadwal pengganti'
                : editingScheduleId
                  ? 'Simpan perubahan'
                  : repeatWeekly
                    ? 'Buat jadwal rutin'
                    : 'Tambah pertemuan'
            }
            onPress={saveSchedule}
            disabled={busy}
            primary
          />
          {editingScheduleId || reschedulingScheduleId || addingMeetingToSeriesId ? (
            <ActionButton
              label="Batal"
              onPress={resetScheduleForm}
              disabled={busy}
            />
          ) : null}
        </View>
      </ThemedView>
    );
  }

  function renderSchedules() {
    return (
      <>
        <ThemedText type="smallBold">Jadwal rutin</ThemedText>
        {scheduleSeries.length === 0 ? (
          <EmptyState text="Belum ada jadwal rutin. Buat jadwal mingguan dari formulir di atas." />
        ) : (
          scheduleSeries.map(({ id, template, meetings, active }) => (
            <ThemedView
              key={id}
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.listRow}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{template.praktikum}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {template.kelas} · {template.ruang}
                  </ThemedText>
                </View>
                <ThemedText
                  type="smallBold"
                  style={{ color: active ? theme.primary : theme.textSecondary }}>
                  {active ? 'Aktif' : 'Selesai'}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Setiap {new Date(`${template.date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long' })} · {template.startTime}–{template.endTime}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Set(
                  meetings
                    .filter((meeting) => meeting.status !== 'cancelled')
                    .map((meeting) => meeting.seriesIndex ?? meeting.id),
                ).size} pertemuan tersimpan
              </ThemedText>
              {active ? (
                <View style={styles.buttonRow}>
                  <ActionButton
                    label="Tambah pertemuan"
                    onPress={() => beginAddSeriesMeeting(id)}
                    disabled={busy || Boolean(editingScheduleId)}
                  />
                  <ActionButton
                    label="Akhiri jadwal"
                    onPress={() => setDeleteTarget({ type: 'series', id, label: template.praktikum })}
                    disabled={busy}
                    danger
                  />
                </View>
              ) : null}
            </ThemedView>
          ))
        )}
      </>
    );
  }

  function renderMeetings() {
    const sortedSchedules = [...schedules].sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    );

    const searchKey = meetingQuery.trim().toLowerCase();
    const matchesQuery = (praktikum: string, ruang: string) =>
      !searchKey ||
      praktikum.toLowerCase().includes(searchKey) ||
      ruang.toLowerCase().includes(searchKey);

    // Satu baris per seri pertemuan; jadwal tunggal juga punya detail sendiri
    const groupRows = scheduleSeries.map((series) => ({
      rowKey: `series:${series.id}`,
      seriesId: series.id,
      scheduleId: null as string | null,
      praktikum: series.template.praktikum,
      kelas: series.template.kelas,
      ruang: series.template.ruang,
      firstDate: series.meetings[0]?.date ?? series.template.date,
      count: series.meetings.filter(
        (meeting) => meeting.status !== 'cancelled',
      ).length,
      active: series.active,
    }));

    const singleRows = sortedSchedules
      .filter((schedule) => !schedule.seriesId)
      .map((schedule) => ({
        rowKey: `schedule:${schedule.id}`,
        seriesId: null as string | null,
        scheduleId: schedule.id,
        praktikum: schedule.praktikum,
        kelas: schedule.kelas,
        ruang: schedule.ruang,
        firstDate: schedule.date,
        count: 1,
        active: schedule.status !== 'cancelled',
      }));

    const meetingRows = [...groupRows, ...singleRows]
      .filter((row) => matchesQuery(row.praktikum, row.ruang))
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate));

    const expandedSeries = expandedSeriesId
      ? scheduleSeries.find((series) => series.id === expandedSeriesId)
      : undefined;

    const expandedSchedule =
      !expandedSeries && expandedSeriesId
        ? schedules.find((schedule) => schedule.id === expandedSeriesId)
        : undefined;

    return (
      <>
        {addingMeetingToSeriesId || editingScheduleId || reschedulingScheduleId
          ? renderScheduleEditor()
          : null}

        <View style={styles.section}>
          <ThemedText type="smallBold">Daftar pertemuan</ThemedText>

          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.glassInput,
                borderColor: theme.glassBorder,
              },
            ]}>
            <TextInput
              value={meetingQuery}
              onChangeText={setMeetingQuery}
              placeholder="Cari nama praktikum atau lab"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
            {meetingQuery.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hapus pencarian"
                onPress={() => setMeetingQuery('')}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  ✕
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {meetingRows.length === 0 ? (
            <EmptyState text="Tidak ada pertemuan yang cocok dengan pencarian." />
          ) : (
            <View style={styles.meetingList}>
              {meetingRows.map((row, index) => {
                const rowId = row.seriesId ?? row.scheduleId;
                const expanded = expandedSeriesId === rowId;

                return (
                  <ThemedView
                    key={row.rowKey}
                    type="backgroundElement"
                    style={[
                      styles.meetingCard,
                      {
                        backgroundColor: '#F7F1E7',
                        borderColor: expanded ? theme.primary : '#C8B995',
                      },
                    ]}>
                    <View style={styles.listRow}>
                      <View style={styles.flex}>
                        <ThemedText type="smallBold">
                          {index + 1}. {row.praktikum}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {row.kelas} · {row.ruang}
                        </ThemedText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Lihat detail ${row.praktikum}`}
                        onPress={() =>
                          setExpandedSeriesId(expanded ? null : rowId)
                        }
                        style={({ pressed }) => [
                          styles.detailChip,
                          {
                            backgroundColor: expanded
                              ? theme.primary
                              : theme.glassInput,
                            borderColor: theme.glassBorder,
                          },
                          pressed && styles.pressedRow,
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{
                            color: expanded ? theme.primaryText : theme.text,
                          }}>
                          {expanded ? 'Tutup' : 'Detail'}
                        </ThemedText>
                      </Pressable>
                    </View>

                    <View style={styles.meetingCardMetaRow}>
                      <View style={styles.meetingCardMetaItem}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Tanggal Mulai
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {formatDate(row.firstDate)}
                        </ThemedText>
                      </View>
                      <View style={styles.meetingCardMetaItem}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Status
                        </ThemedText>
                        <View style={styles.meetingCardStatusRow}>
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor: row.active
                                  ? theme.primary
                                  : 'rgba(53, 64, 36, 0.15)',
                              },
                            ]}>
                            <ThemedText
                              type="small"
                              style={{
                                color: row.active
                                  ? theme.primaryText
                                  : theme.text,
                              }}>
                              {row.active ? 'Aktif' : 'Selesai'}
                            </ThemedText>
                          </View>
                          <ThemedText
                            type="small"
                            themeColor="textSecondary">
                            {row.count} pertemuan
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}

          {expandedSeries && (
            <ThemedView
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.listRow}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">
                    Detail {expandedSeries.template.praktikum}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {expandedSeries.template.kelas} · {expandedSeries.template.ruang} ·{' '}
                    {expandedSeries.template.startTime}–
                    {expandedSeries.template.endTime}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tutup detail pertemuan"
                  onPress={() => setExpandedSeriesId(null)}
                  style={({ pressed }) => [
                    styles.closeDetailButton,
                    {
                      backgroundColor: theme.glassInput,
                      borderColor: theme.glassBorder,
                    },
                    pressed && styles.pressedRow,
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Tutup Detail
                  </ThemedText>
                </Pressable>
              </View>

              {expandedSeries.meetings.map((meeting) => {
                const isPast = meeting.date < todayKey();
                const cancelled = meeting.status === 'cancelled';
                const rescheduled = meeting.status === 'rescheduled';

                return (
                  <View key={meeting.id} style={styles.meetingDetailRow}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">
                        Pertemuan {meeting.seriesIndex}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDate(meeting.date)} · {meeting.startTime}–
                        {meeting.endTime}
                      </ThemedText>
                    </View>
                    <View style={styles.meetingDetailMeta}>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: cancelled
                            ? theme.textSecondary
                            : isPast
                              ? theme.textSecondary
                              : theme.primary,
                        }}>
                        {cancelled
                          ? 'Dibatalkan'
                          : rescheduled
                            ? 'Dipindahkan'
                            : isPast
                              ? 'Selesai'
                              : 'Mendatang'}
                      </ThemedText>
                    </View>
                    {!cancelled && !rescheduled && isPast ? null : null}
                    {!cancelled && !rescheduled && !isPast ? (
                      <View style={styles.buttonRow}>
                        <ActionButton
                          label="Ubah"
                          onPress={() => beginEditSchedule(meeting)}
                          disabled={busy || Boolean(editingScheduleId)}
                        />
                        <ActionButton
                          label="Pindah"
                          onPress={() => beginReschedule(meeting)}
                          disabled={busy || Boolean(editingScheduleId)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {expandedSeries.active ? (
                <View style={styles.buttonRow}>
                  <ActionButton
                    label="Tambah pertemuan"
                    onPress={() => beginAddSeriesMeeting(expandedSeries.id)}
                    disabled={busy || Boolean(editingScheduleId)}
                    primary
                  />
                  <ActionButton
                    label="Akhiri jadwal"
                    onPress={() =>
                      setDeleteTarget({
                        type: 'series',
                        id: expandedSeries.id,
                        label: expandedSeries.template.praktikum,
                      })
                    }
                    disabled={busy}
                    danger
                  />
                </View>
              ) : null}
            </ThemedView>
          )}

          {expandedSchedule && (
            <ThemedView
              type="backgroundElement"
              style={[
                styles.card,
                {
                  backgroundColor: theme.glassCard,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.listRow}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">
                    Detail {expandedSchedule.praktikum}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {expandedSchedule.kelas} · {expandedSchedule.ruang} ·{' '}
                    {expandedSchedule.startTime}–{expandedSchedule.endTime}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tutup detail pertemuan"
                  onPress={() => setExpandedSeriesId(null)}
                  style={({ pressed }) => [
                    styles.closeDetailButton,
                    {
                      backgroundColor: theme.glassInput,
                      borderColor: theme.glassBorder,
                    },
                    pressed && styles.pressedRow,
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Tutup Detail
                  </ThemedText>
                </Pressable>
              </View>

              {(() => {
                const isPast = expandedSchedule.date < todayKey();
                const cancelled = expandedSchedule.status === 'cancelled';
                const rescheduled = expandedSchedule.status === 'rescheduled';

                return (
                  <View style={styles.meetingDetailRow}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">Pertemuan 1</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDate(expandedSchedule.date)} ·{' '}
                        {expandedSchedule.startTime}–{expandedSchedule.endTime}
                      </ThemedText>
                    </View>
                    <View style={styles.meetingDetailMeta}>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: cancelled
                            ? theme.textSecondary
                            : isPast
                              ? theme.textSecondary
                              : theme.primary,
                        }}>
                        {cancelled
                          ? 'Dibatalkan'
                          : rescheduled
                            ? 'Dipindahkan'
                            : isPast
                              ? 'Selesai'
                              : 'Mendatang'}
                      </ThemedText>
                    </View>
                    {!cancelled && !rescheduled && !isPast ? (
                      <View style={styles.buttonRow}>
                        <ActionButton
                          label="Ubah"
                          onPress={() => beginEditSchedule(expandedSchedule)}
                          disabled={busy || Boolean(editingScheduleId)}
                        />
                        <ActionButton
                          label="Pindah"
                          onPress={() => beginReschedule(expandedSchedule)}
                          disabled={busy || Boolean(editingScheduleId)}
                        />
                        <ActionButton
                          label="Hapus"
                          onPress={() =>
                            setDeleteTarget({
                              type: 'schedule',
                              id: expandedSchedule.id,
                              label: expandedSchedule.praktikum,
                            })
                          }
                          disabled={busy}
                          danger
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })()}
            </ThemedView>
          )}
        </View>
      </>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <DashboardCapsule
            title="Kelola Data Praktikum"
            subtitle="Kelola Lab, peserta, jadwal rutin, dan pertemuan."
            actions={[
              { label: 'Kembali ke Jadwal', onPress: () => router.replace('/asisten/jadwal') },
            ]}
          />
          <DashboardTabs
            tabs={TABS.map((tab) => ({
              key: tab.id,
              label: tab.label,
              active: activeTab === tab.id,
              onPress: () => {
                if (activeTab !== tab.id && (addingMeetingToSeriesId || editingScheduleId || reschedulingScheduleId)) {
                  resetScheduleForm();
                }
                setActiveTab(tab.id);
                setRepeatWeekly(tab.id === 'schedules');
                setTimeDropdownOpen(false);
                setLabDropdownOpen(false);
                setParticipantOfferingDropdownOpen(false);
                setDatePickerVisible(false);
              },
            }))}
          />

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
          ) : activeTab === 'labs' ? (
            renderClasses()
          ) : activeTab === 'schedules' ? (
            renderScheduleTab()
          ) : activeTab === 'meetings' ? (
            renderMeetingTab()
          ) : (
            renderParticipants()
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={labDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLabDropdownOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pilihan Lab"
            style={StyleSheet.absoluteFill}
            onPress={() => setLabDropdownOpen(false)}
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
            <ThemedText type="smallBold">Pilih Lab</ThemedText>
            <ScrollView
              style={styles.timeDropdownList}
              contentContainerStyle={styles.timeDropdownListContent}
              showsVerticalScrollIndicator={false}>
              {classes.map((practicumClass) => {
                const selected = activeClassId === practicumClass.id;
                return (
                  <Pressable
                    key={practicumClass.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedClassId(practicumClass.id);
                      setLabDropdownOpen(false);
                      setError(null);
                      setNotice(null);
                    }}
                    style={[
                      styles.timeDropdownOption,
                      selected && {
                        backgroundColor: theme.glassInput,
                      },
                    ]}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">
                        {practicumClass.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {practicumClass.course}
                      </ThemedText>
                    </View>
                    {selected ? (
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primary }}>
                        Dipilih
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <ActionButton
              label="Tutup"
              onPress={() => setLabDropdownOpen(false)}
            />
          </ThemedView>
        </View>
      </Modal>

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
        visible={participantOfferingDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setParticipantOfferingDropdownOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pilihan praktikum"
            style={StyleSheet.absoluteFill}
            onPress={() => setParticipantOfferingDropdownOpen(false)}
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
            <ThemedText type="smallBold">Pilih praktikum</ThemedText>
            <ScrollView
              style={styles.timeDropdownList}
              contentContainerStyle={styles.timeDropdownListContent}
              showsVerticalScrollIndicator={false}>
              {labGroups.map((lab) => (
                <View key={lab.name.trim().toLocaleLowerCase()}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {lab.name}
                  </ThemedText>
                  {lab.offerings.map((practicumClass) => {
                    const selected = activeClassId === practicumClass.id;
                    return (
                      <Pressable
                        key={practicumClass.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setSelectedClassId(practicumClass.id);
                          setParticipantOfferingDropdownOpen(false);
                          setError(null);
                          setNotice(null);
                        }}
                        style={[
                          styles.timeDropdownOption,
                          selected && {
                            backgroundColor: theme.glassInput,
                          },
                        ]}>
                        <ThemedText type="small">
                          {practicumClass.course}
                        </ThemedText>
                        {selected ? (
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
              onPress={() => setParticipantOfferingDropdownOpen(false)}
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
            <ThemedText type="smallBold">
              {deleteTarget?.type === 'series' ? 'Akhiri jadwal rutin?' : 'Hapus data?'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {deleteTarget?.type === 'series'
                ? `Akhiri ${deleteTarget.label}? Pertemuan mendatang akan dibatalkan, sementara pertemuan dan riwayat yang sudah lewat tetap tersimpan.`
                : `Yakin ingin menghapus ${deleteTarget?.label}? Tindakan ini tidak dapat dibatalkan.`}
            </ThemedText>
            <View style={styles.buttonRow}>
              <ActionButton
                label="Batal"
                onPress={() => setDeleteTarget(null)}
                disabled={busy}
              />
              <ActionButton
                label={busy ? 'Menyimpan...' : deleteTarget?.type === 'series' ? 'Akhiri jadwal' : 'Hapus'}
                onPress={confirmDelete}
                disabled={busy}
                danger
              />
            </View>
          </ThemedView>
        </View>
      </Modal>
      <Modal
        visible={roomDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoomDropdownOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pilihan ruang"
            style={StyleSheet.absoluteFill}
            onPress={() => setRoomDropdownOpen(false)}
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
            <ThemedText type="smallBold">Pilih ruang laboratorium</ThemedText>
            <ScrollView
              style={styles.dropdownScroll}
              contentContainerStyle={styles.timeDropdownListContent}
              showsVerticalScrollIndicator>
              {labGroups.map((lab) => {
                const selected =
                  scheduleRoom.trim().toLowerCase() ===
                  lab.name.trim().toLowerCase();

                return (
                  <Pressable
                    key={`room-option-${lab.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      updateScheduleRoom(lab.name);
                      setRoomDropdownOpen(false);
                    }}
                    style={[
                      styles.timeDropdownOption,
                      selected && { backgroundColor: theme.glassInput },
                    ]}>
                    <ThemedText type="smallBold">{lab.name}</ThemedText>
                  </Pressable>
                );
              })}
              {labGroups.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Belum ada lab. Tambahkan kelas di tab Labs terlebih dahulu.
                </ThemedText>
              ) : null}
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={participantUserDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setParticipantUserDropdownOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup pilihan praktikan"
            style={StyleSheet.absoluteFill}
            onPress={() => setParticipantUserDropdownOpen(false)}
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
            <ThemedText type="smallBold">Pilih praktikan</ThemedText>
            <ScrollView
              style={styles.dropdownScroll}
              contentContainerStyle={styles.timeDropdownListContent}
              showsVerticalScrollIndicator>
              {users.map((user) => {
                const enrolled = enrolledUserIds.has(user.id);
                const selected = activeUserId === user.id;

                return (
                  <Pressable
                    key={`user-option-${user.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: enrolled }}
                    disabled={enrolled}
                    onPress={() => {
                      setSelectedUserId(user.id);
                      setParticipantUserDropdownOpen(false);
                    }}
                    style={[
                      styles.timeDropdownOption,
                      selected && { backgroundColor: theme.glassInput },
                      enrolled && styles.dimmed,
                    ]}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">{user.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {user.identityNumber}
                        {enrolled ? ' · sudah terdaftar' : ''}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
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
    paddingBottom: 110,
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
    flexShrink: 0,
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
  dropdownScroll: {
    flexShrink: 1,
    maxHeight: 280,
  },
  closeDetailButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
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
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  meetingList: {
    gap: Spacing.two,
  },
  meetingCard: {
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  meetingCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  meetingCardMetaItem: {
    gap: 2,
  },
  meetingCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tableCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#C8B995',
    overflow: 'hidden',
    backgroundColor: '#F7F1E7',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 185, 149, 0.6)',
  },
  tableHeaderRow: {
    backgroundColor: 'rgba(136, 144, 99, 0.3)',
  },
  tableRowZebra: {
    backgroundColor: 'rgba(136, 144, 99, 0.08)',
  },
  pressedRow: {
    opacity: 0.65,
  },
  tableCellNo: {
    width: 28,
  },
  tableCellMain: {
    flex: 1,
    gap: 2,
  },
  tableCellDate: {
    width: 116,
  },
  tableCellStatus: {
    width: 96,
    gap: 2,
  },
  tableCellAction: {
    width: 76,
    alignItems: 'flex-end',
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  detailChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  meetingDetailRow: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: 'rgba(136, 144, 99, 0.2)',
  },
  meetingDetailMeta: {
    alignItems: 'flex-end',
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
