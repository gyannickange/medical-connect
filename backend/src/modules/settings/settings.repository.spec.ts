import { ConflictException, NotFoundException } from "@nestjs/common";
import { SettingsRepository } from "./settings.repository";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    find: jest.fn().mockResolvedValue({ docs: [] }),
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    destroy: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
    ensureIndex: jest.fn().mockResolvedValue(undefined),
  };
  return {
    db,
    couchDBService,
    repository: new SettingsRepository(couchDBService as any),
  };
}

describe("SettingsRepository", () => {
  it("rejects a public id already used by a different setting key", async () => {
    const { repository, db } = harness({
      find: jest.fn().mockResolvedValue({
        docs: [
          {
            _id: "setting:existing",
            id: "shared-id",
            type: "setting",
            tenantId: "tenant-1",
            key: "existing.key",
            value: "1",
            category: "general",
            dataType: "string",
            isEncrypted: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    });

    await expect(
      repository.create(
        { id: "shared-id", key: "new.key", value: "2" } as any,
        "tenant-1"
      )
    ).rejects.toThrow(ConflictException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("stores settings in the unified tenant database with a deterministic key id", async () => {
    const { repository, db, couchDBService } = harness();

    const created = await repository.create(
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        key: "receiptFormat",
        value: "retail",
        category: "system",
        dataType: "string",
      } as any,
      "tenant-1"
    );

    expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.stringMatching(/^setting:/),
        id: "123e4567-e89b-42d3-a456-426614174000",
        type: "setting",
        tenantId: "tenant-1",
        key: "receiptFormat",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
    expect(created).toEqual(
      expect.objectContaining({
        id: "123e4567-e89b-42d3-a456-426614174000",
        tenantId: "tenant-1",
        key: "receiptFormat",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
  });

  it("rejects duplicate keys", async () => {
    const { repository } = harness({
      insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
    });

    await expect(
      repository.create({ key: "currency", value: "XOF" } as any, "tenant-1")
    ).rejects.toThrow(ConflictException);
  });

  it("finds and sorts all tenant settings", async () => {
    const { repository, db } = harness({
      find: jest.fn().mockResolvedValue({
        docs: [
          {
            _id: "setting:a",
            _rev: "1-a",
            id: "setting-1",
            type: "setting",
            tenantId: "tenant-1",
            key: "currency",
            value: "XOF",
            category: "general",
            dataType: "string",
            isEncrypted: false,
            createdAt: "2026-08-13T00:00:00.000Z",
            updatedAt: "2026-08-13T00:00:00.000Z",
          },
        ],
      }),
    });

    const result = await repository.findByTenant("tenant-1");

    expect(db.find).toHaveBeenCalledWith({
      selector: { type: "setting", tenantId: "tenant-1" },
      sort: [{ category: "asc" }, { key: "asc" }],
      limit: 1000,
    });
    expect(result[0]).toEqual(
      expect.objectContaining({ id: "setting-1", createdAt: expect.any(Date) })
    );
    expect(result[0]).not.toHaveProperty("_rev");
  });

  it("updates by public id and retries a CouchDB revision conflict", async () => {
    const existing = {
      _id: "setting:a",
      _rev: "1-a",
      id: "setting-1",
      type: "setting",
      tenantId: "tenant-1",
      key: "currency",
      value: "XOF",
      category: "general",
      dataType: "string",
      isEncrypted: false,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    const find = jest
      .fn()
      .mockResolvedValueOnce({ docs: [existing] })
      .mockResolvedValueOnce({ docs: [{ ...existing, _rev: "2-b" }] });
    const insert = jest
      .fn()
      .mockRejectedValueOnce({ statusCode: 409 })
      .mockResolvedValueOnce({ ok: true });
    const { repository } = harness({ find, insert });

    const result = await repository.update("setting-1", "tenant-1", {
      value: "EUR",
    });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(result.value).toBe("EUR");
  });

  it("throws not found when deleting an unknown public id", async () => {
    const { repository } = harness();
    await expect(repository.delete("missing", "tenant-1")).rejects.toThrow(
      NotFoundException
    );
  });
});
