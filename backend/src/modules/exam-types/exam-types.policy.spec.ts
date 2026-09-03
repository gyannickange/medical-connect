import { ExamTypesPolicy } from "./exam-types.policy";

function policyFor(role: string): ExamTypesPolicy {
  const policy = new ExamTypesPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("ExamTypesPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "laboratoire"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["accueil", "pharmacien", "cashier"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["medecin", "infirmier", "laboratoire", "accueil"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["admin", "manager"])("%s can delete", (role) => {
    expect(policyFor(role).delete()).toBe(true);
  });

  it.each(["medecin", "infirmier", "laboratoire"])("%s cannot delete", (role) => {
    expect(policyFor(role).delete()).toBe(false);
  });
});
