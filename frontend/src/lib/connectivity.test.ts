import { describe, expect, it } from "vitest";
import { classifyConnectivity } from "./connectivity";

describe("three-state connectivity", () => {
  it("is green when Internet is reachable", () => {
    expect(classifyConnectivity(true, true)).toBe("internet");
  });

  it("is orange when a network exists without Internet", () => {
    expect(classifyConnectivity(true, false)).toBe("lan");
  });

  it("is red when neither Internet nor a local network is available", () => {
    expect(classifyConnectivity(false, false)).toBe("offline");
  });

  it("converges across a LAN cut and reconnection", () => {
    const states = [
      classifyConnectivity(true, false),
      classifyConnectivity(false, false),
      classifyConnectivity(true, false),
    ];

    expect(states).toEqual(["lan", "offline", "lan"]);
  });

  it("is local for a local install regardless of real connectivity", () => {
    expect(classifyConnectivity(true, true, true)).toBe("local");
    expect(classifyConnectivity(false, false, true)).toBe("local");
  });
});
