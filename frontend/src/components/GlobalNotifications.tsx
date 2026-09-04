import { useNotificationSignal } from "../hooks/useNotificationSignal";

/**
 * Global component that turns newly-synced notification documents into
 * native OS toasts. Should be mounted once, high in the component tree,
 * alongside GlobalOfflineSync.
 */
export const GlobalNotifications: React.FC = () => {
  useNotificationSignal();
  return null;
};
