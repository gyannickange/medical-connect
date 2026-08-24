import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId, getDeviceName } from "../lib/deviceIdentity";
import { lanAgent } from "../lib/lanAgent";
import {
  acquireOrRenewProductLock,
  decideLockAction,
  getProductLock,
  releaseProductLock,
} from "../lib/productLock";

const RENEWAL_INTERVAL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;

export type ProductLockState =
  | "idle"
  | "checking"
  | "granted"
  | "requesting"
  | "refused"
  | "timeout"
  | "unreachable"
  | "error";

interface LockResponsePayload {
  productId: string;
  granted: boolean;
}

interface UseProductLockResult {
  state: ProductLockState;
  holderName: string | null;
  retry: () => void;
}

/**
 * Drives the edit-lock state machine for a single product while a modal has
 * it open for editing. See docs/superpowers/specs/2026-08-11-lan-edit-lock-design.md
 * section 4 for the acquire / request / unreachable cases this implements.
 */
export function useProductLock(
  tenantId: string | undefined,
  productId: string | undefined,
  isActive: boolean
): UseProductLockResult {
  const [state, setState] = useState<ProductLockState>("idle");
  const [holderName, setHolderName] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const heldRef = useRef(false);
  const grantedProductIdRef = useRef<string | null>(null);
  const pendingRequestRef = useRef<{ timeoutId: number; stop: () => void } | null>(null);

  useEffect(() => {
    if (!isActive || !tenantId || !productId) {
      setState("idle");
      return;
    }

    let cancelled = false;
    heldRef.current = false;
    grantedProductIdRef.current = null;
    setState("checking");
    setHolderName(null);

    const disposePendingRequest = () => {
      const pending = pendingRequestRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timeoutId);
      pending.stop();
      pendingRequestRef.current = null;
    };

    const run = async () => {
      const myDeviceId = getDeviceId();
      try {
        const existing = await getProductLock(tenantId, productId);
        if (cancelled) return;

        const peers = await lanAgent.getPeers();
        if (cancelled) return;
        const decision = decideLockAction(existing, myDeviceId, peers);

        if (decision.kind === "acquire") {
          await acquireOrRenewProductLock(productId, myDeviceId, getDeviceName());
          if (cancelled) {
            void releaseProductLock(productId, myDeviceId).catch(() => {});
            return;
          }
          heldRef.current = true;
          grantedProductIdRef.current = productId;
          setState("granted");
          return;
        }

        if (decision.kind === "unreachable") {
          setHolderName(decision.holderName);
          setState("unreachable");
          return;
        }

        setHolderName(decision.holderName);
        setState("requesting");

        const timeoutId = window.setTimeout(() => {
          disposePendingRequest();
          if (!cancelled) setState("timeout");
        }, REQUEST_TIMEOUT_MS);

        const stop = await lanAgent.onLockEvent<LockResponsePayload>(
          "lan-lock-response-received",
          (event) => {
            if (event.payload.productId !== productId) return;
            disposePendingRequest();
            if (cancelled) return;

            if (!event.payload.granted) {
              setState("refused");
              return;
            }
            acquireOrRenewProductLock(productId, myDeviceId, getDeviceName())
              .then(() => {
                if (cancelled) {
                  void releaseProductLock(productId, myDeviceId).catch(() => {});
                  return;
                }
                heldRef.current = true;
                grantedProductIdRef.current = productId;
                setState("granted");
              })
              .catch(() => {
                if (!cancelled) setState("error");
              });
          }
        );

        if (cancelled) {
          window.clearTimeout(timeoutId);
          stop();
          return;
        }
        pendingRequestRef.current = { timeoutId, stop };

        await lanAgent.sendLockMessage(
          decision.address,
          decision.port,
          "/lock/request",
          {
            productId,
            requesterId: myDeviceId,
            requesterName: getDeviceName(),
          }
        );
      } catch {
        if (!cancelled) setState("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
      disposePendingRequest();
      if (heldRef.current) {
        void releaseProductLock(productId, getDeviceId()).catch(() => {});
        heldRef.current = false;
        grantedProductIdRef.current = null;
      }
    };
  }, [isActive, tenantId, productId, attempt]);

  useEffect(() => {
    if (state !== "granted") return;
    const lockedProductId = grantedProductIdRef.current;
    if (!lockedProductId) return;

    let stopped = false;
    const timer = window.setInterval(() => {
      void acquireOrRenewProductLock(lockedProductId, getDeviceId(), getDeviceName()).catch(
        () => {
          if (!stopped) setState("error");
        }
      );
    }, RENEWAL_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [state]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, holderName, retry };
}
