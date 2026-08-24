import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lanAgent } from "./lanAgent";

const invoke = vi.fn();

describe("native LAN agent enrollment", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal("window", {
      __TAURI__: { core: { invoke } },
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the native Internet reachability command in the desktop shell", async () => {
    invoke.mockResolvedValueOnce(false);

    await expect(lanAgent.checkInternet()).resolves.toBe(false);
    expect(invoke).toHaveBeenCalledWith("lan_agent_check_internet");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("starts from an installed certificate without contacting the backend", async () => {
    invoke
      .mockResolvedValueOnce({
        deviceId: "device-1",
        devicePublicKey: "public-key",
        hasCertificate: true,
      })
      .mockResolvedValueOnce({
        running: true,
        deviceId: "device-1",
        peerCount: 0,
        networkAvailable: true,
      });

    await expect(lanAgent.enrollAndStart("device-1")).resolves.toMatchObject({
      running: true,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenNthCalledWith(2, "lan_agent_start");
  });

  it("enrolls a new identity before starting the agent", async () => {
    invoke
      .mockResolvedValueOnce({
        deviceId: "device-1",
        devicePublicKey: "public-key",
        hasCertificate: false,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        running: true,
        deviceId: "device-1",
        peerCount: 0,
        networkAvailable: true,
      });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ certificate: "certificate", caPublicKey: "ca-key" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    await lanAgent.enrollAndStart("device-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/lan-identity/certificate",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "lan_agent_install_certificate",
      { certificate: "certificate", caPublicKey: "ca-key" }
    );
    expect(invoke).toHaveBeenNthCalledWith(3, "lan_agent_start");
  });

  it("renews an unusable installed certificate", async () => {
    invoke
      .mockResolvedValueOnce({
        deviceId: "device-1",
        devicePublicKey: "public-key",
        hasCertificate: true,
      })
      .mockRejectedValueOnce(new Error("certificate expired"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        running: true,
        deviceId: "device-1",
        peerCount: 0,
        networkAvailable: true,
      });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ certificate: "renewed", caPublicKey: "ca-key" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(lanAgent.enrollAndStart("device-1")).resolves.toMatchObject({
      running: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith("lan_agent_start");
  });

  it("signs and sends a lock message to a peer via the native agent", async () => {
    invoke.mockResolvedValueOnce(undefined);

    await lanAgent.sendLockMessage("192.168.1.5", 45839, "/lock/request", {
      productId: "product-1",
    });

    expect(invoke).toHaveBeenCalledWith("lan_agent_send_lock_message", {
      address: "192.168.1.5",
      port: 45839,
      path: "/lock/request",
      payload: { productId: "product-1" },
    });
  });

  it("subscribes to native lock events through the Tauri event bridge", async () => {
    const listen = vi.fn().mockResolvedValue(() => {});
    vi.stubGlobal("window", {
      __TAURI__: { core: { invoke }, event: { listen } },
    });

    const handler = vi.fn();
    await lanAgent.onLockEvent("lan-lock-request-received", handler);

    expect(listen).toHaveBeenCalledWith(
      "lan-lock-request-received",
      expect.any(Function)
    );
    const nativeHandler = listen.mock.calls[0][1];
    nativeHandler({
      payload: { senderDeviceId: "device-2", payload: { productId: "p1" } },
    });
    expect(handler).toHaveBeenCalledWith({
      senderDeviceId: "device-2",
      payload: { productId: "p1" },
    });
  });

  it("returns a no-op unsubscribe when the native event bridge is unavailable", async () => {
    const unlisten = await lanAgent.onLockEvent(
      "lan-lock-response-received",
      vi.fn()
    );
    expect(() => unlisten()).not.toThrow();
  });
});
