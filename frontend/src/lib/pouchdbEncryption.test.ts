import { describe, expect, it } from "vitest";
import {
  encryptDocument,
  decryptDocument,
  DocumentDecryptionError,
  wrapPouchDB,
} from "./pouchdbEncryption";

async function testKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

describe("encryptDocument / decryptDocument", () => {
  it("round-trips a document, keeping whitelisted fields in plaintext", async () => {
    const key = await testKey();
    const doc = {
      _id: "product:1",
      type: "product",
      tenantId: "t1",
      name: "Coca-Cola",
      price: 500,
    };
    const encrypted = await encryptDocument(doc, key);
    expect(encrypted._id).toBe("product:1");
    expect(encrypted.tenantId).toBe("t1");
    expect(encrypted).not.toHaveProperty("name");
    expect(encrypted).not.toHaveProperty("price");
    expect(JSON.stringify(encrypted)).not.toContain("Coca-Cola");

    const decrypted = await decryptDocument(encrypted, key);
    expect(decrypted).toEqual(doc);
  });

  it("passes a document through unchanged when it has no enc envelope", async () => {
    const key = await testKey();
    const plain = { _id: "a", foo: "bar" };
    await expect(decryptDocument(plain, key)).resolves.toEqual(plain);
  });

  it("never emits a top-level field name reserved by PouchDB/CouchDB", async () => {
    // PouchDB's local validation rejects any top-level `_`-prefixed field
    // other than its own reserved set (_id, _rev, _deleted, _attachments,
    // etc.) with a "doc_validation: Bad special document member" error -
    // the encrypted envelope must not collide with that.
    const key = await testKey();
    const encrypted = await encryptDocument(
      { _id: "a", tenantId: "t1", name: "secret" },
      key
    );
    const reserved = new Set([
      "_id",
      "_rev",
      "_deleted",
      "_attachments",
      "_conflicts",
      "_deleted_conflicts",
      "_local_seq",
      "_revs_info",
      "_revisions",
    ]);
    for (const field of Object.keys(encrypted)) {
      if (field.startsWith("_")) {
        expect(reserved.has(field)).toBe(true);
      }
    }
  });

  it("rejects a document whose ciphertext has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    const enc = encrypted.enc as { v: number; iv: string; ct: string };
    const tampered = { ...encrypted, enc: { ...enc, ct: enc.ct.slice(0, -2) + "AA" } };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("rejects a document whose IV has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    const enc = encrypted.enc as { v: number; iv: string; ct: string };
    const tampered = { ...encrypted, enc: { ...enc, iv: enc.iv.slice(0, -2) + "AA" } };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("rejects a document whose plaintext AAD metadata has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument(
      { _id: "a", tenantId: "t1", name: "secret" },
      key
    );
    const tampered = { ...encrypted, tenantId: "t2" };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("fails to decrypt with the wrong key", async () => {
    const key = await testKey();
    const otherKey = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    await expect(decryptDocument(encrypted, otherKey)).rejects.toThrow(
      DocumentDecryptionError
    );
  });
});

describe("wrapPouchDB", () => {
  function fakeRawDb() {
    const store = new Map<string, any>();
    return {
      _isMock: false,
      async put(doc: any) {
        const stored = { ...doc, _rev: "1-fake" };
        store.set(doc._id, stored);
        return { ok: true, id: doc._id, rev: "1-fake" };
      },
      async get(id: string) {
        const doc = store.get(id);
        if (!doc) throw { name: "not_found" };
        return doc;
      },
      async remove(doc: any) {
        store.delete(doc._id);
        return { ok: true };
      },
      async allDocs(options: any) {
        const rows = Array.from(store.values()).map((doc) => ({
          id: doc._id,
          key: doc._id,
          doc: options?.include_docs ? doc : undefined,
        }));
        return { rows, total_rows: rows.length, offset: 0 };
      },
      async info() {
        return { doc_count: store.size };
      },
    };
  }

  it("encrypts on put and decrypts on get", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "product:1", name: "Coca-Cola" });
    const doc = await db.get("product:1");
    expect(doc.name).toBe("Coca-Cola");
  });

  it("stores ciphertext, not plaintext, in the underlying database", async () => {
    const key = await testKey();
    const raw = fakeRawDb();
    const db = wrapPouchDB(raw, key);
    await db.put({ _id: "product:1", name: "Coca-Cola" });
    const stored = await raw.get("product:1");
    expect(JSON.stringify(stored)).not.toContain("Coca-Cola");
  });

  it("decrypts every row returned by allDocs", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    await db.put({ _id: "b", name: "Beta" });
    const result = await db.allDocs({ include_docs: true });
    expect(result.rows.map((row: any) => row.doc.name).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("passes through non-wrapped methods like info()", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    expect(await db.info()).toEqual({ doc_count: 1 });
  });

  it("removes documents through the underlying database", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    const doc = await db.get("a");
    await db.remove(doc);
    await expect(db.get("a")).rejects.toEqual({ name: "not_found" });
  });
});
