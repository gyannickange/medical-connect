import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "../contexts/TenantContext";
import { useSettings } from "./useSettings";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrencyValue } from "@/lib/formatNumber";

// Types pour les devises
export interface Currency {
  code: string;
  symbol: string;
  name: string;
  position: "before" | "after";
}

// Devises supportées
export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: "EUR", symbol: "€", name: "Euro", position: "after" },
  { code: "USD", symbol: "$", name: "US Dollar", position: "before" },
  { code: "GBP", symbol: "£", name: "British Pound", position: "before" },
  {
    code: "XOF",
    symbol: "FCFA",
    name: "West African CFA Franc",
    position: "after",
  },
  {
    code: "XAF",
    symbol: "FCFA",
    name: "Central African CFA Franc",
    position: "after",
  },
  {
    code: "NGN",
    symbol: "₦",
    name: "Nigerian Naira",
    position: "before",
  },
  {
    code: "GHS",
    symbol: "₵",
    name: "Ghanaian Cedi",
    position: "before",
  },
  {
    code: "ZAR",
    symbol: "R",
    name: "South African Rand",
    position: "before",
  },
  {
    code: "KES",
    symbol: "KSh",
    name: "Kenyan Shilling",
    position: "before",
  },
  {
    code: "MAD",
    symbol: "د.م.",
    name: "Moroccan Dirham",
    position: "before",
  },
  {
    code: "EGP",
    symbol: "ج.م.",
    name: "Egyptian Pound",
    position: "before",
  },
];

// Fonction utilitaire pour formater les montants (legacy support)
export const formatCurrency = (amount: number, currency: Currency): string => {
  const formattedAmount = amount.toFixed(2);

  if (currency.position === "before") {
    return `${currency.symbol}${formattedAmount}`;
  } else {
    return `${formattedAmount} ${currency.symbol}`;
  }
};

// Hook pour gérer la monnaie
export const useCurrency = () => {
  const { currentTenant } = useTenant();
  const {
    getDefaultCurrency,
    getCurrencyFormat,
    updateCurrencySettings,
    isLoading: settingsLoading,
  } = useSettings();
  const [localCurrency, setLocalCurrency] = useState<string>("EUR");

  // Get currency from settings
  useEffect(() => {
    const currency = getDefaultCurrency();
    if (currency) {
      setLocalCurrency(currency);
    }
  }, [getDefaultCurrency]);

  // Fonction pour changer la monnaie
  const setCurrency = async (currencyCode: string) => {
    setLocalCurrency(currencyCode);
    await updateCurrencySettings(currencyCode);
  };

  // Obtenir la monnaie actuelle
  const getCurrentCurrency = (): Currency => {
    return (
      SUPPORTED_CURRENCIES.find((c) => c.code === localCurrency) ||
      SUPPORTED_CURRENCIES[0]
    );
  };

  // Formater un montant avec la monnaie actuelle et les options de format
  const formatAmount = (amount: number): string => {
    const format = getCurrencyFormat();
    return formatCurrencyValue(amount, localCurrency, {
      decimalSeparator: format.decimalSeparator,
      thousandSeparator: format.thousandSeparator,
      decimalPlaces: format.decimalPlaces,
      symbolPosition: format.symbolPosition,
    });
  };

  return {
    currentCurrency: getCurrentCurrency(),
    supportedCurrencies: SUPPORTED_CURRENCIES,
    formatAmount,
    setCurrency,
    isLoading: settingsLoading,
    currencyFormat: getCurrencyFormat(),
  };
};
