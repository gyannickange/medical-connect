import { CustomersService } from "./customers.service";

function stubCustomersRepository() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByTenant: jest.fn(),
    search: jest.fn(),
  };
}

describe("CustomersService", () => {
  it("delegates reads and writes to CustomersRepository", async () => {
    const customer = {
      id: "customer-1",
      tenantId: "tenant-1",
      firstName: "Jane",
      lastName: "Doe",
    };
    const repository = {
      ...stubCustomersRepository(),
      findByTenant: jest.fn().mockResolvedValue([customer]),
      search: jest.fn().mockResolvedValue([customer]),
      create: jest.fn().mockResolvedValue(customer),
      update: jest.fn().mockResolvedValue({ ...customer, firstName: "Janet" }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const salesRepository = { findByCustomer: jest.fn().mockResolvedValue([]) };
    const service = new CustomersService(repository as any, salesRepository as any);

    await expect(service.findByTenant("tenant-1", { limit: 20 })).resolves.toEqual([
      customer,
    ]);
    await expect(service.search("Jane", "tenant-1")).resolves.toEqual([customer]);
    await expect(service.getPurchases("customer-1", "tenant-1")).resolves.toEqual([]);
    await expect(
      service.create({ tenantId: "tenant-1", firstName: "Jane", lastName: "Doe" } as any)
    ).resolves.toEqual(customer);
    await expect(
      service.update("customer-1", "tenant-1", { firstName: "Janet" })
    ).resolves.toEqual({ ...customer, firstName: "Janet" });
    await expect(service.delete("customer-1", "tenant-1")).resolves.toBeUndefined();

    expect(repository.create).toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith("customer-1", "tenant-1", {
      firstName: "Janet",
    });
    expect(repository.delete).toHaveBeenCalledWith("customer-1", "tenant-1");
    expect(salesRepository.findByCustomer).toHaveBeenCalledWith("customer-1", "tenant-1");
  });
});
