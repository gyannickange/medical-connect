import { describe, expect, it } from "vitest";
import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy new Medical Connect role helpers", () => {
  it.each([
    ["accueil", "isAccueil"],
    ["infirmier", "isInfirmier"],
    ["medecin", "isMedecin"],
    ["laboratoire", "isLaboratoire"],
    ["pharmacien", "isPharmacien"],
  ] as const)("%s -> %s() is true only for that role", (role, method) => {
    const policy = new TestPolicy(role);
    expect((policy as any)[method]()).toBe(true);
    expect((policy as any).isAdmin()).toBe(false);
  });
});
