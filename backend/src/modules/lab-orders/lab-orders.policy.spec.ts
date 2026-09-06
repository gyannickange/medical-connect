import { LabOrdersPolicy } from "./lab-orders.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): LabOrdersPolicy {
  const policy = new LabOrdersPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { labOrders: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("LabOrdersPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false, recordFollowUp: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.recordFollowUp()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("laboratoire", { view: true, create: false, update: true, recordFollowUp: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.recordFollowUp()).resolves.toBe(false);
  });
});
