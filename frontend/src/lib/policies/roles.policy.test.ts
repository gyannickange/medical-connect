import { describe, expect, it } from "vitest";
import { RolesPolicy } from "./roles.policy";

describe("RolesPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new RolesPolicy("admin", { roles: { view: false, create: false, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canDelete()).toBe(true);
  });

  it("a non-admin role reads the matrix", () => {
    const policy = new RolesPolicy("manager", { roles: { view: true, create: false, update: false, delete: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canCreate()).toBe(false);
  });
});
