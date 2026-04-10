# Clear Design System v2

> Visual system for apps compiled from Clear source. Every pattern here maps to a DaisyUI v5 + Tailwind v4 output.

---

## CDN Setup

Every compiled app emits these two tags before `</head>`:

```html
<link href="https://cdn.jsdelivr.net/npm/daisyui@5/daisyui.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

---

## Typography

Load once in `<head>`. Three roles, three fonts, never mixed.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Geist+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
```

| Role    | Font              | Use                              |
|---------|-------------------|----------------------------------|
| Display | Plus Jakarta Sans | Hero headlines only (h1 on landing pages) |
| Body    | DM Sans           | All UI text, headings, labels    |
| Mono    | Geist Mono        | Code, numbers, badges, data cells |

```css
/* Inject once via <style type="text/tailwindcss"> */
body { font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; }
.font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
.font-mono, code, pre { font-family: 'Geist Mono', monospace; }
```

---

## 10 Design Rules

These are compiler-enforced constraints, not suggestions.

1. **One accent color per page** — only `btn-primary` carries the accent. All other buttons are `btn-ghost` or `btn-outline`.
2. **One `btn-primary` per section** — secondary actions get `btn-ghost`.
3. **Hero headline ≤ 10 words** — compiler trims at render.
4. **Max 3 font sizes per component** — label / body / heading. Never more.
5. **8pt spacing grid** — use `p-2 p-4 p-6 p-8 p-12 p-16` (Tailwind's 4→8pt steps). No odd values.
6. **Cards: colored bg OR colored border, never both** — pick one signal, not two.
7. **Hover: transform OR color change, not both + shadow + glow** — one effect per interactive element.
8. **Logo bars opacity ≤ 0.5** — `opacity-40` or `opacity-50` on partner logos.
9. **Motion: one hero animation + scroll reveals only** — no element-level animations beyond these two.
10. **Dark themes are separate palettes** — never `filter: invert()` on a light theme.

---

## Theme CSS Variables

Place inside `<style>` before DaisyUI loads, or in your compiled CSS. Set `data-theme` on `<html>`.

### `midnight` — Tokyo Night (deep navy, electric blue accent)

```css
[data-theme="midnight"] {
  color-scheme: dark;
  --color-base-100: oklch(13% 0.02 250);     /* #0d1117 deep navy bg */
  --color-base-200: oklch(10% 0.02 255);     /* #090d14 sidebar/darker */
  --color-base-300: oklch(18% 0.015 250);    /* #161b22 borders/surfaces */
  --color-base-content: oklch(88% 0.025 240); /* #c8d8f0 light blue text */
  --color-primary: oklch(62% 0.18 250);      /* #4a8cff electric blue */
  --color-primary-content: oklch(98% 0.005 250);
  --color-secondary: oklch(58% 0.12 155);    /* #5dbb7a green */
  --color-secondary-content: oklch(10% 0.02 155);
  --color-accent: oklch(78% 0.14 85);        /* #ffbb44 warm yellow */
  --color-accent-content: oklch(12% 0.02 85);
  --color-neutral: oklch(20% 0.015 250);
  --color-neutral-content: oklch(80% 0.02 240);
  --color-info: oklch(68% 0.12 245);         /* #7ab4ff light blue */
  --color-info-content: oklch(10% 0.02 245);
  --color-success: oklch(62% 0.14 155);      /* #5dbb7a green */
  --color-success-content: oklch(10% 0.02 155);
  --color-warning: oklch(78% 0.14 85);       /* #ffbb44 yellow */
  --color-warning-content: oklch(15% 0.02 85);
  --color-error: oklch(60% 0.2 25);
  --color-error-content: oklch(10% 0.02 25);
  --radius-box: 0.75rem;
  --radius-field: 0.5rem;
  --radius-selector: 0.375rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

### `ivory` — Light Enterprise (Stripe / Ramp)

```css
[data-theme="ivory"] {
  color-scheme: light;
  --color-base-100: oklch(100% 0 0);
  --color-base-200: oklch(97.5% 0.004 240);
  --color-base-300: oklch(94% 0.006 240);
  --color-base-content: oklch(14% 0.02 255);
  --color-primary: oklch(52% 0.22 258);
  --color-primary-content: oklch(100% 0 0);
  --color-secondary: oklch(55% 0.15 200);
  --color-secondary-content: oklch(100% 0 0);
  --color-accent: oklch(60% 0.18 25);
  --color-accent-content: oklch(100% 0 0);
  --color-neutral: oklch(25% 0.01 255);
  --color-neutral-content: oklch(95% 0 0);
  --color-info: oklch(55% 0.18 245);
  --color-info-content: oklch(98% 0.005 245);
  --color-success: oklch(50% 0.17 150);
  --color-success-content: oklch(98% 0.005 150);
  --color-warning: oklch(65% 0.15 80);
  --color-warning-content: oklch(15% 0.02 80);
  --color-error: oklch(55% 0.2 25);
  --color-error-content: oklch(98% 0.005 25);
  --radius-box: 0.625rem;
  --radius-field: 0.375rem;
  --radius-selector: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

### `nova` — Warm Creative (Lovable / Amie)

```css
[data-theme="nova"] {
  color-scheme: light;
  --color-base-100: oklch(99% 0.008 80);
  --color-base-200: oklch(96% 0.012 78);
  --color-base-300: oklch(92% 0.016 75);
  --color-base-content: oklch(20% 0.025 65);
  --color-primary: oklch(63% 0.21 38);
  --color-primary-content: oklch(99% 0.005 38);
  --color-secondary: oklch(58% 0.18 285);
  --color-secondary-content: oklch(99% 0.005 285);
  --color-accent: oklch(65% 0.16 165);
  --color-accent-content: oklch(15% 0.02 165);
  --color-neutral: oklch(30% 0.02 65);
  --color-neutral-content: oklch(95% 0.008 80);
  --color-info: oklch(60% 0.16 240);
  --color-info-content: oklch(99% 0.005 240);
  --color-success: oklch(58% 0.16 155);
  --color-success-content: oklch(99% 0.005 155);
  --color-warning: oklch(70% 0.14 80);
  --color-warning-content: oklch(18% 0.02 80);
  --color-error: oklch(60% 0.2 25);
  --color-error-content: oklch(99% 0.005 25);
  --radius-box: 1rem;
  --radius-field: 0.75rem;
  --radius-selector: 0.5rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

### `arctic` — Ice Blue (Figma / Linear)

```css
[data-theme="arctic"] {
  color-scheme: light;
  --color-base-100: oklch(97% 0.01 220);
  --color-base-200: oklch(93% 0.016 220);
  --color-base-300: oklch(88% 0.022 220);
  --color-base-content: oklch(22% 0.04 225);
  --color-primary: oklch(48% 0.14 220);
  --color-primary-content: oklch(98% 0.005 220);
  --color-secondary: oklch(52% 0.12 175);
  --color-secondary-content: oklch(98% 0.005 175);
  --color-accent: oklch(65% 0.14 80);
  --color-accent-content: oklch(15% 0.02 80);
  --color-neutral: oklch(30% 0.03 225);
  --color-neutral-content: oklch(95% 0.01 220);
  --color-info: oklch(52% 0.16 220);
  --color-info-content: oklch(98% 0.005 220);
  --color-success: oklch(50% 0.14 160);
  --color-success-content: oklch(98% 0.005 160);
  --color-warning: oklch(65% 0.13 80);
  --color-warning-content: oklch(15% 0.02 80);
  --color-error: oklch(55% 0.18 25);
  --color-error-content: oklch(98% 0.005 25);
  --radius-box: 0.75rem;
  --radius-field: 0.5rem;
  --radius-selector: 0.375rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

### `moss` — Sage & Slate

```css
[data-theme="moss"] {
  color-scheme: light;
  --color-base-100: oklch(95.5% 0.01 150);
  --color-base-200: oklch(92% 0.014 148);
  --color-base-300: oklch(87% 0.018 145);
  --color-base-content: oklch(18% 0.025 155);
  --color-primary: oklch(44% 0.1 155);
  --color-primary-content: oklch(97% 0.005 155);
  --color-secondary: oklch(45% 0.09 280);
  --color-secondary-content: oklch(97% 0.005 280);
  --color-accent: oklch(48% 0.1 75);
  --color-accent-content: oklch(97% 0.005 75);
  --color-neutral: oklch(28% 0.02 155);
  --color-neutral-content: oklch(94% 0.01 150);
  --color-info: oklch(48% 0.12 220);
  --color-info-content: oklch(97% 0.005 220);
  --color-success: oklch(48% 0.12 155);
  --color-success-content: oklch(97% 0.005 155);
  --color-warning: oklch(60% 0.12 80);
  --color-warning-content: oklch(15% 0.02 80);
  --color-error: oklch(52% 0.16 25);
  --color-error-content: oklch(97% 0.005 25);
  --radius-box: 0.625rem;
  --radius-field: 0.375rem;
  --radius-selector: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

---

## Typography Scale

Use these classes consistently. Never define sizes outside this scale.

```html
<!-- Display — hero headlines only, Plus Jakarta Sans -->
<h1 class="font-display text-5xl font-bold tracking-tight leading-tight">
  Ship faster, break nothing.
</h1>

<!-- Page heading — DM Sans -->
<h1 class="text-3xl font-bold tracking-tight text-base-content">Dashboard</h1>

<!-- Section heading -->
<h2 class="text-xl font-semibold text-base-content">Recent Activity</h2>

<!-- Component heading -->
<h3 class="text-base font-semibold text-base-content">Total Revenue</h3>

<!-- Body text -->
<p class="text-sm text-base-content/70 leading-relaxed">
  Supporting copy goes here. Keep it under three lines.
</p>

<!-- Label (uppercase, tracked) -->
<span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">
  Category
</span>

<!-- Monospace data -->
<span class="font-mono text-sm text-base-content">$42,300.00</span>

<!-- Muted caption -->
<p class="text-xs text-base-content/40">Last updated 2 minutes ago</p>
```

**Token note:** `text-base-content/70` uses Tailwind's opacity modifier with the DaisyUI CSS variable. Works across all themes automatically.

---

## 1. Landing Page Sections

### 1a. Hero

Rule: headline ≤ 10 words. One `btn-primary`. Optional eyebrow badge.

```html
<!-- Eyebrow + headline + subhead + CTA -->
<section class="bg-base-100 py-24 px-6 text-center">
  <div class="max-w-3xl mx-auto flex flex-col items-center gap-6">

    <!-- Eyebrow badge (optional) -->
    <span class="badge badge-outline badge-sm font-mono tracking-wide uppercase">
      Now in public beta
    </span>

    <!-- Headline: Plus Jakarta Sans, ≤10 words -->
    <h1 class="font-display text-5xl md:text-6xl font-bold tracking-tight leading-tight text-base-content">
      Write English. Ship production apps.
    </h1>

    <!-- Subhead -->
    <p class="text-lg text-base-content/60 leading-relaxed max-w-xl">
      Clear compiles plain English to JavaScript, Python, and HTML.
      No boilerplate. No config. Just describe what you want.
    </p>

    <!-- CTA row: one primary, one ghost -->
    <div class="flex gap-3 flex-wrap justify-center">
      <a href="#" class="btn btn-primary btn-lg">Start building free</a>
      <a href="#" class="btn btn-ghost btn-lg">See examples →</a>
    </div>

  </div>
</section>
```

**Theme notes:**
- `midnight`: `bg-base-100` = deep navy. Text is near-white automatically.
- `ivory`: clean white canvas, blue primary button.
- `nova`: warm white bg, coral primary button.
- The eyebrow `badge-outline` picks up `--color-primary` border automatically.

---

### 1b. Feature Grid

2–3 columns. Icon + title + description. Card: bg only (no border). Rule 6.

```html
<section class="bg-base-200 py-20 px-6">
  <div class="max-w-5xl mx-auto">

    <h2 class="text-3xl font-bold text-base-content text-center mb-12">
      Everything the compiler handles for you
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

      <!-- Feature card: bg-base-100, NO border -->
      <div class="bg-base-100 rounded-box p-6 flex flex-col gap-3
                  hover:scale-[1.02] transition-transform duration-200">
        <!-- Icon: inline SVG or emoji, 24px -->
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor"
               stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-base-content">Instant compilation</h3>
        <p class="text-sm text-base-content/60 leading-relaxed">
          Your Clear file becomes a working app in under 8ms.
          Zero configuration required.
        </p>
      </div>

      <div class="bg-base-100 rounded-box p-6 flex flex-col gap-3
                  hover:scale-[1.02] transition-transform duration-200">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor"
               stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-base-content">Type-safe output</h3>
        <p class="text-sm text-base-content/60 leading-relaxed">
          Generated code passes TypeScript strict mode and ESLint out of the box.
        </p>
      </div>

      <div class="bg-base-100 rounded-box p-6 flex flex-col gap-3
                  hover:scale-[1.02] transition-transform duration-200">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor"
               stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-base-content">Five themes included</h3>
        <p class="text-sm text-base-content/60 leading-relaxed">
          One line of Clear picks midnight, ivory, nova, arctic, or moss.
        </p>
      </div>

    </div>
  </div>
</section>
```

**Theme notes:** `bg-primary/10` creates a 10% opacity tint of the theme primary. Works in all themes. Hover uses `scale` only (rule 7).

---

### 1c. Stats Strip

3–4 big numbers. Full-width band. Use DaisyUI `stats`.

```html
<section class="bg-base-100 border-y border-base-300 py-16 px-6">
  <div class="max-w-4xl mx-auto">
    <div class="stats stats-vertical md:stats-horizontal w-full shadow-none bg-transparent">

      <div class="stat">
        <div class="stat-title text-xs uppercase tracking-widest font-semibold">
          Apps compiled
        </div>
        <div class="stat-value font-mono text-4xl">48,291</div>
        <div class="stat-desc text-base-content/40">Since launch</div>
      </div>

      <div class="stat">
        <div class="stat-title text-xs uppercase tracking-widest font-semibold">
          Avg compile time
        </div>
        <div class="stat-value font-mono text-4xl">8ms</div>
        <div class="stat-desc text-base-content/40">p95 across all regions</div>
      </div>

      <div class="stat">
        <div class="stat-title text-xs uppercase tracking-widest font-semibold">
          Lines of Clear
        </div>
        <div class="stat-value font-mono text-4xl">1.2M</div>
        <div class="stat-desc text-base-content/40">Written this month</div>
      </div>

      <div class="stat">
        <div class="stat-title text-xs uppercase tracking-widest font-semibold">
          Open source stars
        </div>
        <div class="stat-value font-mono text-4xl">12.4k</div>
        <div class="stat-desc text-base-content/40">GitHub</div>
      </div>

    </div>
  </div>
</section>
```

---

### 1d. CTA Section

Full-width accent background. One button. No competing elements.

```html
<section class="bg-primary py-20 px-6 text-center">
  <div class="max-w-2xl mx-auto flex flex-col items-center gap-6">
    <h2 class="font-display text-4xl font-bold text-primary-content tracking-tight">
      Your next app starts with one sentence.
    </h2>
    <p class="text-primary-content/70 text-lg">
      No sign-up required. Paste your Clear file and watch it compile.
    </p>
    <!-- Primary button inverted on accent bg -->
    <a href="#" class="btn btn-lg bg-primary-content text-primary border-0
                       hover:bg-primary-content/90">
      Try the playground
    </a>
  </div>
</section>
```

**Theme notes:** `bg-primary` and `text-primary-content` flip correctly in every theme. The button uses `bg-primary-content text-primary` to invert — a reliable pattern for CTAs on colored bands.

---

### 1e. Alternating Section Bands

Light/dark alternating rhythm. Achieved through `bg-base-100` / `bg-base-200`.

```html
<!-- Band 1: light -->
<section class="bg-base-100 py-20 px-6">
  <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
    <div class="flex flex-col gap-4">
      <span class="text-xs font-semibold uppercase tracking-widest text-primary">Feature</span>
      <h2 class="text-3xl font-bold text-base-content tracking-tight">Write it like you mean it</h2>
      <p class="text-base-content/60 leading-relaxed">
        Clear reads like English because it is English with structure.
        The compiler infers types, validates inputs, and wires your API automatically.
      </p>
      <a href="#" class="btn btn-primary self-start">See how it works</a>
    </div>
    <div class="bg-base-200 rounded-box p-6 font-mono text-sm text-base-content/80 leading-relaxed">
      <pre>page 'Dashboard' at '/':
  heading 'Revenue'
  display revenue as card</pre>
    </div>
  </div>
</section>

<!-- Band 2: slightly darker -->
<section class="bg-base-200 py-20 px-6">
  <div class="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
    <!-- Image/demo left, text right (reversed) -->
    <div class="bg-base-300 rounded-box h-48 flex items-center justify-center
                text-base-content/30 text-sm">
      Demo screenshot
    </div>
    <div class="flex flex-col gap-4">
      <span class="text-xs font-semibold uppercase tracking-widest text-primary">Output</span>
      <h2 class="text-3xl font-bold text-base-content tracking-tight">
        Production-ready HTML, instantly
      </h2>
      <p class="text-base-content/60 leading-relaxed">
        The compiler emits DaisyUI v5 + Tailwind CSS v4. Every output is
        accessible, responsive, and theme-aware.
      </p>
      <a href="#" class="btn btn-ghost self-start border border-base-content/20">
        Read the docs
      </a>
    </div>
  </div>
</section>
```

---

## 2. App / Dashboard Layout

### 2a. Shell — Sidebar + Main Content

```html
<html data-theme="midnight" class="h-full">
<body class="h-full overflow-hidden">

<!-- Full-height flex shell -->
<div class="flex h-screen overflow-hidden">

  <!-- Sidebar: fixed width, scrollable nav -->
  <aside class="w-64 shrink-0 flex flex-col bg-base-200 border-r border-base-300 overflow-hidden">

    <!-- Brand -->
    <div class="px-5 py-4 border-b border-base-300 shrink-0">
      <span class="text-base font-bold text-base-content tracking-tight">Acme Inc</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto py-3 px-3">
      <ul class="menu menu-sm gap-0.5 p-0">
        <li>
          <a class="active font-semibold">
            <!-- active class adds primary bg automatically in DaisyUI -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </a>
        </li>
        <li><a>Analytics</a></li>
        <li><a>Customers</a></li>
        <li><a>Settings</a></li>
      </ul>
    </nav>

    <!-- User footer -->
    <div class="px-4 py-3 border-t border-base-300 shrink-0 flex items-center gap-3">
      <div class="avatar placeholder">
        <div class="w-8 rounded-full bg-neutral text-neutral-content">
          <span class="text-xs font-mono">RM</span>
        </div>
      </div>
      <div class="flex flex-col min-w-0">
        <span class="text-xs font-semibold text-base-content truncate">Russell Miller</span>
        <span class="text-xs text-base-content/40 truncate">russell@clear.dev</span>
      </div>
    </div>
  </aside>

  <!-- Main -->
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <!-- Sticky header (see 2b) -->
    <!-- Scrollable content -->
    <main class="flex-1 overflow-y-auto bg-base-100 p-8">
      <!-- Content goes here -->
    </main>
  </div>

</div>
</body>
</html>
```

---

### 2b. Sticky Header Bar

Sits at the top of the main column. Stays fixed while content scrolls.

```html
<header class="sticky top-0 z-20 flex items-center justify-between
               h-14 px-8 bg-base-100 border-b border-base-300 shrink-0">

  <div class="flex items-center gap-3">
    <h1 class="text-base font-semibold text-base-content">Revenue Dashboard</h1>
    <span class="badge badge-ghost badge-sm font-mono">Q4 2026</span>
  </div>

  <div class="flex items-center gap-2">
    <!-- One primary action max per header -->
    <button class="btn btn-ghost btn-sm gap-1.5">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
      Export
    </button>
    <button class="btn btn-primary btn-sm">New report</button>
  </div>

</header>
```

---

### 2c. Metric Card Grid

Rule 6: bg signal OR border signal, not both. Use `bg-base-200` cards with no border, or `bg-base-100` cards with a subtle border.

```html
<!-- 2×2 grid -->
<div class="grid grid-cols-2 gap-4 mb-8">

  <!-- Standard metric card: bg-base-200, no border -->
  <div class="bg-base-200 rounded-box p-6">
    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/50 mb-2">
      Monthly Revenue
    </p>
    <p class="font-mono text-3xl font-bold text-base-content tracking-tight">$42,300</p>
    <p class="text-xs text-success mt-1 font-mono">▲ 12.4% vs last month</p>
  </div>

  <!-- Highlighted metric: primary border, no bg color -->
  <div class="bg-base-100 border border-primary/30 rounded-box p-6">
    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/50 mb-2">
      Active Users
    </p>
    <p class="font-mono text-3xl font-bold text-primary tracking-tight">847</p>
    <p class="text-xs text-base-content/40 mt-1 font-mono">↔ Stable</p>
  </div>

  <div class="bg-base-200 rounded-box p-6">
    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/50 mb-2">
      Churn Rate
    </p>
    <p class="font-mono text-3xl font-bold text-error tracking-tight">2.1%</p>
    <p class="text-xs text-error/70 mt-1 font-mono">▲ 0.3% vs last month</p>
  </div>

  <div class="bg-base-200 rounded-box p-6">
    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/50 mb-2">
      Open Issues
    </p>
    <p class="font-mono text-3xl font-bold text-base-content tracking-tight">14</p>
    <p class="text-xs text-base-content/40 mt-1 font-mono">3 critical</p>
  </div>

</div>

<!-- 3×1 strip variant -->
<div class="grid grid-cols-3 gap-4 mb-8">
  <div class="bg-base-200 rounded-box px-6 py-4 flex justify-between items-center">
    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">MRR</span>
    <span class="font-mono text-xl font-bold text-base-content">$42k</span>
  </div>
  <div class="bg-base-200 rounded-box px-6 py-4 flex justify-between items-center">
    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">ARR</span>
    <span class="font-mono text-xl font-bold text-base-content">$504k</span>
  </div>
  <div class="bg-base-200 rounded-box px-6 py-4 flex justify-between items-center">
    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">NPS</span>
    <span class="font-mono text-xl font-bold text-success">72</span>
  </div>
</div>
```

---

### 2d. Data Table

Sortable headers, status badges, monospace numbers. Horizontal scroll on small screens.

```html
<div class="bg-base-100 rounded-box border border-base-300 overflow-hidden">

  <!-- Table header row -->
  <div class="px-6 py-4 border-b border-base-300 flex items-center justify-between">
    <h3 class="text-sm font-semibold text-base-content">Recent Transactions</h3>
    <input class="input input-sm input-bordered w-48 font-mono text-xs"
           placeholder="Search..." />
  </div>

  <!-- Scrollable table -->
  <div class="overflow-x-auto">
    <table class="table table-sm w-full">
      <thead>
        <tr class="border-base-300">
          <!-- Sortable header: cursor-pointer, hover:text-primary, no extra effects -->
          <th class="text-xs uppercase tracking-widest font-semibold text-base-content/50
                     cursor-pointer hover:text-primary transition-colors">
            Customer ↕
          </th>
          <th class="text-xs uppercase tracking-widest font-semibold text-base-content/50
                     cursor-pointer hover:text-primary transition-colors">
            Amount ↕
          </th>
          <th class="text-xs uppercase tracking-widest font-semibold text-base-content/50
                     cursor-pointer hover:text-primary transition-colors">
            Date ↕
          </th>
          <th class="text-xs uppercase tracking-widest font-semibold text-base-content/50">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-base-300 hover:bg-base-200 transition-colors">
          <td class="text-sm text-base-content font-medium">Acme Corporation</td>
          <td class="font-mono text-sm text-base-content">$4,200.00</td>
          <td class="font-mono text-xs text-base-content/50">2026-04-03</td>
          <td><span class="badge badge-success badge-sm">Paid</span></td>
        </tr>
        <tr class="border-base-300 hover:bg-base-200 transition-colors">
          <td class="text-sm text-base-content font-medium">Globex LLC</td>
          <td class="font-mono text-sm text-base-content">$1,850.00</td>
          <td class="font-mono text-xs text-base-content/50">2026-04-02</td>
          <td><span class="badge badge-warning badge-sm">Pending</span></td>
        </tr>
        <tr class="border-base-300 hover:bg-base-200 transition-colors">
          <td class="text-sm text-base-content font-medium">Initech Partners</td>
          <td class="font-mono text-sm text-base-content">$900.00</td>
          <td class="font-mono text-xs text-base-content/50">2026-04-01</td>
          <td><span class="badge badge-error badge-sm">Failed</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pagination footer -->
  <div class="px-6 py-3 border-t border-base-300 flex items-center justify-between">
    <span class="text-xs text-base-content/40 font-mono">Showing 1–20 of 341</span>
    <div class="join">
      <button class="join-item btn btn-ghost btn-xs">«</button>
      <button class="join-item btn btn-ghost btn-xs btn-active">1</button>
      <button class="join-item btn btn-ghost btn-xs">2</button>
      <button class="join-item btn btn-ghost btn-xs">»</button>
    </div>
  </div>

</div>
```

---

### 2e. Form — Labels, Inputs, Validation States

```html
<form class="bg-base-100 rounded-box border border-base-300 p-8 max-w-lg flex flex-col gap-5">

  <h2 class="text-lg font-semibold text-base-content mb-2">Account Details</h2>

  <!-- Standard field -->
  <fieldset class="fieldset">
    <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold
                   text-base-content/50">
      Full name
    </legend>
    <input type="text" class="input input-bordered w-full"
           placeholder="Russell Miller" />
  </fieldset>

  <!-- Success state -->
  <fieldset class="fieldset">
    <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold
                   text-base-content/50">
      Email
    </legend>
    <input type="email" class="input input-bordered input-success w-full"
           value="russell@clear.dev" />
    <p class="fieldset-label text-success text-xs mt-1">✓ Verified</p>
  </fieldset>

  <!-- Error state -->
  <fieldset class="fieldset">
    <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold
                   text-base-content/50">
      Password
    </legend>
    <input type="password" class="input input-bordered input-error w-full" />
    <p class="fieldset-label text-error text-xs mt-1">Must be at least 8 characters</p>
  </fieldset>

  <!-- Select -->
  <fieldset class="fieldset">
    <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold
                   text-base-content/50">
      Plan
    </legend>
    <select class="select select-bordered w-full">
      <option>Free</option>
      <option selected>Pro — $49/mo</option>
      <option>Team — $149/seat</option>
    </select>
  </fieldset>

  <!-- Checkbox -->
  <div class="flex items-center gap-3">
    <input type="checkbox" class="checkbox checkbox-primary" id="terms" checked />
    <label for="terms" class="text-sm text-base-content/70">
      I agree to the <a href="#" class="link link-primary">terms of service</a>
    </label>
  </div>

  <!-- Actions: one primary, one ghost -->
  <div class="flex gap-3 pt-2">
    <button type="submit" class="btn btn-primary flex-1">Save changes</button>
    <button type="button" class="btn btn-ghost">Cancel</button>
  </div>

</form>
```

---

## 3. Interactive Patterns

### 3a. Tabs — Content Switching

```html
<!-- DaisyUI tabs-bordered. JS switches .tab-active -->
<div role="tablist" class="tabs tabs-bordered mb-6">
  <button role="tab" class="tab tab-active" onclick="switchTab(this, 'overview')">
    Overview
  </button>
  <button role="tab" class="tab" onclick="switchTab(this, 'analytics')">
    Analytics
  </button>
  <button role="tab" class="tab" onclick="switchTab(this, 'settings')">
    Settings
  </button>
</div>

<div id="tab-overview" class="tab-panel">
  <p class="text-sm text-base-content/70">Overview content here.</p>
</div>
<div id="tab-analytics" class="tab-panel hidden">
  <p class="text-sm text-base-content/70">Analytics content here.</p>
</div>
<div id="tab-settings" class="tab-panel hidden">
  <p class="text-sm text-base-content/70">Settings content here.</p>
</div>

<script>
function switchTab(el, id) {
  document.querySelectorAll('[role="tab"]').forEach(t => t.classList.remove('tab-active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  el.classList.add('tab-active');
  document.getElementById('tab-' + id).classList.remove('hidden');
}
</script>
```

---

### 3b. Modal / Dialog

```html
<!-- Trigger -->
<button class="btn btn-primary" onclick="document.getElementById('my-modal').showModal()">
  Open modal
</button>

<!-- Modal: uses native <dialog> element — DaisyUI modal class -->
<dialog id="my-modal" class="modal">
  <div class="modal-box">

    <form method="dialog">
      <button class="btn btn-ghost btn-sm btn-circle absolute right-4 top-4">✕</button>
    </form>

    <h3 class="text-lg font-semibold text-base-content mb-1">Confirm deletion</h3>
    <p class="text-sm text-base-content/60 mb-6">
      This action is permanent. The record cannot be recovered.
    </p>

    <div class="modal-action">
      <form method="dialog" class="flex gap-3">
        <button class="btn btn-ghost">Cancel</button>
        <button class="btn btn-error">Delete</button>
      </form>
    </div>

  </div>
  <!-- Click outside closes -->
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
```

---

### 3c. Collapsible Sections

```html
<!-- DaisyUI collapse component -->
<div class="collapse collapse-arrow bg-base-200 rounded-box mb-2">
  <input type="checkbox" />
  <div class="collapse-title text-sm font-semibold text-base-content">
    Advanced settings
  </div>
  <div class="collapse-content">
    <p class="text-sm text-base-content/60 pt-2">
      Configure advanced options here. These affect compiled output directly.
    </p>
  </div>
</div>

<div class="collapse collapse-arrow bg-base-200 rounded-box mb-2">
  <input type="checkbox" />
  <div class="collapse-title text-sm font-semibold text-base-content">
    Environment variables
  </div>
  <div class="collapse-content">
    <pre class="font-mono text-xs bg-base-300 rounded p-4 mt-2">DATABASE_URL=postgres://...</pre>
  </div>
</div>
```

---

### 3d. Toast Notifications

```html
<!-- Toast container: fixed, top-right -->
<div class="toast toast-top toast-end z-50" id="toast-container">
  <!-- Toasts are injected here by JS -->
</div>

<script>
function showToast(message, type = 'info') {
  // type: 'success' | 'error' | 'warning' | 'info'
  const alertClass = {
    success: 'alert-success',
    error:   'alert-error',
    warning: 'alert-warning',
    info:    'alert-info',
  }[type];

  const el = document.createElement('div');
  el.className = `alert ${alertClass} text-sm shadow-lg max-w-xs`;
  el.innerHTML = `<span>${message}</span>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Usage
showToast('Record saved successfully', 'success');
showToast('Failed to connect to database', 'error');
</script>
```

---

## 4. Content Elements

### 4a. Heading Scale

```html
<!-- h1: page-level, DM Sans -->
<h1 class="text-3xl font-bold text-base-content tracking-tight leading-snug">
  Revenue Dashboard
</h1>

<!-- h2: section-level -->
<h2 class="text-xl font-semibold text-base-content tracking-tight">
  Recent Activity
</h2>

<!-- h3: component-level -->
<h3 class="text-base font-semibold text-base-content">
  Total Revenue
</h3>
```

### 4b. Body Text

```html
<p class="text-sm text-base-content/70 leading-relaxed max-w-prose">
  Body copy uses 70% opacity on base-content — readable in every theme
  without needing separate color tokens.
</p>

<!-- Smaller caption -->
<p class="text-xs text-base-content/40">Last updated 2 min ago</p>
```

### 4c. Labels

```html
<!-- Section label: uppercase, tracked, muted -->
<span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">
  Filter by status
</span>

<!-- Inline field label -->
<label class="text-xs font-medium text-base-content/60">Amount (USD)</label>
```

### 4d. Code Blocks

```html
<!-- Inline code -->
<code class="font-mono text-xs bg-base-300 text-base-content px-1.5 py-0.5 rounded">
  theme 'midnight'
</code>

<!-- Block code -->
<div class="bg-base-200 rounded-box border border-base-300 overflow-hidden">
  <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-300/50">
    <span class="text-xs font-mono text-base-content/50">main.clear</span>
  </div>
  <pre class="font-mono text-sm text-base-content/80 p-4 leading-relaxed overflow-x-auto"><code>build for web
theme 'midnight'

page 'Dashboard' at '/':
  heading 'Revenue'
  display revenue as card</code></pre>
</div>
```

### 4e. Dividers

```html
<!-- Horizontal rule -->
<div class="divider my-0"></div>

<!-- Labeled divider -->
<div class="divider text-xs text-base-content/30 font-mono uppercase tracking-widest">
  or continue with
</div>
```

### 4f. Button Links

```html
<!-- Primary CTA button -->
<a href="#" class="btn btn-primary">Get started</a>

<!-- Ghost secondary action -->
<a href="#" class="btn btn-ghost">Learn more</a>

<!-- Outline variant -->
<a href="#" class="btn btn-outline btn-primary">View docs</a>

<!-- Small ghost with arrow -->
<a href="#" class="btn btn-ghost btn-sm gap-1">
  See all examples
  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
  </svg>
</a>
```

### 4g. Status Badges

```html
<!-- DaisyUI badge variants — all theme-aware -->
<span class="badge badge-success badge-sm">Active</span>
<span class="badge badge-warning badge-sm">Pending</span>
<span class="badge badge-error badge-sm">Failed</span>
<span class="badge badge-info badge-sm">In review</span>
<span class="badge badge-ghost badge-sm font-mono">Draft</span>

<!-- With dot indicator -->
<span class="badge badge-success badge-sm gap-1.5">
  <span class="w-1.5 h-1.5 rounded-full bg-current inline-block"></span>
  Live
</span>

<!-- Outline style (rule 6: border only, no colored bg) -->
<span class="badge badge-outline badge-sm text-success border-success">Verified</span>
```

### 4h. Images

```html
<!-- Full-width responsive image -->
<img src="https://example.com/hero.jpg" alt="" class="w-full rounded-lg" loading="lazy" />

<!-- Avatar (circular, fixed size) -->
<img src="https://example.com/avatar.jpg" alt="" width="64" height="64" class="rounded-full object-cover" loading="lazy" />
```

### 4i. Blog Layouts

```html
<!-- Blog grid (3-column card listing) -->
<section class="bg-base-100 py-16 lg:py-24 px-6">
  <div class="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
    <!-- blog_card -->
    <div class="bg-base-100 rounded-2xl overflow-hidden border border-base-300/40 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col group">
      <img src="..." alt="" class="w-full rounded-lg" loading="lazy" />
      <div class="p-6 flex flex-col flex-1">
        <span class="badge badge-info badge-sm">Category</span>
        <h3 class="text-lg font-semibold mt-3">Post Title</h3>
        <p class="text-sm text-base-content/60 mt-2">Excerpt...</p>
      </div>
    </div>
  </div>
</section>

<!-- Blog article (Medium-style single post) -->
<section class="bg-base-100 py-16 px-6 max-w-3xl mx-auto">
  <span class="badge badge-info badge-sm">Category</span>
  <h1 class="text-3xl font-bold mt-4">Article Title</h1>
  <p class="text-base text-base-content/80 leading-relaxed mt-6">Paragraph text...</p>
  <h2 class="text-xl font-semibold mt-8">Subheading</h2>
</section>
```

---

## 5. ECharts Integration

### Color Palettes per Theme

```js
const CHART_PALETTES = {
  midnight: ['#4d94ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8'],
  ivory:    ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
  nova:     ['#f97316', '#8b5cf6', '#10d9a0', '#f59e0b', '#ec4899', '#3b82f6'],
  arctic:   ['#1e6a8a', '#2a7a60', '#7a6010', '#5a4a8a', '#1a8a70', '#4a7a9a'],
  moss:     ['#4a7a50', '#5a5a8a', '#7a6030', '#3a6a7a', '#7a5a6a', '#5a7a48'],
};
```

### Base Config — Transparent bg, Themed Tooltip, Subtle Grid

```js
function getBaseConfig(theme) {
  // Pull computed CSS variables from the rendered DOM
  const style = getComputedStyle(document.documentElement);
  const textColor   = style.getPropertyValue('--color-base-content').trim() || '#888';
  const gridColor   = 'rgba(128,128,128,0.1)';
  const tooltipBg   = theme === 'midnight' ? '#1a2035' : '#ffffff';
  const tooltipText = theme === 'midnight' ? '#e6edf3' : '#1a1f2e';

  return {
    backgroundColor: 'transparent',
    color: CHART_PALETTES[theme] || CHART_PALETTES.ivory,
    textStyle: {
      fontFamily: "'DM Sans', sans-serif",
      color: tooltipText,
    },
    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: gridColor,
      borderWidth: 1,
      textStyle: {
        color: tooltipText,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 12,
      },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    },
    legend: {
      textStyle: {
        color: tooltipText,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
      },
    },
    grid: {
      left: 48, right: 16, top: 24, bottom: 40,
      containLabel: true,
    },
    xAxis: {
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: {
        color: tooltipText,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        opacity: 0.5,
      },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: tooltipText,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        opacity: 0.5,
      },
      splitLine: {
        lineStyle: { color: gridColor, type: 'dashed' },
      },
    },
  };
}
```

### Line Chart Starter

```js
function lineChartConfig(theme, { title, xData, series }) {
  return {
    ...getBaseConfig(theme),
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      lineStyle: { width: 2 },
      symbolSize: 4,
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: CHART_PALETTES[theme][i] + '30' },
            { offset: 1, color: CHART_PALETTES[theme][i] + '00' },
          ],
        },
      },
    })),
    xAxis: {
      ...getBaseConfig(theme).xAxis,
      type: 'category',
      data: xData,
      boundaryGap: false,
    },
    yAxis: { ...getBaseConfig(theme).yAxis, type: 'value' },
    tooltip: { ...getBaseConfig(theme).tooltip, trigger: 'axis' },
  };
}

// Usage
const chart = echarts.init(document.getElementById('chart'));
chart.setOption(lineChartConfig('midnight', {
  xData: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [
    { name: 'Revenue', data: [32000, 38000, 35000, 42000, 40000, 48000] },
    { name: 'Expenses', data: [18000, 21000, 19000, 24000, 22000, 25000] },
  ],
}));
```

### Bar Chart Starter

```js
function barChartConfig(theme, { xData, series, horizontal = false }) {
  const base = getBaseConfig(theme);
  return {
    ...base,
    series: series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      itemStyle: {
        borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        color: CHART_PALETTES[theme][i],
      },
      barMaxWidth: 40,
    })),
    xAxis: horizontal
      ? { ...base.xAxis, type: 'value' }
      : { ...base.xAxis, type: 'category', data: xData },
    yAxis: horizontal
      ? { ...base.yAxis, type: 'category', data: xData }
      : { ...base.yAxis, type: 'value' },
    tooltip: { ...base.tooltip, trigger: 'axis' },
  };
}
```

### Donut Chart Starter

```js
function donutChartConfig(theme, { data, title }) {
  const base = getBaseConfig(theme);
  return {
    ...base,
    series: [{
      type: 'pie',
      radius: ['52%', '72%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      data: data.map((d, i) => ({
        ...d,
        itemStyle: { color: CHART_PALETTES[theme][i] },
      })),
      label: {
        show: true,
        position: 'outside',
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        color: base.textStyle.color,
      },
      labelLine: { length: 8, length2: 12 },
      emphasis: {
        itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
      },
    }],
    title: title ? {
      text: title,
      left: 'center',
      top: 'center',
      textStyle: {
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: base.textStyle.color,
      },
    } : undefined,
    tooltip: {
      ...base.tooltip,
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
  };
}

// Usage
donutChartConfig('ivory', {
  title: 'Revenue',
  data: [
    { name: 'Enterprise', value: 48 },
    { name: 'Pro',        value: 32 },
    { name: 'Free',       value: 20 },
  ],
});
```

---

## Quick Reference — DaisyUI Classes Used

| Category      | Classes                                                                 |
|---------------|-------------------------------------------------------------------------|
| Buttons       | `btn btn-primary btn-ghost btn-outline btn-sm btn-lg btn-circle`        |
| Badges        | `badge badge-success badge-warning badge-error badge-info badge-ghost`  |
| Cards         | `card card-body card-title` (or custom div with `rounded-box`)          |
| Forms         | `input input-bordered input-success input-error select select-bordered` |
| Tables        | `table table-sm`                                                        |
| Stats         | `stats stat stat-title stat-value stat-desc`                            |
| Navigation    | `menu menu-sm`                                                          |
| Tabs          | `tabs tabs-bordered tab tab-active`                                     |
| Modal         | `modal modal-box modal-action modal-backdrop`                           |
| Collapse      | `collapse collapse-arrow collapse-title collapse-content`               |
| Toast         | `toast toast-top toast-end alert alert-success alert-error`             |
| Dividers      | `divider`                                                               |
| Avatars       | `avatar avatar-placeholder`                                             |
| Join          | `join join-item` (for button groups / pagination)                       |
| Layout        | `drawer` (sidebar with overlay on mobile)                               |

---

## Spacing Cheatsheet (8pt grid)

| Tailwind class | px value | Use                        |
|----------------|----------|----------------------------|
| `p-2`          | 8px      | Icon padding, badge inset  |
| `p-4`          | 16px     | Component inner padding    |
| `p-6`          | 24px     | Card padding               |
| `p-8`          | 32px     | Section padding            |
| `p-12`         | 48px     | Large section breathe room |
| `p-16`         | 64px     | Hero vertical padding      |
| `p-24`         | 96px     | Landing page sections      |
| `gap-2`        | 8px      | Tight element groups       |
| `gap-4`        | 16px     | Standard gaps              |
| `gap-6`        | 24px     | Card grids                 |
| `gap-8`        | 32px     | Section sub-components     |

---

*Clear Design System v2 — generated for Clear compiler output*
