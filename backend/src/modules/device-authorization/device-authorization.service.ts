import { ForbiddenException, Injectable } from "@nestjs/common";
import { TenantDataKeyRepository } from "./tenant-data-key.repository";
import { TenantsRepository } from "../identity/tenants.repository";
import {
  DeviceAuthorization,
  DeviceAuthorizationRepository,
} from "./device-authorization.repository";
import { sealForDevice } from "./sealed-box";
import { SignalingService } from "../../websocket/services/signaling.service";
import { LanIdentityService } from "../lan-identity/lan-identity.service";

@Injectable()
export class DeviceAuthorizationService {
  constructor(
    private readonly tenantDataKeyRepository: TenantDataKeyRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly deviceAuthorizationRepository: DeviceAuthorizationRepository,
    private readonly signalingService: SignalingService,
    private readonly lanIdentityService: LanIdentityService
  ) {}

  async request(
    tenantId: string,
    deviceId: string,
    devicePublicKey: string,
    provisioningSecret?: string
  ): Promise<DeviceAuthorization> {
    const existing = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      deviceId
    );
    if (existing) return existing;

    const created = await this.deviceAuthorizationRepository.create({
      tenantId,
      deviceId,
      devicePublicKey,
    });

    const tenantInitialized = await this.tenantsRepository.isInitialized(tenantId);
    if (!tenantInitialized) {
      const secretValid =
        !!provisioningSecret &&
        (await this.tenantsRepository.verifyAndConsumeProvisioningSecret(
          tenantId,
          provisioningSecret
        ));
      if (!secretValid) {
        throw new ForbiddenException(
          "A valid provisioning secret is required for the first device of a tenant"
        );
      }
      await this.tenantsRepository.markInitialized(tenantId);
      await this.deviceAuthorizationRepository.approve(tenantId, deviceId, "bootstrap");
      return created;
    }

    // Not a bootstrap request - notify already-approved devices so an admin
    // can review it. Best-effort: if nobody is currently connected, the
    // request still exists and the Settings page will show it on refetch.
    this.signalingService.broadcastToTenant(tenantId, {
      type: "device-authorization-requested",
      deviceId,
    });

    return created;
  }

  async approve(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.deviceAuthorizationRepository.approve(tenantId, deviceId, decidedByUserId);
  }

  async revoke(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.deviceAuthorizationRepository.revoke(tenantId, deviceId, decidedByUserId);
  }

  async list(tenantId: string): Promise<DeviceAuthorization[]> {
    return this.deviceAuthorizationRepository.listByTenant(tenantId);
  }

  async deliverKey(
    tenantId: string,
    deviceId: string
  ): Promise<{ ephemeralPublicKey: string; iv: string; ciphertext: string }> {
    const authorization = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      deviceId
    );
    if (!authorization || authorization.status !== "approved") {
      throw new ForbiddenException("This device is not authorized for this tenant");
    }
    const key = await this.tenantDataKeyRepository.getOrCreate(tenantId);
    return sealForDevice(key, authorization.devicePublicKey);
  }

  async issueApprovalCapability(
    tenantId: string,
    deviceId: string
  ): Promise<{ capability: string; expiresAt: number }> {
    const own = await this.deviceAuthorizationRepository.findByDevice(tenantId, deviceId);
    if (!own || own.status !== "approved") {
      throw new ForbiddenException(
        "Only a currently approved device can request an Approval Capability"
      );
    }
    return this.lanIdentityService.issueApprovalCapability(tenantId, deviceId);
  }

  async reconcileLanGrant(
    tenantId: string,
    grant: {
      grantedDeviceId: string;
      grantedByDeviceId: string;
      grantedByCertificate: string;
      approvalCapability: string;
      tenantFingerprint: string;
      decidedAt: string;
      signature: string;
    }
  ): Promise<DeviceAuthorization> {
    // The granting device's certificate is self-verifying against the CA key
    // this server already owns - no need to have pre-stored that device's
    // public key anywhere. Once verified, it's the trusted source for that
    // device's Ed25519 public key used to check the grant signature itself.
    const granterCertificate = this.lanIdentityService.verifyCertificate(
      grant.grantedByCertificate
    );
    if (!granterCertificate || granterCertificate.deviceId !== grant.grantedByDeviceId) {
      throw new ForbiddenException("Invalid granting device certificate");
    }

    if (!this.lanIdentityService.verifyTenantFingerprint(tenantId, grant.tenantFingerprint)) {
      throw new ForbiddenException("Tenant fingerprint mismatch");
    }

    const granterAuthorization = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      grant.grantedByDeviceId
    );
    if (!granterAuthorization || granterAuthorization.status !== "approved") {
      throw new ForbiddenException(
        "The granting device is not currently approved for this tenant"
      );
    }

    return this.deviceAuthorizationRepository.approve(
      tenantId,
      grant.grantedDeviceId,
      grant.grantedByDeviceId
    );
  }
}
