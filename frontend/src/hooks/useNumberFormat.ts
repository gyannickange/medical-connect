import { useSettings } from "./useSettings";
import { formatNumber, formatCurrencyValue } from "@/lib/formatNumber";

/**
 * Custom hook for formatting numbers with user settings
 * This hook automatically applies the user's preferred format settings
 * for all number and currency displays throughout the application
 */
export const useNumberFormat = () => {
  const { getDefaultCurrency, getCurrencyFormat } = useSettings();

  const currencySettings = getCurrencyFormat();
  const defaultCurrency = getDefaultCurrency();

  /**
   * Format a number with user's preferred settings
   */
  const formatNumberWithSettings = (value: number | string): string => {
    return formatNumber(value, {
      decimalSeparator: currencySettings.decimalSeparator,
      thousandSeparator: currencySettings.thousandSeparator,
      decimalPlaces: currencySettings.decimalPlaces,
    });
  };

  /**
   * Format a currency value with user's preferred settings
   */
  const formatCurrency = (
    value: number | string,
    currencyCode?: string
  ): string => {
    return formatCurrencyValue(value, currencyCode || defaultCurrency, {
      decimalSeparator: currencySettings.decimalSeparator,
      thousandSeparator: currencySettings.thousandSeparator,
      decimalPlaces: currencySettings.decimalPlaces,
      symbolPosition: currencySettings.symbolPosition,
    });
  };

  /**
   * Format a percentage value with user's preferred settings
   */
  const formatPercentage = (value: number): string => {
    return formatNumber(value, {
      decimalSeparator: currencySettings.decimalSeparator,
      thousandSeparator: currencySettings.thousandSeparator,
      decimalPlaces: Math.min(currencySettings.decimalPlaces, 2), // Max 2 decimals for percentages
      suffix: "%",
    });
  };

  /**
   * Format a price (currency without thousand separator for compact display)
   */
  const formatPrice = (value: number | string): string => {
    return formatCurrencyValue(value, defaultCurrency, {
      decimalSeparator: currencySettings.decimalSeparator,
      thousandSeparator: currencySettings.thousandSeparator,
      decimalPlaces: currencySettings.decimalPlaces,
      symbolPosition: currencySettings.symbolPosition,
    });
  };

  /**
   * Format a quantity (usually integers or 2 decimals max)
   */
  const formatQuantity = (value: number | string): string => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    const isInteger = Number.isInteger(numValue);

    return formatNumber(value, {
      decimalSeparator: currencySettings.decimalSeparator,
      thousandSeparator: currencySettings.thousandSeparator,
      decimalPlaces: isInteger ? 0 : Math.min(currencySettings.decimalPlaces, 2),
    });
  };

  return {
    formatNumber: formatNumberWithSettings,
    formatCurrency,
    formatPrice,
    formatPercentage,
    formatQuantity,
    currencySettings,
    defaultCurrency,
  };
};

