import { createEncryptedLocalPouchDB } from "./encryptedPouchDB";
import {
  buildLocalUserDoc,
  isPouchConflictError,
  localUserDocId,
  resetPasswordWithRecoveryCode,
  verifySecret,
  type LocalRole,
  type LocalUserDoc,
} from "./localAuth";

export const LOCAL_ACCOUNTS_DB_NAME = "businessconnect_local_accounts";

export class LocalStorageUnavailableError extends Error {
  constructor() {
    super("local_storage_unavailable");
    this.name = "LocalStorageUnavailableError";
  }
}

export class LastAdminProtectedError extends Error {
  constructor() {
    super("last_admin_protected");
    this.name = "LastAdminProtectedError";
  }
}

async function accountsDb() {
  const database = await createEncryptedLocalPouchDB(LOCAL_ACCOUNTS_DB_NAME);
  if ((database as any)._isMock) {
    throw new LocalStorageUnavailableError();
  }
  return database;
}

export async function countLocalAccounts(): Promise<number> {
  const database = await accountsDb();
  const info = await (database as any).info();
  return info.doc_count;
}

export async function findLocalAccountByUsername(
  username: string
): Promise<LocalUserDoc | null> {
  const database = await accountsDb();
  try {
    return await (database as any).get(localUserDocId(username));
  } catch (error: any) {
    if (error?.name === "not_found") return null;
    throw error;
  }
}

export async function getLocalAccountById(
  id: string
): Promise<LocalUserDoc | null> {
  const database = await accountsDb();
  try {
    return await (database as any).get(id);
  } catch (error: any) {
    if (error?.name === "not_found") return null;
    throw error;
  }
}

export async function listLocalAccounts(): Promise<LocalUserDoc[]> {
  const database = await accountsDb();
  const result = await (database as any).allDocs({ include_docs: true });
  return result.rows.map((row: any) => row.doc as LocalUserDoc);
}

export async function createLocalAccount(params: {
  username: string;
  password: string;
  role: LocalRole;
  firstName?: string;
  lastName?: string;
  email?: string | null;
}): Promise<{ doc: LocalUserDoc; recoveryCode: string }> {
  const existing = await findLocalAccountByUsername(params.username);
  if (existing) {
    throw new Error("username_taken");
  }
  const built = await buildLocalUserDoc(params);
  const database = await accountsDb();
  try {
    const result = await (database as any).put(built.doc);
    return {
      doc: { ...built.doc, _rev: result.rev },
      recoveryCode: built.recoveryCode,
    };
  } catch (error) {
    // Two concurrent creates for the same username can both pass the
    // check above before either writes - PouchDB's own `_id` conflict on
    // the loser is the real guarantee, translate it to the same error the
    // pre-check produces so callers only handle one case.
    if (isPouchConflictError(error)) {
      throw new Error("username_taken");
    }
    throw error;
  }
}

export async function verifyLocalLogin(
  username: string,
  password: string
): Promise<LocalUserDoc | null> {
  const doc = await findLocalAccountByUsername(username);
  if (!doc || !doc.active) return null;
  const valid = await verifySecret(password, doc.passwordHash);
  return valid ? doc : null;
}

export async function recoverLocalAccount(params: {
  username: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ doc: LocalUserDoc; recoveryCode: string } | null> {
  const doc = await findLocalAccountByUsername(params.username);
  if (!doc) return null;
  const result = await resetPasswordWithRecoveryCode({
    doc,
    recoveryCode: params.recoveryCode,
    newPassword: params.newPassword,
  });
  if (!result) return null;
  const database = await accountsDb();
  const putResult = await (database as any).put(result.doc);
  return {
    doc: { ...result.doc, _rev: putResult.rev },
    recoveryCode: result.recoveryCode,
  };
}

export async function setLocalAccountRoleAndActive(params: {
  id: string;
  role?: LocalRole;
  active?: boolean;
}): Promise<LocalUserDoc> {
  const database = await accountsDb();
  const current: LocalUserDoc = await (database as any).get(params.id);

  const nextRole = params.role ?? current.role;
  const nextActive = params.active ?? current.active;
  const wasActiveAdmin = current.role === "admin" && current.active === true;
  const staysActiveAdmin = nextRole === "admin" && nextActive === true;

  if (wasActiveAdmin && !staysActiveAdmin) {
    const all = await listLocalAccounts();
    const otherActiveAdmins = all.filter(
      (doc) => doc._id !== current._id && doc.role === "admin" && doc.active
    );
    if (otherActiveAdmins.length === 0) {
      throw new LastAdminProtectedError();
    }
  }

  const updated: LocalUserDoc = {
    ...current,
    role: nextRole,
    active: nextActive,
    updatedAt: new Date().toISOString(),
  };
  const result = await (database as any).put(updated);
  return { ...updated, _rev: result.rev };
}
