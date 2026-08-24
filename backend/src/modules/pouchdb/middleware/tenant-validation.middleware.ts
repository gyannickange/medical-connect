import { Injectable, NestMiddleware, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { PouchDBService } from "../pouchdb.service";

@Injectable()
export class TenantValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantValidationMiddleware.name);

  constructor(private readonly pouchdbService: PouchDBService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract tenant ID from the first path segment after /api/pouchdb
    const pathSegments = req.path.split("/").filter(Boolean);

    // Remove 'api' and 'pouchdb' from path segments
    const relevantSegments = pathSegments.slice(2);
    const tenantId = relevantSegments[0];

    if (!tenantId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: "invalid_path",
        reason: "Tenant ID required",
      });
    }

    try {
      // Validate tenant exists (this also initializes the database)
      await this.pouchdbService.getTenantDatabase(tenantId);
      next();
    } catch (error) {
      this.logger.error("Tenant validation error:", error);
      res.status(HttpStatus.NOT_FOUND).json({
        error: "tenant_not_found",
        reason: "Tenant not found",
      });
    }
  }
}
