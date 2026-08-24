import { describe, expect, it, vi, beforeAll } from "vitest";

// `deviceMasterKey` transitively imports `pouchdb`, whose `pouchdbAuth` singleton
// reads `localStorage` at module load. Stub it before importing so the pure
// `decideKeyBootstrap` can be unit-tested in Vitest's node environment.
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
});

type KeyBootstrapDecision = "use-existing" | "create-new" | "fatal-missing-key";

let decideKeyBootstrap!: (params: {
  existingKeyFound: boolean;
  hasExistingLocalData: boolean;
}) => KeyBootstrapDecision;
let fromBase64!: (value: string) => Uint8Array;

beforeAll(async () => {
  const mod = await import("./deviceMasterKey");
  decideKeyBootstrap = mod.decideKeyBootstrap;
  fromBase64 = mod.fromBase64;
});

describe("decideKeyBootstrap", () => {
  it("uses the existing key when one is found in the keyring", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: true, hasExistingLocalData: true })
    ).toBe("use-existing");
    expect(
      decideKeyBootstrap({ existingKeyFound: true, hasExistingLocalData: false })
    ).toBe("use-existing");
  });

  it("creates a new key on a genuinely fresh install", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: false, hasExistingLocalData: false })
    ).toBe("create-new");
  });

  it("fails closed instead of silently creating a key when local data already exists", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: false, hasExistingLocalData: true })
    ).toBe("fatal-missing-key");
  });
});

describe("fromBase64", () => {
  it("decodes base64url (Rust's URL_SAFE_NO_PAD) without throwing", () => {
    // Real base64url output from device_key.rs's URL_SAFE_NO_PAD encoder -
    // contains both `-` and `_`, which plain atob() rejects with
    // InvalidCharacterError.
    const raw = fromBase64("uWBovMXu4xS_Ykyy-_38AA");
    expect(raw).toBeInstanceOf(Uint8Array);
    expect(raw.length).toBeGreaterThan(0);
  });

  it("round-trips 32 random bytes through the Rust encoder's alphabet", () => {
    const original = crypto.getRandomValues(new Uint8Array(32));
    let binary = "";
    for (const byte of original) binary += String.fromCharCode(byte);
    const urlSafeNoPad = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(fromBase64(urlSafeNoPad)).toEqual(original);
  });
});
