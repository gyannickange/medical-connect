export interface NativeLanPeer {
  deviceId: string;
  serviceName: string;
  addresses: string[];
  port: number;
  protocolVersion: string;
  lastSeenAt: number;
}

export interface NativeLanAgentStatus {
  running: boolean;
  deviceId: string | null;
  peerCount: number;
  networkAvailable: boolean;
}

export interface PreparedLanIdentity {
  deviceId: string;
  devicePublicKey: string;
  hasCertificate: boolean;
}

export interface LockMessageEvent<T = unknown> {
  senderDeviceId: string;
  payload: T;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type TauriUnlisten = () => void;
type TauriListen = <T>(
  event: string,
  handler: (event: { payload: T }) => void
) => Promise<TauriUnlisten>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke?: TauriInvoke };
      event?: { listen?: TauriListen };
    };
  }
}

function nativeInvoke(): TauriInvoke | null {
  return window.__TAURI__?.core?.invoke ?? null;
}

export const lanAgent = {
  isAvailable(): boolean {
    return nativeInvoke() !== null;
  },

  async prepareIdentity(deviceId: string) {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("Medical Connect LAN Agent is not available in this browser");
    return invoke<PreparedLanIdentity>("lan_agent_prepare_identity", {
      deviceId,
    });
  },

  async installCertificate(certificate: string, caPublicKey: string) {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("Medical Connect LAN Agent is not available in this browser");
    await invoke<void>("lan_agent_install_certificate", {
      certificate,
      caPublicKey,
    });
  },

  async enrollAndStart(deviceId: string) {
    const identity = await this.prepareIdentity(deviceId);

    // A previously enrolled desktop must be able to restart its LAN agent
    // while the remote backend is unavailable.
    if (identity.hasCertificate) {
      try {
        return await this.start();
      } catch {
        // The certificate may have expired or become unusable. Renew it below
        // while the authenticated backend is reachable.
      }
    }

    const response = await fetch("/api/lan-identity/certificate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        devicePublicKey: identity.devicePublicKey,
      }),
    });
    if (!response.ok) {
      throw new Error(`LAN device enrollment failed (${response.status})`);
    }
    const issued = (await response.json()) as {
      certificate: string;
      caPublicKey: string;
    };
    await this.installCertificate(issued.certificate, issued.caPublicKey);
    return this.start();
  },

  async start() {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("Medical Connect LAN Agent is not available in this browser");
    return invoke<NativeLanAgentStatus>("lan_agent_start");
  },

  async stop() {
    const invoke = nativeInvoke();
    if (!invoke) return;
    await invoke<void>("lan_agent_stop");
  },

  async status(): Promise<NativeLanAgentStatus> {
    const invoke = nativeInvoke();
    if (!invoke) {
      return {
        running: false,
        deviceId: null,
        peerCount: 0,
        networkAvailable: navigator.onLine !== false,
      };
    }
    return invoke<NativeLanAgentStatus>("lan_agent_status");
  },

  async getPeers(): Promise<NativeLanPeer[]> {
    const invoke = nativeInvoke();
    if (!invoke) return [];
    return invoke<NativeLanPeer[]>("lan_agent_get_peers");
  },

  async sendLockMessage(
    address: string,
    port: number,
    path: string,
    payload: unknown
  ): Promise<void> {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("Medical Connect LAN Agent is not available in this browser");
    await invoke<void>("lan_agent_send_lock_message", { address, port, path, payload });
  },

  async onLockEvent<T>(
    eventName: "lan-lock-request-received" | "lan-lock-response-received",
    handler: (event: LockMessageEvent<T>) => void
  ): Promise<() => void> {
    const listen = window.__TAURI__?.event?.listen;
    if (!listen) return () => {};
    return listen<LockMessageEvent<T>>(eventName, (event) => handler(event.payload));
  },

  async sendDeviceAuthorizationMessage(
    address: string,
    port: number,
    path: "/device-authorization/request" | "/device-authorization/grant",
    payload: unknown
  ): Promise<void> {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("Medical Connect LAN Agent is not available in this browser");
    await invoke<void>("lan_agent_send_lock_message", { address, port, path, payload });
  },

  async onDeviceAuthorizationEvent<T>(
    eventName:
      | "lan-device-authorization-request-received"
      | "lan-device-authorization-grant-received",
    handler: (event: LockMessageEvent<T>) => void
  ): Promise<() => void> {
    return this.onLockEvent(eventName as any, handler);
  },

  async checkInternet(): Promise<boolean> {
    const invoke = nativeInvoke();
    if (invoke) return invoke<boolean>("lan_agent_check_internet");

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch("https://www.gstatic.com/generate_204", {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
