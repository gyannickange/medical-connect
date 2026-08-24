import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pouchdb", () => ({ createPouchDB: vi.fn() }));
vi.mock("./queryClient", () => ({ apiRequest: vi.fn() }));

import { createPouchDB } from "./pouchdb";
import { apiRequest } from "./queryClient";
import {
  acquireOrRenewProductLock,
  decideLockAction,
  getProductLock,
  releaseProductLock,
  type ProductLock,
} from "./productLock";
import type { NativeLanPeer } from "./lanAgent";

describe("getProductLock", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockDb(get: (id: string) => Promise<unknown>) {
    vi.mocked(createPouchDB).mockResolvedValue({ get } as any);
  }

  it("returns null when no lock document exists", async () => {
    mockDb(() => Promise.reject({ name: "not_found" }));

    await expect(getProductLock("tenant-1", "product-1")).resolves.toBeNull();
    expect(createPouchDB).toHaveBeenCalledWith("businessconnect_tenant-1");
  });

  it("returns the lock document when it is still valid", async () => {
    const lock: ProductLock = {
      productId: "product-1",
      deviceId: "device-1",
      deviceName: "Caisse A",
      acquiredAt: "2026-08-11T10:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
    };
    mockDb(() => Promise.resolve(lock));

    await expect(getProductLock("tenant-1", "product-1")).resolves.toEqual(lock);
  });

  it("treats an expired lock document as absent", async () => {
    mockDb(() =>
      Promise.resolve({
        productId: "product-1",
        deviceId: "device-1",
        deviceName: "Caisse A",
        acquiredAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-01T00:10:00.000Z",
      })
    );

    await expect(getProductLock("tenant-1", "product-1")).resolves.toBeNull();
  });

  it("propagates unexpected errors", async () => {
    mockDb(() => Promise.reject(new Error("boom")));

    await expect(getProductLock("tenant-1", "product-1")).rejects.toThrow("boom");
  });
});

describe("acquireOrRenewProductLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs the device identity to the lock endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(null, { status: 200 }));

    await acquireOrRenewProductLock("product-1", "device-1", "Caisse A");

    expect(apiRequest).toHaveBeenCalledWith("PUT", "/api/products/product-1/lock", {
      deviceId: "device-1",
      deviceName: "Caisse A",
    });
  });
});

describe("releaseProductLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETEs the lock with the releasing device's id", async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(null, { status: 204 }));

    await releaseProductLock("product-1", "device-1");

    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/products/product-1/lock", {
      deviceId: "device-1",
    });
  });
});

describe("decideLockAction", () => {
  const peer = (overrides: Partial<NativeLanPeer> = {}): NativeLanPeer => ({
    deviceId: "device-holder",
    serviceName: "businessconnect",
    addresses: ["192.168.1.5"],
    port: 45839,
    protocolVersion: "1",
    lastSeenAt: Date.now(),
    ...overrides,
  });

  it("acquires when nobody holds the lock", () => {
    expect(decideLockAction(null, "device-me", [])).toEqual({ kind: "acquire" });
  });

  it("acquires when this device already holds the lock", () => {
    const lock: ProductLock = {
      productId: "product-1",
      deviceId: "device-me",
      deviceName: "Caisse Me",
      acquiredAt: "2026-08-11T10:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
    };
    expect(decideLockAction(lock, "device-me", [])).toEqual({ kind: "acquire" });
  });

  it("requests from a reachable peer holding the lock", () => {
    const lock: ProductLock = {
      productId: "product-1",
      deviceId: "device-holder",
      deviceName: "Caisse A",
      acquiredAt: "2026-08-11T10:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
    };
    expect(decideLockAction(lock, "device-me", [peer()])).toEqual({
      kind: "request",
      address: "192.168.1.5",
      port: 45839,
      holderName: "Caisse A",
    });
  });

  it("reports unreachable when the holder is not a known LAN peer", () => {
    const lock: ProductLock = {
      productId: "product-1",
      deviceId: "device-holder",
      deviceName: "Caisse A",
      acquiredAt: "2026-08-11T10:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
    };
    expect(decideLockAction(lock, "device-me", [])).toEqual({
      kind: "unreachable",
      holderName: "Caisse A",
    });
  });

  it("reports unreachable when the known peer has no addresses", () => {
    const lock: ProductLock = {
      productId: "product-1",
      deviceId: "device-holder",
      deviceName: "Caisse A",
      acquiredAt: "2026-08-11T10:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
    };
    expect(
      decideLockAction(lock, "device-me", [peer({ addresses: [] })])
    ).toEqual({ kind: "unreachable", holderName: "Caisse A" });
  });
});
