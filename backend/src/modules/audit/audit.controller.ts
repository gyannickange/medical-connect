import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { AuditPolicy } from "./audit.policy";

@Controller("api/audit-logs")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(":tenantId")
  @CheckPolicy(AuditPolicy, "view")
  async getAuditLogs(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("action") action?: string,
    @Query("status") status?: string,
    @Query("entityType") entityType?: string,
    @Query("userId") userId?: string
  ) {
    const options: any = {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    };

    if (startDate) {
      options.startDate = new Date(startDate);
    }

    if (endDate) {
      options.endDate = new Date(endDate);
    }

    if (action) {
      options.action = action;
    }

    if (status) {
      options.status = status;
    }

    if (entityType) {
      options.entityType = entityType;
    }

    if (userId) {
      options.userId = userId;
    }

    return this.auditService.getAuditLogs(tenantId, options);
  }

  @Get(":tenantId/entity/:entityType/:entityId")
  @CheckPolicy(AuditPolicy, "view")
  async getAuditLogsByEntity(
    @Param("tenantId") tenantId: string,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number
  ) {
    return this.auditService.getAuditLogsByEntity(
      tenantId,
      entityType,
      entityId,
      {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }
    );
  }

  @Get(":tenantId/user/:userId")
  @CheckPolicy(AuditPolicy, "view")
  async getAuditLogsByUser(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number
  ) {
    return this.auditService.getAuditLogsByUser(tenantId, userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
