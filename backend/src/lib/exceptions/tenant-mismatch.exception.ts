import { BadRequestException } from "@nestjs/common";

/**
 * Thrown when an entity (product, variant) does not belong to the
 * requesting tenant.
 */
export class TenantMismatchException extends BadRequestException {
  static readonly ERROR_CODE = "TENANT_MISMATCH";

  constructor(entityType: string, entityId: string, tenantId: string) {
    super({
      statusCode: 400,
      errorCode: TenantMismatchException.ERROR_CODE,
      message: `${entityType} ${entityId} does not belong to tenant ${tenantId}`,
    });
  }
}
