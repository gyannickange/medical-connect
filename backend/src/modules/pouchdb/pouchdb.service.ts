import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { TenantsRepository } from "../identity/tenants.repository";
import PouchDB from "pouchdb-node";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class PouchDBService {
  private readonly logger = new Logger(PouchDBService.name);
  private tenantDatabases = new Map<string, any>();
  private PouchWithPrefix: any;

  constructor(private readonly tenantsRepository: TenantsRepository) {
    // Ensure PouchDB data directory and _all_dbs subdirectory exist
    // LevelDOWN can't create parent directories, only the LOCK file
    const pouchDir = path.resolve("./data/pouchdb/");
    const allDbsDir = path.join(pouchDir, "pouch__all_dbs__");
    fs.mkdirSync(allDbsDir, { recursive: true });

    this.PouchWithPrefix = PouchDB.defaults({ prefix: pouchDir });
    this.logger.log("PouchDB service initialized");
  }

  async getTenantDatabase(tenantId: string) {
    if (this.tenantDatabases.has(tenantId)) {
      return this.tenantDatabases.get(tenantId);
    }

    // Verify tenant exists
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const db = new this.PouchWithPrefix(tenantId);

    try {
      await db.info(); // Initialize
      this.logger.log(`PouchDB database initialized for tenant: ${tenantId}`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize PouchDB for tenant ${tenantId}:`,
        error
      );
      throw error;
    }

    this.tenantDatabases.set(tenantId, db);
    return db;
  }

  getPouchWithPrefix() {
    return this.PouchWithPrefix;
  }
}
