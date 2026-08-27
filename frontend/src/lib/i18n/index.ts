import { useState } from "react";
import type { Language, TranslationSection } from "./types";

import { navigation } from "./navigation";
import { suppliers } from "./suppliers";
import { dashboard } from "./dashboard";
import { products } from "./products";
import { categories } from "./categories";
import { variants } from "./variants";
import { validation } from "./validation";
import { pricing } from "./pricing";
import { analytics } from "./analytics";
import { stock } from "./stock";
import { customers } from "./customers";
import { sales } from "./sales";
import { lan } from "./lan";
import { messages } from "./messages";
import { audit } from "./audit";
import { units } from "./units";
import { auth } from "./auth";
import { settings } from "./settings";
import { formatting } from "./formatting";
import { salesReports } from "./salesReports";
import { setup } from "./setup";
import { rayons } from "./rayons";
import { patients } from "./patients";

export type { Language } from "./types";

const sections: TranslationSection[] = [
  navigation,
  suppliers,
  dashboard,
  products,
  categories,
  variants,
  validation,
  pricing,
  analytics,
  stock,
  customers,
  sales,
  lan,
  messages,
  audit,
  units,
  auth,
  settings,
  formatting,
  salesReports,
  setup,
  rayons,
  patients,
];

const en: Record<string, string> = {};
const fr: Record<string, string> = {};
for (const section of sections) {
  Object.assign(en, section.en);
  Object.assign(fr, section.fr);
}

export const translations = { en, fr };

let currentLanguage: Language = "fr";

export const setLanguage = (lang: Language) => {
  currentLanguage = lang;
  localStorage.setItem("medicalconnect_language", lang);
};

export const getLanguage = (): Language => {
  const stored = localStorage.getItem("medicalconnect_language") as Language;
  return stored || currentLanguage;
};

export const t = (key: string): string => {
  const lang = getLanguage();
  const keys = key.split(".");
  let value: any = translations[lang];

  for (const k of keys) {
    value = value?.[k];
  }

  return value || key;
};

export const useTranslation = () => {
  const [language, setCurrentLanguage] = useState(getLanguage());

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    setCurrentLanguage(lang);
  };

  return { t, language, changeLanguage };
};
