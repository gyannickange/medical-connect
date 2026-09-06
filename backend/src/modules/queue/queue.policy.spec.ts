import { QueuePolicy } from "./queue.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): QueuePolicy {
  const policy = new QueuePolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { queue: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("QueuePolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, appendEvent: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.appendEvent()).resolves.toBe(true);
  });

  it("view and appendEvent read their own entries independently", async () => {
    const policy = policyFor("accueil", { view: true, appendEvent: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.appendEvent()).resolves.toBe(false);
  });
});
