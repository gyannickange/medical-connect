import { PatientsPolicy } from "./patients.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): PatientsPolicy {
  const policy = new PatientsPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { patients: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PatientsPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
  });

  it("view reads the patients.view entry", async () => {
    await expect(policyFor("accueil", { view: true, create: false, update: false }).view()).resolves.toBe(true);
    await expect(policyFor("laboratoire", { view: false, create: false, update: false }).view()).resolves.toBe(false);
  });

  it("create reads the patients.create entry", async () => {
    await expect(policyFor("accueil", { view: false, create: true, update: false }).create()).resolves.toBe(true);
    await expect(policyFor("infirmier", { view: false, create: false, update: false }).create()).resolves.toBe(false);
  });

  it("update reads the patients.update entry", async () => {
    await expect(policyFor("accueil", { view: false, create: false, update: true }).update()).resolves.toBe(true);
    await expect(policyFor("medecin", { view: false, create: false, update: false }).update()).resolves.toBe(false);
  });
});
