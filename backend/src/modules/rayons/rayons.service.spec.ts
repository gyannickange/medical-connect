import { RayonsService } from "./rayons.service";

function stubRayonsRepository() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findByTenant: jest.fn(),
  };
}

describe("RayonsService", () => {
  it("delegates reads and writes to RayonsRepository", async () => {
    const rayon = { id: "rayon-1", tenantId: "tenant-1", name: "Boissons" };
    const repository = {
      ...stubRayonsRepository(),
      findByTenant: jest.fn().mockResolvedValue([rayon]),
      create: jest.fn().mockResolvedValue(rayon),
      update: jest.fn().mockResolvedValue({ ...rayon, name: "Épicerie" }),
    };
    const service = new RayonsService(repository as any);

    await expect(service.findByTenant("tenant-1", { limit: 20 })).resolves.toEqual([rayon]);
    await expect(
      service.create({ tenantId: "tenant-1", name: "Boissons" } as any)
    ).resolves.toEqual(rayon);
    await expect(
      service.update("rayon-1", "tenant-1", { name: "Épicerie" })
    ).resolves.toEqual({ ...rayon, name: "Épicerie" });

    expect(repository.findByTenant).toHaveBeenCalledWith("tenant-1", { limit: 20 });
    expect(repository.create).toHaveBeenCalledWith({ tenantId: "tenant-1", name: "Boissons" });
    expect(repository.update).toHaveBeenCalledWith("rayon-1", "tenant-1", { name: "Épicerie" });
  });

  it("awaits propagation of a renamed rayon to embedded product snapshots", async () => {
    const updated = { id: "rayon-1", tenantId: "tenant-1", name: "Épicerie" };
    const repository = { ...stubRayonsRepository(), update: jest.fn().mockResolvedValue(updated) };
    const productsRepository = { renameRayonOnProducts: jest.fn().mockResolvedValue(undefined) };
    const service = new RayonsService(repository as any, productsRepository as any);

    await service.update("rayon-1", "tenant-1", { name: "Épicerie" });

    expect(productsRepository.renameRayonOnProducts).toHaveBeenCalledWith(
      "tenant-1",
      "rayon-1",
      "Épicerie"
    );
  });

  it("does not cascade a rename when only the description changes", async () => {
    const updated = { id: "rayon-1", tenantId: "tenant-1", name: "Boissons" };
    const repository = { ...stubRayonsRepository(), update: jest.fn().mockResolvedValue(updated) };
    const productsRepository = { renameRayonOnProducts: jest.fn() };
    const service = new RayonsService(repository as any, productsRepository as any);

    await service.update("rayon-1", "tenant-1", { description: "Sodas et jus" });

    expect(productsRepository.renameRayonOnProducts).not.toHaveBeenCalled();
  });
});
