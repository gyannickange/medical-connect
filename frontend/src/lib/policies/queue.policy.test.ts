import { describe, expect, it } from "vitest";
import { QueuePolicy } from "./queue.policy";

describe("QueuePolicy", () => {
  it("admin always passes regardless of the matrix", () => {
    const policy = new QueuePolicy("admin", { queue: { view: false, appendEvent: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canAppendEvent()).toBe(true);
  });

  it("canView and canAppendEvent read their own entries independently", () => {
    const policy = new QueuePolicy("accueil", { queue: { view: true, appendEvent: false } } as any);
    expect(policy.canView()).toBe(true);
    expect(policy.canAppendEvent()).toBe(false);
  });
});
