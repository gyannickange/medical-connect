import { LanIdentityService } from "./lan-identity.service";
import { generateKeyPairSync } from "crypto";

describe("LanIdentityService", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFingerprintSecret =
    process.env.LAN_TENANT_FINGERPRINT_SECRET;

  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFingerprintSecret === undefined) {
      delete process.env.LAN_TENANT_FINGERPRINT_SECRET;
    } else {
      process.env.LAN_TENANT_FINGERPRINT_SECRET = previousFingerprintSecret;
    }
  });

  it("issues and verifies a tenant-scoped device certificate", () => {
    const service = new LanIdentityService();
    const deviceKey = Buffer.alloc(32, 7).toString("base64url");
    const issued = service.issueCertificate("tenant-a", "caisse-1", deviceKey);

    expect(service.verifyCertificate(issued.certificate)).toMatchObject({
      version: 1,
      deviceId: "caisse-1",
      tenantFingerprint: issued.tenantFingerprint,
      devicePublicKey: deviceKey,
    });
  });

  it("uses different opaque fingerprints for different tenants", () => {
    const service = new LanIdentityService();
    const deviceKey = Buffer.alloc(32, 9).toString("base64url");
    const first = service.issueCertificate("tenant-a", "caisse-1", deviceKey);
    const second = service.issueCertificate("tenant-b", "caisse-2", deviceKey);

    expect(first.tenantFingerprint).not.toBe(second.tenantFingerprint);
    expect(first.tenantFingerprint).not.toContain("tenant-a");
  });

  it("rejects a tampered certificate", () => {
    const service = new LanIdentityService();
    const deviceKey = Buffer.alloc(32, 3).toString("base64url");
    const issued = service.issueCertificate("tenant-a", "caisse-1", deviceKey);
    const [payload, signature] = issued.certificate.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${
      payload.endsWith("A") ? "B" : "A"
    }`;

    expect(
      service.verifyCertificate(`${tamperedPayload}.${signature}`)
    ).toBeNull();
  });

  it("loads a persistent PKCS#8 DER certificate authority", () => {
    const previous = process.env.LAN_CERTIFICATE_PRIVATE_KEY;
    const { privateKey } = generateKeyPairSync("ed25519");
    process.env.LAN_CERTIFICATE_PRIVATE_KEY = privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64");
    try {
      const service = new LanIdentityService();
      const deviceKey = Buffer.alloc(32, 4).toString("base64url");
      const issued = service.issueCertificate("tenant-a", "caisse-1", deviceKey);
      expect(service.verifyCertificate(issued.certificate)?.deviceId).toBe(
        "caisse-1"
      );
    } finally {
      if (previous === undefined) delete process.env.LAN_CERTIFICATE_PRIVATE_KEY;
      else process.env.LAN_CERTIFICATE_PRIVATE_KEY = previous;
    }
  });

  describe("issueApprovalCapability", () => {
    it("issues a capability that verifyApprovalCapability accepts", () => {
      process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
      const service = new LanIdentityService();
      const { capability, expiresAt } = service.issueApprovalCapability(
        "tenant-1",
        "device-a"
      );

      expect(typeof capability).toBe("string");
      expect(capability.split(".")).toHaveLength(2);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeLessThanOrEqual(
        Date.now() + 12 * 60 * 60 * 1000 + 1000
      );
    });

    it("scopes the expiry to 12 hours, not the certificate's 30 days", () => {
      process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
      const service = new LanIdentityService();
      const { expiresAt } = service.issueApprovalCapability(
        "tenant-1",
        "device-a"
      );

      const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeLessThan(thirtyDaysFromNow);
    });
  });

  describe("verifyTenantFingerprint", () => {
    it("accepts the fingerprint it would itself compute for a tenant", () => {
      process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
      const service = new LanIdentityService();
      const { certificate } = service.issueCertificate(
        "tenant-1",
        "device-a",
        "A".repeat(43)
      );
      const [encodedPayload] = certificate.split(".");
      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      );

      expect(
        service.verifyTenantFingerprint("tenant-1", payload.tenantFingerprint)
      ).toBe(true);
      expect(
        service.verifyTenantFingerprint("tenant-2", payload.tenantFingerprint)
      ).toBe(false);
    });
  });
});
