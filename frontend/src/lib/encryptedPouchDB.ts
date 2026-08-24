import { createPouchDB } from "./pouchdb";
import { getLocalDataKey } from "./deviceMasterKey";
import { wrapPouchDB } from "./pouchdbEncryption";

export async function createEncryptedLocalPouchDB(
  name: "businessconnect_local_accounts" | "businessconnect_cache"
) {
  const rawDb = await createPouchDB(name);
  if ((rawDb as any)._isMock) return rawDb;
  const key = await getLocalDataKey();
  return wrapPouchDB(rawDb, key);
}
