# E2E Smoke Tests

Playwright end-to-end tests for the Medical Connect application.

**Test file:** `tests/app.spec.ts`
**Coverage:** Auth, Dashboard, Navigation, LAN Discovery, Products, Reports & Sales, Customers, Categories, Suppliers, Staff, Settings, UI Features

## Prerequisites

Both servers must be running:

```bash
# Terminal 1 — Backend (port 5200)
cd backend
npm run start:dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

## Run the tests

```bash
cd frontend
npx playwright test
```

## Variations

```bash
# Line reporter (shows each test as it runs)
npx playwright test --reporter=line

# Run a single test by name
npx playwright test -g "login page renders"

# Run all tests in a describe block
npx playwright test -g "LAN Discovery"

# Headed browser (see it visually)
npx playwright test --headed

# Open the HTML report
npx playwright test --reporter=html
npx playwright show-report

# Debug mode (step through)
npx playwright test --debug

# Inspect a failing test trace
npx playwright show-trace test-results/<test-folder>/trace.zip

# Run with increased timeout for slow CI
npx playwright test --timeout=60000
```

## Test Structure

| Area | Tests | What it checks |
|------|-------|----------------|
| Authentication | 3 | Login page, valid credentials, redirect guard |
| Task 08 UI findings | 10 | Standalone Sales route, product empty search, explicit LAN states |
| Dashboard & Navigation | 3 | Page rendering, all page routes, standalone `/sales` page |
| LAN Discovery | 5 | Toggle on/off, peer sync, device ID, status changes |
| Products | 3 | Page render, add modal, search filtering |
| Reports & Sales | 3 | Reports page, sales report type, sale modal |
| Customers | 2 | Page render, add customer modal |
| Categories | 1 | Page render with add button |
| Suppliers | 1 | Page render with add button |
| Staff | 1 | Page render with add button |
| Settings | 1 | Page render |
| UI Features | 5 | Theme toggle, tenant selector, language toggle, header, sidebar |
