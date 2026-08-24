import { describe, expect, it } from "vitest";
import { signLocalSession, verifyLocalSession } from "./localSessionToken";

async function testKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

describe("local session token", () => {
  it("verifies a session signed with the same key", async () => {
    const key = await testKey();
    const signed = await signLocalSession(
      { userId: "user:admin", expiresAt: Date.now() + 1000 },
      key
    );
    expect(await verifyLocalSession(signed, key)).toBe(true);
  });

  it("rejects a session with a tampered userId", async () => {
    const key = await testKey();
    const signed = await signLocalSession(
      { userId: "user:cashier", expiresAt: Date.now() + 1000 },
      key
    );
    const tampered = { ...signed, userId: "user:admin" };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });

  it("rejects a session with a tampered expiresAt", async () => {
    const key = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    const tampered = { ...signed, expiresAt: signed.expiresAt + 1_000_000 };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });

  it("rejects a session signed with a different key", async () => {
    const key = await testKey();
    const otherKey = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    expect(await verifyLocalSession(signed, otherKey)).toBe(false);
  });

  it("rejects a garbage signature instead of throwing", async () => {
    const key = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    const tampered = { ...signed, sig: "not-valid-base64!!" };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });
});
