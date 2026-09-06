import { RolesPolicy } from "./roles.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, resolvedRole: Role | null): RolesPolicy {
  const policy = new RolesPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue(resolvedRole));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("RolesPolicy", () => {
  it("admin can always manage roles regardless of its stored matrix", async () => {
    const policy = policyFor("admin", { permissions: { roles: { view: false, create: false, update: false, delete: false } } } as any);
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.delete()).resolves.toBe(true);
  });

  it("a non-admin role with no roles permissions granted is denied everything", async () => {
    const policy = policyFor("manager", { permissions: { roles: { view: false, create: false, update: false, delete: false } } } as any);
    await expect(policy.view()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(false);
  });

  it("a role explicitly granted roles.update can update but not delete", async () => {
    const policy = policyFor("manager", { permissions: { roles: { view: true, create: false, update: true, delete: false } } } as any);
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
    await expect(policy.delete()).resolves.toBe(false);
  });
});
