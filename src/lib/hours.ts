import type { OpeningHours } from "./types";

const DAYS = [
  ["mon", "lunes"],
  ["tue", "martes"],
  ["wed", "miércoles"],
  ["thu", "jueves"],
  ["fri", "viernes"],
  ["sat", "sábado"],
  ["sun", "domingo"],
] as const;

function formatTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour < 12 ? "a. m." : "p. m.";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatOpeningHours(hours: OpeningHours) {
  const slots = DAYS.map(([key, label]) => ({ label, slot: hours[key] }));
  if (slots.every((day) => !day.slot?.open || !day.slot?.close)) return null;
  const first = slots[0]?.slot;
  const same = Boolean(
    first?.open &&
      first.close &&
      slots.every((day) => day.slot?.open === first.open && day.slot?.close === first.close),
  );
  if (same && first?.open && first.close) {
    return `todos los días, ${formatTime(first.open)} a ${formatTime(first.close)}`;
  }
  return slots
    .map((day) =>
      day.slot?.open && day.slot.close
        ? `${day.label} ${formatTime(day.slot.open)} a ${formatTime(day.slot.close)}`
        : `${day.label} cerrado`,
    )
    .join(" · ");
}
