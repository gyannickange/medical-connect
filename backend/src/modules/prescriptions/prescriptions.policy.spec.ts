import { PrescriptionsPolicy } from "./prescriptions.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): PrescriptionsPolicy {
  const policy = new PrescriptionsPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { prescriptions: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PrescriptionsPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("pharmacien", { view: true, create: false, update: true });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(true);
  });
});
