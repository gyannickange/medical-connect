export interface SealedBox {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveWrapKey(
  sharedBits: ArrayBuffer,
  usage: "encrypt" | "decrypt"
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

export async function sealForDevice(
  plaintext: Uint8Array,
  devicePublicKeyBase64: string
): Promise<SealedBox> {
  const devicePublicKey = await crypto.subtle.importKey(
    "raw",
    fromBase64(devicePublicKeyBase64),
    { name: "X25519" } as any,
    false,
    []
  );

  const ephemeralKeyPair = (await crypto.subtle.generateKey(
    { name: "X25519" } as any,
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: devicePublicKey } as any,
    ephemeralKeyPair.privateKey,
    256
  );

  const wrapKey = await deriveWrapKey(sharedBits, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, plaintext);
  const ephemeralPublicKeyRaw = await crypto.subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey
  );

  return {
    ephemeralPublicKey: toBase64(new Uint8Array(ephemeralPublicKeyRaw)),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function openSealedBox(
  sealed: SealedBox,
  devicePrivateKey: CryptoKey
): Promise<ArrayBuffer> {
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    fromBase64(sealed.ephemeralPublicKey),
    { name: "X25519" } as any,
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: ephemeralPublicKey } as any,
    devicePrivateKey,
    256
  );
  const wrapKey = await deriveWrapKey(sharedBits, "decrypt");
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    wrapKey,
    fromBase64(sealed.ciphertext)
  );
}
