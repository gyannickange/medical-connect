import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyOfflineMutationToQueryCache } from "./offlineQueryCache";

describe("offline React Query cache", () => {
  it("shows an offline-created entity in the active tenant table immediately", () => {
    const queryClient = new QueryClient();
    const listKey = ["/api/customers", "tenant-1"];
    const otherTenantKey = ["/api/customers", "tenant-2"];
    queryClient.setQueryData(listKey, [{ id: "customer-1", firstName: "Ada" }]);
    queryClient.setQueryData(otherTenantKey, []);

    applyOfflineMutationToQueryCache(queryClient, {
      collection: "customers",
      method: "POST",
      entity: {
        id: "offline-customer",
        tenantId: "tenant-1",
        firstName: "Grace",
        lastName: "Hopper",
        _offlinePending: true,
      },
    });

    expect(queryClient.getQueryData(listKey)).toEqual([
      { id: "customer-1", firstName: "Ada" },
      expect.objectContaining({
        id: "offline-customer",
        firstName: "Grace",
        _offlinePending: true,
      }),
    ]);
    expect(queryClient.getQueryData(otherTenantKey)).toEqual([]);
  });

  it("merges an offline edit into the existing table row", () => {
    const queryClient = new QueryClient();
    const listKey = ["/api/customers", "tenant-1"];
    queryClient.setQueryData(listKey, [
      { id: "customer-1", firstName: "Before", phone: "123" },
    ]);

    applyOfflineMutationToQueryCache(queryClient, {
      collection: "customers",
      method: "PUT",
      entity: {
        id: "customer-1",
        tenantId: "tenant-1",
        firstName: "After",
        _offlinePending: true,
      },
    });

    expect(queryClient.getQueryData(listKey)).toEqual([
      {
        id: "customer-1",
        tenantId: "tenant-1",
        firstName: "After",
        phone: "123",
        _offlinePending: true,
      },
    ]);
  });
});
