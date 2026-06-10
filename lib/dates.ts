export const pacificTimeZone = "America/Los_Angeles";

export function todayPacificDateInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: pacificTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

export function todayPacificParts() {
  const [year, month, day] = todayPacificDateInput().split("-").map(Number);
  return { year, month: month - 1, day };
}

export function formatPacificLongDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: pacificTimeZone
  }).format(date);
}

export function formatPacificDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: pacificTimeZone,
    timeZoneName: "short"
  }).format(date);
}
