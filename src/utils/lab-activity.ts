import type { Schedule, Session, SessionStatus } from '@/types';

export type PracticumActivityItem = {
  id: string;
  praktikum: string;
  kelas: string;
  ruang: string;
  date: string;
  timeRange: string;
  sessionStatus: SessionStatus;
  isToday: boolean;
};

export type LabActivitySummary = {
  ongoing: PracticumActivityItem | null;
  upcoming: PracticumActivityItem | null;
  ongoingDescription: string;
  upcomingDescription: string;
  allTodaySchedules: PracticumActivityItem[];
};

function formatTodayDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function getMatchingRoomNames(labName: string): Set<string> {
  const normalized = labName.trim().replace(/\s+/g, ' ').toLowerCase();
  const aliases: Record<string, string[]> = {
    'lab komputer a': ['lab a'],
    'lab a': ['lab komputer a'],
    'lab b': ['lab komputer b'],
    'lab c': ['lab komputer c'],
    'lab d': ['lab multimedia'],
    'lab multimedia': ['lab d'],
  };

  return new Set([normalized, ...(aliases[normalized] ?? [])]);
}

export function getLaboratoryActivity(
  labName: string,
  schedules: Schedule[],
  sessions: Session[],
  now: Date = new Date(),
): LabActivitySummary {
  const matchingRoomNames = getMatchingRoomNames(labName);
  const todayStr = formatTodayDate(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Filter schedules matching this lab room
  const matchingSchedules = schedules.filter((s) => {
    const roomName = s.ruang.trim().replace(/\s+/g, ' ').toLowerCase();
    return matchingRoomNames.has(roomName);
  });

  // Map each schedule to its current session status
  const items: PracticumActivityItem[] = matchingSchedules.map((s) => {
    const session = sessions.find((sess) => sess.scheduleId === s.id);
    const sessionStatus: SessionStatus = session ? session.status : 'scheduled';

    return {
      id: s.id,
      praktikum: s.praktikum,
      kelas: s.kelas,
      ruang: s.ruang,
      date: s.date,
      timeRange: `${s.startTime} - ${s.endTime} WIB`,
      sessionStatus,
      isToday: s.date === todayStr,
    };
  });

  // Today's schedules sorted by start time
  const todayItems = items
    .filter((item) => item.isToday)
    .sort((a, b) => {
      const aStart = schedules.find((s) => s.id === a.id)?.startTime || '00:00';
      const bStart = schedules.find((s) => s.id === b.id)?.startTime || '00:00';
      return timeToMinutes(aStart) - timeToMinutes(bStart);
    });

  // 1. Ongoing practicum:
  // Either session is explicitly 'open', OR current time is within schedule window (and not closed/cancelled)
  let ongoingItem: PracticumActivityItem | null = null;

  // First check if any session is actively open right now
  const openSessionItem = todayItems.find((item) => {
    const schedule = schedules.find((s) => s.id === item.id);
    return schedule?.status !== 'cancelled' && item.sessionStatus === 'open';
  });
  if (openSessionItem) {
    ongoingItem = openSessionItem;
  } else {
    // Otherwise check time window
    ongoingItem =
      todayItems.find((item) => {
        const schedule = schedules.find((s) => s.id === item.id);
        if (!schedule || schedule.status === 'cancelled') return false;
        const start = timeToMinutes(schedule.startTime);
        const end = timeToMinutes(schedule.endTime);
        return (
          currentMinutes >= start &&
          currentMinutes <= end &&
          item.sessionStatus !== 'closed'
        );
      }) || null;
  }

  // 2. Upcoming practicum:
  // Next schedule today starting after current time or after ongoing schedule
  let upcomingItem: PracticumActivityItem | null = null;

  const candidateUpcoming = todayItems.filter((item) => {
    if (ongoingItem && item.id === ongoingItem.id) return false;
    const schedule = schedules.find((s) => s.id === item.id);
    if (!schedule || schedule.status === 'cancelled') return false;
    const start = timeToMinutes(schedule.startTime);
    return start > currentMinutes && item.sessionStatus !== 'closed';
  });

  if (candidateUpcoming.length > 0) {
    upcomingItem = candidateUpcoming[0];
  } else {
    // If none today, check nearest future date
    const futureItems = items
      .filter((item) => {
        const schedule = schedules.find((s) => s.id === item.id);
        return (
          item.date > todayStr &&
          schedule?.status !== 'cancelled' &&
          item.sessionStatus !== 'closed'
        );
      })
      .sort((a, b) =>
        `${a.date} ${schedules.find((s) => s.id === a.id)?.startTime ?? '00:00'}`
          .localeCompare(
            `${b.date} ${schedules.find((s) => s.id === b.id)?.startTime ?? '00:00'}`,
          ),
      );
    if (futureItems.length > 0) {
      upcomingItem = futureItems[0];
    }
  }

  return {
    ongoing: ongoingItem,
    upcoming: upcomingItem,
    ongoingDescription: ongoingItem
      ? `${ongoingItem.praktikum} (${ongoingItem.kelas}) - ${ongoingItem.timeRange}`
      : 'Tidak ada praktikum yang sedang berlangsung saat ini.',
    upcomingDescription: upcomingItem
      ? `${upcomingItem.praktikum} (${upcomingItem.kelas}) - ${upcomingItem.timeRange} (${upcomingItem.isToday ? 'Hari ini' : upcomingItem.date})`
      : 'Tidak ada praktikum berikutnya yang dijadwalkan.',
    allTodaySchedules: todayItems,
  };
}
