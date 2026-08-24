import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/offlineApiRequest", () => ({
  offlineApiRequest: vi.fn(),
  isSavedOfflineResponse: (response: unknown) =>
    typeof response === "object" &&
    response !== null &&
    "_savedOffline" in response &&
    response._savedOffline === true,
}));

import { offlineApiRequest } from "@/lib/offlineApiRequest";
import {
  createOfflineDeleteMutationOptions,
  type OfflineDeleteConfig,
} from "./useOfflineDeleteMutation";

const entities = ["products", "staff", "customers", "categories", "suppliers"];

function config(collection: string): OfflineDeleteConfig {
  return {
    collection,
    queryKey: [`/api/${collection}`],
    entityUrl: (id) => `/api/${collection}/${id}`,
    messages: {
      online: `${collection} deleted online`,
      queued: `${collection} deletion queued offline`,
      error: `${collection} delete failed`,
      successTitle: "Success",
      queuedTitle: "Saved Offline",
      errorTitle: "Error",
    },
  };
}

describe.each(entities)("%s offline delete integration", (collection) => {
  let queryClient: QueryClient;
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient();
    notify = vi.fn();
    vi.clearAllMocks();
  });

  it("sends DELETE to the exact entity URL without reading a 204 body", async () => {
    const response = { status: 204, json: vi.fn() } as unknown as Response;
    vi.mocked(offlineApiRequest).mockResolvedValue(response);
    const options = createOfflineDeleteMutationOptions(
      config(collection), queryClient, notify
    );

    await expect(options.mutationFn("entity-7")).resolves.toBe(response);
    expect(offlineApiRequest).toHaveBeenCalledWith(
      "DELETE", `/api/${collection}/entity-7`, undefined,
      { collection, entityId: "entity-7" }
    );
    expect(response.json).not.toHaveBeenCalled();
  });

  it("optimistically hides the row and reports queued-offline success", async () => {
    const key = [`/api/${collection}`, "tenant-1"];
    queryClient.setQueryData(key, [{ id: "entity-7" }, { id: "entity-8" }]);
    const options = createOfflineDeleteMutationOptions(
      config(collection), queryClient, notify
    );
    await options.onMutate("entity-7");
    options.onSuccess({ _savedOffline: true }, "entity-7");

    expect(queryClient.getQueryData(key)).toEqual([{ id: "entity-8" }]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      description: `${collection} deletion queued offline`,
    }));
  });

  it("restores the row and shows an error when enqueue/delete fails", async () => {
    const key = [`/api/${collection}`, "tenant-1"];
    const rows = [{ id: "entity-7" }, { id: "entity-8" }];
    queryClient.setQueryData(key, rows);
    const options = createOfflineDeleteMutationOptions(
      config(collection), queryClient, notify
    );
    const context = await options.onMutate("entity-7");
    await options.onError(new Error("queue unavailable"), "entity-7", context);

    expect(queryClient.getQueryData(key)).toEqual(rows);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      description: "queue unavailable", variant: "destructive",
    }));
  });

  it("shows online success and invalidates the collection", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const options = createOfflineDeleteMutationOptions(
      config(collection), queryClient, notify
    );
    const response = { status: 204 } as Response;
    options.onSuccess(response, "entity-7");
    await options.onSettled(response, null);

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      description: `${collection} deleted online`,
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [`/api/${collection}`] });
  });
});
