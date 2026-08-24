import type {
  OfflineOperationDocument,
  OfflineOperationDraft,
} from "./offlineOperationQueue";

export type OfflineStorageHandler = (
  operation: OfflineOperationDraft
) => Promise<OfflineOperationDocument | void>;

let saveHandler: OfflineStorageHandler | null = null;

export function setOfflineStorageHandler(
  saveFunction: OfflineStorageHandler | null
) {
  saveHandler = saveFunction;
  if (typeof window !== "undefined") {
    (window as any).__saveToOfflineStorage = saveFunction;
  }
}

export function getOfflineStorageHandler() {
  return saveHandler;
}
