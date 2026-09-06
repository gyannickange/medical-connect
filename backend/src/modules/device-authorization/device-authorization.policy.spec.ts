import { DeviceAuthorizationPolicy } from "./device-authorization.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): DeviceAuthorizationPolicy {
  const policy = new DeviceAuthorizationPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { deviceAuthorization: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("DeviceAuthorizationPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { list: false, approve: false, revoke: false });
    await expect(policy.list()).resolves.toBe(true);
    await expect(policy.approve()).resolves.toBe(true);
    await expect(policy.revoke()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("manager", { list: true, approve: false, revoke: false });
    await expect(policy.list()).resolves.toBe(true);
    await expect(policy.approve()).resolves.toBe(false);
    await expect(policy.revoke()).resolves.toBe(false);
  });
});
