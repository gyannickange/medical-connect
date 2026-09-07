import "dotenv/config";
import { CouchDBService } from "../src/database/couchdb.service";
import { TenantsRepository } from "../src/modules/identity/tenants.repository";
import { SpecialtiesRepository } from "../src/modules/specialties/specialties.repository";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");

  const couch = new CouchDBService();
  const tenantsRepository = new TenantsRepository(couch);
  const specialtiesRepository = new SpecialtiesRepository(couch);

  const tenants = await tenantsRepository.findAll();
  console.log(`Found ${tenants.length} tenant(s).`);

  for (const tenant of tenants) {
    const existing = await specialtiesRepository.findByTenant(tenant.id);
    if (existing.length > 0) {
      console.log(`Tenant ${tenant.name} (${tenant.id}): already has ${existing.length} specialty(ies), skipping.`);
      continue;
    }
    await specialtiesRepository.seedDefaults(tenant.id);
    console.log(`Tenant ${tenant.name} (${tenant.id}): seeded the default specialty catalog.`);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error("seed-specialties-migration failed:", error);
  process.exitCode = 1;
});
