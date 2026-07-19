/**
 * Presentation-only formatter for Arabic user-facing clock values.
 * Keep database columns and API machine fields in canonical TIME/ISO formats.
 */
const BAGHDAD_TZ = 'Asia/Baghdad';

export function formatTime12Arabic(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const fromIso = formatDateTimeParts(raw);
    return fromIso ? fromIso.time : raw;
  }

  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;

  let hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return raw;

  const suffix = hour >= 12 ? 'م' : 'ص';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function formatTimeRange12Arabic(start: unknown, end: unknown): string {
  const from = formatTime12Arabic(start);
  const to = formatTime12Arabic(end);
  if (!from) return to;
  if (!to) return from;
  return `${from} - ${to}`;
}

/** Formats an ISO/timestamptz value as `dd/MM · h:mm ص/م` in Asia/Baghdad. */
export function formatDateTime12Arabic(value: unknown): string {
  if (value === null || value === undefined) return '';
  const parts = formatDateTimeParts(value);
  if (!parts) return String(value);
  return `${parts.date} · ${parts.time}`;
}

function formatDateTimeParts(
  value: unknown
): { date: string; time: string } | null {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD_TZ,
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const hour24 = Number(parts['hour']);
  const minute = parts['minute'] ?? '00';
  const suffix = hour24 >= 12 ? 'م' : 'ص';
  const hour12 = hour24 % 12 || 12;
  return {
    date: `${parts['day']}/${parts['month']}`,
    time: `${hour12}:${minute} ${suffix}`,
  };
}
