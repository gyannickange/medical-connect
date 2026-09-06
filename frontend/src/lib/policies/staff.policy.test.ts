import { describe, expect, it } from "vitest";
import { StaffPolicy } from "./staff.policy";

describe("StaffPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new StaffPolicy("admin", { staff: { view: false, create: false, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
    expect(policy.canDelete()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new StaffPolicy("manager", { staff: { view: true, create: false, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(false);
    expect(policy.canDelete()).toBe(false);
  });
});
