import "dotenv/config";
import * as bcrypt from "bcrypt";
import { CouchDBService } from "../src/database/couchdb.service";
import { UsersRepository } from "../src/modules/identity/users.repository";
import { S3Service } from "../src/lib/s3.service";
import { normalizeUsername } from "../src/lib/exceptions";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");

  const username = process.env.PLATFORM_ADMIN_USERNAME;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME ?? "Platform";
  const lastName = process.env.PLATFORM_ADMIN_LAST_NAME ?? "Admin";
  if (!username || !password) {
    throw new Error(
      "PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD are required"
    );
  }

  const couch = new CouchDBService();
  const s3 = new S3Service();
  const users = new UsersRepository(couch, s3);

  const existing = await users.findByRole("platform_admin");
  if (existing.length > 0) {
    throw new Error(
      `A platform_admin already exists (username: ${existing[0].username}). Refusing to create another one.`
    );
  }

  const user = await users.create({
    username: normalizeUsername(username),
    password: await bcrypt.hash(password, 10),
    firstName,
    lastName,
    role: "platform_admin",
    tenantId: null,
  });

  console.log(`Created platform_admin ${user.username} (id: ${user.id})`);
}

main().catch((error) => {
  console.error("create-platform-admin failed:", error);
  process.exitCode = 1;
});
