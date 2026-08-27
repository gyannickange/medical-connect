import { describe, expect, it } from "vitest";
import { calculateAge } from "./patientAge";

describe("calculateAge", () => {
  it("returns the age when the birthday already happened this year", () => {
    expect(calculateAge("1994-03-12", new Date("2026-08-27"))).toBe(32);
  });

  it("returns one less when the birthday has not happened yet this year", () => {
    expect(calculateAge("1994-10-12", new Date("2026-08-27"))).toBe(31);
  });

  it("returns the exact age on the birthday itself", () => {
    expect(calculateAge("1994-08-27", new Date("2026-08-27"))).toBe(32);
  });
});
