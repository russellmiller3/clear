# AI Build Instructions -- UI System
> Paste this at the top of every prompt, or load as system context / knowledge base

---

## Stack

- **HTML + vanilla JavaScript** (no framework, no build step)
- **Tailwind CSS v4** (via CDN or PostCSS)
- **DaisyUI v5** (Tailwind plugin -- semantic component classes)
- **Apache ECharts** (all charts, graphs, data viz)
- **No React. No Vue. No Svelte. No JSX.**

---

## File Context

Always read `design-system.md` before generating any UI. It defines:
- 3 named color themes: `midnight`, `ivory`, `nova`
- All token values: colors, typography, spacing, radius, shadows, animation
- Component patterns: buttons, cards, hero, nav, badges, tables
- 10 hard design rules (enforce all of them)

---

## Theme Selection

Every component or page must declare a theme. Apply it as a `data-theme` attribute on the root element or `<html>` tag.

```html
<!-- Midnight (dark SaaS) -->
<html data-theme="midnight">

<!-- Ivory (light enterprise) -->
<html data-theme="ivory">

<!-- Nova (AI / creative / warm) -->
<html data-theme="nova">
```

Never mix themes on the same page. Never hardcode colors -- always use DaisyUI semantic classes or CSS variables from design-system.md.

---

## Tailwind Usage Rules

- Use Tailwind utility classes for layout, spacing, sizing
- Use DaisyUI semantic classes for components (`btn`, `card`, `badge`, `navbar`, `table`, `stat`, `modal`, `drawer`, `tabs`, `input`, `select`, `textarea`, `toggle`, `checkbox`, `radio`)
- Never write custom CSS for anything DaisyUI already handles
- Never use arbitrary Tailwind values like `w-[437px]` -- use scale values
- Always mobile-first: `sm:` `md:` `lg:` prefixes for responsive

---

## DaisyUI Component Classes -- Reference

Always prefer these over hand-rolled CSS:

```
Layout:    navbar, drawer, hero, footer
Content:   card, card-body, card-title, divider, badge, avatar
Data:      table, stat, stat-title, stat-value, stat-desc
Forms:     input, select, textarea, checkbox, radio, toggle, range, file-input
Actions:   btn, btn-primary, btn-secondary, btn-ghost, btn-outline, btn-sm, btn-lg
Feedback:  alert, toast, loading, progress, radial-progress
Navigation:menu, tabs, breadcrumbs, pagination, steps, link
Overlay:   modal, drawer, tooltip, popover, dropdown
```

---

## 10 Hard Rules -- Always Enforce

1. One accent color per page. Never two bold accent colors simultaneously.
2. One `btn-primary` per section. All others `btn-outline` or `btn-ghost`.
3. Hero headline <= 10 words. Subhead carries the nuance.
4. Max 3 font sizes in any single component.
5. 8pt spacing grid only. No 5px, 7px, 13px, 15px gaps.
6. Cards: colored background OR colored border. Never both.
7. Hover: transform OR color change. Not transform + color + shadow + glow together.
8. Logo bars: opacity <= 0.5. Trust signal, not hero content.
9. Motion budget: one hero animation + scroll reveals only.
10. Dark themes are separate palettes -- never `filter: invert()` or `filter: brightness()`.

---

## CDN Imports (always use these exact versions)

```html
<!-- Tailwind CSS v4 -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- DaisyUI v5 -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@5/dist/full.min.css" rel="stylesheet">

<!-- ECharts v5 -->
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

---

*Attach design-system.md alongside this file for full token reference.*
*Stack: HTML + Vanilla JS + Tailwind CSS v4 + DaisyUI v5 + ECharts v5*
