---
version: alpha
name: MedicalConnect-design-tokens
description: "Medical Connect's own dark-first glassmorphic system: a near-black canvas (#0A0B0D) layered with translucent charcoal glass panels (rgba(26, 29, 36, 0.6)), white text (#FFFFFF), and a single chromatic accent — Medical Connect blue (#3B82F6) — used on the brand mark, primary CTAs, focus rings, active nav state, and chart highlights. The system reads as a dense operations console: glass cards with backdrop-blur, soft blue glows, and a subtle gradient background, rather than flat hairline panels. A first-class light theme exists (white canvas, slate-900 ink) toggled via a `.light` class. Display type runs Space Grotesk over an Inter body; JetBrains Mono covers code/barcode contexts. Semantic status colors (success green, warning amber, danger red) are reserved for stock alerts, badges, and chart series — never used decoratively."

colors:
  primary: "#3B82F6"
  on-primary: "#FFFFFF"
  primary-hover: "#60A5FA"
  primary-focus: "#1D4ED8"
  ink: "#FFFFFF"
  ink-muted: "#A0A5B0"
  ink-subtle: "#6B7280"
  ink-tertiary: "#6B7280"
  canvas: "#0A0B0D"
  surface-1: "#12151A"
  surface-2: "#1A1D24"
  surface-3: "rgba(26, 29, 36, 0.6)"
  surface-4: "rgba(26, 29, 36, 0.8)"
  hairline: "rgba(255, 255, 255, 0.05)"
  hairline-strong: "rgba(255, 255, 255, 0.08)"
  hairline-tertiary: "rgba(255, 255, 255, 0.03)"
  inverse-canvas: "#FFFFFF"
  inverse-surface-1: "rgba(255, 255, 255, 0.6)"
  inverse-surface-2: "rgba(255, 255, 255, 0.8)"
  inverse-ink: "#0F172A"
  brand-secure: "#818CF8"
  semantic-success: "#10B981"
  semantic-danger: "#EF4444"
  semantic-warning: "#F59E0B"
  semantic-overlay: "rgba(0, 0, 0, 0.85)"
  chart-positive: "#22C55E"
  chart-negative: "#DC2626"
  chart-neutral: "#3B82F6"
  chart-grid: "rgba(255, 255, 255, 0.05)"

typography:
  display-xl:
    fontFamily: Linear Display
    fontSize: 80px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -3.0px
  display-lg:
    fontFamily: Linear Display
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -1.8px
  display-md:
    fontFamily: Linear Display
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1.0px
  headline:
    fontFamily: Linear Display
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.6px
  card-title:
    fontFamily: Linear Display
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.4px
  subhead:
    fontFamily: Linear Display
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: -0.2px
  body-lg:
    fontFamily: Linear Text
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.1px
  body:
    fontFamily: Linear Text
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.05px
  body-sm:
    fontFamily: Linear Text
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: Linear Text
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: Linear Text
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: Linear Text
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.4px
  mono:
    fontFamily: Linear Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-primary-pressed:
    backgroundColor: "{colors.primary-focus}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-inverse:
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  pricing-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-card-featured:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  product-screenshot-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: 24px
  testimonial-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: 32px
  customer-logo-tile:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 16px
  text-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  pricing-tab-default:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  pricing-tab-selected:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 6px 14px
  cta-banner:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: 48px
  changelog-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 24px 0
  status-badge:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    height: 56px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 32px
---

## Overview

Medical Connect's canvas is near-black — `{colors.canvas}` is #0A0B0D, rendered under a subtle body gradient rather than a flat fill. On top sits a surface ladder (`{colors.surface-1}`, `{colors.surface-2}` as opaque steps, `{colors.surface-3}`/`{colors.surface-4}` as translucent glass for cards and popovers) with soft borders running from `{colors.hairline}` up through `{colors.hairline-strong}`. White text (`{colors.ink}` #FFFFFF) carries the body and headlines in dark mode.

The single chromatic accent is **Medical Connect blue** `{colors.primary}` (#3B82F6) — used on the brand mark, focus rings, active nav state, and the primary CTA button. A lighter hover tint (`{colors.primary-hover}` #60A5FA) and a darker pressed/focus tone (`{colors.primary-focus}` #1D4ED8, the far stop of the primary gradient) extend the same hue. Status colors are reserved for meaning, not decoration: `{colors.semantic-success}` (#10B981) for in-stock/healthy states, `{colors.semantic-warning}` (#F59E0B) for low-stock alerts, `{colors.semantic-danger}` (#EF4444) for out-of-stock/errors, and the `{colors.chart-*}` tokens for stock-value and sales charts.

Display type runs Space Grotesk at weight 300–700, with Inter carrying body copy and JetBrains Mono covering barcode/code contexts — real, freely-licensed families, not proprietary cuts requiring substitutes.

The page rhythm is **glassmorphic**: cards (`{colors.surface-3}`) and popovers (`{colors.surface-4}`) are translucent, blurred (`backdrop-filter: blur(10px) saturate(112%)`) panels that let the gradient canvas show through, lifted further with soft blue glows (`box-shadow` at low-opacity `{colors.primary}`) rather than hard shadows.

**Key Characteristics:**

- **Dark-canvas system by default** — `{colors.canvas}` (#0A0B0D) with a documented light-theme mirror (`{colors.inverse-canvas}` #FFFFFF, `{colors.inverse-ink}` #0F172A) toggled via a `.light` class.
- **Blue brand accent** (`{colors.primary}` #3B82F6) — used scarcely on brand mark, focus, active state, and primary CTAs.
- Surface ladder blends opaque steps (canvas → surface-1 → surface-2) with translucent glass steps (surface-3 card, surface-4 popover) — hierarchy comes from blur + glow, not shadow alone.
- Typography uses real system-safe families (Space Grotesk / Inter / JetBrains Mono), no negative-tracking display treatment.
- Cards default to the app's single radius scale (`--radius` 16px, stepping down to 14px/12px for nested elements) rather than a wide rounded scale.
- **Glassmorphism + glow is the signature**, not screenshots: gradients, backdrop blur, and low-opacity blue glows are core, not avoided.
- One chromatic accent (blue) plus a scoped semantic palette (success/warning/danger) for status — never a second decorative brand color.

## Colors

> Source: `frontend/tailwind.config.ts`, `frontend/src/index.css` (Medical Connect's actual design tokens, dark theme = `:root` default, light theme = `.light` override).

### Brand & Accent
- **Medical Connect Blue** ({colors.primary}): The signature accent — primary CTA, brand mark, active nav, link emphasis, focus rings.
- **Blue Hover** ({colors.primary-hover}): Lighter blue (#60A5FA) — hovered state of the primary CTA.
- **Blue Focus/Pressed** ({colors.primary-focus}): Deeper blue (#1D4ED8) — the far stop of the primary gradient; pressed buttons, focus emphasis.
- **Brand Secure** ({colors.brand-secure}): Muted indigo (#818CF8) — `accent.secondary` in the Tailwind config; sparing secondary highlight, not a second brand color.

### Surface
- **Canvas** ({colors.canvas}): Default page background — #0A0B0D, near-pure black, rendered under a subtle gradient rather than flat.
- **Surface 1** ({colors.surface-1}): One step above canvas — #12151A, opaque panel background.
- **Surface 2** ({colors.surface-2}): Two steps above — #1A1D24, opaque, deepest solid tile.
- **Surface 3** ({colors.surface-3}): Glass card surface — rgba(26, 29, 36, 0.6) with backdrop-blur; the default `.glass-card` background.
- **Surface 4** ({colors.surface-4}): Glass popover/dropdown surface — rgba(26, 29, 36, 0.8), slightly more opaque than cards.
- **Hairline** ({colors.hairline}): rgba(255, 255, 255, 0.05) — default 1px borders on cards and dividers.
- **Hairline Strong** ({colors.hairline-strong}): rgba(255, 255, 255, 0.08) — glass-card border, slightly more visible.
- **Hairline Tertiary** ({colors.hairline-tertiary}): rgba(255, 255, 255, 0.03) — input backgrounds, faintest nested surfaces.
- **Inverse Canvas** ({colors.inverse-canvas}): #FFFFFF — light-theme page background (`.light` class).
- **Inverse Surface 1** ({colors.inverse-surface-1}): rgba(255, 255, 255, 0.6) — light-theme glass card.
- **Inverse Surface 2** ({colors.inverse-surface-2}): rgba(255, 255, 255, 0.8) — light-theme glass popover.

### Text
- **Ink** ({colors.ink}): All headlines and body type in dark mode — white #FFFFFF.
- **Ink Muted** ({colors.ink-muted}): Secondary type at #A0A5B0 — secondary-foreground, meta info.
- **Ink Subtle** ({colors.ink-subtle}): Tertiary type at #6B7280 — muted-foreground, deselected states, footer columns.
- **Ink Tertiary** ({colors.ink-tertiary}): Same #6B7280 — the app does not define a distinct fourth text tier; reuses muted-foreground.
- **Inverse Ink** ({colors.inverse-ink}): #0F172A — light-theme foreground (slate-900).

### Semantic
- **Success** ({colors.semantic-success}): #10B981 — in-stock / healthy status pills and indicators.
- **Warning** ({colors.semantic-warning}): #F59E0B — low-stock alerts, warning badges.
- **Danger** ({colors.semantic-danger}): #EF4444 — out-of-stock, destructive actions, error states.
- **Overlay** ({colors.semantic-overlay}): rgba(0, 0, 0, 0.85) — modal/dialog scrim.
- **Chart Positive** ({colors.chart-positive}): #22C55E — positive trend lines/bars.
- **Chart Negative** ({colors.chart-negative}): #DC2626 — negative trend lines/bars.
- **Chart Neutral** ({colors.chart-neutral}): #3B82F6 — same as primary; neutral series.
- **Chart Grid** ({colors.chart-grid}): rgba(255, 255, 255, 0.05) — chart gridlines, same opacity as hairline.

## Typography

### Font Family

- **Linear Display** — Linear's custom display sans; fallback `SF Pro Display, -apple-system, system-ui, Segoe UI, Roboto`. Carries display-xl through subhead.
- **Linear Text** — Linear's custom text sans (a slightly different cut tuned for body sizes); same fallback stack. Carries body sizes, button labels, captions.
- **Linear Mono** — Linear's custom mono; fallback `ui-monospace, SF Mono, Menlo`. Used for code snippets in product screenshots and for status / ID tokens.

The marketing surface treats Display and Text as one continuous voice; the family change is silent.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 600 | 1.05 | -3.0px | Largest hero headline |
| `{typography.display-lg}` | 56px | 600 | 1.10 | -1.8px | Section opener headlines |
| `{typography.display-md}` | 40px | 600 | 1.15 | -1.0px | Sub-section headlines |
| `{typography.headline}` | 28px | 600 | 1.20 | -0.6px | Pricing tier titles, CTA banner heading |
| `{typography.card-title}` | 22px | 500 | 1.25 | -0.4px | Feature card title |
| `{typography.subhead}` | 20px | 400 | 1.40 | -0.2px | Lead body, intro paragraphs |
| `{typography.body-lg}` | 18px | 400 | 1.50 | -0.1px | Hero subhead, lead paragraphs |
| `{typography.body}` | 16px | 400 | 1.50 | -0.05px | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.50 | 0 | Card body, footer columns |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Captions, meta, status |
| `{typography.button}` | 14px | 500 | 1.20 | 0 | All button labels |
| `{typography.eyebrow}` | 13px | 500 | 1.30 | 0.4px | Section eyebrow (slight positive tracking) |
| `{typography.mono}` | 13px | 400 | 1.50 | 0 | Linear Mono for code in product screenshots |

### Principles

- **Aggressive negative tracking on display** (-3.0px at 80px ≈ 4% of size).
- **Single voice from display to body.** Display-xl at 600 → body at 400 — same family, narrower weights.
- **Eyebrow uses positive tracking** (+0.4px) — contrast against the negative-tracked display marks the eyebrow as taxonomy.
- **Mono only in code contexts.** Linear Mono lives inside product screenshots — not on marketing chrome.

### Note on Font Substitutes

Linear's custom typeface isn't publicly distributed; the documented fallback `SF Pro Display, -apple-system, system-ui` is the recommended substitute on macOS. For cross-platform implementation, **Inter** at weight 500 / 600 / 700 is the closest free substitute. **Geist Sans** is also viable. For mono, **JetBrains Mono** or **Geist Mono** at weight 400 closely approximates Linear Mono.

## Layout

### Spacing System

- **Base unit**: 4px.
- **Tokens (front matter)**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- Card interior padding: `{spacing.lg}` 24px on feature/pricing cards; `{spacing.xl}` 32px on testimonial cards; `{spacing.xxl}` 48px on CTA banners.
- Pill button padding: 8px vertical · 14px horizontal — Linear's compact button spec.
- Form input padding: 8px vertical · 12px horizontal.

### Grid & Container

- Max content width sits around 1280px.
- Card grids are 3-up at desktop, 2-up at tablet, 1-up at mobile.
- Pricing tier grid is 3-up; comparison strip below shows checkmarks per tier.
- Product screenshot panels span full content width — they're the protagonist.

### Whitespace Philosophy

The dark canvas IS the whitespace. Sections separate by lift onto surface-1 panels, not by gaps in white. Within a panel, generous `{spacing.lg}` 24px gaps between content blocks; `{spacing.section}` 96px between sections.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Default for body type, page background |
| 1 (charcoal lift) | `{colors.surface-1}` opaque background on canvas | Base panels, section backgrounds |
| 2 (glass lift) | `{colors.surface-3}` translucent + `backdrop-filter: blur(10px) saturate(112%)`, 1px `{colors.hairline}` | Default `.glass-card`, metric cards, quick actions |
| 3 (glow hover) | Glass lift + `{colors.primary}` border tint + soft blue shadow (`glow-accent` / `glow-sm`) | Hovered cards, hovered buttons |
| 4 (focus ring) | 3px `{colors.primary}` ring at ~20% opacity (`--ring`) | Focused input, focused button |

Medical Connect's depth is carried by translucency + blur + soft glow, not the hairline-only ladder of a flat marketing site — shadows and gradients are a deliberate part of the brand, not avoided.

### Decorative Depth

- **Glass + glow dominates** as decorative depth — blurred, translucent cards over a gradient canvas.
- **Gradients are core, not avoided**: `{colors.primary}` → `{colors.primary-focus}` powers `gradient-primary` on primary buttons; a radial `gradient-accent`/`gradient-glow` washes the canvas.
- **Soft blue glow** (`box-shadow` in low-opacity `{colors.primary}`) on hover/focus states — the signature Medical Connect "lift", in place of Linear's hairline-only elevation.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Small chips, status badges |
| `{rounded.sm}` | 6px | Inline tags |
| `{rounded.md}` | 8px | All buttons, form inputs |
| `{rounded.lg}` | 12px | Pricing cards, feature cards, testimonial cards |
| `{rounded.xl}` | 16px | Product screenshot panels |
| `{rounded.xxl}` | 24px | Oversized CTA banners (rare) |
| `{rounded.pill}` | 9999px | Pricing tab toggles, status pills |
| `{rounded.full}` | 9999px | Avatar circles |

### Photography & Illustration Geometry

- Product UI screenshots dominate; they sit in `{rounded.xl}` 16px tiles with `{spacing.lg}` 24px outer padding.
- Customer logo tiles render at small sizes (~24px logo height) on `{colors.canvas}` with no border.
- Avatar circles in testimonial cards use `{rounded.full}` at 32–40px sizes.

## Components

### Buttons

**`button-primary`** — Blue CTA. The default primary CTA across all pages.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, padding 8px 14px, rounded `{rounded.md}`.
- Pressed state lives in `button-primary-pressed` (background shifts to `{colors.primary-focus}`).
- Hover state lives in `button-primary-hover` (background shifts to `{colors.primary-hover}` lighter blue).

**`button-secondary`** — Charcoal button. Used for secondary CTAs ("Sign in", "Read changelog").
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.button}`, padding 8px 14px, rounded `{rounded.md}`. 1px `{colors.hairline}` border.

**`button-tertiary`** — Plain text button.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.button}`, rounded `{rounded.md}`, padding 8px 14px.

**`button-inverse`** — White-on-dark inverse CTA.
- Background `{colors.inverse-canvas}`, text `{colors.inverse-ink}`, type `{typography.button}`, rounded `{rounded.md}`, padding 8px 14px.

### Pricing Tabs

**`pricing-tab-default`** + **`pricing-tab-selected`** — Pill-toggle on `/pricing`.
- Default: `{colors.canvas}` background, `{colors.ink-subtle}` text, rounded `{rounded.pill}`, padding 6px 14px.
- Selected: `{colors.surface-2}` background, `{colors.ink}` text — selected = surface lift.

### Cards & Containers

**`pricing-card`** — Each tier on `/pricing`.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.lg}`, padding 24px. 1px `{colors.hairline}` border.

**`pricing-card-featured`** — Recommended tier — surface lift to surface-2.
- Background `{colors.surface-2}`, otherwise identical structure.

**`feature-card`** — Generic feature highlight tile.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.lg}`, padding 24px.

**`product-screenshot-card`** — The dominant card type — frames a high-fidelity Linear app UI screenshot.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.xl}`, padding 24px.

**`testimonial-card`** — Customer quote with avatar + name + role.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body-lg}`, rounded `{rounded.lg}`, padding 32px.

**`customer-logo-tile`** — Small tile in the customer marquee.
- Background `{colors.canvas}`, text `{colors.ink-subtle}`, type `{typography.caption}`, rounded `{rounded.xs}`, padding 16px.

**`cta-banner`** — Closing CTA panel near page bottom.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.headline}`, rounded `{rounded.lg}`, padding 48px.

### Inputs & Forms

**`text-input`** + **`text-input-focused`** — Form fields on `/contact/sales` and signup overlays.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.md}`, padding 8px 12px.
- Focused state retains the same surface; the focus ring is a 2px `{colors.primary-focus}` outline at 50% opacity.

### Status & Build Page

**`changelog-row`** — Each row in `/build` (changelog page) listing version, date, and changes.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.xs}`, padding 24px 0. 1px `{colors.hairline}` bottom rule.

**`status-badge`** — Small status pill.
- Background `{colors.surface-2}`, text `{colors.ink-muted}`, type `{typography.caption}`, rounded `{rounded.pill}`, padding 2px 8px.

### Navigation

**`top-nav`** — Sticky dark bar with the Linear wordmark left, primary nav links centered, and a `button-secondary` ("Sign in") + `button-primary` ("Get started") pair right.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, height 56px.

### Footer

**`footer`** — Dense link grid on `{colors.canvas}` with the Linear wordmark left.
- Background `{colors.canvas}`, text `{colors.ink-subtle}`, type `{typography.caption}`, padding 64px 32px.

## Do's and Don'ts

### Do

- Reserve `{colors.canvas}` (#0A0B0D) as the system's anchor surface, rendered under the app's subtle body gradient.
- Use `{colors.primary}` blue ONLY for: brand mark, primary CTA, focus ring, active nav state, link emphasis, neutral chart series.
- Use the surface ladder (opaque canvas/surface-1/surface-2, translucent glass surface-3/surface-4) for hierarchy.
- Reserve semantic colors for meaning: `{colors.semantic-success}` (in-stock), `{colors.semantic-warning}` (low-stock), `{colors.semantic-danger}` (out-of-stock/errors) — never decoratively.
- Use `backdrop-filter: blur(...)` glass panels + soft `{colors.primary}` glow for lift, matching `.glass-card`/`.glass-input` conventions in `frontend/src/index.css`.
- Respect the light-theme mirror (`{colors.inverse-canvas}`/`{colors.inverse-ink}`) via the `.light` class — Medical Connect ships both themes.
- Compose CTAs as `{rounded.md}`-equivalent to the app's actual radius scale (`--radius` 16px stepping to 14px/12px).

### Don't

- Don't drop the light theme — Medical Connect is theme-aware (`darkMode: ["class"]`, `.light` overrides), unlike a dark-only marketing page.
- Don't use `{colors.primary}` blue as a full section background or large card fill — it's an accent, not a surface.
- Don't introduce a second chromatic brand color — `{colors.brand-secure}` (indigo) is a sparing secondary highlight, not a co-equal accent.
- Don't strip glow/gradient effects when reskinning a component — they're core to this system, not decoration to avoid.
- Don't use hard-edged flat shadows in place of the app's blur + low-opacity glow pattern.
- Don't use `#000000` true black as the canvas — Medical Connect's canvas carries a deliberate near-black, not pure black.
- Don't mix semantic colors (success/warning/danger) into non-status UI — keep them scoped to stock/alert states.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Desktop-XL | 1440px | Default desktop layout |
| Desktop | 1280px | Card grid 3-up maintained |
| Tablet | 1024px | Card grid 3-up → 2-up |
| Mobile-Lg | 768px | Pricing comparison becomes accordion; nav hamburger |
| Mobile | 480px | Single-column; display-xl scales 80px → ~36px |

### Touch Targets

- CTAs hold ≥40px tap height across viewports.
- Pricing tab pills hold ≥36px tap height; touch viewports grow to ≥44px.
- Form inputs hold ≥44px tap target on touch.

### Collapsing Strategy

- **Top nav**: links collapse to hamburger below 768px.
- **Card grids**: 3-up → 2-up at 1024px → 1-up below 768px.
- **Pricing comparison**: per-tier accordion below 768px.
- **Display type**: `{typography.display-xl}` 80px scales toward `{typography.display-md}` 40px on mobile.

### Image Behavior

- Product UI screenshots maintain aspect ratio and never crop.
- Customer logos in the marquee may collapse from 6-up to 3-up below 768px.

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name.
2. When introducing a section, decide first which surface lift it lives on.
3. Default body to `{typography.body}` at weight 400.
4. Run `npx @google/design.md lint DESIGN.md` after edits.
5. Add new variants as separate component entries.
6. Treat `{colors.primary}` blue as scarce: brand mark, primary CTA, focus, active nav, link emphasis.
7. Reach for a `.glass-card`/blur + glow treatment before reaching for a flat shadow.

## Known Gaps

- Color values are extracted directly from `frontend/tailwind.config.ts` and the `:root`/`.light` blocks in `frontend/src/index.css` — they are Medical Connect's actual, shipped tokens, not an approximation.
- Form-field error/validation styling beyond `{colors.semantic-danger}` is not fully catalogued here — check `frontend/src/components/ui/` for the live component before inventing a new treatment.
- The light theme (`.light` class) is captured via the `inverse-*` tokens, but Medical Connect's toggle mechanism (class-based, not `prefers-color-scheme`) should be respected when implementing theme-aware components.
- Chart color usage (`{colors.chart-*}`) reflects the tokens defined in `tailwind.config.ts`; actual per-chart series assignment lives in the charting components themselves.
- The typography scale (Linear Display/Text/Mono naming, negative letter-spacing, xs–xxl rounded/spacing scales) below is still Linear's structural system, Medical Connect's — only color tokens were reconciled with the app. Medical Connect's real type stack is Space Grotesk (display) / Inter (body) / JetBrains Mono, and its actual radius scale is the 3-step `--radius`-based one in `tailwind.config.ts`, not the xs–xxl scale documented here.
