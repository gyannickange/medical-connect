import "dotenv/config";
import Nano from "nano";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");
  const couch = Nano(process.env.COUCHDB_URL);
  const databases = await couch.db.list();
  const businessconnectDatabases = databases.filter(
    (name) => name === "businessconnect_identity" || name.startsWith("businessconnect_")
  );
  for (const name of businessconnectDatabases) {
    await couch.db.destroy(name);
    console.log(`Removed CouchDB database ${name}`);
  }
}

main().catch((error) => {
  console.error("CouchDB reset failed:", error);
  process.exitCode = 1;
});
