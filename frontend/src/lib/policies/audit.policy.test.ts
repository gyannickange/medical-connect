import { describe, expect, it } from "vitest";
import { AuditPolicy } from "./audit.policy";

describe("AuditPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    expect(new AuditPolicy("admin", { audit: { view: false } } as any).canView()).toBe(true);
  });

  it("canView reads the audit.view entry", () => {
    expect(new AuditPolicy("manager", { audit: { view: false } } as any).canView()).toBe(false);
    expect(new AuditPolicy("manager", { audit: { view: true } } as any).canView()).toBe(true);
  });
});
