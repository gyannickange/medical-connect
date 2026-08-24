export interface SaleTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Computes tax and the tax-inclusive total from a cart's pre-tax subtotal
 * (the sum of each item's unitPrice * quantity). `preTaxSubtotal` must be
 * tax-exclusive — this matches how the backend recomputes and verifies sale
 * totals in the backend sales ledger.
 */
export function computeSaleTotals(
  preTaxSubtotal: number,
  taxRate = 0.2
): SaleTotals {
  const subtotal = parseFloat(preTaxSubtotal.toFixed(2));
  const tax = parseFloat((subtotal * taxRate).toFixed(2));
  const total = parseFloat((subtotal + tax).toFixed(2));
  return { subtotal, tax, total };
}
