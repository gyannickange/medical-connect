import { ForbiddenException } from "@nestjs/common";
import { LanIdentityController } from "./lan-identity.controller";

describe("LanIdentityController.issueCertificate", () => {
  it("rejects a platform_admin, who has no tenant to issue a device certificate for", () => {
    const identities = { issueCertificate: jest.fn() };
    const controller = new LanIdentityController(identities as any);
    const request = { user: { id: "u1", tenantId: null, role: "platform_admin" } };

    expect(() =>
      controller.issueCertificate(
        { deviceId: "device-a", devicePublicKey: "pubkey" },
        request as any
      )
    ).toThrow(ForbiddenException);
    expect(identities.issueCertificate).not.toHaveBeenCalled();
  });

  it("issues a certificate for a tenant-scoped caller", () => {
    const identities = { issueCertificate: jest.fn().mockReturnValue({ certificate: "cert" }) };
    const controller = new LanIdentityController(identities as any);
    const request = { user: { id: "u1", tenantId: "tenant-1", role: "admin" } };

    controller.issueCertificate(
      { deviceId: "device-a", devicePublicKey: "pubkey" },
      request as any
    );

    expect(identities.issueCertificate).toHaveBeenCalledWith("tenant-1", "device-a", "pubkey");
  });
});
