/** Yearly dates without a year (birthdays, anniversaries), for the family address book. */

export interface MonthDay {
  month: number;
  day: number;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Relationship suggestions; buyers can type anything. */
export const RELATIONSHIPS = [
  "Ammi", "Abbu", "Nani", "Nana", "Dadi", "Dada", "Bhai", "Behen",
  "Khala", "Phupho", "Chacha", "Mamu", "Wife", "Husband", "Friend",
];

/** "12 Mar". */
export function formatMonthDay({ month, day }: MonthDay): string {
  return `${day} ${MONTHS[month - 1]}`;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Whole days from `today` (a YYYY-MM-DD in the buyer's zone) to the next
 * occurrence; 0 means today. A 29 Feb date falls on 28 Feb in non-leap years.
 */
export function daysUntil(md: MonthDay, today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const at = (year: number) => {
    const day = md.month === 2 && md.day === 29 && !isLeap(year) ? 28 : md.day;
    return Date.UTC(year, md.month - 1, day);
  };
  const next = at(y) >= start ? at(y) : at(y + 1);
  return Math.round((next - start) / 86_400_000);
}

/** "today", "tomorrow", "in 5 days". */
export function formatDaysUntil(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** How far ahead an occasion counts as "coming up" (time to order and deliver). */
export const UPCOMING_DAYS = 30;
