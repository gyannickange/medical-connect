import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { refetchLanSharedData } from "./lanSharedRefresh";

describe("LAN shared data refresh", () => {
  it("refreshes every active view affected by a stock transaction", async () => {
    const refetchQueries = vi.fn().mockResolvedValue(undefined);

    await refetchLanSharedData({ refetchQueries } as unknown as QueryClient);

    expect(refetchQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["/api/products"],
      ["/api/stock"],
      ["/api/dashboard"],
      ["/api/sales"],
    ]);
  });
});
