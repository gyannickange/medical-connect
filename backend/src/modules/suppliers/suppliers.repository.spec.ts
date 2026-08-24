import { SuppliersRepository } from "./suppliers.repository";

describe("SuppliersRepository", () => {
  it("creates suppliers in the unified tenant database", async () => {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const couch = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new SuppliersRepository(couch as any);

    const result = await repository.create(
      { id: "supplier-1", tenantId: "tenant-1", name: "Acme" } as any
    );

    expect(couch.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "supplier:supplier-1",
        type: "supplier",
        tenantId: "tenant-1",
      })
    );
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
