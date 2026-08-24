import { Injectable, Logger } from "@nestjs/common";
import { TenantsRepository } from "../../modules/identity/tenants.repository";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private usedNonces = new Map<string, { nonce: string; exp: number }>();

  constructor(private readonly tenantsRepository: TenantsRepository) {
    // Clean up expired nonces periodically
    setInterval(() => this.cleanupExpiredNonces(), 5 * 60 * 1000);
  }

  async generateSecureToken(
    tenantId: string,
    deviceId: string
  ): Promise<string> {
    // Verify tenant exists
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    // Generate secure token with HMAC signature
    const timestamp = Date.now();
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = timestamp + 10 * 60 * 1000; // 10 minutes

    // Create payload
    const payload = JSON.stringify({
      tenantId,
      deviceId,
      nonce,
      iat: timestamp,
      exp: expiresAt,
    });

    // Sign with HMAC using SESSION_SECRET
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error(
        "SESSION_SECRET environment variable is required for secure token generation"
      );
    }

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Combine payload and signature
    return `${Buffer.from(payload).toString("base64")}.${signature}`;
  }

  async authenticateWebSocketUser(
    peerId: string,
    tenantId: string,
    authToken?: string,
    consumeNonce: boolean = true
  ): Promise<boolean> {
    try {
      if (!authToken) {
        this.logger.log(
          `WebSocket auth failed: No token provided for ${peerId}`
        );
        return false;
      }

      // Token format: base64(payload).signature
      const [encodedPayload, signature] = authToken.split(".");
      if (!encodedPayload || !signature) {
        this.logger.log(
          `WebSocket auth failed: Invalid token format for ${peerId}`
        );
        return false;
      }

      // Decode and parse payload
      let payload;
      try {
        const decodedPayload = Buffer.from(encodedPayload, "base64").toString(
          "utf-8"
        );
        payload = JSON.parse(decodedPayload);
      } catch (parseError) {
        this.logger.log(
          `WebSocket auth failed: Invalid payload format for ${peerId}`
        );
        return false;
      }

      // Verify payload structure
      if (
        !payload.tenantId ||
        !payload.deviceId ||
        !payload.nonce ||
        !payload.iat ||
        !payload.exp
      ) {
        this.logger.log(
          `WebSocket auth failed: Missing required payload fields for ${peerId}`
        );
        return false;
      }

      // Verify signature using HMAC
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        this.logger.log(`WebSocket auth failed: SESSION_SECRET not configured`);
        return false;
      }

      const decodedPayload = Buffer.from(encodedPayload, "base64").toString(
        "utf-8"
      );
      const expectedSignature = createHmac("sha256", secret)
        .update(decodedPayload)
        .digest("hex");

      // Use timing-safe comparison to prevent timing attacks
      if (
        !timingSafeEqual(
          Buffer.from(signature, "hex") as any,
          Buffer.from(expectedSignature, "hex") as any
        )
      ) {
        this.logger.log(
          `WebSocket auth failed: Invalid signature for ${peerId}`
        );
        return false;
      }

      // Verify tenant matches
      if (payload.tenantId !== tenantId) {
        this.logger.log(`WebSocket auth failed: Tenant mismatch for ${peerId}`);
        return false;
      }

      // Verify device ID matches
      if (payload.deviceId !== peerId) {
        this.logger.log(
          `WebSocket auth failed: Device ID mismatch for ${peerId}`
        );
        return false;
      }

      // Check token expiration
      const now = Date.now();
      if (now > payload.exp) {
        this.logger.log(`WebSocket auth failed: Token expired for ${peerId}`);
        return false;
      }

      // Check token isn't from future (clock skew protection)
      if (payload.iat > now + 60000) {
        this.logger.log(
          `WebSocket auth failed: Token from future for ${peerId}`
        );
        return false;
      }

      // Check for nonce reuse to prevent replay attacks
      const nonceKey = `${payload.tenantId}:${payload.deviceId}:${payload.nonce}`;
      if (consumeNonce && this.usedNonces.has(nonceKey)) {
        this.logger.log(
          `WebSocket auth failed: Nonce already used for ${peerId}`
        );
        return false;
      }

      // Store nonce until token expiration
      if (consumeNonce) {
        this.usedNonces.set(nonceKey, { nonce: payload.nonce, exp: payload.exp });
      }

      // Verify tenant exists in database
      const tenant = await this.tenantsRepository.findById(tenantId);
      if (!tenant) {
        this.logger.log(
          `WebSocket auth failed: Tenant not found for ${peerId}`
        );
        return false;
      }

      this.logger.log(
        `WebSocket auth success: ${peerId} authenticated for tenant ${tenantId}`
      );
      return true;
    } catch (error) {
      this.logger.error(`WebSocket auth error for ${peerId}:`, error);
      return false;
    }
  }

  private cleanupExpiredNonces() {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.usedNonces.entries())) {
      if (now > entry.exp) {
        this.usedNonces.delete(key);
      }
    }
  }
}
