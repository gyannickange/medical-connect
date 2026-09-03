import "dotenv/config";
import * as bcrypt from "bcrypt";
import { CouchDBService } from "../src/database/couchdb.service";
import { TenantsRepository } from "../src/modules/identity/tenants.repository";
import { UsersRepository } from "../src/modules/identity/users.repository";
import { SettingsRepository } from "../src/modules/settings/settings.repository";
import { ServicesRepository } from "../src/modules/services/services.repository";
import { ExamTypesRepository } from "../src/modules/exam-types/exam-types.repository";
import { S3Service } from "../src/lib/s3.service";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");
  const couch = new CouchDBService();
  const s3 = new S3Service();
  const tenants = new TenantsRepository(couch);
  const users = new UsersRepository(couch, s3);
  const settings = new SettingsRepository(couch);
  const services = new ServicesRepository(couch);
  const examTypes = new ExamTypesRepository(couch);

  const TENANT_ID = "00000000-0000-4000-8000-000000000001";
  let tenant = await tenants.findById(TENANT_ID);
  if (!tenant) {
    ({ tenant } = await tenants.create({
      id: TENANT_ID,
      name: "Medical Connect Store",
      settings: { currency: "XOF", timezone: "Africa/Porto-Novo" },
    }));
  }

  const STAFF = [
    { id: "00000000-0000-4000-8000-000000000002", username: "admin", firstName: "Medical Connect", lastName: "Admin", role: "admin" as const },
    { id: "00000000-0000-4000-8000-000000000005", username: "accueil", firstName: "Medical Connect", lastName: "Accueil", role: "accueil" as const },
    { id: "00000000-0000-4000-8000-000000000006", username: "infirmier", firstName: "Medical Connect", lastName: "Infirmier", role: "infirmier" as const },
    { id: "00000000-0000-4000-8000-000000000007", username: "medecin", firstName: "Dr.", lastName: "Mbarga", role: "medecin" as const },
  ];
  for (const s of STAFF) {
    const existing = await users.findByUsername(s.username);
    if (!existing) {
      await users.create({
        id: s.id,
        username: s.username,
        password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role,
        tenantId: tenant.id,
      });
    }
  }

  if (!(await settings.findByKey("currency", tenant.id))) {
    await settings.create(
      { key: "currency", value: "XOF", category: "company", dataType: "string" },
      tenant.id
    );
  }
  await services.seedDefaults(tenant.id);
  await examTypes.seedDefaults(tenant.id);
  console.log(`Seeded tenant ${tenant.id}; login: admin`);
}

main().catch((error) => {
  console.error("CouchDB seed failed:", error);
  process.exitCode = 1;
});
