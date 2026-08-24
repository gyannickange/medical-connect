import type { PurchaseEntry, SellingPriceEntry } from "@shared/schema";

export function resolveCurrentSellingPrice(
  sellingPrices: SellingPriceEntry[] | undefined,
  variantId: string | null,
  fallback: string
): string {
  const now = Date.now();
  const candidates = (sellingPrices ?? [])
    .filter((entry) => (entry.variantId ?? null) === variantId)
    .filter((entry) => new Date(entry.effectiveAt).getTime() <= now)
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
  return candidates[0] ? String(candidates[0].price) : fallback;
}

export function sortSellingPricesDesc(entries: SellingPriceEntry[]): SellingPriceEntry[] {
  return [...entries].sort((a, b) => {
    const byEffectiveAt = new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime();
    if (byEffectiveAt !== 0) return byEffectiveAt;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function sortPurchasesDesc(entries: PurchaseEntry[]): PurchaseEntry[] {
  return [...entries].sort((a, b) => {
    const byPurchaseDate = new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
    if (byPurchaseDate !== 0) return byPurchaseDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
