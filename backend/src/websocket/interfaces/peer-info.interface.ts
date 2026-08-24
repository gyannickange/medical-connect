export interface PeerInfo {
  peerId: string;
  tenantId: string;
  authenticated: boolean;
  ip: string;
  host: string;
  lastActivity: number;
  ws: any;
}
