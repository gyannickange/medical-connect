import { webcrypto } from "crypto";

const { subtle } = webcrypto;

export async function sealForDevice(
  plaintext: Buffer,
  devicePublicKeyBase64: string
): Promise<{ ephemeralPublicKey: string; iv: string; ciphertext: string }> {
  const devicePublicKey = await subtle.importKey(
    "raw",
    Buffer.from(devicePublicKeyBase64, "base64"),
    { name: "X25519" },
    false,
    []
  );

  const ephemeralKeyPair = (await subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: devicePublicKey },
    ephemeralKeyPair.privateKey,
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
    ["encrypt"]
  );

  const iv = new Uint8Array(12);
  webcrypto.getRandomValues(iv);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, plaintext);

  const ephemeralPublicKeyRaw = await subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey
  );

  return {
    ephemeralPublicKey: Buffer.from(ephemeralPublicKeyRaw).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  };
}
