import { ProductPurchasesService } from "./product-purchases.service";

describe("ProductPurchasesService", () => {
  const tenantId = "tenant-1";

  function setup(overrides: Partial<{ addPurchaseResult: any }> = {}) {
    const addPurchaseResult = overrides.addPurchaseResult ?? {
      purchase: { id: "purchase-1", quantity: 100, unitCostConverted: "2000.00", variantId: null },
      variantId: null,
      previousQuantity: 10,
      previousCost: "1000.00",
      newQuantity: 110,
      newCost: "1909.09",
      alreadyApplied: false,
    };
    const productsRepository = {
      addPurchase: jest.fn().mockResolvedValue(addPurchaseResult),
      getPurchases: jest.fn().mockResolvedValue([addPurchaseResult.purchase]),
      revertPurchaseImpact: jest.fn().mockResolvedValue(undefined),
    };
    const stockRepository = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const settingsService = { getReferenceCurrency: jest.fn().mockResolvedValue("XOF") };
    const service = new ProductPurchasesService(
      productsRepository as any,
      stockRepository as any,
      settingsService as any
    );
    return { service, productsRepository, stockRepository, settingsService, addPurchaseResult };
  }

  it("resolves the tenant reference currency and records the stock movement with purchaseId", async () => {
    const { service, productsRepository, stockRepository, settingsService } = setup();

    const result = await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "xof", conversionRate: 1 } as any,
      "user-1"
    );

    expect(settingsService.getReferenceCurrency).toHaveBeenCalledWith(tenantId);
    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ referenceCurrency: "XOF", createdByUserId: "user-1" })
    );
    expect(stockRepository.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        type: "entry",
        quantity: 100,
        previousQuantity: 10,
        newQuantity: 110,
        reason: "purchase",
        unitPrice: "2000.00",
        purchaseId: "purchase-1",
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: "purchase-1" }));
  });

  it("forces conversionRate to 1 when purchaseCurrency equals the reference currency", async () => {
    const { service, productsRepository } = setup();

    await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 10, unitPurchasePrice: 500, purchaseCurrency: "xof", conversionRate: 1.15 } as any,
      "user-1"
    );

    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ purchaseCurrency: "XOF", conversionRate: 1 })
    );
  });

  it("keeps the submitted conversionRate for a genuinely foreign currency", async () => {
    const { service, productsRepository } = setup();

    await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 10, unitPurchasePrice: 500, purchaseCurrency: "ngn", conversionRate: 1.15 } as any,
      "user-1"
    );

    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ purchaseCurrency: "NGN", conversionRate: 1.15 })
    );
  });

  it("rolls back quantity and cost when recording the stock movement fails", async () => {
    const { service, productsRepository, stockRepository } = setup();
    stockRepository.recordRequired.mockRejectedValue(new Error("CouchDB unavailable"));

    await expect(
      service.addPurchase(
        "product-1",
        tenantId,
        { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
        "user-1"
      )
    ).rejects.toThrow("CouchDB unavailable");

    expect(productsRepository.revertPurchaseImpact).toHaveBeenCalledWith(
      "product-1", tenantId, null, 10, "1000.00"
    );
  });

  it("still surfaces the original stock movement error even if the compensating revert itself fails", async () => {
    const { service, stockRepository, productsRepository } = setup();
    stockRepository.recordRequired.mockRejectedValue(new Error("CouchDB unavailable"));
    productsRepository.revertPurchaseImpact.mockRejectedValue(new Error("revert also failed"));

    await expect(
      service.addPurchase(
        "product-1",
        tenantId,
        { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
        "user-1"
      )
    ).rejects.toThrow("CouchDB unavailable");
  });

  it("skips the stock movement entirely on an idempotent replay", async () => {
    const { service, productsRepository, stockRepository } = setup({
      addPurchaseResult: {
        purchase: { id: "purchase-1", quantity: 100, unitCostConverted: "2000.00", variantId: null },
        variantId: null, previousQuantity: 0, previousCost: "0.00",
        newQuantity: 0, newCost: "0.00", alreadyApplied: true,
      },
    });

    await service.addPurchase(
      "product-1", tenantId,
      { id: "purchase-1", quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
      "user-1"
    );

    expect(stockRepository.recordRequired).not.toHaveBeenCalled();
    expect(productsRepository.revertPurchaseImpact).not.toHaveBeenCalled();
  });

  it("delegates read to the repository with the requested variantId", async () => {
    const { service, productsRepository } = setup();
    await service.getPurchases("product-1", tenantId, "variant-1");
    expect(productsRepository.getPurchases).toHaveBeenCalledWith("product-1", tenantId, "variant-1");
  });
});
