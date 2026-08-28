import { RoomsPolicy } from "./rooms.policy";

function policyFor(role: string): RoomsPolicy {
  const policy = new RoomsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("RoomsPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "accueil"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["laboratoire", "pharmacien", "cashier"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["medecin", "infirmier", "accueil", "laboratoire", "pharmacien", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "accueil"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
