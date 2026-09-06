import { describe, expect, it } from "vitest";
import { ServicesPolicy } from "./services.policy";

describe("ServicesPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new ServicesPolicy("admin", { services: { view: false, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new ServicesPolicy("accueil", { services: { view: true, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(false);
  });

  it("no longer exposes canDelete (dead code, no backend route)", () => {
    const policy = new ServicesPolicy("admin", {} as any);
    expect((policy as any).canDelete).toBeUndefined();
  });
});
