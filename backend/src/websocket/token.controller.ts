import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Logger,
  Req,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";
import { TokenService } from "./services/token.service";
import { JwtAuthGuard } from "../modules/auth/jwt-auth.guard";

@Controller("api/ws")
@UseGuards(JwtAuthGuard)
export class TokenController {
  private readonly logger = new Logger(TokenController.name);

  constructor(private readonly tokenService: TokenService) {}

  @Post("token")
  @HttpCode(HttpStatus.OK)
  async generateToken(
    @Body() body: { tenantId: string; deviceId: string },
    @Req() request: any
  ): Promise<{ token: string }> {
    const { tenantId, deviceId } = body;

    if (!tenantId || !deviceId) {
      throw new Error("tenantId and deviceId are required");
    }
    if (request.user?.tenantId !== tenantId) {
      throw new ForbiddenException("Cannot issue a token for another tenant");
    }

    try {
      const token = await this.tokenService.generateSecureToken(
        tenantId,
        deviceId
      );

      this.logger.log(
        `Generated auth token for device ${deviceId} on tenant ${tenantId}`
      );

      return { token };
    } catch (error) {
      this.logger.error(
        `Failed to generate token for device ${deviceId}:`,
        error
      );
      throw error;
    }
  }
}
