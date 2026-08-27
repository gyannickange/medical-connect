import { PrescriptionsPolicy } from "./prescriptions.policy";

function policyFor(role: string): PrescriptionsPolicy {
  const policy = new PrescriptionsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PrescriptionsPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "pharmacien"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["accueil", "cashier", "laboratoire"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "pharmacien", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "pharmacien"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
