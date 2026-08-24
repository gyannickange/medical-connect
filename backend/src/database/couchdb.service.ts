import { Injectable, Logger } from "@nestjs/common";
import Nano, { ServerScope, DocumentScope } from "nano";

@Injectable()
export class CouchDBService {
  private readonly logger = new Logger(CouchDBService.name);
  private client: ServerScope | null = null;
  private readonly databases = new Map<string, DocumentScope<unknown>>();
  private readonly databaseInitializations = new Map<
    string,
    Promise<DocumentScope<unknown>>
  >();

  private getClient(): ServerScope {
    if (this.client) return this.client;
    const url = process.env.COUCHDB_URL;
    if (!url) {
      throw new Error("COUCHDB_URL is required to use CouchDBService");
    }
    this.client = Nano(url);
    return this.client;
  }

  async getDatabase<T = unknown>(name: string): Promise<DocumentScope<T>> {
    const cached = this.databases.get(name);
    if (cached) {
      return cached as DocumentScope<T>;
    }

    const pending = this.databaseInitializations.get(name);
    if (pending) {
      return pending as Promise<DocumentScope<T>>;
    }

    const initialization = this.initializeDatabase(name);
    this.databaseInitializations.set(name, initialization);

    try {
      return (await initialization) as DocumentScope<T>;
    } finally {
      this.databaseInitializations.delete(name);
    }
  }

  private async initializeDatabase(
    name: string
  ): Promise<DocumentScope<unknown>> {
    const client = this.getClient();
    await this.ensureDatabaseExists(client, name);
    const db = client.use<unknown>(name);
    this.databases.set(name, db);
    return db;
  }

  private async ensureDatabaseExists(
    client: ServerScope,
    name: string
  ): Promise<void> {
    try {
      await client.db.get(name);
    } catch (error: unknown) {
      if (this.hasStatusCode(error, 404)) {
        await client.db.create(name);
        this.logger.log(`Created CouchDB database: ${name}`);
        return;
      }
      throw error;
    }
  }

  private hasStatusCode(error: unknown, statusCode: number): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === statusCode
    );
  }

  async ensureIndex(
    dbName: string,
    indexName: string,
    fields: string[]
  ): Promise<void> {
    const db = await this.getDatabase(dbName);
    await db.createIndex({
      index: { fields },
      name: indexName,
    });
  }

  async ensureDesignDocument(
    dbName: string,
    designName: string,
    views: Record<string, { map: string; reduce?: string }>
  ): Promise<void> {
    const db = await this.getDatabase(dbName);
    const _id = `_design/${designName}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let current: Record<string, any> | null = null;
      try {
        current = (await db.get(_id)) as unknown as Record<string, any>;
      } catch (error) {
        if (!this.hasStatusCode(error, 404)) throw error;
      }

      if (
        current?.language === "javascript" &&
        JSON.stringify(current.views) === JSON.stringify(views)
      ) {
        return;
      }

      try {
        await db.insert({
          _id,
          ...(current?._rev ? { _rev: current._rev } : {}),
          language: "javascript",
          views,
        } as any);
        return;
      } catch (error) {
        if (this.hasStatusCode(error, 409) && attempt < 2) continue;
        throw error;
      }
    }
  }
}
