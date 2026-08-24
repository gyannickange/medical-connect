import { Injectable, Logger } from "@nestjs/common";
import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign,
  verify,
} from "crypto";

const CERTIFICATE_VERSION = 1 as const;
const CERTIFICATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const APPROVAL_CAPABILITY_LIFETIME_MS = 12 * 60 * 60 * 1000;

export interface LanDeviceCertificatePayload {
  version: typeof CERTIFICATE_VERSION;
  deviceId: string;
  tenantFingerprint: string;
  devicePublicKey: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ApprovalCapabilityPayload {
  version: typeof CERTIFICATE_VERSION;
  purpose: "device-authorization-approve";
  deviceId: string;
  tenantFingerprint: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssuedLanCertificate {
  certificate: string;
  caPublicKey: string;
  tenantFingerprint: string;
  expiresAt: number;
}

@Injectable()
export class LanIdentityService {
  private readonly logger = new Logger(LanIdentityService.name);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor() {
    const configuredPrivateKey = process.env.LAN_CERTIFICATE_PRIVATE_KEY;
    if (configuredPrivateKey) {
      this.privateKey = loadPrivateKey(configuredPrivateKey);
      this.publicKey = createPublicKey(this.privateKey);
    } else {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "LAN_CERTIFICATE_PRIVATE_KEY is required in production"
        );
      }
      const generated = generateKeyPairSync("ed25519");
      this.privateKey = generated.privateKey;
      this.publicKey = generated.publicKey;
      this.logger.warn(
        "Using an ephemeral LAN certificate authority; configure LAN_CERTIFICATE_PRIVATE_KEY for persistent device certificates"
      );
    }
  }

  issueCertificate(
    tenantId: string,
    deviceId: string,
    devicePublicKey: string
  ): IssuedLanCertificate {
    validateDeviceId(deviceId);
    validateDevicePublicKey(devicePublicKey);

    const now = Date.now();
    const tenantFingerprint = this.tenantFingerprint(tenantId);
    const payload: LanDeviceCertificatePayload = {
      version: CERTIFICATE_VERSION,
      deviceId,
      tenantFingerprint,
      devicePublicKey,
      issuedAt: now,
      expiresAt: now + CERTIFICATE_LIFETIME_MS,
    };
    const certificate = this.sign(payload);

    return {
      certificate,
      caPublicKey: (this.publicKey.export({ format: "jwk" }) as JsonWebKey).x!,
      tenantFingerprint,
      expiresAt: payload.expiresAt,
    };
  }

  verifyCertificate(certificate: string): LanDeviceCertificatePayload | null {
    try {
      const [encodedPayload, encodedSignature, extra] = certificate.split(".");
      if (!encodedPayload || !encodedSignature || extra) return null;
      const valid = verify(
        null,
        Buffer.from(encodedPayload),
        this.publicKey,
        Buffer.from(encodedSignature, "base64url")
      );
      if (!valid) return null;

      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      ) as LanDeviceCertificatePayload;
      if (
        payload.version !== CERTIFICATE_VERSION ||
        payload.issuedAt > Date.now() + 60_000 ||
        payload.expiresAt <= Date.now()
      ) {
        return null;
      }
      validateDeviceId(payload.deviceId);
      validateDevicePublicKey(payload.devicePublicKey);
      return payload;
    } catch {
      return null;
    }
  }

  issueApprovalCapability(
    tenantId: string,
    deviceId: string
  ): { capability: string; expiresAt: number } {
    validateDeviceId(deviceId);

    const now = Date.now();
    const payload: ApprovalCapabilityPayload = {
      version: CERTIFICATE_VERSION,
      purpose: "device-authorization-approve",
      deviceId,
      tenantFingerprint: this.tenantFingerprint(tenantId),
      issuedAt: now,
      expiresAt: now + APPROVAL_CAPABILITY_LIFETIME_MS,
    };
    return { capability: this.sign(payload), expiresAt: payload.expiresAt };
  }

  verifyTenantFingerprint(tenantId: string, fingerprint: string): boolean {
    return this.tenantFingerprint(tenantId) === fingerprint;
  }

  private sign(payload: object): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const signature = sign(
      null,
      Buffer.from(encodedPayload),
      this.privateKey
    ).toString("base64url");
    return `${encodedPayload}.${signature}`;
  }

  private tenantFingerprint(tenantId: string): string {
    const secret =
      process.env.LAN_TENANT_FINGERPRINT_SECRET || process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error(
        "LAN_TENANT_FINGERPRINT_SECRET or SESSION_SECRET is required"
      );
    }
    return createHmac("sha256", secret)
      .update(`business-connect-tenant:${tenantId}`)
      .digest("base64url");
  }
}

function loadPrivateKey(value: string): KeyObject {
  const normalized = value.replace(/\\n/g, "\n");
  if (normalized.includes("BEGIN PRIVATE KEY")) {
    return createPrivateKey(normalized);
  }
  return createPrivateKey({
    key: Buffer.from(normalized, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

function validateDeviceId(deviceId: string): void {
  if (
    deviceId.length < 3 ||
    deviceId.length > 63 ||
    !/^[a-zA-Z0-9_-]+$/.test(deviceId)
  ) {
    throw new Error("Invalid LAN device identifier");
  }
}

function validateDevicePublicKey(devicePublicKey: string): void {
  const decoded = Buffer.from(devicePublicKey, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== devicePublicKey) {
    throw new Error("Invalid Ed25519 device public key");
  }
}
