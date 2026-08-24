// Thin re-export shim: keeps every existing import path working unchanged
// (e.g. `../lib/i18n`, `@/lib/i18n`, `./i18n`) while the implementation now
// lives in the split files under `i18n/`.
export * from "./i18n/index";
