import { pacificTimeZone } from "@/lib/dates";

export function createSubmissionReferenceId(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: pacificTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `SUB-${year}${month}${day}-${randomSuffix()}`;
}

function randomSuffix() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 6).toUpperCase();
  }
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
