import { TenantsPolicy } from "./tenants.policy";

describe("TenantsPolicy", () => {
  it("lets every role view the tenant list", () => {
    const policy = new TenantsPolicy();
    const roles = [
      "admin", "manager", "cashier", "accueil", "infirmier",
      "medecin", "laboratoire", "pharmacien", "platform_admin",
    ] as const;
    for (const role of roles) {
      policy.setUser({
        id: "u",
        username: "x",
        tenantId: role === "platform_admin" ? null : "tenant-1",
        role,
      } as any);
      expect(policy.view()).toBe(true);
    }
  });

  it("restricts create/update/delete to platform_admin only", () => {
    const policy = new TenantsPolicy();

    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect(policy.create()).toBe(true);
    expect(policy.update()).toBe(true);
    expect(policy.delete()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "tenant-1", role: "admin" } as any);
    expect(policy.create()).toBe(false);
    expect(policy.update()).toBe(false);
    expect(policy.delete()).toBe(false);
  });
});
