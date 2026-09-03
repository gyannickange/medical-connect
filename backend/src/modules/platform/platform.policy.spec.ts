import { PlatformPolicy } from "./platform.policy";

describe("PlatformPolicy", () => {
  it("allows only platform_admin to create a tenant", () => {
    const policy = new PlatformPolicy();

    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect(policy.createTenant()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "tenant-1", role: "admin" } as any);
    expect(policy.createTenant()).toBe(false);
  });
});
