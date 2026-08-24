import { describe, expect, it, vi } from "vitest";
import {
  buildGrantRequestPayload,
  buildGrantResponsePayload,
  reconcileGrantOverNetwork,
} from "./lanDeviceAuthorization";

vi.mock("./offlineApiRequest", () => ({
  offlineApiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("buildGrantRequestPayload", () => {
  it("shapes the request a new device broadcasts on the LAN", () => {
    const payload = buildGrantRequestPayload("device-b", "base64-x25519-pubkey");
    expect(payload).toEqual({
      deviceId: "device-b",
      devicePublicKey: "base64-x25519-pubkey",
    });
  });
});

describe("buildGrantResponsePayload", () => {
  it("shapes the grant a granting device sends back over the LAN", () => {
    const sealed = { ephemeralPublicKey: "e", iv: "i", ciphertext: "c" };
    const payload = buildGrantResponsePayload(
      "device-b",
      "device-a",
      "tenant-fingerprint",
      sealed,
      "approval-capability-token",
      "grant-signature"
    );
    expect(payload).toEqual({
      grantedDeviceId: "device-b",
      grantedByDeviceId: "device-a",
      tenantFingerprint: "tenant-fingerprint",
      sealedTenantDataKey: sealed,
      approvalCapability: "approval-capability-token",
      signature: "grant-signature",
    });
  });
});

describe("reconcileGrantOverNetwork", () => {
  it("queues the reconciliation upload through the existing offline-request path", async () => {
    const { offlineApiRequest } = await import("./offlineApiRequest");
    const grant = {
      grantedDeviceId: "device-b",
      grantedByDeviceId: "device-a",
      grantedByCertificate: "cert.sig",
      approvalCapability: "cap.sig",
      tenantFingerprint: "fingerprint",
      decidedAt: "2026-08-16T00:00:00.000Z",
      signature: "sig",
    };

    await reconcileGrantOverNetwork(grant);

    expect(offlineApiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/device-authorization/reconcile-lan-grant",
      grant,
      { collection: "device-authorization" }
    );
  });
});
