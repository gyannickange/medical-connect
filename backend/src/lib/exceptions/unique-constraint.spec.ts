import { ConflictException } from "@nestjs/common";
import {
  normalizeBarcode,
  normalizeUsername,
  translateUniqueViolation,
} from "./unique-constraint";

describe("unique constraint helpers", () => {
  it("normalizes usernames case-insensitively and trims whitespace", () => {
    expect(normalizeUsername("  Alice.Admin  ")).toBe("alice.admin");
  });

  it("trims barcodes, preserves case, and converts blanks to null", () => {
    expect(normalizeBarcode("  AbC-123  ")).toBe("AbC-123");
    expect(normalizeBarcode("   ")).toBeNull();
    expect(normalizeBarcode(undefined)).toBeUndefined();
  });

  it.each([
    ["products_tenant_barcode_unique", "barcode"],
    ["users_username_normalized_unique", "username"],
  ])(
    "translates %s to a safe stable conflict response",
    (constraint, field) => {
      const translated = translateUniqueViolation({
        code: "23505",
        constraint,
      });

      expect(translated).toBeInstanceOf(ConflictException);
      expect(translated?.getResponse()).toEqual({
        statusCode: 409,
        message: `${field === "barcode" ? "Barcode" : "Username"} already exists`,
        code: "DUPLICATE_VALUE",
        field,
      });
    },
  );

  it("does not translate unrelated database errors", () => {
    expect(translateUniqueViolation({ code: "23503" })).toBeUndefined();
    expect(
      translateUniqueViolation({ code: "23505", constraint: "other_unique" }),
    ).toBeUndefined();
  });

  it("recognizes wrapped PostgreSQL errors", () => {
    const translated = translateUniqueViolation({
      cause: {
        code: "23505",
        constraint: "products_tenant_barcode_unique",
      },
    });

    expect(translated?.getStatus()).toBe(409);
  });
});
