import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy.isPlatformAdmin", () => {
  it("is true only for platform_admin", () => {
    const policy = new TestPolicy();
    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "t1", role: "admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(false);
  });
});

describe("BasePolicy.can", () => {
  class TestCanPolicy extends BasePolicy {
    protected readonly module = "patients" as const;
    view() {
      return this.can("view");
    }
  }

  it("returns true for the admin role without consulting the resolver", async () => {
    const policy = new TestCanPolicy();
    const resolver = jest.fn();
    policy.setRoleResolver(resolver);
    policy.setUser({ id: "u1", username: "x", tenantId: "t1", role: "admin" } as any);

    await expect(policy.view()).resolves.toBe(true);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("looks up the resolved role's matrix for a non-admin role", async () => {
    const policy = new TestCanPolicy();
    const resolver = jest.fn().mockResolvedValue({
      id: "medecin", tenantId: "t1", name: "Médecin", description: null, isSystemRole: true,
      permissions: { patients: { view: true } }, createdAt: new Date(), updatedAt: new Date(),
    });
    policy.setRoleResolver(resolver);
    policy.setUser({ id: "u2", username: "y", tenantId: "t1", role: "medecin" } as any);

    await expect(policy.view()).resolves.toBe(true);
    expect(resolver).toHaveBeenCalledWith("t1", "medecin");
  });

  it("denies when the matrix has no entry for this module/action", async () => {
    const policy = new TestCanPolicy();
    policy.setRoleResolver(jest.fn().mockResolvedValue({
      id: "cashier", tenantId: "t1", name: "Cashier", description: null, isSystemRole: true,
      permissions: { patients: { view: false } }, createdAt: new Date(), updatedAt: new Date(),
    }));
    policy.setUser({ id: "u3", username: "z", tenantId: "t1", role: "cashier" } as any);

    await expect(policy.view()).resolves.toBe(false);
  });

  it("denies when the role resolver has not been set", async () => {
    const policy = new TestCanPolicy();
    policy.setUser({ id: "u4", username: "w", tenantId: "t1", role: "medecin" } as any);

    await expect(policy.view()).resolves.toBe(false);
  });

  it("denies when the resolver returns null (role not found)", async () => {
    const policy = new TestCanPolicy();
    policy.setRoleResolver(jest.fn().mockResolvedValue(null));
    policy.setUser({ id: "u5", username: "v", tenantId: "t1", role: "deleted-role" } as any);

    await expect(policy.view()).resolves.toBe(false);
  });
});
