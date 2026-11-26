export function zonedDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function zonedDayStart(isoDate: string, timeZone: string) {
  const noonUtc = new Date(`${isoDate}T12:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(noonUtc));
  const minute = Number(new Intl.DateTimeFormat("en-US", { timeZone, minute: "2-digit" }).format(noonUtc));
  const offsetMinutes = hour * 60 + minute - 12 * 60;
  return new Date(noonUtc.getTime() - offsetMinutes * 60_000 - 12 * 3_600_000);
}

export function localInputToIso(local: string, timeZone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const start = zonedDayStart(match[1], timeZone);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

export function toLocalInput(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

export function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatClock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDayLabel(isoDate: string, timeZone: string) {
  const start = zonedDayStart(isoDate, timeZone);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
}
