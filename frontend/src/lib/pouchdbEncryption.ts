const PLAINTEXT_FIELDS = ["type", "schemaVersion", "state", "tenantId", "deviceId"] as const;
const ENCRYPTED_BODY_VERSION = 1;

export class DocumentDecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt PouchDB document");
    this.name = "DocumentDecryptionError";
    this.cause = cause;
  }
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

function isClearField(field: string): boolean {
  return (
    field === "_id" ||
    field === "_rev" ||
    (PLAINTEXT_FIELDS as readonly string[]).includes(field)
  );
}

function splitClearFields(doc: Record<string, unknown>): {
  clear: Record<string, unknown>;
  secret: Record<string, unknown>;
} {
  const clear: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(doc)) {
    if (isClearField(field)) clear[field] = value;
    else secret[field] = value;
  }
  return { clear, secret };
}

function canonicalAad(clear: Record<string, unknown>): Uint8Array {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(clear).sort()) {
    // `_rev` is assigned by PouchDB after the document is encrypted, so it is
    // absent at encrypt time but present at decrypt time. Excluding it keeps
    // the authenticated additional data identical on both sides.
    if (key === "_rev") continue;
    sorted[key] = clear[key];
  }
  return new TextEncoder().encode(JSON.stringify(sorted));
}

export async function encryptDocument(
  doc: Record<string, unknown>,
  key: CryptoKey
): Promise<Record<string, unknown>> {
  const { clear, secret } = splitClearFields(doc);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = canonicalAad(clear);
  const plaintext = new TextEncoder().encode(JSON.stringify(secret));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    plaintext
  );
  return {
    ...clear,
    enc: {
      v: ENCRYPTED_BODY_VERSION,
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(ciphertext)),
    },
  };
}

export async function decryptDocument(
  doc: Record<string, unknown>,
  key: CryptoKey
): Promise<Record<string, unknown>> {
  const { enc: _enc, ...rest } = doc as {
    enc?: { v: number; iv: string; ct: string };
    [field: string]: unknown;
  };
  if (!_enc) return doc;

  const { clear } = splitClearFields(rest);
  const additionalData = canonicalAad(clear);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(_enc.iv), additionalData },
      key,
      fromBase64(_enc.ct)
    );
  } catch (error) {
    throw new DocumentDecryptionError(error);
  }

  const secret = JSON.parse(new TextDecoder().decode(plaintext));
  return { ...clear, ...secret };
}

export function wrapPouchDB(rawDb: any, key: CryptoKey): any {
  const overrides: Record<string, (...args: any[]) => Promise<any>> = {
    async put(doc: Record<string, unknown>) {
      return rawDb.put(await encryptDocument(doc, key));
    },
    async get(id: string, options?: unknown) {
      const doc = await rawDb.get(id, options);
      return decryptDocument(doc, key);
    },
    async remove(doc: { _id: string; _rev: string }) {
      return rawDb.remove(doc);
    },
    async allDocs(options?: Record<string, unknown>) {
      const result = await rawDb.allDocs({ ...options, include_docs: true });
      return {
        ...result,
        rows: await Promise.all(
          result.rows.map(async (row: any) =>
            row.doc ? { ...row, doc: await decryptDocument(row.doc, key) } : row
          )
        ),
      };
    },
  };

  return new Proxy(rawDb, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in overrides) {
        return overrides[prop];
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
