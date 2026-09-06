import { describe, expect, it } from "vitest";
import { DeviceAuthorizationPolicy } from "./deviceAuthorization.policy";

describe("DeviceAuthorizationPolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new DeviceAuthorizationPolicy("admin", { deviceAuthorization: { list: false, approve: false, revoke: false } } as any);
    expect(policy.canList()).toBe(true);
    expect(policy.canApprove()).toBe(true);
    expect(policy.canRevoke()).toBe(true);
  });

  it("each method reads its own action entry independently", () => {
    const policy = new DeviceAuthorizationPolicy("manager", { deviceAuthorization: { list: true, approve: false, revoke: false } } as any);
    expect(policy.canList()).toBe(true);
    expect(policy.canApprove()).toBe(false);
    expect(policy.canRevoke()).toBe(false);
  });
});
