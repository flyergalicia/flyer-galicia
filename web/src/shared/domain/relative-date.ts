// When something happened, as the lists of the app write it.
const SECOND_MS = 1000;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const TWO_DAYS = 172_800;

function twoDigits(number: number): string {
  return String(number).padStart(2, "0");
}

export function relativeDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const seconds = (now.getTime() - date.getTime()) / SECOND_MS;
  if (seconds < MINUTE) return "hace un momento";
  if (seconds < HOUR) return `hace ${String(Math.floor(seconds / MINUTE))} min`;
  if (seconds < DAY) return `hace ${String(Math.floor(seconds / HOUR))}h`;
  if (seconds < TWO_DAYS) return "ayer";
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${String(date.getFullYear())}`;
}
