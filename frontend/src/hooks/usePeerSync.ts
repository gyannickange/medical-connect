import { useEffect, useCallback, useState, useRef } from "react";
import { usePouchDB } from "../lib/pouchdb";
import { DiscoveredPeer } from "./useLANDiscovery";
import { useTenant } from "../contexts/TenantContext";

export interface PeerSyncInfo {
  peerId: string;
  status: "connecting" | "syncing" | "synced" | "error" | "disconnected";
  lastSync?: Date;
  bytesTransferred?: number;
  docsTransferred?: number;
}

export const usePeerSync = (
  discoveredPeers: DiscoveredPeer[] = [],
  connectedPeers: string[] = [],
  isDiscovering: boolean = false,
  startDiscovery: () => void = () => {},
  connectToPeer: (peerId: string) => Promise<void> = async () => {},
  stopDiscovery: () => void = () => {},
  deviceId: string = ""
) => {
  const { currentTenant } = useTenant();
  const [peerSyncStatus, setPeerSyncStatus] = useState<
    Map<string, PeerSyncInfo>
  >(new Map());
  const [isEnabled, setIsEnabled] = useState(false);
  const syncInProgress = useRef<Set<string>>(new Set());

  // Get PouchDB methods for peer sync
  const {
    initialized: dbInitialized,
    startPeerSync,
    stopPeerSync,
    stopAllPeerSyncs,
  } = usePouchDB(`businessconnect_${currentTenant?.id || "default"}`);

  // Update peer sync status
  const updatePeerSyncStatus = useCallback(
    (peerId: string, updates: Partial<PeerSyncInfo>) => {
      setPeerSyncStatus((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(peerId) || {
          peerId,
          status: "disconnected",
        };
        newMap.set(peerId, { ...current, ...updates });
        return newMap;
      });
    },
    []
  );

  // Start peer sync with a connected device
  const initiatePeerSync = useCallback(
    async (peerId: string) => {
      if (
        !dbInitialized ||
        !currentTenant ||
        syncInProgress.current.has(peerId)
      ) {
        return;
      }

      console.log(`Initiating peer sync with ${peerId}`);
      syncInProgress.current.add(peerId);
      updatePeerSyncStatus(peerId, { status: "connecting" });

      try {
        // Get the actual peer info to extract real network address
        console.log(
          `Looking for peer ${peerId} in discovered peers:`,
          discoveredPeers.map((p) => p.peerId)
        );
        const peer = discoveredPeers.find((p) => p.peerId === peerId);
        if (!peer) {
          console.error(
            `Peer ${peerId} not found in discovered peers. Available peers:`,
            discoveredPeers
          );
          throw new Error(
            `Peer ${peerId} not found in discovered peers. Available: ${discoveredPeers
              .map((p) => p.peerId)
              .join(", ")}`
          );
        }

        // Get peer host information
        const peerHost = peer.host || peer.ip;

        if (!peerHost || peerHost === "unknown") {
          throw new Error("Peer host information not available");
        }

        // Prevent syncing with self
        if (peer.peerId === deviceId) {
          throw new Error("Cannot sync with same device");
        }

        // Always use peer's endpoint for sync (never sync with current server)
        const peerPort = peer.port || 5200;
        const protocol =
          window.location.protocol === "https:" ? "https" : "http";
        const peerDbUrl = `${protocol}://${peerHost}:${peerPort}/api/pouchdb/${currentTenant.id}`;

        console.log(`Using peer replication URL: ${peerDbUrl}`);

        const sync = await startPeerSync(peerId, peerDbUrl);

        if (sync) {
          updatePeerSyncStatus(peerId, {
            status: "syncing",
            lastSync: new Date(),
          });

          // Listen for sync events to update status
          sync.on("change", (info: any) => {
            updatePeerSyncStatus(peerId, {
              status: "syncing",
              docsTransferred: (info.docs_read || 0) + (info.docs_written || 0),
              lastSync: new Date(),
            });
          });

          sync.on("paused", () => {
            updatePeerSyncStatus(peerId, {
              status: "synced",
              lastSync: new Date(),
            });
          });

          sync.on("active", () => {
            updatePeerSyncStatus(peerId, { status: "syncing" });
          });

          sync.on("error", (err: any) => {
            console.error(`Peer sync error with ${peerId}:`, err);
            updatePeerSyncStatus(peerId, { status: "error" });
            syncInProgress.current.delete(peerId);
          });

          sync.on("complete", () => {
            updatePeerSyncStatus(peerId, {
              status: "synced",
              lastSync: new Date(),
            });
            syncInProgress.current.delete(peerId);
          });
        } else {
          throw new Error("Failed to create sync");
        }
      } catch (error: any) {
        console.error(`Failed to start peer sync with ${peerId}:`, error);

        // Create descriptive error message
        let errorMessage = "Sync failed";
        if (error.message?.includes("same device")) {
          errorMessage = "Cannot sync with same device";
        } else if (error.message?.includes("host information")) {
          errorMessage = "Peer host information unavailable";
        } else if (error.message?.includes("not found")) {
          errorMessage = "Peer not found in discovered peers";
        } else if (error.message?.includes("timeout")) {
          errorMessage = "Connection timeout";
        } else if (error.message?.includes("network")) {
          errorMessage = "Network error - check connection";
        } else if (error.message) {
          errorMessage = error.message;
        }

        console.error(`Peer sync error: ${errorMessage}`);
        updatePeerSyncStatus(peerId, { status: "error" });
        syncInProgress.current.delete(peerId);
        throw new Error(errorMessage);
      }
    },
    [
      dbInitialized,
      currentTenant,
      startPeerSync,
      updatePeerSyncStatus,
      discoveredPeers,
    ]
  );

  // Stop peer sync with a device
  const terminatePeerSync = useCallback(
    (peerId: string) => {
      console.log(`Terminating peer sync with ${peerId}`);
      stopPeerSync(peerId);
      syncInProgress.current.delete(peerId);
      updatePeerSyncStatus(peerId, { status: "disconnected" });
    },
    [stopPeerSync, updatePeerSyncStatus]
  );

  // Auto-sync with connected peers when enabled
  useEffect(() => {
    if (!isEnabled || !dbInitialized || !currentTenant) return;

    // Start sync with all connected peers
    for (const peerId of connectedPeers) {
      if (
        !peerSyncStatus.has(peerId) ||
        peerSyncStatus.get(peerId)?.status === "disconnected"
      ) {
        initiatePeerSync(peerId);
      }
    }
  }, [
    isEnabled,
    dbInitialized,
    currentTenant,
    connectedPeers,
    initiatePeerSync,
    peerSyncStatus,
  ]);

  // Handle peer disconnections
  useEffect(() => {
    const connectedPeerIds = new Set(connectedPeers);

    // Stop sync for peers that are no longer connected
    for (const [peerId, syncInfo] of Array.from(peerSyncStatus.entries())) {
      if (!connectedPeerIds.has(peerId) && syncInfo.status !== "disconnected") {
        terminatePeerSync(peerId);
      }
    }
  }, [connectedPeers, peerSyncStatus, terminatePeerSync]);

  // Enable/disable peer sync
  const enablePeerSync = useCallback(() => {
    setIsEnabled(true);
    if (!isDiscovering) {
      startDiscovery();
    }
  }, [isDiscovering, startDiscovery]);

  const disablePeerSync = useCallback(() => {
    setIsEnabled(false);
    stopAllPeerSyncs();
    syncInProgress.current.clear();
    setPeerSyncStatus(new Map());
    stopDiscovery();
  }, [stopAllPeerSyncs, stopDiscovery]);

  // Force sync with a specific peer
  const forceSyncWithPeer = useCallback(
    async (peerId: string) => {
      // First ensure we're connected to the peer
      const isConnected = connectedPeers.includes(peerId);

      if (!isConnected) {
        // Try to connect first
        try {
          await connectToPeer(peerId);
          // Give connection time to establish
          setTimeout(() => initiatePeerSync(peerId), 1000);
        } catch (error) {
          console.error(`Failed to connect to peer ${peerId} for sync:`, error);
          updatePeerSyncStatus(peerId, { status: "error" });
        }
      } else {
        // Already connected, start sync
        await initiatePeerSync(peerId);
      }
    },
    [connectedPeers, connectToPeer, initiatePeerSync, updatePeerSyncStatus]
  );

  // Get sync statistics
  const getSyncStats = useCallback(() => {
    const stats = {
      totalPeers: discoveredPeers.length,
      connectedPeers: connectedPeers.length,
      syncingPeers: 0,
      syncedPeers: 0,
      errorPeers: 0,
    };

    for (const syncInfo of Array.from(peerSyncStatus.values())) {
      switch (syncInfo.status) {
        case "syncing":
        case "connecting":
          stats.syncingPeers++;
          break;
        case "synced":
          stats.syncedPeers++;
          break;
        case "error":
          stats.errorPeers++;
          break;
      }
    }

    return stats;
  }, [discoveredPeers, connectedPeers, peerSyncStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isEnabled) {
        disablePeerSync();
      }
    };
  }, [isEnabled, disablePeerSync]);

  return {
    // State
    isEnabled,
    peerSyncStatus, // Return the raw Map for efficient lookups

    // Actions
    enablePeerSync,
    disablePeerSync,
    forceSyncWithPeer,

    // Stats
    getSyncStats,
  };
};
