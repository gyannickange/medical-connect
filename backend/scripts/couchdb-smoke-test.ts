import "dotenv/config";
import { randomUUID } from "crypto";
import Nano from "nano";
import type { Sale, StockMovement } from "../src/shared/schema";
import { CouchDBService } from "../src/database/couchdb.service";
import { tenantDatabaseName } from "../src/database/couchdb-naming";
import { SettingsRepository } from "../src/modules/settings/settings.repository";
import { CategoriesRepository } from "../src/modules/categories/categories.repository";
import { ProductsRepository } from "../src/modules/products/products.repository";
import { SalesRepository } from "../src/modules/sales/sales.repository";
import { StockRepository } from "../src/modules/stock/stock.repository";

async function main() {
  const couchUrl = process.env.COUCHDB_URL;
  if (!couchUrl) throw new Error("COUCHDB_URL is required");

  const tenantId = `smoke-${randomUUID()}`;
  const databaseName = tenantDatabaseName(tenantId);
  const client = Nano(couchUrl);
  const couch = new CouchDBService();
  const settings = new SettingsRepository(couch);
  const categories = new CategoriesRepository(couch);
  const products = new ProductsRepository(couch);
  const sales = new SalesRepository(couch);
  const stock = new StockRepository(couch);

  try {
    const setting = await settings.create(
      { key: "currency", value: "XOF", category: "company", dataType: "string" },
      tenantId
    );
    const category = await categories.create({
      id: randomUUID(),
      name: "Smoke category",
      tenantId,
    });
    const product = await products.create({
      id: randomUUID(),
      name: "Smoke product",
      price: "1000.00",
      cost: "500.00",
      categoryId: category.id,
      tenantId,
    });

    const movement: StockMovement = {
      id: randomUUID(),
      productId: product.id,
      variantId: null,
      type: "entry",
      quantity: 5,
      previousQuantity: 0,
      newQuantity: 5,
      reason: "Smoke stock entry",
      priceType: null,
      unitPrice: null,
      userId: null,
      tenantId,
      createdAt: new Date(),
    } as StockMovement;
    await stock.recordRequired(movement);

    const sale: Sale = {
      id: randomUUID(),
      saleNumber: `SMOKE-${Date.now()}`,
      customerId: null,
      userId: randomUUID(),
      subtotal: "2000.00",
      tax: "0.00",
      total: "2000.00",
      profit: "1000.00",
      paymentMethod: "cash",
      status: "completed",
      tenantId,
      createdAt: new Date(),
    } as Sale;
    const recorded = await sales.record(
      sale,
      [
        {
          productId: product.id,
          variantId: null,
          quantity: 2,
          unitPrice: "1000.00",
          totalPrice: "2000.00",
          priceType: null,
          pricingId: null,
          product: {
            id: product.id,
            name: product.name,
            description: product.description,
            cost: product.cost,
          },
          variant: null,
        },
      ],
      null,
      [
        {
          productId: product.id,
          variantId: null,
          quantity: 2,
          previousQuantity: 5,
          newQuantity: 3,
        },
      ]
    );
    if (!recorded) throw new Error("Sale was not recorded");

    const quantities = await stock.findProjectedQuantities(tenantId);
    if (quantities[product.id] !== 3) {
      throw new Error(`Expected projected stock 3, received ${quantities[product.id]}`);
    }
    if ((await settings.findByKey("currency", tenantId))?.id !== setting.id) {
      throw new Error("Setting round-trip failed");
    }
    if (!(await products.findById(product.id, tenantId))) {
      throw new Error("Product round-trip failed");
    }

    await settings.delete(setting.id, tenantId);
    console.log(`CouchDB business smoke passed for ${databaseName}`);
  } finally {
    const databases = await client.db.list().catch(() => [] as string[]);
    if (databases.includes(databaseName)) {
      await client.db.destroy(databaseName);
      console.log(`Removed temporary CouchDB database ${databaseName}`);
    }
  }
}

main().catch((error) => {
  console.error("CouchDB smoke test failed:", error);
  process.exitCode = 1;
});
