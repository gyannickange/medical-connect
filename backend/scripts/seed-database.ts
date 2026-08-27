import "dotenv/config";
import * as bcrypt from "bcrypt";
import { CouchDBService } from "../src/database/couchdb.service";
import { TenantsRepository } from "../src/modules/identity/tenants.repository";
import { UsersRepository } from "../src/modules/identity/users.repository";
import { SettingsRepository } from "../src/modules/settings/settings.repository";
import { CategoriesRepository } from "../src/modules/categories/categories.repository";
import { ProductsRepository } from "../src/modules/products/products.repository";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");
  const couch = new CouchDBService();
  const tenants = new TenantsRepository(couch);
  const users = new UsersRepository(couch);
  const settings = new SettingsRepository(couch);
  const categories = new CategoriesRepository(couch);
  const products = new ProductsRepository(couch);

  const { tenant } = await tenants.create({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Medical Connect Store",
    settings: { currency: "XOF", timezone: "Africa/Porto-Novo" },
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000002",
    username: "admin",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Medical Connect",
    lastName: "Admin",
    role: "admin",
    tenantId: tenant.id,
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000005",
    username: "accueil",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Medical Connect",
    lastName: "Accueil",
    role: "accueil",
    tenantId: tenant.id,
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000006",
    username: "infirmier",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Medical Connect",
    lastName: "Infirmier",
    role: "infirmier",
    tenantId: tenant.id,
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000007",
    username: "medecin",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Dr.",
    lastName: "Mbarga",
    role: "medecin",
    tenantId: tenant.id,
  });
  await settings.create(
    { key: "currency", value: "XOF", category: "company", dataType: "string" },
    tenant.id
  );
  const category = await categories.create({
    id: "00000000-0000-4000-8000-000000000003",
    name: "General",
    tenantId: tenant.id,
    isDefault: true,
  });
  await products.create({
    id: "00000000-0000-4000-8000-000000000004",
    name: "Sample product",
    price: "1000.00",
    cost: "500.00",
    categoryId: category.id,
    tenantId: tenant.id,
  });
  console.log(`Seeded tenant ${tenant.id}; login: admin`);
}

main().catch((error) => {
  console.error("CouchDB seed failed:", error);
  process.exitCode = 1;
});
