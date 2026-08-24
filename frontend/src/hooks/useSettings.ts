import { useSettingsContext } from "@/contexts/SettingsContext";

export interface CurrencyFormatOptions {
  decimalSeparator: "." | ",";
  thousandSeparator: "," | "." | " " | "none";
  decimalPlaces: number;
  symbolPosition: "before" | "after";
}

export const useSettings = () => {
  const { settings, isLoading, getSetting, updateSetting, refreshSettings } =
    useSettingsContext();

  // Company Information
  const getCompanyName = (): string => getSetting("companyName", "");
  const getCompanyAddress = (): string => getSetting("companyAddress", "");
  const getCompanyPhone = (): string => getSetting("companyPhone", "");
  const getCompanyEmail = (): string => getSetting("companyEmail", "");
  const getCompanyWebsite = (): string => getSetting("companyWebsite", "");

  // Currency Settings
  const getDefaultCurrency = (): string => getSetting("defaultCurrency", "XOF");
  const getCurrencyFormat = (): CurrencyFormatOptions => {
    // Get thousandSeparator and migrate empty string to "none" for backward compatibility
    let thousandSeparator = getSetting("currencyThousandSeparator", ".");
    if (thousandSeparator === "") {
      thousandSeparator = "none";
    }

    return {
      decimalSeparator: getSetting("currencyDecimalSeparator", ","),
      thousandSeparator,
      decimalPlaces: getSetting("currencyDecimalPlaces", 2),
      symbolPosition: getSetting("currencySymbolPosition", "after"),
    };
  };

  // Tax Settings
  const getDefaultTaxRate = (): number => getSetting("defaultTaxRate", 20);

  // System Settings
  const getLowStockThreshold = (): number =>
    getSetting("lowStockThreshold", 10);
  const getAutoBackup = (): boolean => getSetting("autoBackup", true);
  const getPrintTemplate = (): string =>
    getSetting("printTemplate", "standard");
  const getDateFormat = (): string => getSetting("dateFormat", "DD/MM/YYYY");
  const getTimeFormat = (): string => getSetting("timeFormat", "24h");
  const getLanguage = (): string => getSetting("language", "en");
  const getAutoPrintReceipt = (): boolean =>
    getSetting("autoPrintReceipt", true);

  // Update methods for common settings
  const updateCompanyInfo = async (info: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  }) => {
    const promises: Promise<void>[] = [];
    if (info.name !== undefined)
      promises.push(
        updateSetting("companyName", info.name, { category: "company" })
      );
    if (info.address !== undefined)
      promises.push(
        updateSetting("companyAddress", info.address, { category: "company" })
      );
    if (info.phone !== undefined)
      promises.push(
        updateSetting("companyPhone", info.phone, { category: "company" })
      );
    if (info.email !== undefined)
      promises.push(
        updateSetting("companyEmail", info.email, { category: "company" })
      );
    if (info.website !== undefined)
      promises.push(
        updateSetting("companyWebsite", info.website, { category: "company" })
      );
    await Promise.all(promises);
  };

  const updateCurrencySettings = async (
    currency: string,
    format?: Partial<CurrencyFormatOptions>
  ) => {
    const promises: Promise<void>[] = [
      updateSetting("defaultCurrency", currency, { category: "system" }),
    ];

    if (format?.decimalSeparator)
      promises.push(
        updateSetting("currencyDecimalSeparator", format.decimalSeparator, {
          category: "system",
        })
      );
    if (format?.thousandSeparator)
      promises.push(
        updateSetting("currencyThousandSeparator", format.thousandSeparator, {
          category: "system",
        })
      );
    if (format?.decimalPlaces !== undefined)
      promises.push(
        updateSetting("currencyDecimalPlaces", format.decimalPlaces, {
          category: "system",
        })
      );
    if (format?.symbolPosition)
      promises.push(
        updateSetting("currencySymbolPosition", format.symbolPosition, {
          category: "system",
        })
      );

    await Promise.all(promises);
  };

  const updateTaxSettings = async (defaultTaxRate: number) => {
    await updateSetting("defaultTaxRate", defaultTaxRate, {
      category: "system",
    });
  };

  return {
    // Raw access
    settings,
    isLoading,
    getSetting,
    updateSetting,
    refreshSettings,

    // Company getters
    getCompanyName,
    getCompanyAddress,
    getCompanyPhone,
    getCompanyEmail,
    getCompanyWebsite,

    // Currency getters
    getDefaultCurrency,
    getCurrencyFormat,

    // Tax getters
    getDefaultTaxRate,

    // System getters
    getLowStockThreshold,
    getAutoBackup,
    getPrintTemplate,
    getDateFormat,
    getTimeFormat,
    getLanguage,
    getAutoPrintReceipt,

    // Update methods
    updateCompanyInfo,
    updateCurrencySettings,
    updateTaxSettings,
  };
};
