export interface FormatOptions {
  decimalSeparator?: "." | ",";
  thousandSeparator?: "," | "." | " " | "none";
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Format a number with custom separators and decimal places
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted number string
 */
export const formatNumber = (
  value: number | string,
  options: FormatOptions = {}
): string => {
  const {
    decimalSeparator = ".",
    thousandSeparator = ",",
    decimalPlaces = 2,
    prefix = "",
    suffix = "",
  } = options;

  // Convert to number if string
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  // Handle invalid numbers
  if (isNaN(numValue)) {
    return "0";
  }

  // Split into integer and decimal parts
  const [integerPart, decimalPart] = numValue.toFixed(decimalPlaces).split(".");

  // Add thousand separators to integer part
  let formattedInteger = integerPart;
  if (thousandSeparator && thousandSeparator !== "none") {
    formattedInteger = integerPart.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      thousandSeparator
    );
  }

  // Combine parts with custom decimal separator
  let result = formattedInteger;
  if (decimalPlaces > 0 && decimalPart) {
    result = `${formattedInteger}${decimalSeparator}${decimalPart}`;
  }

  // Add prefix and suffix
  return `${prefix}${result}${suffix}`;
};

/**
 * Parse a formatted number string back to a number
 * Handles various separator formats
 */
export const parseFormattedNumber = (
  value: string,
  options: FormatOptions = {}
): number => {
  const { decimalSeparator = ".", thousandSeparator = "," } = options;

  // Remove prefix/suffix if present
  let cleaned = value.trim();

  // Remove thousand separators
  if (thousandSeparator && thousandSeparator !== "none") {
    cleaned = cleaned.replace(new RegExp(`\\${thousandSeparator}`, "g"), "");
  }

  // Replace decimal separator with standard dot
  if (decimalSeparator !== ".") {
    cleaned = cleaned.replace(decimalSeparator, ".");
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Format a currency value with proper separators and symbol
 */
export const formatCurrencyValue = (
  value: number | string,
  currencyCode: string,
  options: FormatOptions & { symbolPosition?: "before" | "after" } = {}
): string => {
  const currencySymbols: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    XOF: "FCFA",
    XAF: "FCFA",
    NGN: "₦",
    GHS: "₵",
    ZAR: "R",
    KES: "KSh",
    MAD: "د.م.",
    EGP: "ج.م.",
  };

  const symbol = currencySymbols[currencyCode] || currencyCode;
  const { symbolPosition = "after", ...formatOpts } = options;

  const formattedNumber = formatNumber(value, formatOpts);

  if (symbolPosition === "before") {
    return `${symbol}${formattedNumber}`;
  } else {
    return `${formattedNumber} ${symbol}`;
  }
};

/**
 * Format a percentage value
 */
export const formatPercentage = (
  value: number,
  options: FormatOptions = {}
): string => {
  return formatNumber(value, {
    ...options,
    suffix: "%",
  });
};

/**
 * Abbreviate large numbers (e.g., 1000 -> 1K, 1000000 -> 1M)
 */
export const abbreviateNumber = (
  value: number,
  options: FormatOptions = {}
): string => {
  const absValue = Math.abs(value);

  if (absValue >= 1000000000) {
    return (
      formatNumber(value / 1000000000, { ...options, decimalPlaces: 1 }) + "B"
    );
  }
  if (absValue >= 1000000) {
    return (
      formatNumber(value / 1000000, { ...options, decimalPlaces: 1 }) + "M"
    );
  }
  if (absValue >= 1000) {
    return formatNumber(value / 1000, { ...options, decimalPlaces: 1 }) + "K";
  }

  return formatNumber(value, options);
};
