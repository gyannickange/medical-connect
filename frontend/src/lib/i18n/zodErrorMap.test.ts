import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// `t()` reads the current language via getLanguage(), which reads
// localStorage - stub it so this test can set the language explicitly.
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: () => null,
  length: 0,
});

const { installZodErrorMap } = await import("./zodErrorMap");
const { setLanguage } = await import("./index");

installZodErrorMap();

function firstError(result: z.SafeParseReturnType<unknown, unknown>): string {
  if (result.success) throw new Error("expected parse to fail");
  return result.error.issues[0].message;
}

describe("zodErrorMap", () => {
  beforeEach(() => {
    setLanguage("fr");
  });

  it("translates a required string field", () => {
    const schema = z.object({ name: z.string().min(1) });
    expect(firstError(schema.safeParse({ name: "" }))).toBe("Ce champ est requis");

    setLanguage("en");
    expect(firstError(schema.safeParse({ name: "" }))).toBe("This field is required");
  });

  it("translates a missing (undefined) required field the same as an empty string", () => {
    const schema = z.object({ name: z.string() });
    expect(firstError(schema.safeParse({}))).toBe("Ce champ est requis");
  });

  it("translates a minimum-length string message with the actual minimum", () => {
    const schema = z.object({ code: z.string().min(5) });
    expect(firstError(schema.safeParse({ code: "ab" }))).toBe(
      "Doit contenir au moins 5 caractères"
    );
  });

  it("translates a maximum-length string message", () => {
    const schema = z.object({ code: z.string().max(3) });
    expect(firstError(schema.safeParse({ code: "abcdef" }))).toBe(
      "Doit contenir au plus 3 caractères"
    );
  });

  it("translates a minimum number message", () => {
    const schema = z.object({ quantity: z.number().min(1) });
    expect(firstError(schema.safeParse({ quantity: 0 }))).toBe("Doit être au moins 1");
  });

  it("translates an invalid email message", () => {
    const schema = z.object({ email: z.string().email() });
    expect(firstError(schema.safeParse({ email: "not-an-email" }))).toBe(
      "Adresse email invalide"
    );
  });

  it("translates an invalid enum selection", () => {
    const schema = z.object({ role: z.enum(["admin", "manager"]) });
    expect(firstError(schema.safeParse({ role: "ceo" }))).toBe("Sélection invalide");
  });

  it("translates a minimum-array-length message", () => {
    const schema = z.object({ attributes: z.array(z.string()).min(1) });
    expect(firstError(schema.safeParse({ attributes: [] }))).toBe(
      "Sélectionnez au moins 1"
    );
  });

  it("reflects a language change on the very next validation, with no re-registration", () => {
    const schema = z.object({ name: z.string().min(1) });
    setLanguage("en");
    expect(firstError(schema.safeParse({ name: "" }))).toBe("This field is required");
    setLanguage("fr");
    expect(firstError(schema.safeParse({ name: "" }))).toBe("Ce champ est requis");
  });
});
