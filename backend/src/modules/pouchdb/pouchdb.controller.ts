import {
  Controller,
  Put,
  Param,
  Req,
  Res,
  Next,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { PouchDBService } from "./pouchdb.service";

@Controller("api/pouchdb")
export class PouchDBController {
  private readonly logger = new Logger(PouchDBController.name);

  constructor(private readonly pouchdbService: PouchDBService) {}

  @Put(":tenantId")
  async createDatabase(@Param("tenantId") tenantId: string) {
    try {
      const db = await this.pouchdbService.getTenantDatabase(tenantId);
      const info = await db.info();

      this.logger.log(
        `Database created/verified for tenant ${tenantId}:`,
        info
      );

      return {
        ok: true,
        id: tenantId,
        ...info,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create database for tenant ${tenantId}:`,
        error
      );
      throw error;
    }
  }
}
