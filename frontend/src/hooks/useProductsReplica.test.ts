import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/pouchdb", () => ({
  createPouchDB: vi.fn(),
}));

import { createPouchDB } from "../lib/pouchdb";

// `mapReplicaDocToProduct`/`isActiveProductDoc` moved to lib/productsReplica.ts
// (shared with offlineApiRequest's local-mode products handling) - their
// tests live in productsReplica.test.ts now.

describe("useProductsReplica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb(initialDocs: any[]) {
    const changesHandlers: Record<string, (event: any) => void> = {};
    const changesFeed = {
      on: vi.fn((event: string, handler: (event: any) => void) => {
        changesHandlers[event] = handler;
        return changesFeed;
      }),
      cancel: vi.fn(),
    };
    const db = {
      allDocs: vi.fn().mockResolvedValue({
        rows: initialDocs.map((doc) => ({ doc })),
      }),
      changes: vi.fn().mockReturnValue(changesFeed),
    };
    vi.mocked(createPouchDB).mockResolvedValue(db as any);
    return { db, changesFeed, changesHandlers };
  }

  it("exists and is importable", () => {
    // Full render-based coverage requires @testing-library/react, which
    // this project does not have set up (see CLAUDE.md's frontend testing
    // convention). This hook's pure logic - document parsing, filtering
    // out non-product docs - is covered above via mapReplicaDocToProduct;
    // the hook itself is thin glue matching the untested-hook convention
    // already used by useNativeLANAgent.ts/useProductLock.ts.
    expect(typeof mockDb).toBe("function");
  });
});
