import { BadRequestException } from "@nestjs/common";

/**
 * Thrown when a variant referenced in a sale does not exist or
 * does not belong to its product.
 */
export class VariantNotFoundException extends BadRequestException {
  static readonly ERROR_CODE = "VARIANT_NOT_FOUND";

  constructor(variantId: string, productId?: string) {
    const extra = productId ? ` for product ${productId}` : "";
    super({
      statusCode: 400,
      errorCode: VariantNotFoundException.ERROR_CODE,
      message: `Variant ${variantId} not found${extra}`,
    });
  }
}
