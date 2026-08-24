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

  it("7. Customers save/delete uses normalized error toast", () => {
    expectNormalizedMutationErrors("../pages/Customers.tsx");
    expect(source("../pages/Customers.tsx")).toContain("useOfflineDeleteMutation");
  });

  it("8. Categories save/delete uses normalized error toast", () => {
    expectNormalizedMutationErrors("../pages/Categories.tsx");
    expect(source("../pages/Categories.tsx")).toContain("useOfflineDeleteMutation");
  });

  it("9. Suppliers save/delete uses normalized error toast", () => {
    expectNormalizedMutationErrors("../pages/Suppliers.tsx");
    expect(source("../pages/Suppliers.tsx")).toContain("useOfflineDeleteMutation");
  });

  it("10. Products, variants, and pricing mutations use normalized error toast", () => {
    expectNormalizedMutationErrors("../components/ProductModal.tsx");
    expectNormalizedMutationErrors("../components/ProductVariants.tsx");
    expectNormalizedMutationErrors("../components/ProductPricing.tsx");
    expect(source("../pages/Products.tsx")).toContain("useOfflineDeleteMutation");
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
      "customerDeleteQueuedOffline",
      "categorySavedOffline",
      "categoryDeleteQueuedOffline",
      "supplierDeleteQueuedOffline",
      "productDeleteQueuedOffline",
    ] as const;

    const english = translations.en as Record<string, string>;
    const french = translations.fr as Record<string, string>;

    for (const key of keys) {
      expect(english[key]).toBeTruthy();
      expect(french[key]).toBeTruthy();
    }
  });
});
