import { useCallback, useEffect, useState } from "react";
import { classifyConnectivity } from "../lib/connectivity";
import { getInstallMode } from "../lib/installMode";
import { lanAgent } from "../lib/lanAgent";

export function useConnectivityStatus(
  nativeAgentAvailable: boolean,
  nativeNetworkAvailable: boolean
) {
  const [browserNetworkAvailable, setBrowserNetworkAvailable] = useState(
    () => navigator.onLine !== false
  );
  const [internetAvailable, setInternetAvailable] = useState(false);
  const [isCheckingInternet, setIsCheckingInternet] = useState(true);

  const checkInternet = useCallback(async () => {
    setIsCheckingInternet(true);
    try {
      setInternetAvailable(await lanAgent.checkInternet());
    } catch {
      setInternetAvailable(false);
    } finally {
      setIsCheckingInternet(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserNetworkAvailable(true);
      void checkInternet();
    };
    const handleOffline = () => {
      setBrowserNetworkAvailable(false);
      setInternetAvailable(false);
      setIsCheckingInternet(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void checkInternet();
    const timer = window.setInterval(checkInternet, 10_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(timer);
    };
  }, [checkInternet]);

  return {
    state: classifyConnectivity(
      nativeAgentAvailable ? nativeNetworkAvailable : browserNetworkAvailable,
      internetAvailable,
      getInstallMode() === "local"
    ),
    browserNetworkAvailable,
    internetAvailable,
    isCheckingInternet,
  };
}
