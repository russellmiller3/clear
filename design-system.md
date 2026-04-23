# SaaS Design Token System
> For Tailwind CSS + DaisyUI · Landing pages, dashboards, web apps
> Informed by: Linear, Vercel, Retell AI, Lovable, Ramp, BetterStack, Stripe

---

## Themes (11 total)

Pick one per project. Override with semantic tokens only. All themes
ship in Clear's compiler and are invoked via `theme 'name'` at the top
of a `.clear` file.

### Curated shortlist (Marcus first)

The 5 themes surfaced first in any picker UI. Covers ~90% of Marcus
and SMB use cases.

| Name | Personality | Best for | Reference |
|---|---|---|---|
| **`ivory`** (default) | Light enterprise — trust, clean, conversion | Any SaaS default | Stripe, Ramp, Deel |
| **`sakura`** | Cream + dusty rose — soft, warm, human | Retail, beauty, wellness, hospitality (often female-founded service biz) | Japanese-influenced boutique |
| **`dusk`** | Warm dark — amber on deep brown | AI chat at night, creative writing, journaling | Cozy-warm night mode (opposite of midnight) |
| **`vault`** | Dark navy + muted gold, conservative radii | PE firms, banking, legal, compliance — "trust is the product" | Bank lobby, private equity decks |
| **`arctic`** | Cool light blue + teal | Clean utility, tech-forward SMBs | Notion, Height |

### Additional themes

Available but not featured — not targeted at Marcus's primary use cases.

| Name | Personality | Best for |
|---|---|---|
| `midnight` | Dark + electric blue | Tech startups, developer tools (Linear/Vercel) |
| `nova` | Warm light + coral + purple | AI/creative consumer (Lovable/Amie) |
| `slate` | Muted dark gray-blue | Late-night ops dashboards |
| `moss` | Muted earthy green | Permaculture, wellness, notion-gardener |
| `ember` | Dark + fiery orange | Music, gaming, high-energy consumer |
| `forge` | Brutalist — pure B/W + hot magenta, sharp corners | Design-forward tech teams (Stripe Press / Vercel) |

### Default behavior

When a `.clear` source has no `theme` directive, the compiler defaults
to `ivory`. Explicitly set with: `theme 'sakura'` (etc.) on its own
line near the top of the file.

---

## Color Tokens

> **Note:** the CSS blocks below are the original design-token values
> (hex-based, 3 themes). The canonical shipping tokens live in
> `compiler.js` → `THEME_CSS` as OKLCH (all 11 themes, including the
> newer `arctic`, `moss`, `ember`, `slate`, `dusk`, `vault`, `sakura`,
> `forge`). If you're editing a theme, edit `THEME_CSS` in `compiler.js`
> — this markdown is reference only.

### Midnight Theme (dark)

```css
/* Base surfaces */
--color-base:        #0D1117;   /* page bg */
--color-elevated:    #161B22;   /* card, nav */
--color-surface:     #21262D;   /* input, dropdown */
--color-overlay:     #30363D;   /* modal, popover */

/* Borders */
--color-border:      rgba(240,246,252,0.10);
--color-border-strong: rgba(240,246,252,0.20);

/* Text */
--color-text:        #E6EDF3;
--color-text-muted:  #8B949E;
--color-text-subtle: #484F58;

/* Accent (electric blue — one bold CTA color only) */
--color-accent:         #58A6FF;
--color-accent-hover:   #79B8FF;
--color-accent-subtle:  rgba(88,166,255,0.12);

/* Semantic */
--color-success:     #3FB950;
--color-warning:     #D29922;
--color-danger:      #F85149;
--color-info:        #58A6FF;
```

### Ivory Theme (light)

```css
/* Base surfaces */
--color-base:        #FFFFFF;
--color-elevated:    #F6F8FA;
--color-surface:     #EAEEF2;
--color-overlay:     #FFFFFF;

/* Borders */
--color-border:      #D0D7DE;
--color-border-strong: #AFB8C1;

/* Text */
--color-text:        #1C2128;
--color-text-muted:  #57606A;
--color-text-subtle: #8C959F;

/* Accent (deep indigo) */
--color-accent:         #0969DA;
--color-accent-hover:   #0550AE;
--color-accent-subtle:  #DDF4FF;

/* Semantic */
--color-success:     #1A7F37;
--color-warning:     #9A6700;
--color-danger:      #CF222E;
--color-info:        #0550AE;
```

### Nova Theme (AI/creative)

```css
/* Base surfaces */
--color-base:        #FAFAF9;
--color-elevated:    #FFFFFF;
--color-surface:     #F5F0EB;
--color-overlay:     #FFFFFF;

/* Borders */
--color-border:      #E8E0D8;
--color-border-strong: #CFC4B8;

/* Text */
--color-text:        #1A1714;
--color-text-muted:  #6B5E54;
--color-text-subtle: #A8998F;

/* Accent (coral — warm, human) */
--color-accent:         #E8613C;
--color-accent-hover:   #CC4F2C;
--color-accent-subtle:  #FDF0EC;

/* Secondary accent (used for gradients only) */
--color-accent2:        #9B59F5;

/* Semantic */
--color-success:     #16A34A;
--color-warning:     #D97706;
--color-danger:      #DC2626;
--color-info:        #2563EB;
```

---

## Typography

### Font Stacks

```css
--font-display: 'Cal Sans', 'DM Serif Display', Georgia, serif;
  /* Hero headlines. Bold, editorial. */

--font-body: 'Geist', 'DM Sans', system-ui, sans-serif;
  /* Body copy, UI labels, nav. */

--font-mono: 'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace;
  /* Code, tokens, badges, data. */
```

> For Midnight/Retell style: swap `--font-display` to `'Syne'` (geometric, technical)
> For Nova/Lovable style: use `'Fraunces'` (organic serif with personality)
> Never use: Inter, Roboto, Arial as display. Fine for body fallback only.

### Type Scale

```css
--text-xs:   0.75rem;   /* 12px — captions, badges */
--text-sm:   0.875rem;  /* 14px — labels, helper text */
--text-base: 1rem;      /* 16px — body */
--text-lg:   1.125rem;  /* 18px — lead / subheading */
--text-xl:   1.25rem;   /* 20px — card titles */
--text-2xl:  1.5rem;    /* 24px — section headings */
--text-3xl:  1.875rem;  /* 30px — page titles */
--text-4xl:  2.25rem;   /* 36px — hero subhead */
--text-5xl:  3rem;      /* 48px — hero headline */
--text-6xl:  3.75rem;   /* 60px — big hero */
--text-7xl:  4.5rem;    /* 72px — landing statement */
```

### Font Weights

```css
--weight-regular:   400;
--weight-medium:    500;
--weight-semibold:  600;
--weight-bold:      700;
--weight-black:     900;  /* display headlines only */
```

### Line Heights

```css
--leading-tight:  1.2;   /* hero headlines */
--leading-snug:   1.35;  /* subheadings */
--leading-normal: 1.5;   /* body text */
--leading-relaxed:1.7;   /* long-form, blog */
```

### Letter Spacing

```css
--tracking-tight:  -0.03em;  /* large display type */
--tracking-normal:  0;
--tracking-wide:    0.04em;  /* labels, nav items */
--tracking-widest:  0.1em;   /* badge, eyebrow text */
```

---

## Spacing

8pt base grid. Use multiples only.

```css
--space-1:   0.25rem;  /*  4px */
--space-2:   0.5rem;   /*  8px */
--space-3:   0.75rem;  /* 12px */
--space-4:   1rem;     /* 16px */
--space-5:   1.25rem;  /* 20px */
--space-6:   1.5rem;   /* 24px */
--space-8:   2rem;     /* 32px */
--space-10:  2.5rem;   /* 40px */
--space-12:  3rem;     /* 48px */
--space-16:  4rem;     /* 64px */
--space-20:  5rem;     /* 80px */
--space-24:  6rem;     /* 96px */
--space-32:  8rem;     /* 128px */
```

### Layout Widths

```css
--width-xs:   480px;   /* narrow forms, modals */
--width-sm:   640px;   /* content columns */
--width-md:   768px;   /* default content */
--width-lg:   1024px;  /* wide content */
--width-xl:   1280px;  /* site max-width */
--width-2xl:  1440px;  /* full-bleed max */
```

### Section Padding (landing page)

```css
--section-py: clamp(4rem, 8vw, 8rem);   /* vertical breathing room */
--section-px: clamp(1rem, 5vw, 2rem);   /* horizontal gutter */
```

---

## Border Radius

```css
--radius-none:  0;
--radius-xs:    2px;   /* small badges */
--radius-sm:    4px;   /* tags, chips */
--radius-md:    8px;   /* inputs, buttons */
--radius-lg:    12px;  /* cards */
--radius-xl:    16px;  /* feature cards */
--radius-2xl:   24px;  /* modals, sheets */
--radius-3xl:   32px;  /* hero blobs, pills */
--radius-full:  9999px; /* pills, avatars */
```

---

## Shadows

```css
/* Midnight theme — glow-based */
--shadow-sm:   0 0 0 1px rgba(240,246,252,0.1);
--shadow-md:   0 4px 12px rgba(0,0,0,0.4);
--shadow-lg:   0 8px 32px rgba(0,0,0,0.5);
--shadow-accent: 0 0 24px rgba(88,166,255,0.25);    /* CTA glow */
--shadow-card:   0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(240,246,252,0.08);

/* Ivory theme — elevation-based */
--shadow-sm:   0 1px 2px rgba(0,0,0,0.05);
--shadow-md:   0 4px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-lg:   0 12px 32px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
--shadow-card: 0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.06);

/* Nova theme — warm diffuse */
--shadow-sm:   0 1px 3px rgba(26,23,20,0.06);
--shadow-md:   0 4px 16px rgba(26,23,20,0.10);
--shadow-lg:   0 16px 48px rgba(26,23,20,0.12);
--shadow-accent: 0 8px 32px rgba(232,97,60,0.20);
```

---

## Animation

### Duration

```css
--duration-instant:  50ms;
--duration-fast:     150ms;
--duration-base:     250ms;
--duration-slow:     400ms;
--duration-slower:   600ms;
--duration-crawl:    1000ms;
```

### Easing

```css
--ease-in:       cubic-bezier(0.4, 0, 1, 1);
--ease-out:      cubic-bezier(0, 0, 0.2, 1);      /* default for reveals */
--ease-inout:    cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1); /* bouncy — hover effects */
--ease-smooth:   cubic-bezier(0.25, 0.1, 0.25, 1);
```

### Transition Presets

```css
--transition-base:    all var(--duration-base) var(--ease-out);
--transition-fast:    all var(--duration-fast) var(--ease-out);
--transition-color:   color var(--duration-fast) var(--ease-out),
                      background-color var(--duration-fast) var(--ease-out),
                      border-color var(--duration-fast) var(--ease-out);
--transition-transform: transform var(--duration-base) var(--ease-spring);
```

---

## Component Tokens

### Navigation

```css
--nav-height:        64px;
--nav-height-sm:     56px;   /* mobile */
--nav-px:            var(--space-6);
--nav-bg-scroll:     rgba(var(--color-base-rgb), 0.85);  /* backdrop-blur on scroll */
--nav-blur:          blur(12px);
--nav-border-scroll: 1px solid var(--color-border);
```

### Hero Section

```css
--hero-pt:             clamp(6rem, 12vw, 10rem);
--hero-pb:             clamp(4rem, 8vw, 8rem);
--hero-headline-size:  clamp(2.5rem, 6vw, 4.5rem);
--hero-subhead-size:   clamp(1rem, 2vw, 1.25rem);
--hero-eyebrow-size:   0.8125rem;  /* 13px — "New ✦ Announcing v2.0" */
```

### Buttons

```css
/* Primary CTA */
--btn-primary-bg:       var(--color-accent);
--btn-primary-text:     #FFFFFF;
--btn-primary-hover-bg: var(--color-accent-hover);
--btn-primary-shadow:   var(--shadow-accent);

/* Secondary */
--btn-secondary-bg:     transparent;
--btn-secondary-border: var(--color-border-strong);
--btn-secondary-text:   var(--color-text);

/* Sizing */
--btn-height-sm:    32px;
--btn-height-md:    40px;
--btn-height-lg:    48px;
--btn-height-xl:    56px;   /* hero CTA */
--btn-px-sm:        var(--space-3);
--btn-px-md:        var(--space-5);
--btn-px-lg:        var(--space-6);
--btn-px-xl:        var(--space-8);
--btn-radius:       var(--radius-md);
--btn-font-weight:  var(--weight-semibold);
--btn-font-size-md: var(--text-sm);
--btn-font-size-lg: var(--text-base);
```

### Cards

```css
--card-bg:       var(--color-elevated);
--card-border:   var(--color-border);
--card-radius:   var(--radius-lg);
--card-shadow:   var(--shadow-card);
--card-p:        var(--space-6);
--card-p-sm:     var(--space-4);
--card-p-lg:     var(--space-8);

/* Feature card (landing page) */
--feature-card-bg:     var(--color-surface);
--feature-card-radius: var(--radius-xl);
--feature-card-p:      var(--space-8);

/* Stat/metric card */
--stat-card-radius:    var(--radius-lg);
--stat-number-size:    var(--text-3xl);
--stat-number-weight:  var(--weight-bold);
```

### Forms / Inputs

```css
--input-height:    40px;
--input-height-sm: 32px;
--input-height-lg: 48px;
--input-px:        var(--space-3);
--input-bg:        var(--color-surface);
--input-border:    var(--color-border);
--input-border-focus: var(--color-accent);
--input-radius:    var(--radius-md);
--input-ring:      0 0 0 3px var(--color-accent-subtle);
--input-text:      var(--color-text);
--input-placeholder: var(--color-text-subtle);
```

### Badges / Tags

```css
--badge-height:    22px;
--badge-px:        var(--space-2);
--badge-radius:    var(--radius-sm);
--badge-font-size: var(--text-xs);
--badge-font-weight: var(--weight-medium);

/* Eyebrow badge (top of hero) */
--eyebrow-bg:      var(--color-accent-subtle);
--eyebrow-text:    var(--color-accent);
--eyebrow-border:  var(--color-accent);
--eyebrow-radius:  var(--radius-full);
```

### Dividers / Separators

```css
--divider-color:  var(--color-border);
--divider-weight: 1px;
```

### Logo Bar (social proof)

```css
--logo-bar-opacity: 0.45;  /* muted by default, pop on hover */
--logo-bar-gap:     var(--space-8);
--logo-bar-py:      var(--space-12);
```

---

## Z-Index Scale

```css
--z-base:    0;
--z-raised:  10;
--z-dropdown:200;
--z-sticky:  300;
--z-overlay: 400;
--z-modal:   500;
--z-toast:   600;
--z-top:     9999;
```

---

## Tailwind Config

```js
// tailwind.config.js
const { fontFamily } = require('tailwindcss/defaultTheme')

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Midnight theme
        midnight: {
          base:      '#0D1117',
          elevated:  '#161B22',
          surface:   '#21262D',
          border:    'rgba(240,246,252,0.10)',
          text:      '#E6EDF3',
          muted:     '#8B949E',
          accent:    '#58A6FF',
        },
        // Ivory theme
        ivory: {
          base:      '#FFFFFF',
          elevated:  '#F6F8FA',
          surface:   '#EAEEF2',
          border:    '#D0D7DE',
          text:      '#1C2128',
          muted:     '#57606A',
          accent:    '#0969DA',
        },
        // Nova theme
        nova: {
          base:      '#FAFAF9',
          elevated:  '#FFFFFF',
          surface:   '#F5F0EB',
          border:    '#E8E0D8',
          text:      '#1A1714',
          muted:     '#6B5E54',
          accent:    '#E8613C',
          accent2:   '#9B59F5',
        },
      },
      fontFamily: {
        display: ['Cal Sans', 'DM Serif Display', ...fontFamily.serif],
        body:    ['Geist', 'DM Sans', ...fontFamily.sans],
        mono:    ['Geist Mono', 'JetBrains Mono', ...fontFamily.mono],
      },
      fontSize: {
        'display-sm': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['3rem',    { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1',  letterSpacing: '-0.03em', fontWeight: '900' }],
        'display-xl': ['4.5rem',  { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '900' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '128': '32rem',
      },
      borderRadius: {
        'xs': '2px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'card-dark':    '0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(240,246,252,0.08)',
        'card-light':   '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.06)',
        'accent-glow':  '0 0 24px rgba(88,166,255,0.25)',
        'nova-glow':    '0 8px 32px rgba(232,97,60,0.20)',
        'elevated-dark':'0 8px 32px rgba(0,0,0,0.5)',
      },
      transitionTimingFunction: {
        'spring':   'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth':   'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'out-quad': 'cubic-bezier(0, 0, 0.2, 1)',
      },
      transitionDuration: {
        '50':  '50ms',
        '400': '400ms',
        '600': '600ms',
      },
      animation: {
        'fade-up':    'fadeUp 0.5s cubic-bezier(0,0,0.2,1) both',
        'fade-in':    'fadeIn 0.3s ease both',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'slide-in':   'slideIn 0.4s cubic-bezier(0,0,0.2,1) both',
      },
      keyframes: {
        fadeUp:     { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        pulseGlow:  { '0%,100%': { boxShadow: '0 0 16px rgba(88,166,255,0.2)' }, '50%': { boxShadow: '0 0 32px rgba(88,166,255,0.4)' } },
        slideIn:    { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'none' } },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        midnight: {
          'primary':           '#58A6FF',
          'primary-content':   '#0D1117',
          'secondary':         '#21262D',
          'secondary-content': '#8B949E',
          'accent':            '#58A6FF',
          'accent-content':    '#0D1117',
          'neutral':           '#30363D',
          'neutral-content':   '#E6EDF3',
          'base-100':          '#0D1117',
          'base-200':          '#161B22',
          'base-300':          '#21262D',
          'base-content':      '#E6EDF3',
          'info':              '#58A6FF',
          'success':           '#3FB950',
          'warning':           '#D29922',
          'error':             '#F85149',
        },
        ivory: {
          'primary':           '#0969DA',
          'primary-content':   '#FFFFFF',
          'secondary':         '#EAEEF2',
          'secondary-content': '#57606A',
          'accent':            '#0969DA',
          'accent-content':    '#FFFFFF',
          'neutral':           '#D0D7DE',
          'neutral-content':   '#1C2128',
          'base-100':          '#FFFFFF',
          'base-200':          '#F6F8FA',
          'base-300':          '#EAEEF2',
          'base-content':      '#1C2128',
          'info':              '#0550AE',
          'success':           '#1A7F37',
          'warning':           '#9A6700',
          'error':             '#CF222E',
        },
        nova: {
          'primary':           '#E8613C',
          'primary-content':   '#FFFFFF',
          'secondary':         '#9B59F5',
          'secondary-content': '#FFFFFF',
          'accent':            '#E8613C',
          'accent-content':    '#FFFFFF',
          'neutral':           '#E8E0D8',
          'neutral-content':   '#1A1714',
          'base-100':          '#FAFAF9',
          'base-200':          '#FFFFFF',
          'base-300':          '#F5F0EB',
          'base-content':      '#1A1714',
          'info':              '#2563EB',
          'success':           '#16A34A',
          'warning':           '#D97706',
          'error':             '#DC2626',
        },
      },
    ],
    darkTheme: 'midnight',
    base: true,
    styled: true,
    utils: true,
  },
}
```

---

## Landing Page Section Anatomy

```
nav             height: 64px, sticky, backdrop-blur on scroll
hero            pt: 8–10rem, pb: 6–8rem
  eyebrow badge   font-size: 13px, pill, accent color
  headline        display-xl, font-display, tracking-tight
  subhead         text-lg/xl, text-muted, max-w: 560px
  cta group       primary btn + ghost btn, gap: 12px
  hero media      screenshot | 3D | animation, mt: 3rem
logo bar        social proof logos, opacity: 0.45, py: 3rem
feature grid    2–3 cols, feature cards, icon + title + body
stats strip     3–4 big numbers, centered, section-py
testimonials    3-col grid, cards with avatar + quote + role
pricing         2–3 tiers, most popular gets accent border
faq             accordion, max-w: 640px, centered
cta section     full-width, accent bg or dark bg, headline + single CTA
footer          links, logo, copyright, legal
```

---

## Component Patterns

### Eyebrow (hero badge)

```html
<span class="badge badge-outline text-xs tracking-widest uppercase
             border-accent/30 text-accent bg-accent/10 rounded-full px-3 py-1">
  New · Announcing v2.0 →
</span>
```

### Hero CTA group

```html
<div class="flex items-center gap-3 flex-wrap">
  <button class="btn btn-primary btn-lg rounded-lg shadow-accent-glow
                 font-semibold tracking-tight transition-all duration-200
                 hover:scale-[1.02] hover:shadow-lg">
    Get started free
  </button>
  <button class="btn btn-ghost btn-lg rounded-lg text-base-content/70
                 hover:text-base-content transition-colors duration-150">
    See demo →
  </button>
</div>
```

### Feature card

```html
<div class="card bg-base-200 border border-base-300/50 rounded-2xl p-8
            hover:border-primary/20 hover:shadow-card-dark
            transition-all duration-250">
  <div class="icon mb-4 text-primary"><!-- icon --></div>
  <h3 class="font-display font-bold text-xl mb-2">Title</h3>
  <p class="text-base-content/60 text-sm leading-relaxed">Description</p>
</div>
```

### Stat card

```html
<div class="text-center">
  <div class="font-display font-black text-5xl text-primary mb-1">99.9%</div>
  <div class="text-sm text-base-content/50 tracking-wide">Uptime SLA</div>
</div>
```

### Testimonial card

```html
<div class="card bg-base-200 border border-base-300/50 rounded-xl p-6">
  <p class="text-sm leading-relaxed text-base-content/80 mb-4">"Quote here."</p>
  <div class="flex items-center gap-3">
    <div class="avatar placeholder">
      <div class="bg-primary/20 text-primary rounded-full w-8 h-8 text-xs font-bold">JD</div>
    </div>
    <div>
      <div class="text-sm font-semibold">Jane Doe</div>
      <div class="text-xs text-base-content/50">VP Eng, Acme Corp</div>
    </div>
  </div>
</div>
```

### Nav

```html
<nav class="fixed top-0 inset-x-0 z-[300] h-16 flex items-center px-6
            backdrop-blur-md border-b border-transparent
            transition-all duration-300
            [.scrolled_&]:border-base-300/50 [.scrolled_&]:bg-base-100/85">
  <!-- logo | links | cta -->
</nav>
```

---

## Design Rules (enforce with AI)

1. **One accent color per page.** Never use 2 bold accent colors simultaneously.
2. **Single primary CTA per section.** Secondary actions must be visually subordinate.
3. **Hero headline ≤ 10 words.** Subhead handles nuance.
4. **No more than 3 font sizes in one component.**
5. **8pt grid strictly.** No 5px, 7px, 13px gaps.
6. **Cards never have both colored bg AND colored border.** Pick one signal.
7. **Hover state = transform OR color change.** Not both plus shadow plus glow.
8. **Logo bar opacity ≤ 0.5.** It's trust signal, not hero.
9. **Motion budget:** 1 hero animation + scroll reveals only. No parallax.
10. **Dark mode is not an inversion.** Midnight theme is a separate palette, not `filter: invert()`.

---

## Responsive Breakpoints

```css
/* Match Tailwind defaults */
--bp-sm:  640px;
--bp-md:  768px;
--bp-lg:  1024px;
--bp-xl:  1280px;
--bp-2xl: 1536px;

/* Mobile-first always */
/* Stack → 2col → 3col, never the reverse */
```

---

*Version 1.0 · Based on Linear, Vercel, Retell AI, Lovable, Ramp, BetterStack, Stripe · April 2026*
