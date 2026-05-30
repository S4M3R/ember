---
version: alpha
name: Ember-YC-skeuomorphic
description: A YC-orange, gently-skeuomorphic developer-tool aesthetic adapted from Cursor's warm-cream editorial canvas (`#f7f7f4`). Near-black warm ink (`#26251e`) carries body and display; display sits at weight 400 with negative letter-spacing for a magazine feel. The single brand voltage is **YC Orange** (`#ff6600`) reserved for primary CTAs and the wordmark. Unlike the flat original, depth here is **tactile**: soft layered shadows, top-lit gradient buttons with an inset highlight, raised cards, and inset form fields — "a bit skeuomorphic," not glossy. A signature pastel timeline palette (peach, mint, blue, lavender, gold) marks pipeline/attribution stages. Inter for display/body, JetBrains Mono on every code surface.

colors:
  primary: "#ff6600"
  primary-hover: "#ff7a1a"
  primary-active: "#e25400"
  primary-tint: "#fff1e6"
  ink: "#26251e"
  body: "#5a5852"
  body-strong: "#26251e"
  muted: "#807d72"
  muted-soft: "#a09c92"
  hairline: "#e6e5e0"
  hairline-soft: "#efeee8"
  hairline-strong: "#cfcdc4"
  canvas: "#f7f7f4"
  canvas-soft: "#fafaf7"
  surface-card: "#ffffff"
  surface-strong: "#e6e5e0"
  on-primary: "#ffffff"
  timeline-thinking: "#dfa88f"
  timeline-grep: "#9fc9a2"
  timeline-read: "#9fbbe0"
  timeline-edit: "#c0a8dd"
  timeline-done: "#c08532"
  semantic-error: "#cf2d56"
  semantic-success: "#1f8a65"

gradients:
  primary: "linear-gradient(180deg, #ff8534 0%, #ff6600 52%, #f25c00 100%)"
  primary-hover: "linear-gradient(180deg, #ff9445 0%, #ff7414 52%, #ff6600 100%)"
  primary-active: "linear-gradient(180deg, #f25c00 0%, #e25400 100%)"
  surface-raised: "linear-gradient(180deg, #ffffff 0%, #fbfaf6 100%)"
  ink-button: "linear-gradient(180deg, #36352c 0%, #26251e 100%)"
  canvas-vignette: "radial-gradient(120% 120% at 50% 0%, #fafaf7 0%, #f7f7f4 60%, #f1f0ea 100%)"

shadows:
  xs: "0 1px 2px rgba(38,37,30,0.06)"
  sm: "0 1px 3px rgba(38,37,30,0.10), 0 1px 2px rgba(38,37,30,0.06)"
  md: "0 6px 16px rgba(38,37,30,0.10), 0 2px 5px rgba(38,37,30,0.07)"
  lg: "0 16px 36px rgba(38,37,30,0.14), 0 5px 12px rgba(38,37,30,0.09)"
  inset-field: "inset 0 1px 2px rgba(38,37,30,0.12), inset 0 0 0 1px rgba(38,37,30,0.02)"
  button-raised: "inset 0 1px 0 rgba(255,255,255,0.40), 0 2px 5px rgba(217,72,0,0.32), 0 1px 1px rgba(38,37,30,0.10)"
  button-pressed: "inset 0 2px 5px rgba(170,60,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)"
  ink-raised: "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 10px rgba(38,37,30,0.28)"

typography:
  display-mega:
    fontFamily: "'Inter', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: 72px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -2.16px
  display-lg:
    fontFamily: "'Inter', sans-serif"
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.72px
  display-md:
    fontFamily: "'Inter', sans-serif"
    fontSize: 26px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: -0.325px
  display-sm:
    fontFamily: "'Inter', sans-serif"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.11px
  title-md:
    fontFamily: "'Inter', sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  title-sm:
    fontFamily: "'Inter', sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "'Inter', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-tracked:
    fontFamily: "'Inter', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.08px
  body-sm:
    fontFamily: "'Inter', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "'Inter', sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  caption-uppercase:
    fontFamily: "'Inter', sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.88px
    textTransform: uppercase
  code:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button:
    fontFamily: "'Inter', sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0
  nav-link:
    fontFamily: "'Inter', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 10px
  lg: 14px
  xl: 18px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
    shadow: "{shadows.sm}"
  button-primary:
    background: "{gradients.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
    height: 40px
    shadow: "{shadows.button-raised}"
  button-primary-hover:
    background: "{gradients.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    shadow: "{shadows.button-raised}"
  button-primary-active:
    background: "{gradients.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    shadow: "{shadows.button-pressed}"
    transform: "translateY(1px)"
  button-secondary:
    background: "{gradients.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 17px
    height: 40px
    border: "1px solid {colors.hairline-strong}"
    shadow: "{shadows.sm}"
  button-tertiary-text:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.button}"
  button-download:
    background: "{gradients.ink-button}"
    textColor: "{colors.canvas}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 20px
    height: 44px
    shadow: "{shadows.ink-raised}"
  hero-band:
    background: "{gradients.canvas-vignette}"
    textColor: "{colors.ink}"
    typography: "{typography.display-mega}"
    padding: 80px
  ide-mockup-card:
    background: "{gradients.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 0
    shadow: "{shadows.lg}"
    border: "1px solid {colors.hairline}"
  ide-pane:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px
    shadow: "{shadows.inset-field}"
  feature-card:
    background: "{gradients.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 24px
    shadow: "{shadows.md}"
    border: "1px solid {colors.hairline}"
  comparison-card:
    background: "{gradients.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
    shadow: "{shadows.md}"
  timeline-pill-thinking:
    backgroundColor: "{colors.timeline-thinking}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  timeline-pill-grep:
    backgroundColor: "{colors.timeline-grep}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  timeline-pill-read:
    backgroundColor: "{colors.timeline-read}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  timeline-pill-edit:
    backgroundColor: "{colors.timeline-edit}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  timeline-pill-done:
    backgroundColor: "{colors.timeline-done}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  code-block:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: 20px
    shadow: "{shadows.inset-field}"
    border: "1px solid {colors.hairline}"
  pricing-tier-card:
    background: "{gradients.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
    shadow: "{shadows.md}"
    border: "1px solid {colors.hairline}"
  pricing-tier-featured:
    background: "{gradients.ink-button}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
    shadow: "{shadows.lg}"
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
    height: 44px
    shadow: "{shadows.inset-field}"
    border: "1px solid {colors.hairline-strong}"
  badge-pill:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
    shadow: "{shadows.xs}"
  cta-band:
    background: "{gradients.canvas-vignette}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: 96px
  testimonial-card:
    background: "{gradients.surface-raised}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
    shadow: "{shadows.md}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: 64px 48px
  footer-link:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
---

## Overview

A YC-orange, gently-skeuomorphic developer-tool aesthetic. The base canvas is **warm cream** (`{colors.canvas}` — #f7f7f4) holding warm near-black ink (`{colors.ink}` — #26251e) for body and display alike. The single brand voltage is **YC Orange** (`{colors.primary}` — #ff6600) reserved for primary CTAs and the wordmark — used scarcely.

Type runs **Inter** as the single sans family (the open substitute for the original licensed display face). Display sits at weight 400 with negative letter-spacing — a magazine-editorial voice rather than tech-bombastic. JetBrains Mono carries every code surface (and code surfaces are roughly half of Ember's UI).

The defining departure from the source system is **depth**. The original was flat — hairline-only, no shadows. This system is **a bit skeuomorphic**: surfaces are layered, buttons are top-lit gradients with an inset highlight that read as physically raised, cards cast soft shadows, and form fields sit recessed with an inner shadow. It is tactile, not glossy — restraint is the rule, one elevation step at a time.

The brand's strongest visual signature is the **timeline pill palette**: five pastel pills (peach `{colors.timeline-thinking}`, mint `{colors.timeline-grep}`, blue `{colors.timeline-read}`, lavender `{colors.timeline-edit}`, gold `{colors.timeline-done}`) marking pipeline/attribution stages. In Ember these map cleanly onto the turn timeline and pipeline waterfall.

**Key Characteristics:**
- Warm cream canvas, not white. Ink is warm (#26251e), not pure black.
- Single CTA color: `{colors.primary}` (YC Orange #ff6600), rendered as a top-lit gradient. Used scarcely.
- Display weight stays at 400 — never bold. Magazine voice.
- **Skeuomorphic depth:** layered shadow scale, raised gradient buttons, recessed inputs. Tactile, not glossy.
- Timeline pastels: 5 dedicated tokens for pipeline/attribution stages.
- Slightly softer radii than the flat original (CTAs 10px, cards 14px) to suit the tactile look.
- 80px section rhythm.

## Colors

### Brand & Accent
- **YC Orange** (`{colors.primary}` — #ff6600): Primary CTA gradient base, wordmark, hero accent. Used scarcely.
- **YC Orange Hover** (`{colors.primary-hover}` — #ff7a1a): Lighter hover stop.
- **YC Orange Active** (`{colors.primary-active}` — #e25400): Pressed / darker stop.
- **YC Orange Tint** (`{colors.primary-tint}` — #fff1e6): Faint wash behind selected/active states.

### Surface
- **Canvas** (`{colors.canvas}` — #f7f7f4): Warm cream page floor.
- **Canvas Soft** (`{colors.canvas-soft}` — #fafaf7): Recessed pane background inside mockups.
- **Surface Card** (`{colors.surface-card}` — #ffffff): White card surface; with `{gradients.surface-raised}` it gets a faint top-light.
- **Surface Strong** (`{colors.surface-strong}` — #e6e5e0): Badges, tag pills.

### Hairlines
- **Hairline** (`{colors.hairline}` — #e6e5e0): 1px divider / card border (pairs with a soft shadow).
- **Hairline Soft** (`{colors.hairline-soft}` — #efeee8): Lighter divider.
- **Hairline Strong** (`{colors.hairline-strong}` — #cfcdc4): Stronger panel outline / input border.

### Text
- **Ink** (`{colors.ink}` — #26251e): Display, body emphasis. Warm near-black.
- **Body** (`{colors.body}` — #5a5852): Default running-text.
- **Body Strong** (`{colors.body-strong}` — #26251e): Same as ink.
- **Muted** (`{colors.muted}` — #807d72): Sub-titles.
- **Muted Soft** (`{colors.muted-soft}` — #a09c92): Disabled text.
- **On Primary** (`{colors.on-primary}` — #ffffff): White text on YC Orange.

### Timeline (pipeline / attribution signature)
- **Thinking** (`{colors.timeline-thinking}` — #dfa88f): Peach.
- **Grep** (`{colors.timeline-grep}` — #9fc9a2): Mint.
- **Read** (`{colors.timeline-read}` — #9fbbe0): Pastel blue.
- **Edit** (`{colors.timeline-edit}` — #c0a8dd): Lavender.
- **Done** (`{colors.timeline-done}` — #c08532): Warm gold.

### Semantic
- **Success** (`{colors.semantic-success}` — #1f8a65): Confirmation indicators (e.g. Cekura re-score → pass).
- **Error** (`{colors.semantic-error}` — #cf2d56): Validation errors, Cekura failures.

## Typography

### Font Family
**Inter** is the display + body family (weights 400/500/600). Fallback: `system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif`. Code surfaces switch to **JetBrains Mono**.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-mega}` | 72px | 400 | 1.1 | -2.16px | Hero h1 |
| `{typography.display-lg}` | 36px | 400 | 1.2 | -0.72px | Section heads |
| `{typography.display-md}` | 26px | 400 | 1.25 | -0.325px | Sub-section heads |
| `{typography.display-sm}` | 22px | 400 | 1.3 | -0.11px | Card group titles |
| `{typography.title-md}` | 18px | 600 | 1.4 | 0 | Component titles |
| `{typography.title-sm}` | 16px | 600 | 1.4 | 0 | List labels |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Default body |
| `{typography.body-tracked}` | 16px | 400 | 1.5 | 0.08px | Tracked editorial body |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Footer body |
| `{typography.caption}` | 13px | 400 | 1.4 | 0 | Captions |
| `{typography.caption-uppercase}` | 11px | 600 | 1.4 | 0.88px | Section labels, timeline pill labels |
| `{typography.code}` | 13px | 400 | 1.5 | 0 | Code / prompt / response — JetBrains Mono |
| `{typography.button}` | 14px | 600 | 1.0 | 0 | CTA labels |
| `{typography.nav-link}` | 14px | 500 | 1.4 | 0 | Top-nav menu |

### Principles
- **Display weight stays at 400.** Magazine voice, never bold.
- **Negative letter-spacing on display only.** -0.11px to -2.16px tracking.
- **JetBrains Mono on every code surface** (prompt blocks, response text, IDE panes).
- Button labels bump to 600 — slightly heavier so the raised CTA reads as a physical control.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.base}` 16px · `{spacing.md}` 20px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **Section padding:** 80px.

### Grid & Container
- Max content width: ~1200px.
- Editorial body: 12-column grid.
- Ember app shell: three panels — turn timeline · prompt heatmap · response + replay.

### Whitespace Philosophy
Generous editorial pacing. The cream canvas has plenty of breathing room; shadows do the work of separating layers, so cards can sit close (16–24px gap) without feeling cramped.

## Elevation & Depth

This system uses a **layered skeuomorphic depth model** — the deliberate inverse of the flat original. Depth comes from a small, consistent shadow scale plus top-light gradients. Keep it restrained: most surfaces use `{shadows.sm}`–`{shadows.md}`; reserve `{shadows.lg}` for the single hero/IDE focal card.

| Level | Treatment | Use |
|---|---|---|
| Sunken | `{shadows.inset-field}` | Inputs, code blocks, IDE panes — recessed into the surface |
| Flat (canvas) | `{colors.canvas}`, no shadow | Body bands, footer |
| Raised 1 | `{gradients.surface-raised}` + `{shadows.sm}` | Secondary buttons, small cards |
| Raised 2 | `{gradients.surface-raised}` + `{shadows.md}` | Feature / content cards |
| Raised 3 | `{gradients.surface-raised}` + `{shadows.lg}` | Hero IDE-mockup card, featured pricing tier |
| Control | `{gradients.primary}` + `{shadows.button-raised}` | Primary CTA — top-lit with inset highlight |

### Skeuomorphic rules
- **Top-light convention.** Light comes from above: gradients run light→dark top→bottom; raised elements carry an `inset 0 1px 0 rgba(255,255,255,…)` highlight on their top edge.
- **Press = recess.** Active/pressed controls swap to `{shadows.button-pressed}` and nudge `translateY(1px)` — the control physically sinks.
- **One step at a time.** Don't stack elevations; a card on a card should not both cast `{shadows.lg}`. Demote the inner one.
- **Shadows are warm.** All shadow rgba is tinted with the ink hue (38,37,30), never pure black — it sits naturally on cream.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Reserved |
| `{rounded.xs}` | 4px | Inline tags |
| `{rounded.sm}` | 6px | Compact rows |
| `{rounded.md}` | 10px | CTA buttons, form inputs |
| `{rounded.lg}` | 14px | Cards, IDE panes |
| `{rounded.xl}` | 18px | Larger feature cards (rare) |
| `{rounded.pill}` | 9999px | Timeline pills, badges |
| `{rounded.full}` | 9999px | Avatars (rare) |

### Shadow Scale

| Token | Value | Use |
|---|---|---|
| `{shadows.xs}` | `0 1px 2px rgba(38,37,30,0.06)` | Pills, badges |
| `{shadows.sm}` | layered, ~3px blur | Raised-1 surfaces, nav |
| `{shadows.md}` | layered, ~16px blur | Cards |
| `{shadows.lg}` | layered, ~36px blur | Hero / focal card |
| `{shadows.inset-field}` | inner shadow | Recessed inputs, code blocks |
| `{shadows.button-raised}` | inset highlight + warm-orange drop | Primary CTA at rest |
| `{shadows.button-pressed}` | inner orange shadow | Primary CTA pressed |
| `{shadows.ink-raised}` | inset highlight + deep drop | Dark download CTA |

## Components

### Top Navigation
**`top-nav`** — Background `{colors.canvas}`, text `{colors.ink}`, height 64px, `{shadows.sm}` so the bar floats above scrolling content. Wordmark left, menu center, Sign In + primary CTA right.

### Buttons
**`button-primary`** — The signature YC Orange CTA, rendered as `{gradients.primary}` (top-lit), text `{colors.on-primary}`, type `{typography.button}` (14px / 600), padding 10×18px, height 40px, rounded `{rounded.md}` (10px), `{shadows.button-raised}` (inset top highlight + warm-orange drop). Reads as a physically raised control.

**`button-primary-hover`** — Lighter gradient `{gradients.primary-hover}`, same shadow.

**`button-primary-active`** — Pressed: `{gradients.primary-active}`, `{shadows.button-pressed}`, `translateY(1px)`. The button visibly sinks.

**`button-secondary`** — Raised white pill: `{gradients.surface-raised}`, text `{colors.ink}`, 1px `{colors.hairline-strong}` border, `{shadows.sm}`.

**`button-tertiary-text`** — Inline ink text link, no elevation.

**`button-download`** — Dark CTA: `{gradients.ink-button}`, text `{colors.canvas}`, padding 12×20px, height 44px, `{shadows.ink-raised}`.

### Hero & IDE Mockups
**`hero-band`** — `{gradients.canvas-vignette}` (subtle radial top-light), display headline `{typography.display-mega}`, subhead `{typography.body-md}`, CTAs, and a centered IDE-mockup card below.

**`ide-mockup-card`** — Focal raised card: `{gradients.surface-raised}`, rounded `{rounded.lg}`, 1px `{colors.hairline}` border, `{shadows.lg}`. Panes fill edge-to-edge (padding 0).

**`ide-pane`** — Recessed pane: `{colors.canvas-soft}`, `{typography.code}`, rounded `{rounded.md}`, `{shadows.inset-field}` so it reads sunken into the card.

### Cards
**`feature-card`** — `{gradients.surface-raised}`, `{typography.title-md}`, rounded `{rounded.lg}`, padding 24px, 1px `{colors.hairline}` border, `{shadows.md}`.

**`comparison-card`** — Same raised surface; internally split into 2 columns.

**`testimonial-card`** — Quote card, `{gradients.surface-raised}`, `{shadows.md}`.

### Timeline (signature → Ember turn timeline / pipeline)
**`timeline-pill-thinking`** — Peach pill, `{colors.timeline-thinking}`, `{typography.caption-uppercase}`, rounded `{rounded.pill}`, `{shadows.xs}`.

**`timeline-pill-grep` / `read` / `edit`** — Mint / pastel-blue / lavender variants, same shape.

**`timeline-pill-done`** — Gold pill, white text. Marks the resolved/Done stage.

### Code
**`code-block`** — Recessed: `{colors.surface-card}`, `{typography.code}`, rounded `{rounded.lg}`, padding 20px, `{shadows.inset-field}`, 1px `{colors.hairline}` border. Used for prompt blocks and response text.

### Pricing
**`pricing-tier-card`** — `{gradients.surface-raised}`, rounded `{rounded.lg}`, padding 32px, 1px `{colors.hairline}` border, `{shadows.md}`.

**`pricing-tier-featured`** — Inverts to ink: `{gradients.ink-button}`, text `{colors.canvas}`, `{shadows.lg}`.

### Forms & Tags
**`text-input`** — Recessed field: `{colors.surface-card}`, rounded `{rounded.md}`, padding 12×16px, height 44px, `{shadows.inset-field}`, 1px `{colors.hairline-strong}` border. Focus adds a `{colors.primary}` ring.

**`badge-pill`** — Small uppercase pill, `{colors.surface-strong}`, `{shadows.xs}`.

### CTA / Footer
**`cta-band`** — Pre-footer band: `{gradients.canvas-vignette}`, centered `{typography.display-lg}`, single YC Orange CTA. 96px vertical padding.

**`footer`** — `{colors.canvas}`, text `{colors.body}`, 5-column links, 64×48px padding. Flat (footers sit at the page floor).

**`footer-link`** — Transparent, text `{colors.body}`, `{typography.body-sm}`.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (YC Orange) for primary CTAs and the brand wordmark.
- Render the primary CTA as `{gradients.primary}` with `{shadows.button-raised}` — top-lit, physically raised.
- Keep depth restrained: one elevation step per surface, warm ink-tinted shadows.
- Sink inputs and code blocks with `{shadows.inset-field}`; raise cards and controls.
- Keep display weight at 400. The editorial voice depends on it.
- Use the cream `{colors.canvas}` page floor — never pure white.
- Render every code surface (prompt blocks, response text, IDE panes) in JetBrains Mono.
- Use timeline pastels only on the turn timeline / pipeline visualizations.

### Don't
- Don't introduce a secondary brand action color. YC Orange is the only one.
- Don't go glossy — no high-contrast specular highlights, no heavy bevels or beveled borders. "A bit" skeuomorphic: soft shadows and a single top-light gradient, nothing more.
- Don't stack elevations (a `{shadows.lg}` card holding `{shadows.lg}` children). Demote the inner layer.
- Don't use pure-black shadows; tint with the ink hue so they sit on cream.
- Don't drop display to bold weights (700+). Magazine voice depends on 400.
- Don't use timeline pastels on non-timeline UI.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Hero h1 72→32px; three-panel shell stacks vertically; nav hamburger; shadows lighten one step. |
| Tablet | 640–1024px | Hero h1 56px; panels collapse to 2-up; feature grid 2-up. |
| Desktop | 1024–1280px | Full hero h1 72px; full three-panel shell; feature grid 3-up. |
| Wide | > 1280px | Content caps at 1200px. |

### Touch Targets
- Primary CTA at 40px height — at WCAG AA, padded for AAA.
- Download CTA at 44px — at AAA.

### Collapsing Strategy
- Top nav switches to hamburger below 768px.
- Ember three-panel shell collapses to stacked panels on mobile.
- Feature grid: 3-up → 2-up → 1-up.

## Iteration Guide

1. Focus on a single component at a time.
2. CTAs default to `{rounded.md}` (10px). Cards use `{rounded.lg}` (14px).
3. Elevation: pick exactly one shadow token per surface from the scale — don't hand-roll new shadows.
4. Use `{token.refs}` everywhere — never inline hex, gradients, or shadows.
5. Raised controls carry a top inset highlight; pressed states recess + nudge down 1px.
6. Inter 400 for display, 400/500/600 for body. JetBrains Mono on every code surface.
7. YC Orange stays scarce.
8. Timeline pastels stay scoped to pipeline/attribution visualizations.

## Known Gaps

- The original display face was licensed; Inter is the substitute used here.
- Animation timings (button press, pill entrance, replay transition) are out of scope — pair with `motion` in the viz.
- Dark-mode variant not defined; the system is cream-light only.
- Focus-ring spec beyond "{colors.primary} ring on inputs" not fully captured.
