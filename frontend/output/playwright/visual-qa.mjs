import { chromium } from "@playwright/test";

const baseURL = "http://localhost:3000";
const outputDir = "output/playwright/initial-config-confirmation";
const tenant = {
  id: "tenant-visual-qa",
  name: "Boutique Kima",
  slug: "boutique-kima",
  currency: "XOF",
  timezone: "Africa/Porto-Novo",
  isActive: true,
};
const user = {
  id: "user-visual-qa",
  username: "admin",
  firstName: "Kima",
  lastName: "Admin",
  email: "admin@example.com",
  role: "admin",
  tenantId: tenant.id,
  isActive: true,
};
const now = "2026-08-15T00:00:00.000Z";

function setting(key, value, dataType = "string", category = "system") {
  return {
    id: `setting-${key}`,
    tenantId: tenant.id,
    key,
    value: String(value),
    category,
    dataType,
    isEncrypted: false,
    createdAt: now,
    updatedAt: now,
  };
}

const completedSettings = [
  setting("initialSetupCompleted", true, "boolean"),
  setting("companyName", "Boutique Kima", "string", "company"),
  setting("companyAddress", "Cotonou, Bénin", "string", "company"),
  setting("companyPhone", "+229 01 23 45 67", "string", "company"),
  setting("companyEmail", "bonjour@kima.example", "string", "company"),
  setting("companyWebsite", "kima.example", "string", "company"),
  setting("defaultCurrency", "XOF"),
  setting("currencyDecimalSeparator", ","),
  setting("currencyThousandSeparator", " "),
  setting("currencyDecimalPlaces", 0, "number"),
  setting("currencySymbolPosition", "after"),
  setting("defaultTaxRate", 18, "number"),
  setting("autoPrintReceipt", true, "boolean"),
  setting("receiptFormat", "invoice"),
];

async function mockApp(page, settings) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      return request.method() === "HEAD"
        ? route.fulfill({ status: 200 })
        : route.fulfill({ status: 200, json: { user, tenant } });
    }
    if (pathname === "/api/settings" && request.method() === "GET") {
      return route.fulfill({ status: 200, json: settings });
    }
    if (pathname === "/api/sync/status") {
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 200, json: [] });
  });
}

async function collectMetrics(page, pageName) {
  return page.evaluate((name) => {
    const root = document.documentElement;
    const previews = Array.from(document.querySelectorAll(
      '[data-testid="retail-receipt-preview"], [data-testid="invoice-preview"]',
    ));
    const invoice = document.querySelector('[data-testid="invoice-preview"]');
    const wrapper = invoice?.parentElement;
    const invoiceStyle = invoice ? getComputedStyle(invoice) : null;
    const invoiceRect = invoice?.getBoundingClientRect();
    const invoiceText = invoice?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const active = document.activeElement;
    const activeStyle = active instanceof HTMLElement
      ? getComputedStyle(active)
      : null;
    const targetSelectors = name === "setup"
      ? [
          'label[for="setup-format-retail"]',
          'label[for="setup-format-invoice"]',
          'label[for="setup-auto-print"]',
          'button[type="submit"]',
        ]
      : [
          'button[role="combobox"]',
          'button[type="submit"]',
        ];
    const undersizedTargets = targetSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44
          ? [{ selector, width: Math.round(rect.width), height: Math.round(rect.height) }]
          : [];
      }),
    );
    const blueIcon = name === "setup"
      ? document.querySelector('label[for="setup-format-invoice"] svg')
      : document.querySelector('[data-testid="settings-page"] svg.text-primary');

    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      previewCount: previews.length,
      previewTestIds: previews.map((element) => element.getAttribute("data-testid")),
      darkThemeActive: root.classList.contains("dark"),
      invoiceTextLength: invoiceText.length,
      invoiceHasCompanyName: invoiceText.includes("Boutique Kima"),
      invoiceHasTotal: invoiceText.toUpperCase().includes("TOTAL"),
      invoicePaint: invoiceStyle && invoiceRect
        ? {
            display: invoiceStyle.display,
            visibility: invoiceStyle.visibility,
            opacity: invoiceStyle.opacity,
            color: invoiceStyle.color,
            backgroundColor: invoiceStyle.backgroundColor,
            width: Math.round(invoiceRect.width),
            height: Math.round(invoiceRect.height),
          }
        : null,
      invoiceWidth: invoice ? Math.round(invoice.getBoundingClientRect().width) : null,
      wrapperClientWidth: wrapper?.clientWidth ?? null,
      wrapperScrollWidth: wrapper?.scrollWidth ?? null,
      undersizedTargets,
      focus: activeStyle
        ? {
            tag: active?.tagName,
            id: active?.id,
            outline: activeStyle.outline,
            boxShadow: activeStyle.boxShadow,
          }
        : null,
      headingIconColor: blueIcon ? getComputedStyle(blueIcon).color : null,
    };
  }, pageName);
}

async function prepareContext(browser, viewport, theme) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ selectedTheme }) => {
    localStorage.setItem("medicalconnect_install_mode", "connected");
    localStorage.setItem("medicalconnect_language", "fr");
    localStorage.setItem("medicalconnect_theme", selectedTheme);
  }, { selectedTheme: theme });
  return context;
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    for (const theme of ["dark"]) {
      {
        const context = await prepareContext(browser, viewport, theme);
        const page = await context.newPage();
        await mockApp(page, []);
        await page.goto(baseURL);
        await page.waitForURL(/\/initial-setup$/);
        await page.getByLabel("Nom de l'entreprise").fill("Boutique Kima");
        for (let step = 2; step <= 4; step += 1) {
          await page.getByRole("button", { name: "Continuer" }).click();
          await page.getByText(`Étape ${step} sur 4`, { exact: true }).waitFor();
        }
        await page.getByLabel(/Grande facture/).click();
        await page.keyboard.press("Tab");
        await page.getByText("Synchronisé", { exact: true }).waitFor({ state: "detached", timeout: 7000 }).catch(() => {});
        const path = `${outputDir}/setup-${viewport.name}-${theme}.png`;
        await page.screenshot({ path, fullPage: true });
        results.push({ page: "setup", viewport, theme, path, metrics: await collectMetrics(page, "setup") });
        await context.close();
      }

      {
        const context = await prepareContext(browser, viewport, theme);
        const page = await context.newPage();
        await mockApp(page, completedSettings);
        await page.goto(`${baseURL}/settings`);
        await page.getByTestId("settings-page").waitFor();
        const formatControl = page.getByText("Grande facture", { exact: true }).first();
        await formatControl.scrollIntoViewIfNeeded();
        await page.locator('[data-testid="settings-page"] button[role="combobox"]').last().focus();
        await page.getByText("Synchronisé", { exact: true }).waitFor({ state: "detached", timeout: 7000 }).catch(() => {});
        const path = `${outputDir}/settings-${viewport.name}-${theme}.png`;
        await page.screenshot({ path, fullPage: true });
        results.push({ page: "settings", viewport, theme, path, metrics: await collectMetrics(page, "settings") });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
