import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { AuditService } from "../../modules/audit/audit.service";
import type { InsertAuditLog } from "../../shared/schema";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const path = request.url;

    // Only log write operations (POST, PUT, PATCH, DELETE)
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next.handle();
    }

    // Skip auth endpoints to avoid logging sensitive data
    if (path.startsWith("/api/auth")) {
      return next.handle();
    }

    // Extract user information
    const user = request.user;
    if (!user) {
      // No user authenticated, skip audit logging
      return next.handle();
    }

    const userId = user.id || user.userId;
    const tenantId = user.tenantId;

    if (!userId || !tenantId) {
      return next.handle();
    }

    // Extract entity information from route
    const entityInfo = this.extractEntityInfo(
      path,
      request.params,
      request.body
    );

    // Capture request body and sanitize sensitive data
    const requestBody = this.sanitizeData(
      request.body ? { ...request.body } : null
    );

    // Capture metadata
    const metadata = {
      ip:
        request.ip ||
        request.headers["x-forwarded-for"] ||
        request.headers["x-real-ip"] ||
        "unknown",
      userAgent: request.headers["user-agent"] || "unknown",
      method,
      path,
      statusCode: null as number | null,
      responseTime: null as number | null,
    };

    const startTime = Date.now();

    // Intercept the response
    return next.handle().pipe(
      tap((data) => {
        // Success case
        metadata.statusCode = response.statusCode;
        metadata.responseTime = Date.now() - startTime;

        // Capture response body and sanitize
        const responseBody = this.sanitizeData(
          data ? (typeof data === "object" ? { ...data } : data) : null
        );

        // Log asynchronously (don't block the response)
        this.logAuditAction({
          userId,
          tenantId,
          action: this.mapMethodToAction(method),
          entityType: entityInfo.entityType,
          entityId: entityInfo.entityId,
          requestBody,
          responseBody,
          changes: entityInfo.changes,
          metadata,
          status: "SUCCESS",
          errorMessage: null,
        }).catch((error) => {
          // Log error but don't break the request
          this.logger.error("Failed to create audit log", error);
        });
      }),
      catchError((error) => {
        // Error case
        metadata.statusCode = error.status || error.statusCode || 500;
        metadata.responseTime = Date.now() - startTime;

        // Capture error response
        const errorResponse = {
          message: error.message || "Unknown error",
          statusCode: metadata.statusCode,
          ...(error.response ? { response: error.response } : {}),
        };

        // Log asynchronously
        this.logAuditAction({
          userId,
          tenantId,
          action: this.mapMethodToAction(method),
          entityType: entityInfo.entityType,
          entityId: entityInfo.entityId,
          requestBody,
          responseBody: errorResponse,
          changes: entityInfo.changes,
          metadata,
          status: "FAILED",
          errorMessage: error.message || "Unknown error",
        }).catch((logError) => {
          // Log error but don't break the request
          this.logger.error("Failed to create audit log for error", logError);
        });

        return throwError(() => error);
      })
    );
  }

  private extractEntityInfo(
    path: string,
    params: any,
    body: any
  ): {
    entityType: string;
    entityId: string | null;
    changes: any;
  } {
    // Extract entity type from path
    // Examples:
    // /api/patients/:id -> patients
    // /api/consultations/:id -> consultations
    // /api/queue/:tenantId -> queue (no ID in path, use body.id)

    const pathParts = path.split("/").filter(Boolean);
    let entityType = "unknown";

    // Find the entity type from the path
    const entityMap: { [key: string]: string } = {
      patients: "patients",
      consultations: "consultations",
      queue: "queue",
      staff: "staff",
      settings: "settings",
      tenants: "tenants",
    };

    for (const [key, value] of Object.entries(entityMap)) {
      if (pathParts.includes(key)) {
        entityType = value;
        break;
      }
    }

    // Extract entity ID from params
    const entityId: string | null =
      params.id || params.userId || params.tenantId || body?.id || null;

    // Extract changes for UPDATE/PATCH operations
    let changes = null;
    if (body && typeof body === "object") {
      changes = { ...body };
    }

    return { entityType, entityId, changes };
  }

  private mapMethodToAction(
    method: string
  ): "CREATE" | "UPDATE" | "DELETE" | "PATCH" {
    switch (method) {
      case "POST":
        return "CREATE";
      case "PUT":
        return "UPDATE";
      case "PATCH":
        return "PATCH";
      case "DELETE":
        return "DELETE";
      default:
        return "UPDATE";
    }
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== "object") {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    const sanitized: any = {};
    const sensitiveFields = [
      "password",
      "access_token",
      "refresh_token",
      "token",
      "secret",
      "apiKey",
      "api_key",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveFields.includes(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
      } else if (value && typeof value === "object") {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private async logAuditAction(auditData: InsertAuditLog): Promise<void> {
    try {
      await this.auditService.logAction(auditData);
    } catch (error) {
      // Log error but don't throw - audit logging should never break requests
      this.logger.error("Failed to log audit action", error);
    }
  }
}
