import { RoomsPolicy } from "./rooms.policy";
import type { Role } from "@shared/schema";

function policyFor(role: string, permissions: Record<string, boolean>): RoomsPolicy {
  const policy = new RoomsPolicy();
  policy.setRoleResolver(jest.fn().mockResolvedValue({ permissions: { rooms: permissions } } as unknown as Role));
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("RoomsPolicy", () => {
  it("admin always passes regardless of the stored matrix", async () => {
    const policy = policyFor("admin", { view: false, create: false, update: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(true);
    await expect(policy.update()).resolves.toBe(true);
  });

  it("each method reads its own action entry independently", async () => {
    const policy = policyFor("accueil", { view: true, create: false, update: false });
    await expect(policy.view()).resolves.toBe(true);
    await expect(policy.create()).resolves.toBe(false);
    await expect(policy.update()).resolves.toBe(false);
  });

  it("assign/release read their own action entries independently, same as view/create/update", async () => {
    const policy = policyFor("medecin", { view: true, create: false, update: false, assign: true, release: false });
    await expect(policy.assign()).resolves.toBe(true);
    await expect(policy.release()).resolves.toBe(false);
  });
});
