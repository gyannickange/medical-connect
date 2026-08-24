import { z } from "zod";
import type { CurrencyFormatOptions } from "@/hooks/useSettings";

export const initialSetupSchema = z.object({
  companyName: z.string().trim().min(1),
  companyPhone: z.string(),
  companyEmail: z.string().email().or(z.literal("")),
  companyWebsite: z.string(),
  companyAddress: z.string(),
  defaultCurrency: z.string().min(1),
  decimalSeparator: z.enum([".", ","]),
  thousandSeparator: z.enum(["none", ",", ".", " "]),
  decimalPlaces: z.number().int().min(0).max(4),
  symbolPosition: z.enum(["before", "after"]),
  defaultTaxRate: z.number().min(0).max(100),
  autoPrintReceipt: z.boolean(),
  receiptFormat: z.enum(["retail", "invoice"]),
});

export type InitialSetupValues = z.infer<typeof initialSetupSchema>;

const defaultCurrencyFormat: CurrencyFormatOptions = {
  decimalSeparator: ",",
  thousandSeparator: ".",
  decimalPlaces: 2,
  symbolPosition: "after",
};

export const initialSetupDefaults: InitialSetupValues = {
  companyName: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  companyAddress: "",
  defaultCurrency: "XOF",
  ...defaultCurrencyFormat,
  defaultTaxRate: 20,
  autoPrintReceipt: true,
  receiptFormat: "retail",
};

export function initialSetupCompleted(value: unknown): boolean {
  return value === true || value === "true";
}

export function shouldShowInitialSetupLoader(input: {
  authLoading: boolean;
  authenticated: boolean;
  tenantLoading: boolean;
  tenantReady: boolean;
  settingsLoading: boolean;
}): boolean {
  if (input.authLoading) return true;
  if (!input.authenticated) return false;

  return input.tenantLoading || !input.tenantReady || input.settingsLoading;
}

export function nextInitialSetupLocation(input: {
  authenticated: boolean;
  tenantReady: boolean;
  settingsReady: boolean;
  completed: boolean;
  location: string;
}): string | null {
  if (!input.authenticated || !input.tenantReady || !input.settingsReady) {
    return null;
  }
  if (!input.completed && input.location !== "/initial-setup") {
    return "/initial-setup";
  }
  if (input.completed && input.location === "/initial-setup") {
    return "/";
  }
  return null;
}

type UpdateSetting = (
  key: string,
  value: unknown,
  options?: { category?: string; dataType?: string },
) => Promise<void>;

export async function persistInitialSetup(
  values: InitialSetupValues,
  updateSetting: UpdateSetting,
): Promise<void> {
  const writes: Array<[string, unknown, string]> = [
    ["companyName", values.companyName.trim(), "company"],
    ["companyPhone", values.companyPhone.trim(), "company"],
    ["companyEmail", values.companyEmail.trim(), "company"],
    ["companyWebsite", values.companyWebsite.trim(), "company"],
    ["companyAddress", values.companyAddress.trim(), "company"],
    ["defaultCurrency", values.defaultCurrency, "system"],
    ["currencyDecimalSeparator", values.decimalSeparator, "system"],
    ["currencyThousandSeparator", values.thousandSeparator, "system"],
    ["currencyDecimalPlaces", values.decimalPlaces, "system"],
    ["currencySymbolPosition", values.symbolPosition, "system"],
    ["defaultTaxRate", values.defaultTaxRate, "system"],
    ["autoPrintReceipt", values.autoPrintReceipt, "system"],
    ["receiptFormat", values.receiptFormat, "system"],
  ];

  // Sequential, not Promise.all: on a fresh local install there is no
  // cached settings list yet, and offlineCache.ts's upsertCachedEntity seeds
  // one on the first write for a collection - concurrent first writes would
  // all observe "no cache doc yet" and race to seed it, each overwriting the
  // others' entries instead of merging (that seed path replaces the whole
  // doc, unlike the merge path used once a doc already exists).
  for (const [key, value, category] of writes) {
    await updateSetting(key, value, { category });
  }
  await updateSetting("initialSetupCompleted", true, {
    category: "system",
    dataType: "boolean",
  });
}
