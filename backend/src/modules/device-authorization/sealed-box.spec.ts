import { webcrypto } from "crypto";
import { sealForDevice } from "./sealed-box";

const { subtle } = webcrypto;

async function generateDeviceKeyPair() {
  const keyPair = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const publicKeyRaw = Buffer.from(await subtle.exportKey("raw", keyPair.publicKey));
  return { keyPair, publicKeyBase64: publicKeyRaw.toString("base64") };
}

async function openSealedBox(
  sealed: { ephemeralPublicKey: string; iv: string; ciphertext: string },
  devicePrivateKey: CryptoKey
): Promise<Buffer> {
  const ephemeralPublicKey = await subtle.importKey(
    "raw",
    Buffer.from(sealed.ephemeralPublicKey, "base64"),
    { name: "X25519" },
    false,
    []
  );
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: ephemeralPublicKey },
    devicePrivateKey,
    256
  );
  const baseKey = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrapKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("medical-connect-tenant-key-wrap-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(sealed.iv, "base64") },
    wrapKey,
    Buffer.from(sealed.ciphertext, "base64")
  );
  return Buffer.from(plaintext);
}

describe("sealForDevice", () => {
  it("produces a box only the target device's private key can open", async () => {
    const { keyPair, publicKeyBase64 } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const sealed = await sealForDevice(tenantDataKey, publicKeyBase64);
    const opened = await openSealedBox(sealed, keyPair.privateKey);

    expect(opened.equals(tenantDataKey)).toBe(true);
  });

  it("cannot be opened by a different device's private key", async () => {
    const { publicKeyBase64 } = await generateDeviceKeyPair();
    const { keyPair: otherDeviceKeyPair } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const sealed = await sealForDevice(tenantDataKey, publicKeyBase64);

    await expect(openSealedBox(sealed, otherDeviceKeyPair.privateKey)).rejects.toThrow();
  });

  it("uses a fresh ephemeral key pair on every call", async () => {
    const { publicKeyBase64 } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const first = await sealForDevice(tenantDataKey, publicKeyBase64);
    const second = await sealForDevice(tenantDataKey, publicKeyBase64);

    expect(first.ephemeralPublicKey).not.toBe(second.ephemeralPublicKey);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});
