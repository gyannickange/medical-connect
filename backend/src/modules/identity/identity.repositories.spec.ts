import { ConflictException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";
import { TenantsRepository } from "./tenants.repository";

function couchHarness() {
  const docs = new Map<string, any>();
  const db = {
    get: jest.fn(async (id: string) => {
      if (!docs.has(id)) throw { statusCode: 404 };
      return docs.get(id);
    }),
    insert: jest.fn(async (doc: any) => {
      if (docs.has(doc._id) && !doc._rev) throw { statusCode: 409 };
      const stored = { ...doc, _rev: `${Number(doc._rev?.split("-")[0] ?? 0) + 1}-x` };
      docs.set(doc._id, stored);
      return { ok: true, id: doc._id, rev: stored._rev };
    }),
    destroy: jest.fn(async (id: string) => docs.delete(id)),
    find: jest.fn(async ({ selector }: any) => ({
      docs: [...docs.values()].filter((doc) =>
        Object.entries(selector).every(([key, value]) => doc[key] === value)
      ),
    })),
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
    ensureIndex: jest.fn().mockResolvedValue(undefined),
  };
  return { docs, db, couchDBService };
}

describe("identity repositories", () => {
  it("creates and reads tenants from businessconnect_identity", async () => {
    const { couchDBService } = couchHarness();
    const repository = new TenantsRepository(couchDBService as any);

    const { tenant } = await repository.create({ name: "Store" } as any);

    expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_identity");
    await expect(repository.findById(tenant.id)).resolves.toEqual(
      expect.objectContaining({ id: tenant.id, name: "Store" })
    );
  });

  it("reserves normalized usernames and rejects duplicates", async () => {
    const { couchDBService } = couchHarness();
    const repository = new UsersRepository(couchDBService as any);
    const input = {
      username: "admin",
      password: "hash",
      firstName: "Ada",
      lastName: "Lovelace",
      tenantId: "tenant-1",
    } as any;

    await repository.create(input);
    await expect(repository.create({ ...input, id: undefined })).rejects.toThrow(
      ConflictException
    );
    await expect(repository.findByUsername(" ADMIN ")).resolves.toEqual(
      expect.objectContaining({ username: "admin" })
    );
  });
});
