import { describe, expect, it } from "vitest";
import { relativeTimeSince } from "./relativeTime";

describe("relativeTimeSince", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");

  it("returns 'now' for less than a minute ago", () => {
    expect(relativeTimeSince(new Date("2026-08-29T11:59:30.000Z"), now)).toEqual({ unit: "now", amount: 0 });
  });

  it("returns minutes for less than an hour ago", () => {
    expect(relativeTimeSince(new Date("2026-08-29T11:45:00.000Z"), now)).toEqual({ unit: "minutes", amount: 15 });
  });

  it("returns hours for less than a day ago", () => {
    expect(relativeTimeSince(new Date("2026-08-29T10:00:00.000Z"), now)).toEqual({ unit: "hours", amount: 2 });
  });

  it("returns days for a day or more ago", () => {
    expect(relativeTimeSince(new Date("2026-08-25T12:00:00.000Z"), now)).toEqual({ unit: "days", amount: 4 });
  });

  it("clamps a future date to 'now' instead of a negative amount", () => {
    expect(relativeTimeSince(new Date("2026-08-29T12:05:00.000Z"), now)).toEqual({ unit: "now", amount: 0 });
  });
});
