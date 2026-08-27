import { TenantDataKeyRepository } from "./tenant-data-key.repository";

const ORIGINAL_ENV = process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET;

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
  };
  return {
    db,
    couchDBService,
    repository: new TenantDataKeyRepository(couchDBService as any),
  };
}

describe("TenantDataKeyRepository", () => {
  beforeEach(() => {
    process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET = "test-secret-not-for-production";
  });

  afterAll(() => {
    process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET = ORIGINAL_ENV;
  });

  it("creates a new 32-byte key on first call and stores it wrapped, never in plaintext", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository, db, couchDBService } = harness({
      get: jest.fn().mockRejectedValue(notFound),
    });

    const key = await repository.getOrCreate("tenant-1");

    expect(key).toHaveLength(32);
    expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_identity");
    expect(db.insert).toHaveBeenCalledTimes(1);
    const stored = db.insert.mock.calls[0][0];
    expect(stored._id).toBe("tenant-data-key:tenant-1");
    expect(stored.type).toBe("tenant_data_key");
    expect(stored.tenantId).toBe("tenant-1");
    expect(typeof stored.wrappedKey).toBe("string");
    expect(typeof stored.iv).toBe("string");
    expect(Buffer.from(stored.wrappedKey, "base64").equals(key)).toBe(false);
  });

  it("returns the same key on a second call by unwrapping the stored document", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository, db } = harness({
      get: jest.fn().mockRejectedValueOnce(notFound),
    });

    const firstKey = await repository.getOrCreate("tenant-1");
    const storedDoc = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(storedDoc);

    const secondKey = await repository.getOrCreate("tenant-1");

    expect(secondKey.equals(firstKey)).toBe(true);
  });

  it("recovers from a concurrent-creation race by re-reading instead of erroring", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const conflict = Object.assign(new Error("conflict"), { statusCode: 409 });

    // Simulate: this request's own get() finds nothing, but by the time it
    // tries to insert, another concurrent request already won - the insert
    // conflicts, and the repository must fall back to reading what the
    // winner wrote rather than surfacing the 409.
    let getCallCount = 0;
    const winnerDoc = {
      _id: "tenant-data-key:tenant-1",
      type: "tenant_data_key",
      tenantId: "tenant-1",
      wrappedKey: "",
      iv: "",
      createdAt: new Date().toISOString(),
    };
    const { repository, db } = harness({
      get: jest.fn().mockImplementation(async () => {
        getCallCount += 1;
        if (getCallCount === 1) throw notFound;
        return winnerDoc;
      }),
      insert: jest.fn().mockRejectedValue(conflict),
    });

    // Pre-populate winnerDoc with a validly wrapped key using the same
    // repository instance's own wrap logic, by creating it once against a
    // fresh mock where insert succeeds.
    const seeder = harness({ get: jest.fn().mockRejectedValue(notFound) });
    const seededKey = await seeder.repository.getOrCreate("tenant-1");
    winnerDoc.wrappedKey = seeder.db.insert.mock.calls[0][0].wrappedKey;
    winnerDoc.iv = seeder.db.insert.mock.calls[0][0].iv;

    const key = await repository.getOrCreate("tenant-1");

    expect(key.equals(seededKey)).toBe(true);
  });
});
