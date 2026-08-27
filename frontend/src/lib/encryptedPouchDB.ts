import { createPouchDB } from "./pouchdb";
import { getLocalDataKey } from "./deviceMasterKey";
import { wrapPouchDB } from "./pouchdbEncryption";

export async function createEncryptedLocalPouchDB(
  name: "medicalconnect_local_accounts" | "medicalconnect_cache"
) {
  const rawDb = await createPouchDB(name);
  if ((rawDb as any)._isMock) return rawDb;
  const key = await getLocalDataKey();
  return wrapPouchDB(rawDb, key);
}
