import {
  couchDocumentId,
  identityDatabaseName,
  publicDocumentId,
  tenantDatabaseName,
} from "./couchdb-naming";

describe("CouchDB database naming", () => {
  it("uses one identity database and one unified database per tenant", () => {
    expect(identityDatabaseName()).toBe("businessconnect_identity");
    expect(tenantDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
  });

  it("maps public UUIDs to typed CouchDB ids and back", () => {
    expect(couchDocumentId("product", "product-1")).toBe("product:product-1");
    expect(publicDocumentId("product:product-1", "product")).toBe("product-1");
  });

  it("does not double-prefix an already typed id", () => {
    expect(couchDocumentId("product", "product:product-1")).toBe(
      "product:product-1"
    );
  });
});
