import { ConsultationsPolicy } from "./consultations.policy";

function policyFor(role: string): ConsultationsPolicy {
  const policy = new ConsultationsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("ConsultationsPolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["admin", "manager", "accueil", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "laboratoire", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "medecin", "infirmier"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["accueil", "laboratoire", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
