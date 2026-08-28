import { Timestamp } from "firebase/firestore";

export const STUDENT_EMAIL_PATTERN = /^10\d{6}@ucn\.dk$/i;
export const ARCHIVE_DELAY_DAYS = 120;

const pad = (value: number) => String(value).padStart(2, "0");

export function toDateInputValue(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

export function currentDateInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

export function defaultUserEndDate(from = new Date()): string {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;

  if (month >= 11) return `${year + 1}-06-30`;
  if (month <= 5) return `${year}-06-30`;
  return `${year}-12-31`;
}

export function dateInputToTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}T00:00:00.000Z`));
}

export function archiveTimestampForEndDate(value: string): Timestamp {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + ARCHIVE_DELAY_DAYS);
  return Timestamp.fromDate(date);
}

export function timestampToDateInput(value: unknown): string {
  if (value instanceof Timestamp) return toDateInputValue(value.toDate());

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return toDateInputValue((value as { toDate: () => Date }).toDate());
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return "";
}

export function isArchiveDue(value: unknown, now = new Date()): boolean {
  const dateValue = timestampToDateInput(value);
  return dateValue !== "" && dateValue <= toDateInputValue(now);
}
