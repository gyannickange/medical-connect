export const IDENTITY_DATABASE = "medicalconnect_identity";

export function identityDatabaseName(): string {
  return IDENTITY_DATABASE;
}

export function tenantDatabaseName(tenantId: string): string {
  return `medicalconnect_${tenantId}`;
}

export function couchDocumentId(type: string, publicId: string): string {
  const prefix = `${type}:`;
  return publicId.startsWith(prefix) ? publicId : `${prefix}${publicId}`;
}

export function publicDocumentId(documentId: string, type: string): string {
  const prefix = `${type}:`;
  return documentId.startsWith(prefix) ? documentId.slice(prefix.length) : documentId;
}
