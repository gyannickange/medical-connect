export type RelativeTimeUnit = "now" | "minutes" | "hours" | "days";

export interface RelativeTimeValue {
  unit: RelativeTimeUnit;
  amount: number;
}

export function relativeTimeSince(date: Date, now: Date = new Date()): RelativeTimeValue {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return { unit: "now", amount: 0 };
  if (minutes < 60) return { unit: "minutes", amount: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", amount: hours };
  const days = Math.floor(hours / 24);
  return { unit: "days", amount: days };
}
