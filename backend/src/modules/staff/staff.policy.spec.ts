import { StaffPolicy } from "./staff.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): StaffPolicy {
  const policy = new StaffPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { staff: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("StaffPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false, delete: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.delete()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("manager", { view: true, create: false, update: false, delete: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(false);
    await expect(policy.delete()).resolves.toBe(false);
  });
});
