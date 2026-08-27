import { PatientsPolicy } from "./patients.policy";

function policyFor(role: string): PatientsPolicy {
  const policy = new PatientsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PatientsPolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["admin", "manager", "accueil"])("%s can create and update", (role) => {
    expect(policyFor(role).create()).toBe(true);
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "laboratoire", "cashier"])("%s cannot create or update", (role) => {
    expect(policyFor(role).create()).toBe(false);
    expect(policyFor(role).update()).toBe(false);
  });
});
