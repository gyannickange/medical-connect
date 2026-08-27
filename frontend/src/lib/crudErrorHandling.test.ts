import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translations } from "./i18n";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

function expectNormalizedMutationErrors(relativePath: string) {
  const contents = source(relativePath);
  expect(contents).toContain("showApiErrorToast");
  expect(contents).toMatch(/onError:\s*\(error: unknown\)/);
}

describe("scoped CRUD error handling", () => {
  it("6. Staff save/delete uses normalized error toast", () => {
    const contents = source("../pages/Staff.tsx");
    expectNormalizedMutationErrors("../pages/Staff.tsx");
    expect(contents).toContain("useOfflineDeleteMutation");
    expect(contents).not.toContain("console.log");
  });

  it("11. queued offline success is not rendered as an error", () => {
    const offlineRequest = source("./offlineApiRequest.ts");
    expect(offlineRequest).toContain('response._savedOffline === true');
    const deleteHook = source("../hooks/useOfflineDeleteMutation.ts");
    expect(deleteHook).toContain("queued ? config.messages.queued");
    expect(deleteHook).toContain('variant: "success"');
  });

  it("12. English and French keys exist for every new CRUD/offline/conflict message", () => {
    const keys = [
      "networkRequestFailed",
      "staffSavedOffline",
      "staffDeleteQueuedOffline",
    ] as const;

    const english = translations.en as Record<string, string>;
    const french = translations.fr as Record<string, string>;

    for (const key of keys) {
      expect(english[key]).toBeTruthy();
      expect(french[key]).toBeTruthy();
    }
  });
});
