import { useEffect, useRef, useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { useTranslation } from "../lib/i18n";
import { getDeviceId } from "../lib/deviceIdentity";
import { lanAgent } from "../lib/lanAgent";
import { getProductLock, releaseProductLock } from "../lib/productLock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface IncomingLockRequest {
  productId: string;
  requesterId: string;
  requesterName: string;
}

async function respondToRequest(
  request: IncomingLockRequest,
  granted: boolean
): Promise<void> {
  if (granted) {
    await releaseProductLock(request.productId, getDeviceId()).catch(() => {});
  }
  const peers = await lanAgent.getPeers();
  const requesterPeer = peers.find((peer) => peer.deviceId === request.requesterId);
  if (!requesterPeer || requesterPeer.addresses.length === 0) return;
  await lanAgent
    .sendLockMessage(requesterPeer.addresses[0], requesterPeer.port, "/lock/response", {
      productId: request.productId,
      granted,
    })
    .catch(() => {});
}

/**
 * Listens for peer-to-peer edit-lock requests (design spec section 4.2) and
 * lets this device's user accept or refuse them, regardless of which screen
 * is open. Mounted once in App.tsx alongside GlobalNativeLANAgent.
 *
 * Incoming requests are queued (not single-slot) so two requests for
 * different products arriving close together both get shown, one after the
 * other, instead of the second silently replacing the first.
 */
export function GlobalProductLockRequests() {
  const { currentTenant } = useTenant();
  const { t } = useTranslation();
  const [current, setCurrent] = useState<IncomingLockRequest | null>(null);
  const queueRef = useRef<IncomingLockRequest[]>([]);
  const decidedRef = useRef(false);

  // Radix's AlertDialogAction/AlertDialogCancel both close the dialog via
  // the same internal mechanism that fires onOpenChange, in addition to
  // their own onClick - so a single click on either button synchronously
  // calls decide() twice (once from onClick, once from onOpenChange) in the
  // same event-handling stack, before React re-renders. Resetting this ref
  // in an effect keyed on `current` (which only runs after that render
  // commits) means both same-tick calls see it as "already decided" and the
  // second is a no-op, while a later click for the *next* queued request is
  // unaffected.
  useEffect(() => {
    decidedRef.current = false;
  }, [current]);

  useEffect(() => {
    if (!currentTenant) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    lanAgent
      .onLockEvent<IncomingLockRequest>("lan-lock-request-received", (event) => {
        const request = event.payload;
        void getProductLock(currentTenant.id, request.productId).then((holding) => {
          if (cancelled) return;
          if (!holding || holding.deviceId !== getDeviceId()) {
            void respondToRequest(request, true);
            return;
          }
          queueRef.current.push(request);
          setCurrent((existing) => existing ?? queueRef.current.shift() ?? null);
        });
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [currentTenant?.id]);

  const decide = (granted: boolean) => {
    if (!current || decidedRef.current) return;
    decidedRef.current = true;
    void respondToRequest(current, granted);
    setCurrent(queueRef.current.shift() ?? null);
  };

  if (!current) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && decide(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("lockRequestTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {current.requesterName} {t("lockRequestDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => decide(false)}>
            {t("refuse")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => decide(true)}>
            {t("authorize")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
