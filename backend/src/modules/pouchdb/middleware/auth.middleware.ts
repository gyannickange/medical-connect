import { Injectable, NestMiddleware, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { TokenService } from "../../../websocket/services/token.service";

@Injectable()
export class PouchDBAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PouchDBAuthMiddleware.name);

  constructor(private readonly tokenService: TokenService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract tenant ID from the path
    const pathSegments = req.path.split("/").filter(Boolean);
    const relevantSegments = pathSegments.slice(2); // Remove 'api' and 'pouchdb'
    const tenantId = relevantSegments[0];

    if (!tenantId) {
      this.logger.warn("PouchDB auth failed: No tenant ID in path");
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: "invalid_request",
        reason: "Tenant ID required in path",
      });
    }

    // Extract authentication credentials
    const deviceId = req.headers["x-device-id"] as string;
    const authToken = req.headers["authorization"]?.replace("Bearer ", "");

    // Check if credentials are provided
    if (!deviceId || !authToken) {
      this.logger.warn(
        `PouchDB auth failed: Missing credentials for tenant ${tenantId}`
      );
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: "unauthorized",
        reason: "Device ID and authentication token required",
      });
    }

    // Validate the token using the existing token service
    try {
      const isValid = await this.tokenService.authenticateWebSocketUser(
        deviceId,
        tenantId,
        authToken,
        false
      );

      if (!isValid) {
        this.logger.warn(
          `PouchDB auth failed: Invalid token for device ${deviceId} on tenant ${tenantId}`
        );
        return res.status(HttpStatus.FORBIDDEN).json({
          error: "forbidden",
          reason:
            "Invalid authentication credentials or unauthorized tenant access",
        });
      }

      // Authentication successful - attach tenant and device info to request
      (req as any).authenticatedDevice = {
        deviceId,
        tenantId,
      };

      this.logger.log(
        `PouchDB auth success: Device ${deviceId} authenticated for tenant ${tenantId}`
      );
      next();
    } catch (error) {
      this.logger.error(`PouchDB auth error for device ${deviceId}:`, error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: "authentication_error",
        reason: "Failed to validate authentication",
      });
    }
  }
}
