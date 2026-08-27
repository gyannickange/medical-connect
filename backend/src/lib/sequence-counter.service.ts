import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CouchDBService } from "../database/couchdb.service";
import { tenantDatabaseName } from "../database/couchdb-naming";

@Injectable()
export class SequenceCounterService {
  constructor(private readonly couchDBService: CouchDBService) {}

  async next(tenantId: string, key: string): Promise<number> {
    const db = await this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
    const counterId = `counter:${key}:${tenantId}`;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existing = await this.findExisting(db, counterId);
      const nextValue = (existing?.value ?? 0) + 1;

      try {
        await db.insert({
          _id: counterId,
          ...(existing?._rev ? { _rev: existing._rev } : {}),
          type: "counter",
          tenantId,
          value: nextValue,
        } as any);
        return nextValue;
      } catch (error: any) {
        if (error?.statusCode === 409 && attempt < maxAttempts) continue;
        throw error;
      }
    }
    /* istanbul ignore next -- unreachable: loop always returns or throws */
    throw new ServiceUnavailableException(`Failed to allocate sequence for ${key}`);
  }

  private async findExisting(
    db: any,
    counterId: string
  ): Promise<{ _rev: string; value: number } | null> {
    try {
      return await db.get(counterId);
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }
}
