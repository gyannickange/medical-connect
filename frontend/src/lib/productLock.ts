import { createPouchDB } from "./pouchdb";
import { apiRequest } from "./queryClient";
import { productsReplicaDatabaseName } from "./productsReplica";
import type { NativeLanPeer } from "./lanAgent";

export interface ProductLock {
  productId: string;
  deviceId: string;
  deviceName: string;
  acquiredAt: string;
  expiresAt: string;
}

export type LockDecision =
  | { kind: "acquire" }
  | { kind: "request"; address: string; port: number; holderName: string }
  | { kind: "unreachable"; holderName: string };

function lockDocId(productId: string): string {
  return `lock_${productId}`;
}

function isExpired(lock: ProductLock, now: Date): boolean {
  return new Date(lock.expiresAt).getTime() <= now.getTime();
}

/**
 * Reads the lock document from the tenant's local PouchDB replica (already
 * kept live by frontend/src/lib/productsReplica.ts). Returns null when
 * absent or expired - an expired lock is treated the same as no lock, per
 * docs/superpowers/specs/2026-08-11-lan-edit-lock-design.md section 3.
 */
export async function getProductLock(
  tenantId: string,
  productId: string
): Promise<ProductLock | null> {
  const db = await createPouchDB(productsReplicaDatabaseName(tenantId));
  try {
    const doc = (await (db as any).get(lockDocId(productId))) as ProductLock;
    if (isExpired(doc, new Date())) return null;
    return doc;
  } catch (error: any) {
    if (error?.name === "not_found") return null;
    throw error;
  }
}

export async function acquireOrRenewProductLock(
  productId: string,
  deviceId: string,
  deviceName: string
): Promise<void> {
  await apiRequest("PUT", `/api/products/${productId}/lock`, {
    deviceId,
    deviceName,
  });
}

export async function releaseProductLock(
  productId: string,
  deviceId: string
): Promise<void> {
  await apiRequest("DELETE", `/api/products/${productId}/lock`, { deviceId });
}

/**
 * Pure decision: given the current lock state, this device's id, and the
 * LAN peers currently discovered via mDNS, what should the caller do next?
 * See design spec section 4 for the three cases this implements.
 */
export function decideLockAction(
  existing: ProductLock | null,
  myDeviceId: string,
  peers: NativeLanPeer[]
): LockDecision {
  if (!existing || existing.deviceId === myDeviceId) {
    return { kind: "acquire" };
  }

  const holderPeer = peers.find((peer) => peer.deviceId === existing.deviceId);
  if (!holderPeer || holderPeer.addresses.length === 0) {
    return { kind: "unreachable", holderName: existing.deviceName };
  }

  return {
    kind: "request",
    address: holderPeer.addresses[0],
    port: holderPeer.port,
    holderName: existing.deviceName,
  };
}
