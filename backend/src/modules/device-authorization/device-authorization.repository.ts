import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

export type DeviceAuthorizationStatus = "pending" | "approved" | "revoked";

export interface DeviceAuthorization {
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  status: DeviceAuthorizationStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
}

interface DeviceAuthorizationDocument {
  _id: string;
  _rev?: string;
  type: "device_authorization";
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  status: DeviceAuthorizationStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
}

@Injectable()
export class DeviceAuthorizationRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(input: {
    tenantId: string;
    deviceId: string;
    devicePublicKey: string;
  }): Promise<DeviceAuthorization> {
    const doc: DeviceAuthorizationDocument = {
      _id: this.documentId(input.tenantId, input.deviceId),
      type: "device_authorization",
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      devicePublicKey: input.devicePublicKey,
      status: "pending",
      requestedAt: new Date().toISOString(),
      decidedAt: null,
      decidedByUserId: null,
    };
    await (await this.db()).insert(doc as any);
    return this.hydrate(doc);
  }

  async findByDevice(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAuthorization | undefined> {
    const doc = await this.findDocument(tenantId, deviceId);
    return doc ? this.hydrate(doc) : undefined;
  }

  async approve(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.decide(tenantId, deviceId, "approved", decidedByUserId);
  }

  async revoke(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.decide(tenantId, deviceId, "revoked", decidedByUserId);
  }

  async listByTenant(tenantId: string): Promise<DeviceAuthorization[]> {
    const dbName = identityDatabaseName();
    const db = await this.db();
    await this.couchDBService.ensureIndex(dbName, "device_authorizations_by_tenant", [
      "type",
      "tenantId",
    ]);
    const result = await db.find({
      selector: { type: "device_authorization", tenantId },
      limit: 1000,
    });
    return (result.docs as unknown as DeviceAuthorizationDocument[]).map((doc) =>
      this.hydrate(doc)
    );
  }

  private async decide(
    tenantId: string,
    deviceId: string,
    status: DeviceAuthorizationStatus,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    const db = await this.db();
    const current = await this.findDocument(tenantId, deviceId);
    if (!current) throw new NotFoundException("Device authorization not found");
    const updated: DeviceAuthorizationDocument = {
      ...current,
      status,
      decidedAt: new Date().toISOString(),
      decidedByUserId,
    };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  private async findDocument(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAuthorizationDocument | undefined> {
    try {
      return (await (await this.db()).get(
        this.documentId(tenantId, deviceId)
      )) as unknown as DeviceAuthorizationDocument;
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
    }
  }

  private documentId(tenantId: string, deviceId: string): string {
    return `device-authorization:${tenantId}:${deviceId}`;
  }

  private db() {
    return this.couchDBService.getDatabase(identityDatabaseName());
  }

  private hydrate(doc: DeviceAuthorizationDocument): DeviceAuthorization {
    return {
      tenantId: doc.tenantId,
      deviceId: doc.deviceId,
      devicePublicKey: doc.devicePublicKey,
      status: doc.status,
      requestedAt: new Date(doc.requestedAt),
      decidedAt: doc.decidedAt ? new Date(doc.decidedAt) : null,
      decidedByUserId: doc.decidedByUserId,
    };
  }
}
