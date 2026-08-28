import { LabOrdersPolicy } from "./lab-orders.policy";

function policyFor(role: string): LabOrdersPolicy {
  const policy = new LabOrdersPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("LabOrdersPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "laboratoire"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["accueil", "cashier", "pharmacien"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "laboratoire", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "laboratoire"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });

  it.each(["admin", "manager", "medecin"])("%s can recordFollowUp", (role) => {
    expect(policyFor(role).recordFollowUp()).toBe(true);
  });

  it.each(["laboratoire", "infirmier", "pharmacien"])("%s cannot recordFollowUp", (role) => {
    expect(policyFor(role).recordFollowUp()).toBe(false);
  });
});
