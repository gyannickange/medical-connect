import type { Product, ProductPricing, ProductVariant, SellingPriceEntry } from "@shared/schema";

// The backend embeds `variants`/`pricingRules` on every product document and
// already ships them in the /api/products list response, but the shared
// `Product` type doesn't declare them (they're modeled as separate
// endpoints/types). This is the runtime shape actually available offline.
export type ProductWithPricing = Product & {
  variants?: ProductVariant[];
  pricingRules?: ProductPricing[];
  sellingPrices?: SellingPriceEntry[];
};

export interface ResolvedPrice {
  price: string;
  rule?: ProductPricing;
}

const PRICE_TYPE_PRIORITY: Record<string, number> = {
  promotional: 1,
  bulk: 2,
  wholesale: 3,
  retail: 4,
};

function resolveCurrentSellingPrice(
  sellingPrices: SellingPriceEntry[] | undefined,
  variantId: string | undefined,
  fallback: string
): string {
  const now = Date.now();
  const candidates = (sellingPrices ?? [])
    .filter((entry) => (entry.variantId ?? undefined) === variantId)
    .filter((entry) => new Date(entry.effectiveAt).getTime() <= now)
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
  return candidates[0] ? String(candidates[0].price) : fallback;
}

/**
 * Mirrors backend/src/modules/products/products.repository.ts's
 * calculateProductPrice exactly, operating on the product's already-replicated
 * `pricingRules`/`variants` instead of a network call. Keeping this in sync
 * with the backend algorithm is what makes an offline-computed sale total
 * match what SalesService.resolveAndVerify recomputes on sync.
 */
export function resolveProductPrice(
  product: ProductWithPricing,
  quantity: number,
  variantId?: string,
  priceType?: string
): ResolvedPrice {
  const variant = variantId
    ? (product.variants ?? []).find((v) => v.id === variantId)
    : undefined;

  const now = Date.now();
  const rules = (product.pricingRules ?? [])
    .filter((rule) => {
      if (rule.isActive === false) return false;
      if (priceType && rule.priceType !== priceType) return false;
      if (rule.variantId && rule.variantId !== variantId) return false;
      if (!variantId && rule.variantId) return false;
      if (quantity < Number(rule.minQuantity ?? 1)) return false;
      if (rule.maxQuantity != null && quantity > Number(rule.maxQuantity)) return false;
      if (rule.validFrom && new Date(rule.validFrom).getTime() > now) return false;
      if (rule.validTo && new Date(rule.validTo).getTime() < now) return false;
      return true;
    })
    .sort((a, b) => {
      const typeOrder =
        (PRICE_TYPE_PRIORITY[a.priceType] ?? 5) - (PRICE_TYPE_PRIORITY[b.priceType] ?? 5);
      if (typeOrder !== 0) return typeOrder;
      if (variantId && Boolean(a.variantId) !== Boolean(b.variantId)) {
        return a.variantId ? -1 : 1;
      }
      return Number(b.price) - Number(a.price);
    });

  if (rules[0]) {
    return { price: String(rules[0].price), rule: rules[0] };
  }
  const fallback = String(variant?.price ?? product.price);
  return { price: resolveCurrentSellingPrice(product.sellingPrices, variantId, fallback) };
}
