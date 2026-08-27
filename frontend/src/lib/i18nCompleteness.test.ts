import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "./i18n";

const sourceRoot = path.resolve(__dirname, "..");

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")
      ? [entryPath]
      : [];
  });
}

function usedTranslationKeys(): string[] {
  const keys = new Set<string>();
  const keyPattern = /\bt\(\s*["']([^"']+)["']\s*\)/g;

  for (const file of sourceFiles(sourceRoot)) {
    const contents = fs.readFileSync(file, "utf8");
    for (const match of contents.matchAll(keyPattern)) keys.add(match[1]);
  }

  return [...keys].sort();
}

describe("i18n completeness", () => {
  it("defines every statically referenced translation in English and French", () => {
    const english = translations.en as Record<string, string>;
    const french = translations.fr as Record<string, string>;
    const missing = usedTranslationKeys().flatMap((key) => [
      ...(!english[key] ? [`en.${key}`] : []),
      ...(!french[key] ? [`fr.${key}`] : []),
    ]);

    expect(missing).toEqual([]);
  });

  it("keeps the English and French dictionaries aligned", () => {
    expect(Object.keys(translations.fr).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
  });

  it("keeps the corrected French interface labels translated", () => {
    expect({
      staff: translations.fr.staffMember,
      scanner: translations.fr.barcodeScanner,
      audit: translations.fr.auditLogs,
      camera: translations.fr.startingCamera,
      access: translations.fr.accessDenied,
    }).toEqual({
      staff: "Membre du personnel",
      scanner: "Scanner de codes-barres",
      audit: "Journaux d'audit",
      camera: "Démarrage de la caméra...",
      access: "Accès refusé",
    });
  });

  it("keeps the initial setup French copy explicit", () => {
    expect(translations.fr.configureMedicalConnect).toBe("Configurer Medical Connect");
    expect(translations.fr.chooseDocumentFormat).toBe(
      "Quel format voulez-vous utiliser ?",
    );
  });

  it("keeps the authorized devices card copy explicit", () => {
    expect(translations.fr.authorizedDevices).toBe("Appareils autorisés");
    expect(translations.fr.approveDevice).toBe("Approuver");
  });
});
