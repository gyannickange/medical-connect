import { ConflictException } from "@nestjs/common";

/**
 * Thrown when stock is insufficient for a requested operation.
 * Uses HTTP 409 Conflict to signal a resource state conflict that
 * prevents the operation from completing.
 *
 * Callers can rely on the stable 409 status code and the
 * `errorCode` property — never parse the human-readable message.
 */
export class InsufficientStockException extends ConflictException {
  /** Stable machine-readable error code. */
  static readonly ERROR_CODE = "INSUFFICIENT_STOCK";

  constructor(productId: string, requested: number, available: number) {
    super({
      statusCode: 409,
      errorCode: InsufficientStockException.ERROR_CODE,
      message: `Insufficient stock for product ${productId}: requested ${requested}, available ${available}`,
    });
  }
}
