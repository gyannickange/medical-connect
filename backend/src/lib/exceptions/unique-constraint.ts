import { ConflictException } from "@nestjs/common";

type DatabaseError = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

const UNIQUE_FIELDS = {
  products_tenant_barcode_unique: {
    field: "barcode",
    message: "Barcode already exists",
  },
  users_username_normalized_unique: {
    field: "username",
    message: "Username already exists",
  },
  // Kept during rolling deployments while the original constraint exists.
  users_username_unique: {
    field: "username",
    message: "Username already exists",
  },
} as const;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeBarcode(
  barcode: string | null | undefined,
): string | null | undefined {
  if (barcode == null) return barcode;
  const normalized = barcode.trim();
  return normalized === "" ? null : normalized;
}

function findPostgresError(error: unknown): DatabaseError | undefined {
  let current = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as DatabaseError;
    if (candidate.code === "23505") return candidate;
    current = candidate.cause;
  }

  return undefined;
}

export function translateUniqueViolation(
  error: unknown,
): ConflictException | undefined {
  const databaseError = findPostgresError(error);
  if (!databaseError || typeof databaseError.constraint !== "string") {
    return undefined;
  }

  const detail =
    UNIQUE_FIELDS[databaseError.constraint as keyof typeof UNIQUE_FIELDS];
  if (!detail) return undefined;

  return new ConflictException({
    statusCode: 409,
    message: detail.message,
    code: "DUPLICATE_VALUE",
    field: detail.field,
  });
}

export async function withUniqueViolationTranslation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const conflict = translateUniqueViolation(error);
    if (conflict) throw conflict;
    throw error;
  }
}
