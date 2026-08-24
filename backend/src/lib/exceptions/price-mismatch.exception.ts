import { BadRequestException } from "@nestjs/common";

/**
 * Thrown when the client-provided sale total or item total does not
 * match the server-side calculation using authoritative prices.
 */
export class PriceMismatchException extends BadRequestException {
  static readonly ERROR_CODE = "PRICE_MISMATCH";

  constructor(
    field: string,
    clientValue: string,
    serverValue: string
  ) {
    super({
      statusCode: 400,
      errorCode: PriceMismatchException.ERROR_CODE,
      message: `${field} mismatch: client sent ${clientValue}, server calculated ${serverValue}`,
    });
  }
}
