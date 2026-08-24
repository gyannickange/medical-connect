// PouchDB Authentication Helper
// Manages device authentication tokens for PouchDB sync

import { getDeviceId } from "./deviceIdentity";

interface AuthToken {
  token: string;
  expiresAt: number;
}

class PouchDBAuthManager {
  private tokens: Map<string, AuthToken> = new Map();
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Request an authentication token from the signaling server
   */
  async requestToken(tenantId: string): Promise<string> {
    // Check if we have a valid cached token
    const cached = this.tokens.get(tenantId);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      // 1 minute buffer
      return cached.token;
    }

    // Request new token from backend
    try {
      const response = await fetch("/api/ws/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          deviceId: this.deviceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get auth token: ${response.status}`);
      }

      const data = await response.json();

      // Cache the token
      this.tokens.set(tenantId, {
        token: data.token,
        expiresAt: Date.now() + 9 * 60 * 1000, // 9 minutes (tokens valid for 10)
      });

      return data.token;
    } catch (error) {
      console.error("Failed to request auth token:", error);
      throw error;
    }
  }

  /**
   * Get PouchDB sync options with authentication
   */
  async getSyncOptions(tenantId: string, baseOptions: any = {}): Promise<any> {
    const token = await this.requestToken(tenantId);

    return {
      ...baseOptions,
      fetch: (url: string, opts: any = {}) => {
        // Add authentication headers to all requests
        opts.headers = {
          ...opts.headers,
          Authorization: `Bearer ${token}`,
          "X-Device-ID": this.deviceId,
        };
        return fetch(url, opts);
      },
    };
  }

  /**
   * Clear cached tokens (e.g., on logout)
   */
  clearTokens(): void {
    this.tokens.clear();
  }
}

// Singleton instance
export const pouchdbAuthManager = new PouchDBAuthManager();
