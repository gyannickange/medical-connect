import type { TranslationSection } from "./types";

export const validation: TranslationSection = {
  en: {
    // Validation messages
    productIsRequired: "Product is required",
    quantityMustBeAtLeast1: "Quantity must be at least 1",

    // Generic Zod validation messages (see lib/i18n/zodErrorMap.ts) - these
    // replace Zod's own built-in English-only messages so every form field
    // error respects the current language, without every schema in
    // shared/schema.ts needing its own localized .min()/.email() message.
    zodFieldRequired: "This field is required",
    zodInvalidEmail: "Invalid email address",
    zodInvalidUrl: "Invalid URL",
    zodStringTooShort: "Must be at least {min} characters",
    zodStringTooLong: "Must be at most {max} characters",
    zodNumberTooSmall: "Must be at least {min}",
    zodNumberTooLarge: "Must be at most {max}",
    zodArrayTooShort: "Select at least {min}",
    zodInvalidSelection: "Invalid selection",
    zodInvalidType: "Invalid value",

    // Language settings
    languageChanged: "Language Changed",
    languageChangedTo: "Language changed to",
    english: "English",
    french: "French",
  },
  fr: {
    // Validation messages
    productIsRequired: "Le produit est requis",
    quantityMustBeAtLeast1: "La quantité doit être au moins 1",

    // Generic Zod validation messages (see lib/i18n/zodErrorMap.ts)
    zodFieldRequired: "Ce champ est requis",
    zodInvalidEmail: "Adresse email invalide",
    zodInvalidUrl: "URL invalide",
    zodStringTooShort: "Doit contenir au moins {min} caractères",
    zodStringTooLong: "Doit contenir au plus {max} caractères",
    zodNumberTooSmall: "Doit être au moins {min}",
    zodNumberTooLarge: "Doit être au plus {max}",
    zodArrayTooShort: "Sélectionnez au moins {min}",
    zodInvalidSelection: "Sélection invalide",
    zodInvalidType: "Valeur invalide",

    // Language settings
    languageChanged: "Langue modifiée",
    languageChangedTo: "Langue changée en",
    english: "Anglais",
    french: "Français",
  },
};
