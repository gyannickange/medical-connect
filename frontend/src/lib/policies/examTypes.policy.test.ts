import { describe, expect, it } from "vitest";
import { ExamTypesPolicy } from "./examTypes.policy";

describe("ExamTypesPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new ExamTypesPolicy("admin", { examTypes: { view: false, create: false, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
    expect(policy.canDelete()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new ExamTypesPolicy("manager", { examTypes: { view: true, create: true, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(false);
    expect(policy.canDelete()).toBe(false);
  });
});
