import "dotenv/config";
import Nano from "nano";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");
  const couch = Nano(process.env.COUCHDB_URL);
  const databases = await couch.db.list();
  const medicalconnectDatabases = databases.filter(
    (name) => name === "medicalconnect_identity" || name.startsWith("medicalconnect_")
  );
  for (const name of medicalconnectDatabases) {
    await couch.db.destroy(name);
    console.log(`Removed CouchDB database ${name}`);
  }
}

main().catch((error) => {
  console.error("CouchDB reset failed:", error);
  process.exitCode = 1;
});
