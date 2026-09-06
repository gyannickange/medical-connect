import { describe, expect, it } from "vitest";
import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy.can", () => {
  class TestCanPolicy extends BasePolicy {
    protected readonly module = "patients" as const;
    canView() {
      return this.can("view");
    }
  }

  it("returns true for the admin role regardless of the permissions matrix", () => {
    const policy = new TestCanPolicy("admin", { patients: { view: false } } as any);
    expect(policy.canView()).toBe(true);
  });

  it("reads the matrix for a non-admin role", () => {
    const policy = new TestCanPolicy("medecin", { patients: { view: true } } as any);
    expect(policy.canView()).toBe(true);
  });

  it("denies when the matrix has no entry for this module/action", () => {
    const policy = new TestCanPolicy("cashier", { patients: { view: false } } as any);
    expect(policy.canView()).toBe(false);
  });

  it("denies when no permissions matrix was passed at all", () => {
    const policy = new TestCanPolicy("medecin", null);
    expect(policy.canView()).toBe(false);
  });
});
