import { SettingsService } from "./settings.service";

describe("SettingsService", () => {
  it("delegates the full CRUD contract to SettingsRepository with tenant scope", async () => {
    const repository = {
      findByTenant: jest.fn().mockResolvedValue([]),
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "setting-1" }),
      update: jest.fn().mockResolvedValue({ id: "setting-1" }),
      updateByKey: jest.fn().mockResolvedValue({ id: "setting-1" }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SettingsService(repository as any);

    await service.findByTenant("tenant-1");
    await service.findByKey("currency", "tenant-1");
    await service.create({ key: "currency", value: "XOF" } as any, "tenant-1");
    await service.update("setting-1", "tenant-1", { value: "EUR" });
    await service.updateByKey("currency", "tenant-1", { value: "EUR" });
    await service.delete("setting-1", "tenant-1");

    expect(repository.findByTenant).toHaveBeenCalledWith("tenant-1");
    expect(repository.findByKey).toHaveBeenCalledWith("currency", "tenant-1");
    expect(repository.create).toHaveBeenCalledWith(
      { key: "currency", value: "XOF" },
      "tenant-1"
    );
    expect(repository.update).toHaveBeenCalledWith("setting-1", "tenant-1", {
      value: "EUR",
    });
    expect(repository.updateByKey).toHaveBeenCalledWith(
      "currency",
      "tenant-1",
      { value: "EUR" }
    );
    expect(repository.delete).toHaveBeenCalledWith("setting-1", "tenant-1");
  });

  describe("getReferenceCurrency", () => {
    it("returns the tenant's configured reference currency", async () => {
      const repository = {
        findByKey: jest.fn().mockResolvedValue({ id: "s1", key: "currency.reference", value: "NGN" }),
      };
      const service = new SettingsService(repository as any);

      await expect(service.getReferenceCurrency("tenant-1")).resolves.toBe("NGN");
      expect(repository.findByKey).toHaveBeenCalledWith("currency.reference", "tenant-1");
    });

    it("falls back to XOF when no setting exists for the tenant", async () => {
      const repository = { findByKey: jest.fn().mockResolvedValue(null) };
      const service = new SettingsService(repository as any);

      await expect(service.getReferenceCurrency("tenant-1")).resolves.toBe("XOF");
    });
  });
});
