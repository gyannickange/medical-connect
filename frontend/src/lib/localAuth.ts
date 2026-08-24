import { argon2id, argon2Verify } from "hash-wasm";
import type { Tenant, User } from "@shared/schema";

export type LocalRole = "admin" | "manager" | "cashier";

export interface LocalUserDoc {
  _id: string;
  _rev?: string;
  type: "local_user";
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  passwordHash: string;
  role: LocalRole;
  active: boolean;
  recoveryCodeHash: string;
  recoveryCodeCreatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const LOCAL_TENANT_ID = "local";
export const MIN_LOCAL_PASSWORD_LENGTH = 6;

export class WeakLocalPasswordError extends Error {
  constructor() {
    super("password_too_short");
    this.name = "WeakLocalPasswordError";
  }
}

const ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19456,
  hashLength: 32,
} as const;

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_GROUP_LENGTH = 4;
const RECOVERY_CODE_GROUPS = 3;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function localUserDocId(username: string): string {
  return `user:${normalizeUsername(username)}`;
}

async function randomBytes(length: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = await randomBytes(16);
  return argon2id({
    password: secret,
    salt,
    outputType: "encoded",
    ...ARGON2_PARAMS,
  });
}

export async function verifySecret(
  secret: string,
  hash: string
): Promise<boolean> {
  return argon2Verify({ password: secret, hash });
}

// Rejection sampling: 256 is not a multiple of the 31-symbol alphabet
// (256 % 31 = 8), so `byte % alphabet.length` would make the first 8
// symbols measurably more likely than the rest. Rejecting bytes >= the
// largest multiple of the alphabet length below 256 keeps it uniform.
function randomAlphabetChar(): string {
  const max = 256 - (256 % RECOVERY_CODE_ALPHABET.length);
  let byte: number;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (byte >= max);
  return RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
}

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < RECOVERY_CODE_GROUP_LENGTH; i++) {
      group += randomAlphabetChar();
    }
    groups.push(group);
  }
  return groups.join("-");
}

export function isPouchConflictError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "conflict"
  );
}

export interface BuildLocalUserParams {
  username: string;
  password: string;
  role: LocalRole;
  firstName?: string;
  lastName?: string;
  email?: string | null;
}

export interface BuildLocalUserResult {
  doc: LocalUserDoc;
  recoveryCode: string;
}

export async function buildLocalUserDoc(
  params: BuildLocalUserParams
): Promise<BuildLocalUserResult> {
  if (params.password.length < MIN_LOCAL_PASSWORD_LENGTH) {
    throw new WeakLocalPasswordError();
  }

  const now = new Date().toISOString();
  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashSecret(params.password),
    hashSecret(recoveryCode),
  ]);

  return {
    doc: {
      _id: localUserDocId(params.username),
      type: "local_user",
      username: normalizeUsername(params.username),
      firstName: params.firstName?.trim() || params.username.trim(),
      lastName: params.lastName?.trim() || "",
      email: params.email || null,
      passwordHash,
      role: params.role,
      active: true,
      recoveryCodeHash,
      recoveryCodeCreatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    recoveryCode,
  };
}

export async function rotateRecoveryCode(
  doc: LocalUserDoc
): Promise<BuildLocalUserResult> {
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashSecret(recoveryCode);
  return {
    doc: {
      ...doc,
      recoveryCodeHash,
      recoveryCodeCreatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    recoveryCode,
  };
}

export async function resetPasswordWithRecoveryCode(params: {
  doc: LocalUserDoc;
  recoveryCode: string;
  newPassword: string;
}): Promise<BuildLocalUserResult | null> {
  const valid = await verifySecret(
    params.recoveryCode.trim().toUpperCase(),
    params.doc.recoveryCodeHash
  );
  if (!valid) return null;

  if (params.newPassword.length < MIN_LOCAL_PASSWORD_LENGTH) {
    throw new WeakLocalPasswordError();
  }

  const newPasswordHash = await hashSecret(params.newPassword);
  return rotateRecoveryCode({ ...params.doc, passwordHash: newPasswordHash });
}

export function toPublicLocalUser(doc: LocalUserDoc): Omit<User, "password"> {
  return {
    id: doc._id,
    username: doc.username,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    role: doc.role,
    tenantId: LOCAL_TENANT_ID,
    isActive: doc.active,
    createdAt: doc.createdAt,
  };
}

export function buildLocalTenant(createdAt: string): Tenant {
  return {
    id: LOCAL_TENANT_ID,
    name: "Boutique locale",
    address: null,
    phone: null,
    email: null,
    settings: null,
    isActive: true,
    createdAt,
  };
}
