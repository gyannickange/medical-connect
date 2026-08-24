import { Injectable, Logger } from "@nestjs/common";
import { PeerInfo } from "../interfaces/peer-info.interface";

@Injectable()
export class SignalingService {
  private readonly logger = new Logger(SignalingService.name);
  private connectedPeers = new Map<string, PeerInfo>();
  private readonly serverPort: number;

  constructor() {
    this.serverPort = parseInt(process.env.PORT || "5200", 10);
  }

  registerPeer(
    peerId: string,
    tenantId: string,
    ws: any,
    ip: string,
    host: string
  ): void {
    const peerInfo: PeerInfo = {
      peerId,
      tenantId,
      authenticated: true,
      ip,
      host,
      lastActivity: Date.now(),
      ws,
    };

    this.connectedPeers.set(peerId, peerInfo);
    this.logger.log(`Peer registered: ${peerId} (tenant: ${tenantId})`);
  }

  getPeer(peerId: string): PeerInfo | undefined {
    return this.connectedPeers.get(peerId);
  }

  updatePeerActivity(peerId: string): void {
    const peer = this.connectedPeers.get(peerId);
    if (peer) {
      peer.lastActivity = Date.now();
    }
  }

  relaySignal(
    fromPeer: string,
    toPeer: string,
    signal: any,
    tenantId: string
  ): boolean {
    const sourcePeer = this.connectedPeers.get(fromPeer);
    const targetPeer = this.connectedPeers.get(toPeer);

    // Verify both peers are authenticated and in same tenant
    if (
      !targetPeer ||
      !targetPeer.authenticated ||
      targetPeer.tenantId !== tenantId
    ) {
      return false;
    }

    try {
      targetPeer.ws.send(
        JSON.stringify({
          type: "webrtc-signal",
          fromPeer,
          signal,
        })
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to relay signal from ${fromPeer} to ${toPeer}:`,
        error
      );
      this.connectedPeers.delete(toPeer);
      return false;
    }
  }

  broadcastToTenant(
    tenantId: string,
    message: any,
    excludePeer?: string
  ): void {
    for (const [peerId, peer] of Array.from(this.connectedPeers.entries())) {
      if (
        peer.tenantId === tenantId &&
        peerId !== excludePeer &&
        peer.authenticated
      ) {
        try {
          peer.ws.send(JSON.stringify(message));
        } catch (error) {
          this.logger.error(`Failed to broadcast to peer ${peerId}:`, error);
          this.connectedPeers.delete(peerId);
        }
      }
    }
  }

  getExistingPeers(
    tenantId: string,
    excludePeer?: string
  ): Array<{
    peerId: string;
    tenantId: string;
    ip: string;
    host: string;
    port: number;
    deviceType: string;
  }> {
    return Array.from(this.connectedPeers.values())
      .filter(
        (peer) =>
          peer.tenantId === tenantId &&
          peer.peerId !== excludePeer &&
          peer.authenticated
      )
      .map((peer) => ({
        peerId: peer.peerId,
        tenantId: peer.tenantId,
        ip: peer.ip,
        host: peer.host || peer.ip,
        port: this.serverPort,
        deviceType: "cash-register",
      }));
  }

  removePeer(peerId: string): PeerInfo | undefined {
    const peer = this.connectedPeers.get(peerId);
    if (peer) {
      this.connectedPeers.delete(peerId);
      this.logger.log(`Peer removed: ${peerId}`);
    }
    return peer;
  }

  getAllConnectedPeers(): PeerInfo[] {
    return Array.from(this.connectedPeers.values());
  }
}
