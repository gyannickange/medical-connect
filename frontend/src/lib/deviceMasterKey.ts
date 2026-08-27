import { createPouchDB } from "./pouchdb";
import { getDeviceId } from "./deviceIdentity";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function nativeInvoke(): TauriInvoke | null {
  return window.__TAURI__?.core?.invoke ?? null;
}

export class DeviceMasterKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceMasterKeyUnavailableError";
  }
}

export type KeyBootstrapDecision = "use-existing" | "create-new" | "fatal-missing-key";

export function decideKeyBootstrap(params: {
  existingKeyFound: boolean;
  hasExistingLocalData: boolean;
}): KeyBootstrapDecision {
  if (params.existingKeyFound) return "use-existing";
  if (params.hasExistingLocalData) return "fatal-missing-key";
  return "create-new";
}

const LOCAL_DB_NAMES = ["medicalconnect_local_accounts", "medicalconnect_cache"] as const;

async function hasExistingLocalData(): Promise<boolean> {
  for (const name of LOCAL_DB_NAMES) {
    const db = await createPouchDB(name);
    if ((db as any)._isMock) continue;
    const info = await db.info();
    if (info.doc_count > 0) return true;
  }
  return false;
}

async function fetchRawMasterKeyBase64(): Promise<string> {
  const invoke = nativeInvoke();
  if (!invoke) {
    throw new DeviceMasterKeyUnavailableError(
      "Native device master key storage is unavailable outside the desktop app"
    );
  }

  const deviceId = getDeviceId();
  const existing = await invoke<string | null>("read_device_master_key", { deviceId });
  const decision = decideKeyBootstrap({
    existingKeyFound: existing !== null,
    hasExistingLocalData: await hasExistingLocalData(),
  });

  if (decision === "use-existing") return existing as string;
  if (decision === "create-new") {
    return invoke<string>("create_device_master_key", { deviceId });
  }
  throw new DeviceMasterKeyUnavailableError(
    "Encrypted local data exists on this device but its master key is missing from the OS keyring"
  );
}

// The Rust side (device_key.rs) encodes the master key with base64's
// URL_SAFE_NO_PAD alphabet (`-`/`_`, no `=` padding). `atob` only accepts
// the standard alphabet, so it must be converted first - decoding as-is
// throws InvalidCharacterError whenever the key happens to contain `-`/`_`.
export function fromBase64(value: string): Uint8Array {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedMasterKey: Promise<CryptoKey> | null = null;

function getMasterKey(): Promise<CryptoKey> {
  if (!cachedMasterKey) {
    cachedMasterKey = fetchRawMasterKeyBase64().then((base64) =>
      crypto.subtle.importKey("raw", fromBase64(base64), "HKDF", false, ["deriveKey"])
    );
  }
  return cachedMasterKey;
}

async function deriveKey(
  contextInfo: string,
  algorithm: AesKeyGenParams | HmacKeyGenParams,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const masterKey = await getMasterKey();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(contextInfo),
    },
    masterKey,
    algorithm,
    false,
    usages
  );
}

let cachedLocalDataKey: Promise<CryptoKey> | null = null;

export function getLocalDataKey(): Promise<CryptoKey> {
  if (!cachedLocalDataKey) {
    cachedLocalDataKey = deriveKey(
      "medical-connect-local-data-key-v1",
      { name: "AES-GCM", length: 256 },
      ["encrypt", "decrypt"]
    );
  }
  return cachedLocalDataKey;
}

let cachedSessionSigningKey: Promise<CryptoKey> | null = null;

export function getSessionSigningKey(): Promise<CryptoKey> {
  if (!cachedSessionSigningKey) {
    cachedSessionSigningKey = deriveKey(
      "medical-connect-session-signing-key-v1",
      { name: "HMAC", hash: "SHA-256", length: 256 } as HmacKeyGenParams,
      ["sign", "verify"]
    );
  }
  return cachedSessionSigningKey;
}
