import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

@Injectable()
export class SecurityService implements OnModuleInit {
  private readonly logger = new Logger(SecurityService.name);

  private blockedIps = new Map<string, number>();
  private connectionAttempts = new Map<
    string,
    { count: number; firstAttempt: number }
  >();
  private messageRateLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private preAuthMessageLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private authFailures = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private tenantConnections = new Map<string, number>();
  private ipConnections = new Map<string, number>();

  private readonly config = {
    MAX_CONNECTIONS_PER_TENANT: 50,
    MAX_CONNECTIONS_PER_IP: 5,
    CONNECTION_RATE_LIMIT: 10,
    CONNECTION_RATE_WINDOW: 60 * 1000,
    MESSAGE_RATE_LIMIT: 100,
    MESSAGE_RATE_WINDOW: 60 * 1000,
    AUTH_FAILURE_THRESHOLD: 5,
    IP_BLOCK_DURATION: 15 * 60 * 1000,
  };

  onModuleInit() {
    this.startCleanupInterval();
  }

  isIpBlocked(ip: string): boolean {
    const blockExpiry = this.blockedIps.get(ip);
    if (!blockExpiry) return false;

    if (Date.now() > blockExpiry) {
      this.blockedIps.delete(ip);
      return false;
    }
    return true;
  }

  blockIp(ip: string, reason: string): void {
    const blockUntil = Date.now() + this.config.IP_BLOCK_DURATION;
    this.blockedIps.set(ip, blockUntil);
    this.logger.warn(
      `🚫 IP ${ip} blocked for ${
        this.config.IP_BLOCK_DURATION / 60000
      } minutes: ${reason}`
    );
  }

  checkConnectionRateLimit(ip: string): boolean {
    const now = Date.now();
    const attempt = this.connectionAttempts.get(ip);

    if (
      !attempt ||
      now - attempt.firstAttempt > this.config.CONNECTION_RATE_WINDOW
    ) {
      this.connectionAttempts.set(ip, { count: 1, firstAttempt: now });
      return true;
    }

    if (attempt.count >= this.config.CONNECTION_RATE_LIMIT) {
      return false;
    }

    attempt.count++;
    return true;
  }

  checkMessageRateLimit(peerId: string): boolean {
    const now = Date.now();
    const limit = this.messageRateLimits.get(peerId);

    if (!limit || now - limit.windowStart > this.config.MESSAGE_RATE_WINDOW) {
      this.messageRateLimits.set(peerId, { count: 1, windowStart: now });
      return true;
    }

    if (limit.count >= this.config.MESSAGE_RATE_LIMIT) {
      return false;
    }

    limit.count++;
    return true;
  }

  checkPreAuthMessageRateLimit(ip: string): boolean {
    const now = Date.now();
    const limit = this.preAuthMessageLimits.get(ip);

    if (!limit || now - limit.windowStart > this.config.MESSAGE_RATE_WINDOW) {
      this.preAuthMessageLimits.set(ip, { count: 1, windowStart: now });
      return true;
    }

    if (limit.count >= this.config.MESSAGE_RATE_LIMIT) {
      return false;
    }

    limit.count++;
    return true;
  }

  trackAuthFailure(ip: string): boolean {
    const now = Date.now();
    const failures = this.authFailures.get(ip);

    if (
      !failures ||
      now - failures.windowStart > this.config.CONNECTION_RATE_WINDOW
    ) {
      this.authFailures.set(ip, { count: 1, windowStart: now });
      return false;
    }

    failures.count++;

    if (failures.count >= this.config.AUTH_FAILURE_THRESHOLD) {
      return true; // Should block IP
    }

    return false;
  }

  canAddConnection(
    tenantId: string,
    ip: string
  ): { allowed: boolean; reason?: string } {
    // Check tenant connection limit
    const tenantCount = this.tenantConnections.get(tenantId) || 0;
    if (tenantCount >= this.config.MAX_CONNECTIONS_PER_TENANT) {
      return {
        allowed: false,
        reason: `Tenant ${tenantId} has reached maximum connections (${this.config.MAX_CONNECTIONS_PER_TENANT})`,
      };
    }

    // Check IP connection limit
    const ipCount = this.ipConnections.get(ip) || 0;
    if (ipCount >= this.config.MAX_CONNECTIONS_PER_IP) {
      return {
        allowed: false,
        reason: `IP ${ip} has reached maximum connections (${this.config.MAX_CONNECTIONS_PER_IP})`,
      };
    }

    return { allowed: true };
  }

  addConnection(tenantId: string, ip: string): void {
    this.tenantConnections.set(
      tenantId,
      (this.tenantConnections.get(tenantId) || 0) + 1
    );
    this.ipConnections.set(ip, (this.ipConnections.get(ip) || 0) + 1);
  }

  removeConnection(tenantId: string, ip: string): void {
    const tenantCount = this.tenantConnections.get(tenantId) || 0;
    const ipCount = this.ipConnections.get(ip) || 0;

    if (tenantCount > 1) {
      this.tenantConnections.set(tenantId, tenantCount - 1);
    } else {
      this.tenantConnections.delete(tenantId);
    }

    if (ipCount > 1) {
      this.ipConnections.set(ip, ipCount - 1);
    } else {
      this.ipConnections.delete(ip);
    }
  }

  cleanupConnectionData(peerId: string, ip: string, tenantId?: string): void {
    if (tenantId) {
      this.removeConnection(tenantId, ip);
    }

    this.messageRateLimits.delete(peerId);
    this.preAuthMessageLimits.delete(ip);

    this.logger.log(
      `🧹 Cleaned up security data for peer ${peerId} from ${ip}`
    );
  }

  clearAuthFailures(ip: string): void {
    this.authFailures.delete(ip);
  }

  getAuthFailureCount(ip: string): number {
    return this.authFailures.get(ip)?.count || 0;
  }

  private startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();

      // Clean up expired connection attempts
      for (const [ip, attempt] of Array.from(
        this.connectionAttempts.entries()
      )) {
        if (now - attempt.firstAttempt > this.config.CONNECTION_RATE_WINDOW) {
          this.connectionAttempts.delete(ip);
        }
      }

      // Clean up expired message rate limits
      for (const [peerId, limit] of Array.from(
        this.messageRateLimits.entries()
      )) {
        if (now - limit.windowStart > this.config.MESSAGE_RATE_WINDOW) {
          this.messageRateLimits.delete(peerId);
        }
      }

      // Clean up expired pre-auth message rate limits
      for (const [ip, limit] of Array.from(
        this.preAuthMessageLimits.entries()
      )) {
        if (now - limit.windowStart > this.config.MESSAGE_RATE_WINDOW) {
          this.preAuthMessageLimits.delete(ip);
        }
      }

      // Clean up expired auth failure tracking
      for (const [ip, failures] of Array.from(this.authFailures.entries())) {
        if (now - failures.windowStart > this.config.CONNECTION_RATE_WINDOW) {
          this.authFailures.delete(ip);
        }
      }

      // Clean up expired IP blocks
      for (const [ip, blockExpiry] of Array.from(this.blockedIps.entries())) {
        if (now > blockExpiry) {
          this.blockedIps.delete(ip);
          this.logger.log(`🔓 IP ${ip} unblocked`);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }
}
