import type { Category } from "@shared/schema";

/**
 * Calculate tax amount based on subtotal and tax rate
 * @param subtotal - The subtotal amount before tax
 * @param taxRate - The tax rate as a percentage (0-100)
 * @returns The calculated tax amount
 */
export const calculateTax = (subtotal: number, taxRate: number): number => {
  if (taxRate < 0 || taxRate > 100) {
    throw new Error("Tax rate must be between 0 and 100");
  }
  return (subtotal * taxRate) / 100;
};

/**
 * Calculate total amount including tax
 * @param subtotal - The subtotal amount before tax
 * @param taxRate - The tax rate as a percentage (0-100)
 * @returns The total amount including tax
 */
export const calculateTotal = (subtotal: number, taxRate: number): number => {
  const tax = calculateTax(subtotal, taxRate);
  return subtotal + tax;
};

/**
 * Get the applicable tax rate for a product/category
 * Uses category-specific tax rate if set, otherwise falls back to default
 * @param category - The category object (may have taxRate field)
 * @param defaultTaxRate - The default tax rate from settings
 * @returns The applicable tax rate
 */
export const getTaxRate = (
  category: Category | null | undefined,
  defaultTaxRate: number
): number => {
  // Use category tax rate if it exists and is a valid number
  if (category?.taxRate !== null && category?.taxRate !== undefined) {
    const categoryTaxRate =
      typeof category.taxRate === "string"
        ? parseFloat(category.taxRate)
        : category.taxRate;

    if (!isNaN(categoryTaxRate)) {
      return categoryTaxRate;
    }
  }

  // Fall back to default tax rate
  return defaultTaxRate;
};

/**
 * Calculate tax for multiple items with potentially different tax rates
 * @param items - Array of items with their amounts and tax rates
 * @returns Object with subtotal, total tax, and total amount
 */
export const calculateMultiItemTax = (
  items: Array<{ amount: number; taxRate: number }>
): { subtotal: number; tax: number; total: number } => {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tax = items.reduce(
    (sum, item) => sum + calculateTax(item.amount, item.taxRate),
    0
  );
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total,
  };
};

/**
 * Calculate the pre-tax price from a price that includes tax
 * @param priceWithTax - The price including tax
 * @param taxRate - The tax rate as a percentage (0-100)
 * @returns The price before tax
 */
export const calculatePriceBeforeTax = (
  priceWithTax: number,
  taxRate: number
): number => {
  return priceWithTax / (1 + taxRate / 100);
};

/**
 * Format tax rate for display
 * @param taxRate - The tax rate as a number
 * @returns Formatted tax rate string
 */
export const formatTaxRate = (taxRate: number): string => {
  return `${taxRate.toFixed(1)}%`;
};

/**
 * Calculate tax breakdown for a sale
 * Useful for generating receipts and reports
 * @param subtotal - The subtotal before tax
 * @param taxRate - The tax rate as a percentage
 * @returns Detailed breakdown of the sale
 */
export const calculateSaleBreakdown = (
  subtotal: number,
  taxRate: number
): {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  subtotalFormatted: string;
  taxAmountFormatted: string;
  totalFormatted: string;
} => {
  const taxAmount = calculateTax(subtotal, taxRate);
  const total = subtotal + taxAmount;

  return {
    subtotal,
    taxRate,
    taxAmount,
    total,
    subtotalFormatted: subtotal.toFixed(2),
    taxAmountFormatted: taxAmount.toFixed(2),
    totalFormatted: total.toFixed(2),
  };
};
