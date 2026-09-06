import { describe, expect, it } from "vitest";
import { RoomsPolicy } from "./rooms.policy";

describe("RoomsPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new RoomsPolicy("admin", { rooms: { view: false, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new RoomsPolicy("accueil", { rooms: { view: true, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(false);
  });
});
