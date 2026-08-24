const DEVICE_ID_STORAGE_KEY = "businessconnect_device_id";

function createDeviceId(): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return `device-${randomPart}`;
}

/**
 * Returns the stable identifier shared by offline storage and the native LAN
 * agent for this application profile.
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const deviceId = createDeviceId();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

const DEVICE_NAME_STORAGE_KEY = "businessconnect_device_name";

function createDeviceName(deviceId: string): string {
  const suffix = deviceId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();
  return `Caisse-${suffix}`;
}

/**
 * Returns a human-readable name for this device, shown to peers during LAN
 * edit-lock requests. Derived once from the device id and persisted; there
 * is no settings UI to rename it yet.
 */
export function getDeviceName(): string {
  const existing = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
  if (existing) return existing;

  const deviceName = createDeviceName(getDeviceId());
  localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
  return deviceName;
}
