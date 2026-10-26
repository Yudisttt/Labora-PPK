const DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

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

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `${DAY_NAMES[weekday]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return `${formatDate(value)}, ${formatTime(value)}`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
