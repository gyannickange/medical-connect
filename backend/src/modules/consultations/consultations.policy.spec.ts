import { ConsultationsPolicy } from "./consultations.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): ConsultationsPolicy {
  const policy = new ConsultationsPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { consultations: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("ConsultationsPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false, cancel: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.cancel()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("medecin", { view: true, create: false, update: true, cancel: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.cancel()).resolves.toBe(false);
  });
});
