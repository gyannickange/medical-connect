import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy new Medical Connect role helpers", () => {
  it.each([
    ["accueil", "isAccueil"],
    ["infirmier", "isInfirmier"],
    ["medecin", "isMedecin"],
    ["laboratoire", "isLaboratoire"],
    ["pharmacien", "isPharmacien"],
  ] as const)("%s -> %s() is true only for that role", (role, method) => {
    const policy = new TestPolicy();
    policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
    expect((policy as any)[method]()).toBe(true);
    expect((policy as any).isAdmin()).toBe(false);
  });
});

describe("BasePolicy.isPlatformAdmin", () => {
  it("is true only for platform_admin", () => {
    const policy = new TestPolicy();
    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "t1", role: "admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(false);
  });
});
