import { ForbiddenException } from "@nestjs/common";
import { DeviceAuthorizationService } from "./device-authorization.service";

function harness(overrides: Record<string, unknown> = {}) {
  const tenantDataKeyRepository = {
    getOrCreate: jest.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
  const tenantsRepository = {
    isInitialized: jest.fn().mockResolvedValue(true),
    markInitialized: jest.fn().mockResolvedValue(undefined),
    verifyAndConsumeProvisioningSecret: jest.fn().mockResolvedValue(true),
  };
  const deviceAuthorizationRepository = {
    create: jest.fn().mockImplementation(async (input) => ({
      ...input,
      status: "pending",
      requestedAt: new Date(),
      decidedAt: null,
      decidedByUserId: null,
    })),
    findByDevice: jest.fn().mockResolvedValue(undefined),
    approve: jest.fn(),
    revoke: jest.fn(),
    listByTenant: jest.fn().mockResolvedValue([]),
  };
  const signalingService = { broadcastToTenant: jest.fn() };
  const lanIdentityService = {
    issueApprovalCapability: jest
      .fn()
      .mockReturnValue({ capability: "cap.sig", expiresAt: Date.now() + 1000 }),
    verifyCertificate: jest.fn(),
    verifyTenantFingerprint: jest.fn().mockReturnValue(true),
  };
  const service = new DeviceAuthorizationService(
    { ...tenantDataKeyRepository, ...overrides.tenantDataKeyRepository } as any,
    { ...tenantsRepository, ...overrides.tenantsRepository } as any,
    { ...deviceAuthorizationRepository, ...overrides.deviceAuthorizationRepository } as any,
    signalingService as any,
    { ...lanIdentityService, ...overrides.lanIdentityService } as any
  );
  return {
    service,
    tenantDataKeyRepository,
    tenantsRepository,
    deviceAuthorizationRepository,
    signalingService,
    lanIdentityService,
  };
}

describe("DeviceAuthorizationService", () => {
  describe("request", () => {
    it("auto-approves the first device when the tenant is uninitialized and the secret is valid", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository } = harness({
        tenantsRepository: { isInitialized: jest.fn().mockResolvedValue(false) },
      });

      const result = await service.request("tenant-1", "device-a", "pubkey", "SECRET-CODE-0000");

      expect(tenantsRepository.verifyAndConsumeProvisioningSecret).toHaveBeenCalledWith(
        "tenant-1",
        "SECRET-CODE-0000"
      );
      expect(tenantsRepository.markInitialized).toHaveBeenCalledWith("tenant-1");
      expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
        "tenant-1",
        "device-a",
        "bootstrap"
      );
      expect(result.status).toBe("pending"); // create() always starts pending, then gets approved
    });

    it("rejects bootstrap on an uninitialized tenant with a missing or wrong secret", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository } = harness({
        tenantsRepository: {
          isInitialized: jest.fn().mockResolvedValue(false),
          verifyAndConsumeProvisioningSecret: jest.fn().mockResolvedValue(false),
        },
      });

      await expect(
        service.request("tenant-1", "device-a", "pubkey", "WRONG")
      ).rejects.toThrow(ForbiddenException);
      expect(deviceAuthorizationRepository.approve).not.toHaveBeenCalled();
    });

    it("never auto-approves once the tenant is initialized, even with a correct-looking secret", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository, signalingService } =
        harness({ tenantsRepository: { isInitialized: jest.fn().mockResolvedValue(true) } });

      await service.request("tenant-1", "device-b", "pubkey", "SECRET-CODE-0000");

      expect(tenantsRepository.verifyAndConsumeProvisioningSecret).not.toHaveBeenCalled();
      expect(deviceAuthorizationRepository.approve).not.toHaveBeenCalled();
      expect(signalingService.broadcastToTenant).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ type: "device-authorization-requested", deviceId: "device-b" })
      );
    });

    it("returns the existing authorization instead of creating a duplicate request", async () => {
      const existing = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "pubkey",
        status: "approved" as const,
        requestedAt: new Date(),
        decidedAt: new Date(),
        decidedByUserId: "user-1",
      };
      const { service, deviceAuthorizationRepository } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(existing) },
      });

      const result = await service.request("tenant-1", "device-a", "pubkey");

      expect(result).toBe(existing);
      expect(deviceAuthorizationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("deliverKey", () => {
    it("seals the Tenant Data Key for an approved device", async () => {
      const approved = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: Buffer.alloc(32, 7).toString("base64"),
        status: "approved" as const,
        requestedAt: new Date(),
        decidedAt: new Date(),
        decidedByUserId: "user-1",
      };
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(approved) },
      });

      // Real X25519 raw public keys are exactly 32 bytes; this fixture's
      // base64 decodes to the right length so sealForDevice's importKey
      // step doesn't throw for a length mismatch.
      const sealed = await service.deliverKey("tenant-1", "device-a");
      expect(sealed).toHaveProperty("ephemeralPublicKey");
      expect(sealed).toHaveProperty("iv");
      expect(sealed).toHaveProperty("ciphertext");
    });

    it("refuses to deliver the key to a device that isn't approved", async () => {
      const pending = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "pubkey",
        status: "pending" as const,
        requestedAt: new Date(),
        decidedAt: null,
        decidedByUserId: null,
      };
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(pending) },
      });

      await expect(service.deliverKey("tenant-1", "device-a")).rejects.toThrow(
        ForbiddenException
      );
    });

    it("refuses to deliver the key to an unknown device", async () => {
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(undefined) },
      });

      await expect(service.deliverKey("tenant-1", "device-a")).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  it("approve() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.approve("tenant-1", "device-a", "user-1");
    expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "user-1"
    );
  });

  it("revoke() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.revoke("tenant-1", "device-a", "user-1");
    expect(deviceAuthorizationRepository.revoke).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "user-1"
    );
  });

  it("list() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.list("tenant-1");
    expect(deviceAuthorizationRepository.listByTenant).toHaveBeenCalledWith("tenant-1");
  });

  describe("issueApprovalCapability", () => {
    it("refuses a device that is not itself approved", async () => {
      const { service, deviceAuthorizationRepository } = harness({
        deviceAuthorizationRepository: {
          findByDevice: jest.fn().mockResolvedValue({ status: "pending" }),
        },
      });

      await expect(
        service.issueApprovalCapability("tenant-1", "device-a")
      ).rejects.toThrow(ForbiddenException);
    });

    it("issues a capability for an approved device", async () => {
      const { service, deviceAuthorizationRepository, lanIdentityService } = harness({
        deviceAuthorizationRepository: {
          findByDevice: jest.fn().mockResolvedValue({ status: "approved" }),
        },
      });

      const result = await service.issueApprovalCapability("tenant-1", "device-a");

      expect(lanIdentityService.issueApprovalCapability).toHaveBeenCalledWith(
        "tenant-1",
        "device-a"
      );
      expect(result).toEqual({ capability: "cap.sig", expiresAt: expect.any(Number) });
    });
  });

  describe("reconcileLanGrant", () => {
    function validGrant(overrides: Record<string, unknown> = {}) {
      return {
        grantedDeviceId: "device-b",
        grantedByDeviceId: "device-a",
        grantedByCertificate: "cert.sig",
        approvalCapability: "cap.sig",
        tenantFingerprint: "fingerprint-value",
        decidedAt: new Date().toISOString(),
        signature: "grant-sig",
        ...overrides,
      };
    }

    it("approves the granted device once every check passes", async () => {
      const { service, deviceAuthorizationRepository, lanIdentityService } = harness({
        lanIdentityService: {
          verifyCertificate: jest.fn().mockReturnValue({
            deviceId: "device-a",
            devicePublicKey: "granter-ed25519-pubkey",
            tenantFingerprint: "fingerprint-value",
          }),
          verifyTenantFingerprint: jest.fn().mockReturnValue(true),
        },
        deviceAuthorizationRepository: {
          findByDevice: jest.fn().mockResolvedValue({ status: "approved" }),
        },
      });

      await service.reconcileLanGrant("tenant-1", validGrant());

      expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
        "tenant-1",
        "device-b",
        "device-a"
      );
    });

    it("rejects a grant whose certificate doesn't verify", async () => {
      const { service } = harness({
        lanIdentityService: { verifyCertificate: jest.fn().mockReturnValue(null) },
      });

      await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
        ForbiddenException
      );
    });

    it("rejects a grant whose tenant fingerprint doesn't match", async () => {
      const { service } = harness({
        lanIdentityService: {
          verifyCertificate: jest.fn().mockReturnValue({
            deviceId: "device-a",
            devicePublicKey: "key",
            tenantFingerprint: "fingerprint-value",
          }),
          verifyTenantFingerprint: jest.fn().mockReturnValue(false),
        },
      });

      await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
        ForbiddenException
      );
    });

    it("rejects a grant from a device that is not itself currently approved", async () => {
      const { service } = harness({
        lanIdentityService: {
          verifyCertificate: jest.fn().mockReturnValue({
            deviceId: "device-a",
            devicePublicKey: "key",
            tenantFingerprint: "fingerprint-value",
          }),
          verifyTenantFingerprint: jest.fn().mockReturnValue(true),
        },
        deviceAuthorizationRepository: {
          findByDevice: jest.fn().mockResolvedValue({ status: "revoked" }),
        },
      });

      await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
        ForbiddenException
      );
    });
  });
});
