import { describe, expect, it } from "vitest";
import { LabOrdersPolicy } from "./labOrders.policy";

describe("LabOrdersPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new LabOrdersPolicy("admin", { labOrders: { view: false, create: false, update: false, recordFollowUp: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
    expect(policy.canRecordFollowUp()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new LabOrdersPolicy("laboratoire", { labOrders: { view: true, create: false, update: true, recordFollowUp: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(true);
    expect(policy.canRecordFollowUp()).toBe(false);
  });
});
