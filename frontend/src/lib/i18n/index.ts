import { useState } from "react";
import type { Language, TranslationSection } from "./types";

import { navigation } from "./navigation";
import { dashboard } from "./dashboard";
import { dashboardHome } from "./dashboardHome";
import { validation } from "./validation";
import { lan } from "./lan";
import { messages } from "./messages";
import { audit } from "./audit";
import { auth } from "./auth";
import { settings } from "./settings";
import { formatting } from "./formatting";
import { setup } from "./setup";
import { patients } from "./patients";
import { consultations } from "./consultations";
import { queue } from "./queue";
import { labOrders } from "./labOrders";
import { examTypes } from "./examTypes";
import { prescriptions } from "./prescriptions";
import { carePlan } from "./carePlan";
import { rooms } from "./rooms";
import { platform } from "./platform";
import { notifications } from "./notifications";

export type { Language } from "./types";

const sections: TranslationSection[] = [
  navigation,
  dashboard,
  validation,
  lan,
  messages,
  audit,
  auth,
  settings,
  formatting,
  setup,
  patients,
  consultations,
  queue,
  labOrders,
  examTypes,
  prescriptions,
  carePlan,
  rooms,
  platform,
  notifications,
  dashboardHome,
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
