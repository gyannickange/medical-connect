import { describe, expect, it } from "vitest";
import { ConsultationsPolicy } from "./consultations.policy";

describe("ConsultationsPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new ConsultationsPolicy("admin", { consultations: { view: false, create: false, update: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(true);
    expect(policy.canUpdate()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new ConsultationsPolicy("medecin", { consultations: { view: true, create: false, update: true } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
    expect(policy.canUpdate()).toBe(true);
  });
});
