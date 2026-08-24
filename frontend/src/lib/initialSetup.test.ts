import { describe, expect, it, vi } from "vitest";
import {
  initialSetupSchema,
  initialSetupDefaults,
  nextInitialSetupLocation,
  persistInitialSetup,
  shouldShowInitialSetupLoader,
} from "./initialSetup";

describe("initial setup", () => {
  it("requires only a non-blank company name from company identity", () => {
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "   ",
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      companyAddress: "",
    }).success).toBe(true);
  });

  it("rejects invalid optional email, tax and decimal values", () => {
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      companyEmail: "pas-un-email",
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      defaultTaxRate: 101,
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      decimalPlaces: 5,
    }).success).toBe(false);
  });

  it("redirects authenticated incomplete tenants to setup", () => {
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: false,
      location: "/products",
    })).toBe("/initial-setup");
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: true,
      location: "/products",
    })).toBeNull();
  });

  it("leaves setup only after completion", () => {
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: false,
      location: "/initial-setup",
    })).toBeNull();
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: true,
      location: "/initial-setup",
    })).toBe("/");
  });

  it.each([
    {
      phase: "authentication",
      input: {
        authLoading: true,
        authenticated: false,
        tenantLoading: false,
        tenantReady: false,
        settingsLoading: false,
      },
    },
    {
      phase: "tenant",
      input: {
        authLoading: false,
        authenticated: true,
        tenantLoading: true,
        tenantReady: false,
        settingsLoading: false,
      },
    },
    {
      phase: "settings",
      input: {
        authLoading: false,
        authenticated: true,
        tenantLoading: false,
        tenantReady: true,
        settingsLoading: true,
      },
    },
  ])("blocks children while $phase is loading", ({ input }) => {
    expect(shouldShowInitialSetupLoader(input)).toBe(true);
  });

  it("renders children after readiness or resolved unauthenticated auth", () => {
    expect(shouldShowInitialSetupLoader({
      authLoading: false,
      authenticated: true,
      tenantLoading: false,
      tenantReady: true,
      settingsLoading: false,
    })).toBe(false);
    expect(shouldShowInitialSetupLoader({
      authLoading: false,
      authenticated: false,
      tenantLoading: false,
      tenantReady: false,
      settingsLoading: false,
    })).toBe(false);
  });

  it("writes the completion marker only after every business setting", async () => {
    const calls: string[] = [];
    const updateSetting = vi.fn(async (key: string) => {
      calls.push(key);
    });

    await persistInitialSetup(
      { ...initialSetupDefaults, companyName: "Kima" },
      updateSetting,
    );

    expect(calls.at(-1)).toBe("initialSetupCompleted");
    expect(calls).toContain("companyName");
    expect(calls).toContain("receiptFormat");
  });

  it("does not write completion when a setting fails", async () => {
    const calls: string[] = [];
    const updateSetting = vi.fn(async (key: string) => {
      calls.push(key);
      if (key === "defaultTaxRate") throw new Error("save failed");
    });

    await expect(persistInitialSetup(
      { ...initialSetupDefaults, companyName: "Kima" },
      updateSetting,
    )).rejects.toThrow("save failed");
    expect(calls).not.toContain("initialSetupCompleted");
  });
});
