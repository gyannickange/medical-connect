import { ForbiddenException } from "@nestjs/common";
import { DeviceAuthorizationController } from "./device-authorization.controller";

describe("DeviceAuthorizationController tenant scope", () => {
  const request = {
    user: { id: "user-1", tenantId: "tenant-1", role: "admin" },
    headers: { "x-device-id": "user-1" },
  };

  it("derives the tenant and acting user from the JWT for every operation", async () => {
    const service = {
      request: jest.fn().mockResolvedValue({ status: "pending" }),
      approve: jest.fn().mockResolvedValue({ status: "approved" }),
      revoke: jest.fn().mockResolvedValue({ status: "revoked" }),
      list: jest.fn().mockResolvedValue([]),
      deliverKey: jest.fn().mockResolvedValue({
        ephemeralPublicKey: "e",
        iv: "i",
        ciphertext: "c",
      }),
    };
    const controller = new DeviceAuthorizationController(service as any);

    await controller.request(
      { deviceId: "device-a", devicePublicKey: "pubkey" } as any,
      request as any
    );
    await controller.approve("device-a", request as any);
    await controller.revoke("device-a", request as any);
    await controller.list(request as any);
    await controller.deliverKey("device-a", request as any);

    expect(service.request).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "pubkey",
      undefined
    );
    expect(service.approve).toHaveBeenCalledWith("tenant-1", "device-a", "user-1");
    expect(service.revoke).toHaveBeenCalledWith("tenant-1", "device-a", "user-1");
    expect(service.list).toHaveBeenCalledWith("tenant-1");
    expect(service.deliverKey).toHaveBeenCalledWith("tenant-1", "device-a");
  });

  it("exposes approval-capability and reconcile-lan-grant, tenant-scoped from the JWT", async () => {
    const service = {
      issueApprovalCapability: jest
        .fn()
        .mockResolvedValue({ capability: "cap.sig", expiresAt: 123 }),
      reconcileLanGrant: jest.fn().mockResolvedValue({ status: "approved" }),
    };
    const controller = new DeviceAuthorizationController(service as any);

    await controller.issueApprovalCapability(request as any);
    await controller.reconcileLanGrant({ grantedDeviceId: "device-b" } as any, request as any);

    expect(service.issueApprovalCapability).toHaveBeenCalledWith("tenant-1", "user-1");
    expect(service.reconcileLanGrant).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ grantedDeviceId: "device-b" })
    );
  });
});

describe("DeviceAuthorizationController platform_admin guard", () => {
  const platformAdminRequest = {
    user: { id: "u1", tenantId: null, role: "platform_admin" },
    headers: { "x-device-id": "u1" },
  };

  it("rejects request/deliverKey/issueApprovalCapability/reconcileLanGrant for a platform_admin", async () => {
    const service = {
      request: jest.fn(),
      deliverKey: jest.fn(),
      issueApprovalCapability: jest.fn(),
      reconcileLanGrant: jest.fn(),
    };
    const controller = new DeviceAuthorizationController(service as any);

    await expect(
      controller.request(
        { deviceId: "device-a", devicePublicKey: "pubkey" } as any,
        platformAdminRequest as any
      )
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.deliverKey("device-a", platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.issueApprovalCapability(platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.reconcileLanGrant({ grantedDeviceId: "device-b" } as any, platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);

    expect(service.request).not.toHaveBeenCalled();
    expect(service.deliverKey).not.toHaveBeenCalled();
    expect(service.issueApprovalCapability).not.toHaveBeenCalled();
    expect(service.reconcileLanGrant).not.toHaveBeenCalled();
  });
});
