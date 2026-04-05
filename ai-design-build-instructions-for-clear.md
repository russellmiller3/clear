# AI Build Instructions — UI System
> Paste this at the top of every prompt, or load as system context / knowledge base

---

## Stack

- **HTML + vanilla JavaScript** (no framework, no build step)
- **Tailwind CSS v4** (via CDN or PostCSS)
- **DaisyUI v5** (Tailwind plugin — semantic component classes)
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

Never mix themes on the same page. Never hardcode colors — always use DaisyUI semantic classes or CSS variables from design-system.md.

---

## Tailwind Usage Rules

- Use Tailwind utility classes for layout, spacing, sizing
- Use DaisyUI semantic classes for components (`btn`, `card`, `badge`, `navbar`, `table`, `stat`, `modal`, `drawer`, `tabs`, `input`, `select`, `textarea`, `toggle`, `checkbox`, `radio`)
- Never write custom CSS for anything DaisyUI already handles
- Never use arbitrary Tailwind values like `w-[437px]` — use scale values
- Always mobile-first: `sm:` `md:` `lg:` prefixes for responsive

---

## DaisyUI Component Classes — Reference

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

Full docs: https://daisyui.com/components/

---

## Button Rules

```html
<!-- Primary CTA — one per section max -->
<button class="btn btn-primary btn-lg">Get started</button>

<!-- Secondary -->
<button class="btn btn-outline btn-lg">Learn more</button>

<!-- Ghost / subtle -->
<button class="btn btn-ghost">Cancel</button>

<!-- Small / inline -->
<button class="btn btn-sm">Action</button>
```

Never use more than one `btn-primary` per section. Ghost or outline for all secondary actions.

---

## Card Rules

```html
<!-- Standard card -->
<div class="card bg-base-200 border border-base-300/50 shadow-sm">
  <div class="card-body">
    <h2 class="card-title">Title</h2>
    <p>Content</p>
  </div>
</div>

<!-- Feature card (landing) -->
<div class="card bg-base-200 border border-base-300/50 rounded-2xl p-8
            hover:border-primary/20 transition-colors duration-200">
  <div class="mb-4 text-primary"><!-- icon --></div>
  <h3 class="font-bold text-lg mb-2">Feature</h3>
  <p class="text-base-content/60 text-sm leading-relaxed">Description</p>
</div>
```

---

## Typography Rules

```html
<!-- Hero headline -->
<h1 class="text-5xl font-black tracking-tight leading-tight">
  Headline here
</h1>

<!-- Section heading -->
<h2 class="text-3xl font-bold tracking-tight">Section title</h2>

<!-- Subhead / lead -->
<p class="text-lg text-base-content/60 leading-relaxed max-w-xl">
  Supporting copy here.
</p>

<!-- Eyebrow (above hero headline) -->
<span class="badge badge-outline text-xs tracking-widest uppercase
             border-primary/30 text-primary bg-primary/10 rounded-full px-3">
  New · v2.0 →
</span>

<!-- Body text -->
<p class="text-base text-base-content/80 leading-relaxed">Body copy</p>

<!-- Label / caption -->
<span class="text-xs font-medium text-base-content/50 uppercase tracking-wide">Label</span>
```

Font stack is set in tailwind.config.js from design-system.md. Never override with inline font-family.

---

## Layout Patterns

### Page shell (app / dashboard)
```html
<div class="drawer lg:drawer-open">
  <input id="drawer" type="checkbox" class="drawer-toggle">
  <div class="drawer-content flex flex-col">
    <!-- Topbar -->
    <div class="navbar bg-base-200 border-b border-base-300/50 px-4 h-14">
      <label for="drawer" class="btn btn-ghost btn-sm drawer-button lg:hidden">
        <!-- hamburger icon -->
      </label>
      <span class="font-semibold text-base ml-2">App name</span>
      <div class="ml-auto flex items-center gap-2">
        <!-- topbar actions -->
      </div>
    </div>
    <!-- Page content -->
    <main class="flex-1 p-6 bg-base-100">
      <!-- content here -->
    </main>
  </div>
  <!-- Sidebar -->
  <div class="drawer-side z-40">
    <label for="drawer" class="drawer-overlay"></label>
    <ul class="menu p-4 w-60 min-h-full bg-base-200 border-r border-base-300/50 text-sm">
      <li><a class="font-medium">Dashboard</a></li>
      <li><a>Analytics</a></li>
      <li><a>Settings</a></li>
    </ul>
  </div>
</div>
```

### Landing page section
```html
<section class="py-24 px-4 max-w-6xl mx-auto">
  <!-- content -->
</section>
```

### Stat card grid
```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  <div class="stat bg-base-200 border border-base-300/50 rounded-xl">
    <div class="stat-title text-xs uppercase tracking-wide">Revenue</div>
    <div class="stat-value font-mono text-2xl tabular-nums">$48,291</div>
    <div class="stat-desc text-success text-xs">↑ 12.4% vs last month</div>
  </div>
</div>
```

### Data table
```html
<div class="overflow-hidden rounded-xl border border-base-300/50 bg-base-200">
  <table class="table table-sm">
    <thead>
      <tr class="bg-base-300/30 text-xs uppercase tracking-wide text-base-content/40">
        <th>Name</th>
        <th class="text-right">Amount</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody class="text-sm">
      <tr class="hover:bg-base-300/20 transition-colors">
        <td class="font-medium">Item</td>
        <td class="text-right font-mono tabular-nums">$1,240</td>
        <td><span class="badge badge-success badge-sm">Active</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## ECharts Rules

### Setup
```html
<!-- Always load from CDN -->
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>

<!-- Chart container — always explicit height -->
<div id="chart" style="width:100%;height:320px"></div>

<script>
  const chart = echarts.init(document.getElementById('chart'));
  chart.setOption({ /* config */ });

  // Always handle resize
  window.addEventListener('resize', () => chart.resize());
</script>
```

### Color palette — always use these, never default ECharts colors
```js
// Midnight theme
const COLORS = ['#58A6FF','#3FB950','#F78166','#D2A8FF','#FFA657','#39D3C4'];

// Ivory theme
const COLORS = ['#0969DA','#1A7F37','#BC4C00','#8250DF','#9A6700','#0E7490'];

// Nova theme
const COLORS = ['#E8613C','#16A34A','#9B59F5','#D97706','#2563EB','#0891B2'];
```

### Base config — always start here
```js
const baseConfig = {
  color: COLORS,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'inherit',
    color: '#8B949E',  // use --color-text-muted equivalent for theme
  },
  grid: {
    left: '3%', right: '3%', top: '8%', bottom: '8%',
    containLabel: true
  },
  tooltip: {
    backgroundColor: '#21262D',   // --color-surface for theme
    borderColor: 'rgba(240,246,252,0.1)',
    textStyle: { color: '#E6EDF3' },
    borderRadius: 8,
    padding: 12,
  },
  axisLine:   { lineStyle: { color: 'rgba(240,246,252,0.08)' } },
  splitLine:  { lineStyle: { color: 'rgba(240,246,252,0.06)', type: 'dashed' } },
  axisTick:   { show: false },
  axisLabel:  { color: '#8B949E', fontSize: 11, fontFamily: 'monospace' },
};
```

### Common chart types

**Line chart:**
```js
chart.setOption({
  ...baseConfig,
  xAxis: { type: 'category', data: ['Jan','Feb','Mar','Apr','May','Jun'] },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    data: [120, 200, 150, 300, 250, 400],
    smooth: true,
    lineStyle: { width: 2 },
    areaStyle: { opacity: 0.08 },
    symbol: 'none',
  }]
});
```

**Bar chart:**
```js
series: [{
  type: 'bar',
  data: [120, 200, 150, 300],
  barMaxWidth: 40,
  itemStyle: { borderRadius: [4, 4, 0, 0] },
}]
```

**Donut chart:**
```js
series: [{
  type: 'pie',
  radius: ['55%', '80%'],
  center: ['50%', '50%'],
  data: [
    { value: 60, name: 'Category A' },
    { value: 40, name: 'Category B' },
  ],
  label: { show: false },
  emphasis: { scale: true, scaleSize: 6 },
}]
```

### Rules
- Always `backgroundColor: 'transparent'`
- Always wire `window.addEventListener('resize', () => chart.resize())`
- Never use default ECharts color palette — always set `color: COLORS`
- Always set explicit pixel height on container div
- Tooltip always styled to match theme (never default yellow)
- Grid lines always subtle/dashed, never solid
- No chart titles inside ECharts — put titles in HTML above the chart

---

## State Patterns

### Loading skeleton
```html
<div class="animate-pulse space-y-3">
  <div class="h-4 bg-base-300 rounded w-3/4"></div>
  <div class="h-4 bg-base-300 rounded w-1/2"></div>
  <div class="h-4 bg-base-300 rounded w-5/6"></div>
</div>
```

### Empty state
```html
<div class="flex flex-col items-center justify-center py-16 text-center gap-3">
  <div class="text-base-content/20 text-5xl"><!-- icon --></div>
  <h3 class="font-semibold text-base">Nothing here yet</h3>
  <p class="text-sm text-base-content/50 max-w-xs">
    Add something to get started.
  </p>
  <button class="btn btn-primary btn-sm mt-2">Add first item</button>
</div>
```

### Error state
```html
<div class="alert alert-error text-sm">
  <span>Something went wrong. Please try again.</span>
</div>
```

### Toast notification (vanilla JS)
```js
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `alert alert-${type} fixed bottom-6 right-6 w-80 z-50
                  shadow-lg text-sm animate-fade-up`;
  el.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
```

---

## Status Badges

```html
<span class="badge badge-success badge-sm">Active</span>
<span class="badge badge-warning badge-sm">Pending</span>
<span class="badge badge-error badge-sm">Failed</span>
<span class="badge badge-ghost badge-sm">Inactive</span>

<!-- Status dot with label -->
<span class="flex items-center gap-1.5 text-xs font-medium text-success">
  <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
  Live
</span>
```

---

## Animation Rules

- Use `transition-colors duration-150` for color/bg hover changes
- Use `transition-all duration-200` for transform + opacity
- Use `animate-pulse` for loading states only
- Use `hover:scale-[1.02]` for primary CTA buttons only
- No parallax. No scroll-jacking. No full-page animations.
- Scroll reveals: `opacity-0 translate-y-3` → `opacity-100 translate-y-0` via IntersectionObserver only

```js
// Standard scroll reveal — use this pattern only
const observer = new IntersectionObserver((entries) => {
  entries.forEach(el => {
    if (el.isIntersecting) {
      el.target.classList.add('opacity-100', 'translate-y-0');
      el.target.classList.remove('opacity-0', 'translate-y-3');
      observer.unobserve(el.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
```

---

## 10 Hard Rules — Always Enforce

1. One accent color per page. Never two bold accent colors simultaneously.
2. One `btn-primary` per section. All others `btn-outline` or `btn-ghost`.
3. Hero headline ≤ 10 words. Subhead carries the nuance.
4. Max 3 font sizes in any single component.
5. 8pt spacing grid only. No 5px, 7px, 13px, 15px gaps.
6. Cards: colored background OR colored border. Never both.
7. Hover: transform OR color change. Not transform + color + shadow + glow together.
8. Logo bars: opacity ≤ 0.5. Trust signal, not hero content.
9. Motion budget: one hero animation + scroll reveals only.
10. Dark themes are separate palettes — never `filter: invert()` or `filter: brightness()`.

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

## What NOT to Do

- ❌ No inline `style="color:#333"` — use Tailwind/DaisyUI classes
- ❌ No custom CSS for components DaisyUI already provides
- ❌ No Bootstrap, Material UI, or other component libraries
- ❌ No jQuery
- ❌ No default ECharts colors
- ❌ No hardcoded pixel font sizes outside the type scale
- ❌ No `!important`
- ❌ No `z-index: 9999` on random elements — use z-index scale from design-system.md
- ❌ No placeholder lorem ipsum in final output
- ❌ No gradient backgrounds unless explicitly requested and theme-appropriate

---

*Attach design-system.md alongside this file for full token reference.*
*Stack: HTML · Vanilla JS · Tailwind CSS v4 · DaisyUI v5 · ECharts v5*
