import { describe, expect, it } from "vitest";
import { sealForDevice, openSealedBox } from "./sealedBox";

async function generateX25519KeyPair() {
  return crypto.subtle.generateKey({ name: "X25519" } as any, true, [
    "deriveBits",
  ]) as Promise<CryptoKeyPair>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("sealForDevice / openSealedBox", () => {
  it("round-trips a message only the target's private key can open", async () => {
    const keyPair = await generateX25519KeyPair();
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey)
    );
    const plaintext = crypto.getRandomValues(new Uint8Array(32));

    const sealed = await sealForDevice(plaintext, toBase64(publicKeyRaw));
    const opened = await openSealedBox(sealed, keyPair.privateKey);

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("fails to open with a different device's private key", async () => {
    const targetKeyPair = await generateX25519KeyPair();
    const otherKeyPair = await generateX25519KeyPair();
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", targetKeyPair.publicKey)
    );
    const plaintext = crypto.getRandomValues(new Uint8Array(32));

    const sealed = await sealForDevice(plaintext, toBase64(publicKeyRaw));

    await expect(openSealedBox(sealed, otherKeyPair.privateKey)).rejects.toThrow();
  });
});
