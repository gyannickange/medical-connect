import { useCallback, useEffect, useState } from "react";
import {
  lanAgent,
  type NativeLanAgentStatus,
  type NativeLanPeer,
} from "../lib/lanAgent";

const STOPPED: NativeLanAgentStatus = {
  running: false,
  deviceId: null,
  peerCount: 0,
  networkAvailable: false,
};

export function useNativeLANAgent() {
  const [status, setStatus] = useState<NativeLanAgentStatus>(STOPPED);
  const [peers, setPeers] = useState<NativeLanPeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!lanAgent.isAvailable()) return;
    try {
      const [nextStatus, nextPeers] = await Promise.all([
        lanAgent.status(),
        lanAgent.getPeers(),
      ]);
      setStatus(nextStatus);
      setPeers(nextPeers);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    available: lanAgent.isAvailable(),
    status,
    peers,
    error,
    enrollAndStart: lanAgent.enrollAndStart.bind(lanAgent),
    start: lanAgent.start.bind(lanAgent),
    stop: lanAgent.stop,
    refresh,
  };
}
