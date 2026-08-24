import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server } from "ws";
import { TokenService } from "./services/token.service";
import { SecurityService } from "./services/security.service";
import { SignalingService } from "./services/signaling.service";
import { SyncRepository } from "../modules/sync/sync.repository";

@WebSocketGateway({ path: "/api/ws/signaling" })
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);
  private readonly serverPort: number;
  private peerInfoMap = new Map<
    any,
    {
      peerId?: string;
      tenantId?: string;
      ip: string;
      authTimeout?: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly tokenService: TokenService,
    private readonly securityService: SecurityService,
    private readonly signalingService: SignalingService,
    private readonly syncRepository: SyncRepository
  ) {
    this.serverPort = parseInt(process.env.PORT || "5200", 10);
  }

  handleConnection(client: any, ...args: any[]) {
    // Extract client IP
    const clientIp = this.extractClientIp(client);

    // Check if IP is blocked
    if (this.securityService.isIpBlocked(clientIp)) {
      this.logger.warn(`🚫 Blocked IP ${clientIp} attempted connection`);
      client.close(1008, "IP blocked due to security violations");
      return;
    }

    // Check connection rate limit
    if (!this.securityService.checkConnectionRateLimit(clientIp)) {
      this.logger.warn(`⚠️ Rate limit exceeded for IP ${clientIp}`);
      client.close(1008, "Connection rate limit exceeded");
      return;
    }

    this.logger.log(`🔌 New WebSocket connection from IP: ${clientIp}`);

    // Set authentication timeout - connections must authenticate within 10 seconds
    const authTimeout = setTimeout(() => {
      const peerInfo = this.peerInfoMap.get(client);
      if (!peerInfo?.peerId) {
        this.logger.log("WebSocket connection closed: Authentication timeout");
        client.close(1008, "Authentication timeout");
      }
    }, 10000);

    this.peerInfoMap.set(client, { ip: clientIp, authTimeout });

    // Set up message handler
    client.on("message", (message: any) => this.handleMessage(client, message));
  }

  async handleDisconnect(client: any) {
    const peerInfo = this.peerInfoMap.get(client);

    if (peerInfo?.authTimeout) {
      clearTimeout(peerInfo.authTimeout);
    }

    if (peerInfo?.peerId && peerInfo?.tenantId) {
      this.logger.log(
        `🔌 Authenticated peer disconnected: ${peerInfo.peerId} from ${peerInfo.ip}`
      );

      // Remove from signaling service
      this.signalingService.removePeer(peerInfo.peerId);

      // Cleanup security data
      this.securityService.cleanupConnectionData(
        peerInfo.peerId,
        peerInfo.ip,
        peerInfo.tenantId
      );

      // Update sync status to offline
      try {
        await this.syncRepository.upsert({
          tenantId: peerInfo.tenantId,
          deviceId: peerInfo.peerId,
          status: "offline",
          pendingChanges: 0,
          lastSync: new Date(),
        });
      } catch (error) {
        this.logger.error("Failed to update sync status on disconnect:", error);
      }

      // Notify other authenticated peers in the same tenant
      this.signalingService.broadcastToTenant(
        peerInfo.tenantId,
        {
          type: "peer-disconnected",
          peerId: peerInfo.peerId,
        },
        peerInfo.peerId
      );
    } else if (peerInfo?.peerId) {
      this.logger.log(
        `🔌 Unauthenticated peer disconnected: ${peerInfo.peerId} from ${peerInfo.ip}`
      );
      if (peerInfo.tenantId) {
        this.securityService.cleanupConnectionData(
          peerInfo.peerId,
          peerInfo.ip,
          peerInfo.tenantId
        );
      }
    } else {
      this.logger.log(
        `🔌 Unregistered connection disconnected from ${
          peerInfo?.ip || "unknown"
        }`
      );
    }

    this.peerInfoMap.delete(client);
  }

  private async handleMessage(client: any, message: any) {
    const peerInfo = this.peerInfoMap.get(client);
    if (!peerInfo) return;

    try {
      // Check message size to prevent large message attacks
      const messageStr = message.toString();
      if (messageStr.length > 10 * 1024) {
        this.logger.warn(
          `🚫 Oversized message from ${peerInfo.ip}: ${messageStr.length} bytes`
        );
        client.close(1009, "Message too large");
        return;
      }

      // Apply pre-auth message rate limiting
      if (!this.securityService.checkPreAuthMessageRateLimit(peerInfo.ip)) {
        this.logger.warn(
          `⚠️ Pre-auth message rate limit exceeded for IP ${peerInfo.ip}`
        );
        this.sendToClient(client, {
          type: "rate-limit-error",
          message: "Message rate limit exceeded",
        });
        return;
      }

      const data = JSON.parse(messageStr);

      // Check message rate limit for authenticated peers
      if (
        peerInfo.peerId &&
        !this.securityService.checkMessageRateLimit(peerInfo.peerId)
      ) {
        this.logger.warn(
          `⚠️ Message rate limit exceeded for peer ${peerInfo.peerId}`
        );
        this.sendToClient(client, {
          type: "rate-limit-error",
          message: "Message rate limit exceeded",
        });
        return;
      }

      switch (data.type) {
        case "register":
          await this.handleRegister(client, data, peerInfo);
          break;

        case "webrtc-signal":
          await this.handleWebRTCSignal(client, data, peerInfo);
          break;

        case "ping":
          await this.handlePing(client, data, peerInfo);
          break;

        default:
          if (!peerInfo.peerId) {
            this.sendToClient(client, {
              type: "error",
              message: "Must be authenticated to send messages",
            });
          }
          break;
      }
    } catch (error) {
      this.logger.error("WebSocket message error:", error);
    }
  }

  private async handleRegister(client: any, data: any, peerInfo: any) {
    // Clear auth timeout
    if (peerInfo.authTimeout) {
      clearTimeout(peerInfo.authTimeout);
      peerInfo.authTimeout = undefined;
    }

    // Check connection limits before proceeding
    const connectionCheck = this.securityService.canAddConnection(
      data.tenantId,
      peerInfo.ip
    );
    if (!connectionCheck.allowed) {
      this.logger.warn(
        `🚫 Connection limit exceeded: ${connectionCheck.reason}`
      );
      this.sendToClient(client, {
        type: "connection-limit-error",
        message: connectionCheck.reason,
      });
      client.close(1008, "Connection limit exceeded");
      return;
    }

    // The client must prove membership. Never mint a token from an untrusted
    // tenantId supplied over this unauthenticated socket.
    const isAuthenticated = await this.tokenService.authenticateWebSocketUser(
      data.peerId,
      data.tenantId,
      data.authToken
    );

    if (!isAuthenticated) {
      // Track authentication failure for this IP
      const shouldBlock = this.securityService.trackAuthFailure(peerInfo.ip);
      const currentFailures = this.securityService.getAuthFailureCount(
        peerInfo.ip
      );

      this.logger.warn(
        `🔒 Authentication failed for ${data.peerId} from ${peerInfo.ip} (failure ${currentFailures}/5)`
      );

      // Block IP if threshold reached
      if (shouldBlock) {
        this.securityService.blockIp(
          peerInfo.ip,
          `${currentFailures} authentication failures in 1 minute`
        );
      }

      this.sendToClient(client, {
        type: "auth-error",
        message: "Authentication failed",
      });
      client.close(1008, "Authentication failed");
      return;
    }

    // Clear auth failure tracking on successful authentication
    this.securityService.clearAuthFailures(peerInfo.ip);

    // Add connection to tracking
    this.securityService.addConnection(data.tenantId, peerInfo.ip);

    // Update peer info
    peerInfo.peerId = data.peerId;
    peerInfo.tenantId = data.tenantId;

    const hostHeader =
      client._socket?._httpMessage?.headers?.host?.toString().split(":")[0];
    const host = hostHeader || peerInfo.ip || "localhost";

    // Register peer in signaling service
    this.signalingService.registerPeer(
      data.peerId,
      data.tenantId,
      client,
      peerInfo.ip,
      host
    );

    this.logger.log(
      `Peer registered for LAN discovery: ${data.peerId} (tenant: ${data.tenantId})`
    );

    // Send success confirmation
    this.sendToClient(client, {
      type: "auth-success",
      message: "Authentication successful",
    });

    // Notify other authenticated peers in the same tenant
    this.signalingService.broadcastToTenant(
      data.tenantId,
      {
        type: "peer-discovered",
        peerId: data.peerId,
        tenantId: data.tenantId,
        host,
        ip: peerInfo.ip,
        port: this.serverPort,
        deviceType: "cash-register",
      },
      data.peerId
    );

    // Send existing authenticated peers to new peer
    const existingPeers = this.signalingService.getExistingPeers(
      data.tenantId,
      data.peerId
    );

    this.sendToClient(client, {
      type: "existing-peers",
      peers: existingPeers,
    });
  }

  private async handleWebRTCSignal(client: any, data: any, peerInfo: any) {
    if (!peerInfo.peerId) {
      this.sendToClient(client, {
        type: "error",
        message: "Must be authenticated to send WebRTC signals",
      });
      return;
    }

    const { targetPeer, signal } = data;
    const relayed = this.signalingService.relaySignal(
      peerInfo.peerId,
      targetPeer,
      signal,
      peerInfo.tenantId
    );

    if (!relayed) {
      this.sendToClient(client, {
        type: "error",
        message: "Target peer not found or not in same tenant",
      });
    }
  }

  private async handlePing(client: any, data: any, peerInfo: any) {
    if (!peerInfo.peerId) {
      this.sendToClient(client, {
        type: "error",
        message: "Must be authenticated to ping",
      });
      return;
    }

    // Update peer activity
    this.signalingService.updatePeerActivity(peerInfo.peerId);

    // Send pong
    this.sendToClient(client, { type: "pong" });

    // Update sync status
    try {
      await this.syncRepository.upsert({
        tenantId: peerInfo.tenantId,
        deviceId: peerInfo.peerId,
        status: "online",
        pendingChanges: data.pendingChanges || 0,
        lastSync: new Date(),
      });
    } catch (error) {
      this.logger.error("Failed to update sync status:", error);
    }
  }

  private extractClientIp(client: any): string {
    const req = client._socket?._httpMessage || client.upgradeReq || {};
    const forwarded = req.headers?.["x-forwarded-for"];
    const realIp = req.headers?.["x-real-ip"];
    const remoteAddress = client._socket?.remoteAddress;

    if (forwarded) {
      return forwarded.toString().split(",")[0];
    }
    if (realIp) {
      return realIp.toString();
    }
    return remoteAddress || "unknown";
  }

  private sendToClient(client: any, message: any) {
    try {
      client.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error("Failed to send message to client:", error);
    }
  }
}
