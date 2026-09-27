"use client";

import { MONTHS, type MonthDay } from "@/lib/occasions";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = { id: string; label: string; value: MonthDay | null; onChange: (v: MonthDay | null) => void };

/** Month + day picker for a yearly date (no year). Either both are set or neither. */
export function OccasionInput({ id, label, value, onChange }: Props) {
  const daysIn = (month: number) => new Date(Date.UTC(2000, month, 0)).getUTCDate(); // leap year: Feb has 29
  const month = value?.month ?? 0;
  const day = value?.day ?? 0;

  const set = (m: number, d: number) => {
    if (!m) return onChange(null);
    onChange({ month: m, day: Math.min(d || 1, daysIn(m)) });
  };

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <select id={`${id}-month`} aria-label={`${label} month`} value={month} onChange={(e) => set(Number(e.target.value), day)} className={selectClass}>
          <option value={0}>Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          id={`${id}-day`}
          aria-label={`${label} day`}
          value={day}
          disabled={!month}
          onChange={(e) => set(month, Number(e.target.value))}
          className={selectClass}
        >
          <option value={0}>Day</option>
          {Array.from({ length: month ? daysIn(month) : 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-sm text-muted-foreground hover:underline">
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}
