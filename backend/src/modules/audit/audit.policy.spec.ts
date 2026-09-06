import { AuditPolicy } from "./audit.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): AuditPolicy {
  const policy = new AuditPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { audit: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("AuditPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    await expect(policyFor("admin", { view: false }).view()).resolves.toBe(true);
  });

  it("view reads the audit.view entry", async () => {
    await expect(policyFor("manager", { view: false }).view()).resolves.toBe(false);
    await expect(policyFor("manager", { view: true }).view()).resolves.toBe(true);
  });
});
