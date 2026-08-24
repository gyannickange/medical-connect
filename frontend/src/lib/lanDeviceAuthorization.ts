import { offlineApiRequest } from "./offlineApiRequest";
import type { SealedBox } from "./sealedBox";

export interface GrantRequestPayload {
  deviceId: string;
  devicePublicKey: string;
}

export function buildGrantRequestPayload(
  deviceId: string,
  devicePublicKeyBase64: string
): GrantRequestPayload {
  return { deviceId, devicePublicKey: devicePublicKeyBase64 };
}

export interface GrantResponsePayload {
  grantedDeviceId: string;
  grantedByDeviceId: string;
  tenantFingerprint: string;
  sealedTenantDataKey: SealedBox;
  approvalCapability: string;
  signature: string;
}

export function buildGrantResponsePayload(
  grantedDeviceId: string,
  grantedByDeviceId: string,
  tenantFingerprint: string,
  sealedTenantDataKey: SealedBox,
  approvalCapability: string,
  signature: string
): GrantResponsePayload {
  return {
    grantedDeviceId,
    grantedByDeviceId,
    tenantFingerprint,
    sealedTenantDataKey,
    approvalCapability,
    signature,
  };
}

export interface LanGrantReconciliation {
  grantedDeviceId: string;
  grantedByDeviceId: string;
  grantedByCertificate: string;
  approvalCapability: string;
  tenantFingerprint: string;
  decidedAt: string;
  signature: string;
}

export async function reconcileGrantOverNetwork(
  grant: LanGrantReconciliation
): Promise<void> {
  await offlineApiRequest(
    "POST",
    "/api/device-authorization/reconcile-lan-grant",
    grant,
    { collection: "device-authorization" }
  );
}
