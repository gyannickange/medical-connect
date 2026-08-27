import { test, expect } from "@playwright/test";

/**
 * Medical Connect — Full Application Smoke Test
 *
 * Covers: login, dashboard, navigation, products, LAN discovery,
 * customers, categories, suppliers, staff, reports, settings.
 *
 * Sales is the canonical operational destination at /sales. Reports remains
 * the analytics destination.
 *
 * Run: npx playwright test
 */

const BASE = "http://localhost:3000";

test.describe("Initial setup", () => {
  test("initial setup routes a first login through exclusive document previews", async ({
    page,
  }) => {
    const tenant = {
      id: "tenant-initial-setup",
      name: "Initial Setup Tenant",
      slug: "initial-setup",
      currency: "XOF",
      timezone: "Africa/Porto-Novo",
      isActive: true,
    };
    const user = {
      id: "user-initial-setup",
      username: "admin",
      firstName: "Initial",
      lastName: "Admin",
      email: "admin@example.com",
      role: "admin",
      tenantId: tenant.id,
      isActive: true,
    };
    const submittedSettingKeys: string[] = [];

    await page.addInitScript(() => {
      localStorage.setItem("medicalconnect_install_mode", "connected");
      localStorage.setItem("medicalconnect_language", "fr");
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname === "/api/auth/me") {
        return request.method() === "HEAD"
          ? route.fulfill({ status: 200 })
          : route.fulfill({ status: 200, json: { user, tenant } });
      }
      if (pathname === "/api/settings" && request.method() === "GET") {
        return route.fulfill({ status: 200, json: [] });
      }
      if (pathname === "/api/settings" && request.method() === "POST") {
        const setting = request.postDataJSON();
        submittedSettingKeys.push(setting.key);
        return route.fulfill({
          status: 201,
          json: { ...setting, id: `setting-${setting.key}` },
        });
      }

      return route.fulfill({ status: 200, json: [] });
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/initial-setup$/);
    await page.getByLabel("Nom de l'entreprise").fill("Boutique Kima");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByTestId("retail-receipt-preview")).toBeVisible();
    await page.getByLabel(/Grande facture/).click();
    await expect(page.getByTestId("invoice-preview")).toBeVisible();
    await expect(page.getByTestId("retail-receipt-preview")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    const invoiceFrame = page.getByTestId("invoice-preview").locator("..");
    await expect.poll(() =>
      invoiceFrame.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Configurer Medical Connect" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    expect(submittedSettingKeys.at(-1)).toBe("initialSetupCompleted");
  });

  test("completed initial setup preserves direct settings navigation", async ({
    page,
  }) => {
    const tenant = {
      id: "tenant-completed-setup",
      name: "Completed Setup Tenant",
      slug: "completed-setup",
      currency: "XOF",
      timezone: "Africa/Porto-Novo",
      isActive: true,
    };
    const user = {
      id: "user-completed-setup",
      username: "admin",
      firstName: "Completed",
      lastName: "Admin",
      email: "admin@example.com",
      role: "admin",
      tenantId: tenant.id,
      isActive: true,
    };

    await page.addInitScript(() => {
      localStorage.setItem("medicalconnect_install_mode", "connected");
      localStorage.setItem("medicalconnect_language", "fr");
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/auth/me") {
        return route.fulfill({ status: 200, json: { user, tenant } });
      }
      if (pathname === "/api/settings" && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          json: [
            {
              id: "setting-initial-setup-completed",
              tenantId: tenant.id,
              key: "initialSetupCompleted",
              value: "true",
              category: "system",
              dataType: "boolean",
              isEncrypted: false,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            },
          ],
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId("settings-page")).toBeVisible();
    const selects = page.getByTestId("settings-page").getByRole("combobox");
    await expect(selects).not.toHaveCount(0);
    for (const select of await selects.all()) {
      await expect.poll(async () => (await select.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);
    }
  });
});

// ── Helper ──────────────────────────────────────────────
async function login(page: any) {
  await page.goto(`${BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin123");
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="dashboard-page"]', {
    timeout: 10000,
  });
}

async function mockDeleteTestApp(page: any) {
  const customer = {
    id: "customer-delete-1",
    firstName: "Delete",
    lastName: "Candidate",
    phone: "",
    email: "delete@example.com",
    address: "",
    totalPurchases: "0",
    createdAt: "2026-08-08T00:00:00.000Z",
    tenantId: "tenant-1",
  };
  const tenant = {
    id: "tenant-1",
    name: "Delete Test Tenant",
    slug: "delete-test",
    currency: "USD",
    timezone: "UTC",
    isActive: true,
  };
  const user = {
    id: "user-1",
    username: "admin",
    firstName: "Test",
    lastName: "Admin",
    email: "admin@example.com",
    role: "admin",
    tenantId: tenant.id,
    isActive: true,
  };
  let customers = [customer];

  await page.route("**/api/**", async (route: any) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, json: { user, tenant } });
    }
    if (pathname.startsWith("/api/customers") && request.method() === "GET") {
      return route.fulfill({ status: 200, json: customers });
    }
    if (
      pathname === `/api/customers/${customer.id}` &&
      request.method() === "DELETE"
    ) {
      customers = [];
      return route.fulfill({ status: 204 });
    }
    if (pathname === "/api/sync/status") {
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  page.on("dialog", (dialog: any) => dialog.accept());
  await page.goto(`${BASE}/customers`);
  await expect(page.locator(`[data-testid="customer-row-${customer.id}"]`))
    .toBeVisible({ timeout: 10000 });
  return customer;
}

const task08Tenant = {
  id: "tenant-task-08",
  name: "Task 08 Tenant",
  slug: "task-08",
  currency: "USD",
  timezone: "UTC",
  isActive: true,
};

const task08SecondTenant = {
  ...task08Tenant,
  id: "tenant-task-08-second",
  name: "Second Account",
  slug: "task-08-second",
};

const task08Products = [
  {
    id: "product-coffee",
    name: "Coffee Beans",
    description: "Dark roast",
    barcode: "COFFEE-1",
    price: "12.00",
    cost: "7.00",
    minStockAlert: 2,
    categoryId: "category-drinks",
    category: { id: "category-drinks", name: "Drinks" },
    stocks: { quantity: 12 },
    variants: [],
  },
  {
    id: "product-tea",
    name: "Green Tea",
    description: "Loose leaf",
    barcode: "TEA-1",
    price: "8.00",
    cost: "4.00",
    minStockAlert: 2,
    categoryId: "category-drinks",
    category: { id: "category-drinks", name: "Drinks" },
    stocks: { quantity: 8 },
    variants: [],
  },
];

async function mockTask08App(
  page: any,
  authenticated = true,
  accessibleTenants = [task08Tenant]
) {
  const user = {
    id: "user-task-08",
    username: "admin",
    firstName: "Task",
    lastName: "Admin",
    email: "task08@example.com",
    role: "admin",
    tenantId: task08Tenant.id,
    isActive: true,
  };

  await page.route("**/api/**", async (route: any) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      return authenticated
        ? route.fulfill({
            status: 200,
            json: {
              user,
              tenant: task08Tenant,
              tenants: accessibleTenants,
            },
          })
        : route.fulfill({ status: 401, json: { message: "Unauthorized" } });
    }
    if (pathname.startsWith("/api/products") && request.method() === "GET") {
      return route.fulfill({ status: 200, json: task08Products });
    }
    if (pathname === "/api/categories") {
      return route.fulfill({ status: 200, json: [] });
    }
    if (pathname.startsWith("/api/sales")) {
      return route.fulfill({ status: 200, json: [] });
    }
    if (pathname === "/api/tenants") {
      return route.fulfill({ status: 200, json: [] });
    }
    return route.fulfill({ status: 200, json: [] });
  });
}

async function installMockWebSocket(
  page: any,
  outcome: "pending" | "success" | "error"
) {
  await page.addInitScript((socketOutcome) => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(_url: string) {
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.(new Event("open"));
          if (socketOutcome === "error") {
            this.onerror?.(new Event("error"));
          }
        }, 25);
      }

      send(data: string) {
        const message = JSON.parse(data);
        if (message.type === "register" && socketOutcome === "success") {
          setTimeout(() => {
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({ type: "auth-success" }),
              })
            );
          }, 25);
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
    });
  }, outcome);
}

test.describe("Task 08 — Sales, Products, and LAN states", () => {
  test("direct navigation to /sales follows the chosen canonical behavior", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/sales`);

    await expect(page.locator('[data-testid="sales-page"]')).toBeVisible();
    await expect(page).toHaveURL(/\/sales$/);
  });

  test("authorized navigation contains exactly one intended sales destination", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(BASE);

    const salesDestinations = page.locator(
      '[data-testid="navigation-menu"] a[href="/sales"]'
    );
    await expect(salesDestinations).toHaveCount(1);
    await expect(page.locator('[data-testid="nav-sales"]')).toBeVisible();
  });

  test("unauthorized users cannot access the sales destination", async ({
    page,
  }) => {
    await mockTask08App(page, false);
    await page.goto(`${BASE}/sales`);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('[data-testid="sales-page"]')).toHaveCount(0);
  });

  test("product search with matches shows only matching rows", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/products`);
    await page.locator('[data-testid="input-search-products"]').fill("coffee");

    await expect(page.locator('[data-testid="product-row-product-coffee"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="product-row-product-tea"]'))
      .toHaveCount(0);
  });

  test("product search with no matches shows a localized empty state", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/products`);
    await page.locator('[data-testid="input-search-products"]').fill("missing");

    await expect(page.getByRole("status")).toBeVisible();
  });

  test("clearing product search restores rows and removes the empty state", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/products`);
    await page.locator('[data-testid="input-search-products"]').fill("missing");
    await page.locator('[data-testid="button-clear-product-search"]').click();

    await expect(page.locator('[data-testid^="product-row-"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="product-search-empty"]'))
      .toHaveCount(0);
  });

  test("enabling LAN discovery immediately shows connecting state", async ({
    page,
  }) => {
    await installMockWebSocket(page, "pending");
    await mockTask08App(page);
    await page.goto(BASE);
    await page.locator('[data-testid="toggle-lan-discovery"]').click();

    await expect(page.locator('[data-testid="discovery-status"]'))
      .toHaveAttribute("data-state", "connecting");
  });

  test("successful WebSocket authentication changes connecting to online", async ({
    page,
  }) => {
    await installMockWebSocket(page, "success");
    await mockTask08App(page);
    await page.goto(BASE);
    await page.locator('[data-testid="toggle-lan-discovery"]').click();

    await expect(page.locator('[data-testid="discovery-status"]'))
      .toHaveAttribute("data-state", "online");
  });

  test("connection error/timeout changes connecting to localized error/offline state", async ({
    page,
  }) => {
    await installMockWebSocket(page, "error");
    await mockTask08App(page);
    await page.goto(BASE);
    await page.locator('[data-testid="toggle-lan-discovery"]').click();

    await expect(page.locator('[data-testid="discovery-status"]'))
      .toHaveAttribute("data-state", "error");
  });

  test("disabling discovery cancels connection state and returns to disabled", async ({
    page,
  }) => {
    await installMockWebSocket(page, "pending");
    await mockTask08App(page);
    await page.goto(BASE);
    const toggle = page.locator('[data-testid="toggle-lan-discovery"]');
    await toggle.click();
    await expect(page.locator('[data-testid="discovery-status"]'))
      .toHaveAttribute("data-state", "connecting");
    await toggle.click();

    await expect(page.locator('[data-testid="discovery-status"]'))
      .toHaveAttribute("data-state", "disabled");
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
  });
});

// ── 1. Auth ─────────────────────────────────────────────
test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login succeeds with valid credentials", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill("#username", "admin");
    await page.fill("#password", "admin123");
    await page.click('button[type="submit"]');
    await expect(
      page.locator('[data-testid="dashboard-page"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test("protected routes redirect to login", async ({ page }) => {
    await page.goto(`${BASE}/products`);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── 2. Dashboard & Navigation ───────────────────────────
test.describe("Dashboard & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockTask08App(page);
    await page.goto(BASE);
  });

  test("dashboard renders key sections", async ({ page }) => {
    await expect(
      page.locator('[data-testid="dashboard-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="lan-discovery-card"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="card-peer-sync"]')
    ).toBeVisible();
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test("navigates to all pages", async ({ page }) => {
    const pages = [
      { url: "/products", testid: "products-page" },
      { url: "/categories", testid: "categories-page" },
      { url: "/customers", testid: "customers-page" },
      { url: "/suppliers", testid: "suppliers-page" },
      { url: "/staff", testid: "staff-page" },
      { url: "/reports", testid: "reports-page" },
      { url: "/sales", testid: "sales-page" },
      { url: "/settings", testid: "settings-page" },
    ];

    for (const { url, testid } of pages) {
      await page.goto(`${BASE}${url}`);
      await expect(page.locator(`[data-testid="${testid}"]`)).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("Sales route renders the standalone sales page", async ({ page }) => {
    await page.goto(`${BASE}/sales`);
    await expect(page.locator('[data-testid="sales-page"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/\/sales$/);
  });
});

// ── 3. LAN Discovery ────────────────────────────────────
test.describe("LAN Discovery", () => {
  test.beforeEach(async ({ page }) => {
    await installMockWebSocket(page, "pending");
    await mockTask08App(page);
    await page.goto(BASE);
  });

  test("LAN card renders with device ID", async ({ page }) => {
    await expect(
      page.locator('[data-testid="lan-discovery-card"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="device-id"]')
    ).toBeVisible();
  });

  test("LAN toggle starts discovery", async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-lan-discovery"]');
    // The enable message should be visible before enabling
    await expect(
      page.locator('[data-testid="enable-message"]')
    ).toBeVisible();
    await toggle.click();
    // After clicking toggle, enable-message should disappear (isEnabled = true)
    await expect(
      page.locator('[data-testid="enable-message"]')
    ).not.toBeVisible({ timeout: 5000 });
    // The toggle switch should be checked
    await expect(toggle).toHaveAttribute("data-state", "checked");
  });

  test("LAN toggle stops discovery", async ({ page }) => {
    const toggle = page.locator('[data-testid="toggle-lan-discovery"]');
    // Start
    await toggle.click();
    await page.waitForTimeout(1000);
    // Stop
    await toggle.click();
    await expect(
      page.locator('[data-testid="enable-message"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test("Peer sync card renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="card-peer-sync"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="text-discovered-count"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="text-synced-count"]')
    ).toBeVisible();
  });

  test("Peer sync toggle enables sync", async ({ page }) => {
    const toggle = page.locator('[data-testid="switch-peer-sync"]');
    await toggle.click();
    // The toggle should be checked after enabling
    await expect(toggle).toHaveAttribute("data-state", "checked", {
      timeout: 5000,
    });
  });
});

// ── 4. Products ─────────────────────────────────────────
test.describe("Products", () => {
  test.beforeEach(async ({ page }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/products`);
    await page.waitForSelector('[data-testid="products-page"]', {
      timeout: 10000,
    });
  });

  test("products page renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="products-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="input-search-products"]')
    ).toBeVisible();
  });

  test("add product button opens modal", async ({ page }) => {
    await page.locator('[data-testid="button-add-product"]').click();
    await expect(
      page.locator('[data-testid="product-modal"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test("product search filters results", async ({ page }) => {
    const search = page.locator('[data-testid="input-search-products"]');
    await search.fill("test");
    await expect(search).toHaveValue("test");
    // The products page should still be visible with filtered results
    await expect(
      page.locator('[data-testid="products-page"]')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── 5. Reports (includes Sales functionality) ────────────
test.describe("Reports & Sales", () => {
  test.beforeEach(async ({ page }) => {
    await mockTask08App(page);
    await page.goto(`${BASE}/reports`);
    await page.waitForSelector('[data-testid="reports-page"]', {
      timeout: 10000,
    });
  });

  test("reports page renders with controls", async ({ page }) => {
    await expect(
      page.locator('[data-testid="reports-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="select-report-type"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="button-export-report"]')
    ).toBeVisible();
  });

  test("can switch to sales report type", async ({ page }) => {
    // shadcn/ui Select uses role="combobox" — open it first
    await page.locator('[data-testid="select-report-type"]').click();
    // Select the "sales" option from the dropdown
    await page.getByRole("option", { name: /sales|ventes/i }).click();
    // After switching to sales, the new sale button should appear
    await expect(
      page.locator('[data-testid="button-new-sale-reports"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test("new sale button opens sale modal", async ({ page }) => {
    // Switch to sales report type first (shadcn/ui Select)
    await page.locator('[data-testid="select-report-type"]').click();
    await page.getByRole("option", { name: /sales|ventes/i }).click();
    await page.waitForTimeout(500); // wait for UI to update
    await page.locator('[data-testid="button-new-sale-reports"]').click();
    // Sale modal should open
    await expect(
      page.locator('[data-testid="sale-modal"]')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── 6. Customers ────────────────────────────────────────
test.describe("Customers", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/customers`);
    await page.waitForSelector('[data-testid="customers-page"]', {
      timeout: 10000,
    });
  });

  test("customers page renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="customers-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="button-add-customer"]')
    ).toBeVisible();
  });

  test("add customer button opens modal", async ({ page }) => {
    await page.locator('[data-testid="button-add-customer"]').click();
    await expect(
      page.locator('[data-testid="customer-modal"]')
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Offline delete integration", () => {
  test("online delete sends the exact URL and accepts a 204 response", async ({
    page,
  }) => {
    const customer = await mockDeleteTestApp(page);
    let deleteUrl = "";
    page.on("request", (request) => {
      if (request.method() === "DELETE") {
        deleteUrl = new URL(request.url()).pathname;
      }
    });

    await page.locator(`[data-testid="button-delete-${customer.id}"]`).click();

    await expect(page.locator(`[data-testid="customer-row-${customer.id}"]`))
      .toHaveCount(0);
    await expect.poll(() => deleteUrl).toBe(`/api/customers/${customer.id}`);
  });

  test("offline delete hides the row optimistically", async ({
    page,
  }) => {
    const customer = await mockDeleteTestApp(page);
    await page.evaluate(() => {
      const onlineFetch = window.fetch.bind(window);
      window.fetch = (input, init) =>
        init?.method === "DELETE"
          ? Promise.reject(new TypeError("fetch failed"))
          : onlineFetch(input, init);
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });

    await page.locator(`[data-testid="button-delete-${customer.id}"]`).click();

    await expect(page.locator(`[data-testid="customer-row-${customer.id}"]`))
      .toHaveCount(0);
  });
});

// ── 7. Categories ──────────────────────────────────────
test.describe("Categories", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/categories`);
    await page.waitForSelector('[data-testid="categories-page"]', {
      timeout: 10000,
    });
  });

  test("categories page renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="categories-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="button-add-category"]')
    ).toBeVisible();
  });
});

// ── 8. Suppliers ────────────────────────────────────────
test.describe("Suppliers", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/suppliers`);
    await page.waitForSelector('[data-testid="suppliers-page"]', {
      timeout: 10000,
    });
  });

  test("suppliers page renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="suppliers-page"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="button-add-supplier"]')
    ).toBeVisible();
  });
});

// ── 9. Staff ────────────────────────────────────────────
test.describe("Staff", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/staff`);
    await page.waitForSelector('[data-testid="staff-page"]', {
      timeout: 10000,
    });
  });

  test("staff page renders", async ({ page }) => {
    await expect(page.locator('[data-testid="staff-page"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="button-add-staff"]')
    ).toBeVisible();
  });
});

// ── 10. Settings ────────────────────────────────────────
test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/settings`);
    await page.waitForSelector('[data-testid="settings-page"]', {
      timeout: 10000,
    });
  });

  test("settings page renders", async ({ page }) => {
    await expect(
      page.locator('[data-testid="settings-page"]')
    ).toBeVisible();
  });
});

// ── 11. UI Features ─────────────────────────────────────
test.describe("UI Features", () => {
  test.beforeEach(async ({ page }) => {
    await mockTask08App(page, true, [task08Tenant, task08SecondTenant]);
    await page.goto(BASE);
  });

  test("theme toggle exists", async ({ page }) => {
    await expect(
      page.locator('[data-testid="theme-toggle"]')
    ).toBeVisible();
  });

  test("account switcher lives in the sidebar and changes account", async ({
    page,
  }) => {
    await expect(page.locator('[data-testid="account-switcher"]')).toBeVisible();
    await expect(page.locator('[data-testid="tenant-selector"]')).toHaveCount(0);

    await page.locator('[data-testid="account-switcher"]').click();
    await page
      .locator(`[data-testid="account-option-${task08SecondTenant.id}"]`)
      .click();

    await expect(page.locator('[data-testid="account-switcher"]')).toContainText(
      task08SecondTenant.name
    );
  });

  test("language toggle exists", async ({ page }) => {
    await expect(
      page.locator('[data-testid="language-toggle"]')
    ).toBeVisible();
  });

  test("header renders user profile", async ({ page }) => {
    await expect(page.locator('[data-testid="header"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
  });

  test("sidebar navigation has correct links", async ({ page }) => {
    const navItems = [
      "nav-dashboard",
      "nav-products",
      "nav-categories",
      "nav-customers",
      "nav-suppliers",
      "nav-reports",
    ];
    for (const testid of navItems) {
      await expect(page.locator(`[data-testid="${testid}"]`)).toBeVisible();
    }
    // Sales is NOT in sidebar — sales features are in Reports page
    // Staff, Settings, Audit may be hidden by policies
  });
});

test.describe("Single-account navigation", () => {
  test("shows the current account without an interactive switcher", async ({
    page,
  }) => {
    await mockTask08App(page);
    await page.goto(BASE);

    await expect(page.locator('[data-testid="current-account"]')).toContainText(
      task08Tenant.name
    );
    await expect(page.locator('[data-testid="account-switcher"]')).toHaveCount(0);
  });
});
