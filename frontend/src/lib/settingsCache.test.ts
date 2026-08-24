import { describe, expect, it } from "vitest";
import { upsertSettingRecord } from "./settingsCache";

const base = {
  id: "setting-1",
  tenantId: "local",
  key: "companyName",
  value: "A",
  category: "company",
  dataType: "string",
  isEncrypted: false,
  createdAt: "2026-08-15",
  updatedAt: "2026-08-15",
};

describe("upsertSettingRecord", () => {
  it("adds a newly created setting", () => {
    expect(upsertSettingRecord([], base)).toEqual([base]);
  });

  it("replaces the setting with the same key without duplicating it", () => {
    const next = { ...base, value: "B" };

    expect(upsertSettingRecord([base], next)).toEqual([next]);
  });
});
