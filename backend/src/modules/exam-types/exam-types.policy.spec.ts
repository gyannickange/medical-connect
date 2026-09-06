import { ExamTypesPolicy } from "./exam-types.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): ExamTypesPolicy {
  const policy = new ExamTypesPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { examTypes: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("ExamTypesPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false, delete: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.delete()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("manager", { view: true, create: true, update: false, delete: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(false);
    await expect(policy.delete()).resolves.toBe(false);
  });
});
