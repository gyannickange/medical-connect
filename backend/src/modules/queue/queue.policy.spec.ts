import { QueuePolicy } from "./queue.policy";

function policyFor(role: string): QueuePolicy {
  const policy = new QueuePolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("QueuePolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view and appendEvent", (role) => {
    expect(policyFor(role).view()).toBe(true);
    expect(policyFor(role).appendEvent()).toBe(true);
  });

  it.each(["laboratoire", "cashier"])("%s cannot view or appendEvent", (role) => {
    expect(policyFor(role).view()).toBe(false);
    expect(policyFor(role).appendEvent()).toBe(false);
  });
});
