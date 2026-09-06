import { describe, expect, it } from "vitest";
import { SpecialtiesPolicy } from "./specialties.policy";

describe("SpecialtiesPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new SpecialtiesPolicy("admin", { specialties: { view: false, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new SpecialtiesPolicy("accueil", { specialties: { view: true, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(false);
  });
});
