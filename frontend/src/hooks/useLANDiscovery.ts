import { useEffect, useState, useRef, useCallback } from "react";
import { useTenant } from "../contexts/TenantContext";
import { getDeviceId } from "../lib/deviceIdentity";

export interface DiscoveredPeer {
  peerId: string;
  tenantId: string;
  deviceType: string;
  lastSeen: Date;
  connected?: boolean;
  host?: string; // IP address or hostname for HTTP connections
  ip?: string; // IP address for direct connection
  port?: number; // Port number if different from default
}

interface LANPeer extends DiscoveredPeer {
  connected: boolean;
}

interface WebRTCConnection {
  peer: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  connected: boolean;
}

export type LANDiscoveryStatus =
  | "disabled"
  | "connecting"
  | "online"
  | "error";

export const useLANDiscovery = () => {
  const { currentTenant } = useTenant();
  const [isEnabled, setIsEnabled] = useState(false);
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<LANDiscoveryStatus>("disabled");
  const [hasEverBeenEnabled, setHasEverBeenEnabled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const enabledRef = useRef(false);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const connectionsRef = useRef<Map<string, WebRTCConnection>>(new Map());
  const deviceId = getDeviceId();
  const previousTenantIdRef = useRef<string | undefined>(undefined);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // WebRTC configuration for local network
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }, // STUN for ICE gathering
    ],
  };

  const connectToSignalingServer = useCallback(() => {
    if (
      !currentTenant ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    )
      return;

    console.log("Connecting to signaling server for LAN discovery...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws/signaling`;

    console.log("Creating WebSocket connection:", wsUrl);
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setConnectionStatus("connecting");
    clearConnectionTimeout();
    connectionTimeoutRef.current = setTimeout(() => {
      if (wsRef.current !== socket) return;
      setIsDiscovering(false);
      setConnectionStatus("error");
      wsRef.current = null;
      socket.close();
    }, 8000);

    socket.onopen = () => {
      console.log("Connected to LAN discovery signaling server");

      // Prove tenant membership before joining the legacy signaling channel.
      fetch("/api/ws/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: deviceId, deviceId, tenantId: currentTenant.id }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Unable to authorize LAN discovery");
          return response.json();
        })
        .then(({ token }) =>
          socket.send(
            JSON.stringify({
              type: "register",
              peerId: deviceId,
              tenantId: currentTenant.id,
              authToken: token,
            })
          )
        )
        .catch(() => socket.close(1008, "LAN authorization failed"));
    };

    wsRef.current.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "auth-success":
            // Authentication successful
            console.log("WebSocket authentication successful");
            setIsDiscovering(true);
            clearConnectionTimeout();
            setConnectionStatus("online");
            break;

          case "auth-error":
            // Authentication failed
            console.error("WebSocket authentication failed:", data.message);
            setIsDiscovering(false);
            clearConnectionTimeout();
            setConnectionStatus("error");
            wsRef.current = null;
            socket.close();
            break;

          case "error":
            // General error
            console.error("WebSocket error:", data.message);
            clearConnectionTimeout();
            setIsDiscovering(false);
            setConnectionStatus("error");
            break;

          case "existing-peers":
            // Received list of existing peers in the same tenant
            console.log("Received existing peers:", data.peers);
            setDiscoveredPeers((prev) => {
              const newPeers = data.peers.map((peer: any) => ({
                peerId: peer.peerId,
                tenantId: peer.tenantId,
                deviceType: peer.deviceType || "cash-register",
                lastSeen: new Date(),
                host: peer.host, // IP/hostname from signaling server
                ip: peer.ip, // Direct IP if available
                port: peer.port || 5200,
              }));
              const result = [
                ...prev.filter(
                  (p) => !newPeers.find((np: LANPeer) => np.peerId === p.peerId)
                ),
                ...newPeers,
              ];
              console.log(
                "Setting discovered peers from existing-peers:",
                result
              );
              return result;
            });
            break;

          case "peer-discovered":
            // New peer joined the network
            console.log("New peer discovered:", data.peerId);
            setDiscoveredPeers((prev) => {
              if (prev.find((p) => p.peerId === data.peerId)) return prev;
              return [
                ...prev,
                {
                  peerId: data.peerId,
                  tenantId: data.tenantId,
                  deviceType: data.deviceType || "cash-register",
                  lastSeen: new Date(),
                  host: data.host, // IP/hostname from signaling server
                  ip: data.ip, // Direct IP if available
                  port: data.port || 5200,
                },
              ];
            });
            break;

          case "peer-disconnected":
            // Peer left the network
            console.log("Peer disconnected:", data.peerId);
            setDiscoveredPeers((prev) =>
              prev.filter((p) => p.peerId !== data.peerId)
            );
            setConnectedPeers((prev) => prev.filter((p) => p !== data.peerId));

            // Close WebRTC connection if exists
            const connection = connectionsRef.current.get(data.peerId);
            if (connection) {
              connection.peer.close();
              connectionsRef.current.delete(data.peerId);
            }
            break;

          case "webrtc-signal":
            // Handle WebRTC signaling from other peer
            await handleWebRTCSignal(data.fromPeer, data.signal);
            break;

          case "pong":
            // Server keepalive response
            break;
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };

    socket.onclose = () => {
      if (wsRef.current !== socket) return;
      console.log("Disconnected from signaling server");
      clearConnectionTimeout();
      wsRef.current = null;
      setIsDiscovering(false);
      setConnectionStatus("error");
      setTimeout(() => {
        if (enabledRef.current && currentTenant) {
          connectToSignalingServer();
        }
      }, 5000);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      clearConnectionTimeout();
      setIsDiscovering(false);
      setConnectionStatus("error");
    };
  }, [
    currentTenant,
    deviceId,
    clearConnectionTimeout,
  ]);

  const setupDataChannelHandlers = (
    channel: RTCDataChannel,
    peerId: string
  ) => {
    channel.onopen = () => console.log(`Data channel opened with ${peerId}`);
    channel.onclose = () => console.log(`Data channel closed with ${peerId}`);
    channel.onmessage = (event) => {
      console.log(`Received message from ${peerId}:`, event.data);
      // Handle sync data here - integrate with PouchDB sync
    };
  };

  const getOrCreateConnection = (
    peerId: string,
    createDataChannel: boolean
  ): WebRTCConnection => {
    let connection = connectionsRef.current.get(peerId);

    if (!connection) {
      connection = {
        peer: new RTCPeerConnection(rtcConfig),
        connected: false,
      };

      setupPeerConnectionHandlers(connection, peerId);
      connectionsRef.current.set(peerId, connection);
    }

    if (createDataChannel && !connection.dataChannel) {
      const channel = connection.peer.createDataChannel("sync");
      connection.dataChannel = channel;
      setupDataChannelHandlers(channel, peerId);
    }

    return connection;
  };

  const setupPeerConnectionHandlers = (
    connection: WebRTCConnection,
    peerId: string
  ) => {
    connection.peer.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current?.send(
          JSON.stringify({
            type: "webrtc-signal",
            targetPeer: peerId,
            signal: event.candidate,
          })
        );
      }
    };

    connection.peer.onconnectionstatechange = () => {
      const state = connection.peer.connectionState;
      console.log(`WebRTC connection with ${peerId}:`, state);

      if (state === "connected") {
        connection.connected = true;
        setConnectedPeers((prev) =>
          prev.includes(peerId) ? prev : [...prev, peerId]
        );

        setDiscoveredPeers((prev) =>
          prev.map((p) => (p.peerId === peerId ? { ...p, connected: true } : p))
        );
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        connection.connected = false;
        setConnectedPeers((prev) => prev.filter((p) => p !== peerId));

        setDiscoveredPeers((prev) =>
          prev.map((p) =>
            p.peerId === peerId ? { ...p, connected: false } : p
          )
        );
      }
    };

    connection.peer.ondatachannel = (event) => {
      setupDataChannelHandlers(event.channel, peerId);
    };
  };

  const handleWebRTCSignal = async (fromPeer: string, signal: any) => {
    try {
      const connection = getOrCreateConnection(fromPeer, false);

      if (signal.type === "offer") {
        await connection.peer.setRemoteDescription(signal);
        const answer = await connection.peer.createAnswer();
        await connection.peer.setLocalDescription(answer);

        // Send answer back through signaling server
        wsRef.current?.send(
          JSON.stringify({
            type: "webrtc-signal",
            targetPeer: fromPeer,
            signal: answer,
          })
        );
      } else if (signal.type === "answer") {
        await connection.peer.setRemoteDescription(signal);
      } else if (signal.candidate) {
        await connection.peer.addIceCandidate(signal);
      }
    } catch (error) {
      console.error("Error handling WebRTC signal:", error);
    }
  };

  const connectToPeer = async (peerId: string) => {
    console.log(`Initiating HTTP connection to peer: ${peerId}`);

    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("Signaling connection is not ready");
      }

      // Find the peer info to get host/IP details
      const peer = discoveredPeers.find((p) => p.peerId === peerId);
      if (!peer) {
        throw new Error(`Peer ${peerId} not found in discovered peers`);
      }

      // Use host/IP from peer discovery for connection
      const peerHost = peer.host || peer.ip;
      const peerPort = peer.port || 5200;
      const currentHost = window.location.hostname;

      // Validate peer has host/IP
      if (!peerHost || peerHost === "unknown") {
        throw new Error("Peer host information not available");
      }

      // Check if this is actually the SAME device (not just same network)
      const isSameDevice = peer.peerId === deviceId;

      if (isSameDevice) {
        console.error("Cannot connect to self");
        throw new Error("Cannot connect to same device");
      }

      console.log(`Connecting to peer ${peerId} at ${peerHost}:${peerPort}`);

      // For all peers, use peer's endpoint
      const isHTTPS = window.location.protocol === "https:";
      const protocols = isHTTPS ? ["https", "http"] : ["http", "https"];
      let connectionSuccessful = false;
      let lastError: any = null;

      for (const protocol of protocols) {
        const testUrl = `${protocol}://${peerHost}:${peerPort}/api/pouchdb/${currentTenant?.id}`;
        console.log(
          `Testing ${protocol.toUpperCase()} connection to: ${testUrl}`
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(testUrl, {
            method: "HEAD",
            mode: "cors",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          // 401 proves the protected peer endpoint is reachable; authenticated
          // PouchDB replication obtains its token in the next step.
          if (
            response.ok ||
            response.status === 401 ||
            response.status === 404
          ) {
            console.log(
              `${protocol.toUpperCase()} connection successful to peer ${peerId} at ${peerHost}:${peerPort}`
            );
            connectionSuccessful = true;
            setConnectedPeers((prev) => [
              ...prev.filter((p) => p !== peerId),
              peerId,
            ]);
            break;
          } else {
            lastError = new Error(
              `${protocol.toUpperCase()} connection failed: ${
                response.status
              } ${response.statusText}`
            );
            console.log(
              `${protocol.toUpperCase()} connection failed for ${peerId}:`,
              lastError.message
            );
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);

          if (fetchError.name === "AbortError") {
            lastError = new Error(
              `${protocol.toUpperCase()} connection timeout`
            );
          } else {
            lastError = fetchError;
          }
          console.log(
            `${protocol.toUpperCase()} connection error for ${peerId}:`,
            lastError.message
          );

          if (
            fetchError.message?.includes("Mixed Content") ||
            fetchError.message?.includes("insecure resource")
          ) {
            console.log(
              `Mixed content blocked for ${protocol.toUpperCase()}, trying next protocol...`
            );
            continue;
          }
        }
      }

      if (!connectionSuccessful) {
        throw lastError || new Error("All connection protocols failed");
      }

      // Start WebRTC negotiation with this peer
      const connection = getOrCreateConnection(peerId, true);
      const offer = await connection.peer.createOffer();
      await connection.peer.setLocalDescription(offer);
      wsRef.current.send(
        JSON.stringify({
          type: "webrtc-signal",
          targetPeer: peerId,
          signal: offer,
        })
      );
    } catch (error: any) {
      console.error(`Failed to connect to peer ${peerId}:`, error);

      // Create descriptive error message
      let errorMessage = "Connection failed";
      if (error.message?.includes("timeout")) {
        errorMessage = "Peer is unreachable (timeout)";
      } else if (
        error.message?.includes("CORS") ||
        error.message?.includes("cors")
      ) {
        errorMessage = "CORS error - check network configuration";
      } else if (error.message?.includes("same device")) {
        errorMessage = "Cannot connect to same device";
      } else if (error.message?.includes("host information")) {
        errorMessage = "Peer network information unavailable";
      } else if (error.message?.includes("not found")) {
        errorMessage = "Peer not found";
      } else if (error.message?.includes("protocols failed")) {
        errorMessage = "Unable to reach peer on network";
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Re-throw with descriptive message for UI to catch
      throw new Error(errorMessage);
    }
  };

  const sendSyncData = (peerId: string, data: any) => {
    const connection = connectionsRef.current.get(peerId);
    if (connection?.dataChannel?.readyState === "open") {
      connection.dataChannel.send(JSON.stringify(data));
      return true;
    }
    return false;
  };

  const startDiscovery = () => {
    enabledRef.current = true;
    clearConnectionTimeout();
    setIsDiscovering(false);
    setConnectionStatus("connecting");
    setIsEnabled(true);
    setHasEverBeenEnabled(true);
  };

  const stopDiscovery = useCallback(() => {
    enabledRef.current = false;
    setIsEnabled(false);
    setIsDiscovering(false);
    setConnectionStatus("disabled");
    clearConnectionTimeout();

    // Close WebSocket connection
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Client stopping discovery");
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    // Close all WebRTC connections
    for (const [peerId, connection] of Array.from(
      connectionsRef.current.entries()
    )) {
      if (connection.dataChannel) {
        connection.dataChannel.close();
      }
      connection.peer.close();
    }
    connectionsRef.current.clear();

    console.log("stopDiscovery: Clearing discovered peers array");
    setDiscoveredPeers([]);
    setConnectedPeers([]);
  }, [clearConnectionTimeout]);

  // Send periodic heartbeat to keep connection alive
  useEffect(() => {
    if (!isEnabled || !currentTenant || !isDiscovering) return;

    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ping",
            peerId: deviceId,
            tenantId: currentTenant.id,
          })
        );
      } else if (wsRef.current?.readyState === WebSocket.CLOSED) {
        // Reconnect if connection was lost
        console.log("WebSocket connection lost, attempting to reconnect...");
        connectToSignalingServer();
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(heartbeat);
  }, [
    isEnabled,
    currentTenant,
    deviceId,
    isDiscovering,
    connectToSignalingServer,
  ]);

  // Reset connections when tenant changes to avoid cross-tenant leakage
  useEffect(() => {
    const prevTenantId = previousTenantIdRef.current;
    const currentTenantId = currentTenant?.id;

    if (!isEnabled) {
      previousTenantIdRef.current = currentTenantId;
      return;
    }

    if (prevTenantId && currentTenantId && prevTenantId !== currentTenantId) {
      // Close WebSocket and peer connections
      if (wsRef.current) {
        wsRef.current.close(4001, "Tenant changed");
        wsRef.current = null;
      }

      for (const [, connection] of Array.from(
        connectionsRef.current.entries()
      )) {
        if (connection.dataChannel) {
          connection.dataChannel.close();
        }
        connection.peer.close();
      }
      connectionsRef.current.clear();
      setDiscoveredPeers([]);
      setConnectedPeers([]);
    }

    previousTenantIdRef.current = currentTenantId;

    if (isEnabled && currentTenantId) {
      connectToSignalingServer();
    }
  }, [currentTenant?.id, isEnabled, connectToSignalingServer]);

  // Connect to signaling server when enabled
  useEffect(() => {
    console.log(
      "Effect triggered - isEnabled:",
      isEnabled,
      "currentTenant:",
      currentTenant?.id,
      "hasEverBeenEnabled:",
      hasEverBeenEnabled
    );
    if (isEnabled && currentTenant) {
      connectToSignalingServer();
    } else if (!isEnabled && hasEverBeenEnabled) {
      // Only stop discovery if explicitly disabled AND discovery was previously enabled
      console.log(
        "Calling stopDiscovery because isEnabled is false and hasEverBeenEnabled is true"
      );
      stopDiscovery();
    }

    return () => {
      const socket = wsRef.current;
      if (socket) {
        wsRef.current = null;
        socket.close();
      }
      clearConnectionTimeout();
    };
  }, [
    isEnabled,
    currentTenant,
    connectToSignalingServer,
    clearConnectionTimeout,
  ]);

  return {
    isEnabled,
    isDiscovering,
    connectionStatus,
    discoveredPeers,
    connectedPeers,
    deviceId,
    startDiscovery,
    stopDiscovery,
    connectToPeer,
    sendSyncData,
  };
};
