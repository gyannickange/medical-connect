import "dotenv/config";
import { CouchDBService } from "../src/database/couchdb.service";
import { TenantsRepository } from "../src/modules/identity/tenants.repository";
import { RolesRepository } from "../src/modules/roles/roles.repository";
import { SEEDABLE_ROLES, buildSeedRolePermissions } from "../src/modules/roles/seed-role-permissions";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");

  const couch = new CouchDBService();
  const tenantsRepository = new TenantsRepository(couch);
  const rolesRepository = new RolesRepository(couch);

  const tenants = await tenantsRepository.findAll();
  console.log(`Found ${tenants.length} tenant(s).`);

  for (const tenant of tenants) {
    const existingRoles = await rolesRepository.findByTenant(tenant.id);
    const existingIds = new Set(existingRoles.map((r) => r.id));
    const missing = SEEDABLE_ROLES.filter((role) => !existingIds.has(role));

    if (missing.length === 0) {
      console.log(`Tenant ${tenant.name} (${tenant.id}): already has all 8 roles, skipping.`);
      continue;
    }

    for (const role of missing) {
      await rolesRepository.create({
        id: role,
        name: role,
        permissions: buildSeedRolePermissions(role),
        tenantId: tenant.id,
        isSystemRole: true,
      });
    }
    console.log(`Tenant ${tenant.name} (${tenant.id}): seeded ${missing.length} missing role(s) — ${missing.join(", ")}.`);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error("seed-roles-migration failed:", error);
  process.exitCode = 1;
});
