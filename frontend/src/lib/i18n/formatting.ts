import type { TranslationSection } from "./types";

export const formatting: TranslationSection = {
  en: {
    // Currency & Formatting
    currencyNumberFormatting: "Currency & Number Formatting",
    configureCurrencyFormat: "Configure currency and number display format",
    symbolPosition: "Symbol Position",
    symbolBefore: "Before ($100.00)",
    symbolAfter: "After (100.00 €)",
    decimalSeparator: "Decimal Separator",
    decimalDot: "Dot (100.50)",
    decimalComma: "Comma (100,50)",
    thousandSeparator: "Thousand Separator",
    thousandNone: "None (1000)",
    thousandComma: "Comma (1,000)",
    thousandDot: "Dot (1.000)",
    thousandSpace: "Space (1 000)",
    decimalPlaces: "Decimal Places",
    formatSettingsApplied:
      "These format settings will be applied to all currency and number displays throughout the application.",

    // Tax Settings
    taxConfiguration: "Tax Configuration",
    taxConfigDescription:
      "Set default tax rate for sales (can be overridden per category)",
    defaultSalesTaxRate: "Default Sales Tax Rate (%)",
    defaultTaxRateDescription:
      "This is the default tax rate for all sales. You can override this rate for specific product categories in the Categories page.",

    // Receipt/Invoice Settings
    receiptInvoiceSettings: "Receipt & Invoice Settings",
    receiptInvoiceDescription:
      "Configure automatic receipt generation and printing",
    autoPrintReceipt: "Auto-Print Receipt",
    autoPrintReceiptDescription:
      "Automatically generate and download receipt PDF after completing a sale",
    receiptSettings: "Receipt Settings",
    receiptFormatSetting: "Receipt Format",
    retailReceipt: "Retail Receipt",
    formalInvoice: "Formal Invoice",
    retailReceiptDescription: "Simple thermal receipt style (default)",
    formalInvoiceDescription: "Detailed invoice with company information",
    thankYou: "THANK YOU!!!",

    // Currency codes
    currencyXOF: "XOF (FCFA - West Africa)",
    currencyEUR: "EUR (€)",
    currencyUSD: "USD ($)",
    currencyGBP: "GBP (£)",
    currencyXAF: "XAF (FCFA - Central Africa)",
    currencyNGN: "NGN (₦ - Nigeria)",
    currencyGHS: "GHS (₵ - Ghana)",
    currencyZAR: "ZAR (R - South Africa)",
    currencyKES: "KES (KSh - Kenya)",
    currencyMAD: "MAD (د.م. - Morocco)",
    currencyEGP: "EGP (ج.م. - Egypt)",
  },
  fr: {
    // Currency & Formatting
    currencyNumberFormatting: "Format de Devise et de Nombre",
    configureCurrencyFormat:
      "Configurez le format d'affichage de la devise et des nombres",
    symbolPosition: "Position du Symbole",
    symbolBefore: "Avant ($100.00)",
    symbolAfter: "Après (100.00 €)",
    decimalSeparator: "Séparateur Décimal",
    decimalDot: "Point (100.50)",
    decimalComma: "Virgule (100,50)",
    thousandSeparator: "Séparateur de Milliers",
    thousandNone: "Aucun (1000)",
    thousandComma: "Virgule (1,000)",
    thousandDot: "Point (1.000)",
    thousandSpace: "Espace (1 000)",
    decimalPlaces: "Décimales",
    formatSettingsApplied:
      "Ces paramètres de format seront appliqués à tous les affichages de devise et de nombres dans l'application.",

    // Tax Settings
    taxConfiguration: "Configuration de la Taxe",
    taxConfigDescription:
      "Définir le taux de taxe par défaut pour les ventes (peut être modifié par catégorie)",
    defaultSalesTaxRate: "Taux de Taxe de Vente par Défaut (%)",
    defaultTaxRateDescription:
      "Il s'agit du taux de taxe par défaut pour toutes les ventes. Vous pouvez modifier ce taux pour des catégories de produits spécifiques dans la page Catégories.",

    // Receipt/Invoice Settings
    receiptInvoiceSettings: "Paramètres de Reçu et Facture",
    receiptInvoiceDescription:
      "Configurer la génération et l'impression automatiques des reçus",
    autoPrintReceipt: "Impression Automatique du Reçu",
    autoPrintReceiptDescription:
      "Générer et télécharger automatiquement le reçu PDF après avoir finalisé une vente",
    receiptSettings: "Paramètres de Reçu",
    receiptFormatSetting: "Format de Reçu",
    retailReceipt: "Reçu de Détail",
    formalInvoice: "Facture Formelle",
    retailReceiptDescription: "Style de reçu thermique simple (par défaut)",
    formalInvoiceDescription:
      "Facture détaillée avec informations d'entreprise",
    thankYou: "MERCI !!!",

    // Currency codes
    currencyXOF: "XOF (FCFA - Afrique de l'Ouest)",
    currencyEUR: "EUR (€)",
    currencyUSD: "USD ($)",
    currencyGBP: "GBP (£)",
    currencyXAF: "XAF (FCFA - Afrique Centrale)",
    currencyNGN: "NGN (₦ - Nigeria)",
    currencyGHS: "GHS (₵ - Ghana)",
    currencyZAR: "ZAR (R - Afrique du Sud)",
    currencyKES: "KES (KSh - Kenya)",
    currencyMAD: "MAD (د.م. - Maroc)",
    currencyEGP: "EGP (ج.م. - Égypte)",
  },
};
