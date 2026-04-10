# Plan: Semantic Style Tokens
**Date:** 2026-04-09
**Branch:** `feature/style-tokens` (create from `feature/gan-css-pass`)
**Status:** Ready for implementation

---

## 0. What We're Building

Clear is a design system. Right now the only way to style a section is:
- Use a built-in preset (`app_card`, `page_hero`, etc.)
- Write raw CSS properties in a style block → custom `.style-X {}` class

**The gap:** There's no way to compose a custom style using DaisyUI/Tailwind semantics. If you want "a card with large padding and no border", you have to write raw CSS values.

**The fix:** Add a **semantic token layer** to style blocks. Recognized token properties (`background is 'surface'`, `has shadow`, `corners are 'rounded'`) compile directly to Tailwind/DaisyUI classes — no custom CSS generated. Raw CSS properties (existing behavior) still work as the escape hatch.

```
# Before: only way to customize
style my_card:
  background-color: #f8fafc   ← raw CSS, no theme adaptation
  padding: 24px               ← magic number
  border-radius: 12px         ← magic number

# After: semantic tokens
style my_card:
  background is 'surface'     → bg-base-100 (adapts to all 3 themes)
  padding is 'comfortable'    → p-6
  corners are 'rounded'       → rounded-xl
  has border                  → border border-base-300/40
  has shadow                  → shadow-sm
```

---

## 1. Files to Read (phased)

### Always first:
| `intent.md` | Authoritative spec — check nothing new is added that needs intent update |

### Phase 1 (parser):
| `parser.js` | `parseStyleDef()` ~line 3439 — add `are` as assignment keyword |

### Phase 2 (compiler — token map):
| `compiler.js` | `BUILTIN_PRESET_CLASSES` ~6572 — add `STYLE_TOKENS` map near here |
| `compiler.js` | `friendlyPropToCSS()` ~6552 — understand existing CSS path |
| `compiler.js` | `stylesToCSS()` ~6640 — modify to skip token properties |

### Phase 3 (compiler — section renderer):
| `compiler.js` | Section renderer ~5332 — `hasUserStyle` branch ~5393 |

### Phase 4 (tests):
| `clear.test.js` | Existing style tests — run and update as needed |

---

## 2. Architecture

```
Clear source:
  style my_card:
    background is 'surface'    ← token property (name='background', value='surface')
    corners are 'rounded'      ← token property (name='corners', value='rounded')
    has shadow                 ← token property (name='has_shadow', value=true)
    background_color is 'red'  ← raw CSS (falls through)
       │
       ▼
   parseStyleDef() → STYLE_DEF node {
     name: 'my_card',
     properties: [
       {name:'background', value:'surface'},
       {name:'corners', value:'rounded'},
       {name:'has_shadow', value:true},
       {name:'background_color', value:'red'}    ← raw CSS property
     ]
   }
       │
       ▼ (compiler — two paths)
       ├─ resolveStyleTokens(properties)
       │    → tailwindClasses: 'bg-base-100 rounded-xl shadow-sm'
       │    → rawProperties: [{name:'background_color', value:'red'}]
       │
       ├─ tailwindClasses applied INLINE on <div> (like preset)
       │
       └─ rawProperties → stylesToCSS() → .style-my_card { background-color: red; }
                                          (CSS escape hatch — only if rawProps exist)

HTML output:
  <div class="bg-base-100 rounded-xl shadow-sm style-my_card">
```

---

## 3. The Token Map

Add `STYLE_TOKENS` to `compiler.js` (above `BUILTIN_PRESET_CLASSES`):

```js
// Semantic style tokens: "property:value" → Tailwind/DaisyUI classes
// These compile INLINE on the element — no custom CSS generated.
// Add new tokens here; anything not in this map falls back to raw CSS.
const STYLE_TOKENS = {
  // Background — adapts to all three themes via DaisyUI base tokens
  'background:surface':     'bg-base-100',
  'background:canvas':      'bg-base-200',
  'background:sunken':      'bg-base-300',
  'background:dark':        'bg-neutral',
  'background:primary':     'bg-primary',
  'background:transparent': 'bg-transparent',

  // Text color
  'text:default':   'text-base-content',
  'text:muted':     'text-base-content/60',
  'text:subtle':    'text-base-content/40',
  'text:light':     'text-neutral-content',
  'text:primary':   'text-primary',
  'text:small':     'text-sm',
  'text:large':     'text-lg',

  // Padding (uniform p-*)
  'padding:none':         'p-0',
  'padding:tight':        'p-3',
  'padding:normal':       'p-4',
  'padding:comfortable':  'p-6',
  'padding:spacious':     'p-8',
  'padding:loose':        'p-12',

  // Gap (flex/grid)
  'gap:none':         'gap-0',
  'gap:tight':        'gap-2',
  'gap:normal':       'gap-4',
  'gap:comfortable':  'gap-5',
  'gap:large':        'gap-8',

  // Border radius
  'corners:sharp':        'rounded-none',
  'corners:subtle':       'rounded-md',
  'corners:rounded':      'rounded-xl',
  'corners:very rounded': 'rounded-2xl',
  'corners:pill':         'rounded-full',

  // Shadow (bare boolean properties → name_value format after parse)
  'has_shadow:true':        'shadow-sm',
  'has_large_shadow:true':  'shadow-md',
  'no_shadow:true':         '',           // explicitly removes shadow (empty = no class)

  // Border
  'has_border:true':        'border border-base-300/40',
  'has_strong_border:true': 'border border-base-300',
  'no_border:true':         'border-0',

  // Layout
  'layout:column':     'flex flex-col',
  'layout:row':        'flex flex-row items-center',
  'layout:centered':   'flex flex-col items-center text-center',
  'layout:split':      'flex items-center justify-between',
  'layout:2 columns':  'grid grid-cols-2 gap-5',
  'layout:3 columns':  'grid grid-cols-3 gap-5',
  'layout:4 columns':  'grid grid-cols-4 gap-4',

  // Width
  'width:full':      'w-full',
  'width:narrow':    'max-w-sm mx-auto',
  'width:contained': 'max-w-5xl mx-auto',
  'width:wide':      'max-w-6xl mx-auto',
};
```

---

## 4. New Function: `resolveStyleTokens(properties)`

Add to `compiler.js` near `friendlyPropToCSS`:

```js
// Resolve semantic style tokens to Tailwind classes.
// Returns { tailwindClasses: string, rawProperties: array }
// rawProperties are props not recognized as tokens → fall back to CSS.
function resolveStyleTokens(properties) {
  const classes = [];
  const rawProperties = [];
  for (const prop of properties) {
    const key = `${prop.name}:${prop.value}`;
    if (Object.prototype.hasOwnProperty.call(STYLE_TOKENS, key)) {
      const cls = STYLE_TOKENS[key];
      if (cls) classes.push(cls); // empty string = intentional removal, skip
    } else {
      rawProperties.push(prop);
    }
  }
  return { tailwindClasses: classes.join(' '), rawProperties };
}
```

---

## 5. Exact File Changes

### Change 1: `parser.js` — `parseStyleDef()` — accept `are` as assignment

**Find** (~line 3463):
```js
if (propTokens.length >= 2 && (propTokens[1].type === TokenType.ASSIGN || propTokens[1].canonical === 'is')) {
```
**Replace with:**
```js
if (propTokens.length >= 2 && (propTokens[1].type === TokenType.ASSIGN || propTokens[1].canonical === 'is' || propTokens[1].value === 'are')) {
```

That's it for the parser. `corners are 'rounded'` now parses as `{name:'corners', value:'rounded'}`.

---

### Change 2: `compiler.js` — add `STYLE_TOKENS` constant and `resolveStyleTokens()`

Add the `STYLE_TOKENS` map (see Section 3 above) just above `BUILTIN_PRESET_CLASSES`.
Add `resolveStyleTokens()` (see Section 4 above) just below `friendlyPropToCSS()`.

---

### Change 3: `compiler.js` — section renderer — apply token classes inline

**Find** (~line 5393, the `hasUserStyle || hasInline` branch):
```js
          } else if (hasUserStyle || hasInline) {
            // User-defined style (custom CSS): full-width outer, contained inner
            const allClasses = [node.ui.cssClass, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            parts.push(`    <div class="${allClasses}">`);
            if (hasUserStyle && !hasInline) {
              parts.push(`      <div class="max-w-5xl mx-auto px-4">`);
            }
```

**Replace with:**
```js
          } else if (hasUserStyle || hasInline) {
            // User-defined style: resolve semantic tokens to Tailwind, rest to CSS class
            const styleDef = node.styleName
              ? body.find(n => n.type === NodeType.STYLE_DEF && n.name === node.styleName)
              : null;
            const { tailwindClasses: tokenClasses, rawProperties } =
              styleDef ? resolveStyleTokens(styleDef.properties) : { tailwindClasses: '', rawProperties: [] };
            // Only add CSS class if there are raw (non-token) properties left
            const cssClass = (hasUserStyle && rawProperties.length > 0) ? node.ui.cssClass : '';
            const allClasses = [tokenClasses, cssClass, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            parts.push(`    <div class="${allClasses}">`);
            if (hasUserStyle && !hasInline && rawProperties.length > 0) {
              parts.push(`      <div class="max-w-5xl mx-auto px-4">`);
            }
```

**Note:** The wrapper `max-w-5xl mx-auto px-4` should only appear when there ARE raw CSS properties (and hence a real `.style-X` class). Pure-token styles are treated like presets — no wrapper.

---

### Change 4: `compiler.js` — `stylesToCSS()` — skip token properties

**Find** in `stylesToCSS()` (~line 6640), inside the property loop:
```js
    for (const p of style.properties) {
      let val = p.value;
      if (typeof val === 'string' && vars[val] !== undefined) val = vars[val];
      if (p.name.startsWith('hover_')) {
```

**Add a skip check as the first thing inside the loop:**
```js
    for (const p of style.properties) {
      // Skip properties that compile to Tailwind tokens (handled inline on the element)
      const tokenKey = `${p.name}:${p.value}`;
      if (Object.prototype.hasOwnProperty.call(STYLE_TOKENS, tokenKey)) continue;

      let val = p.value;
      // ... rest unchanged
```

This ensures that even if a style block has BOTH tokens and raw CSS, the tokens don't generate duplicate CSS.

---

## 6. Edge Cases

| Case | Behavior | Notes |
|------|----------|-------|
| Style has ONLY tokens | `tokenClasses` on div, no `.style-X`, no CSS rule emitted | Clean — like a preset |
| Style has ONLY raw CSS | `cssClass` on div, CSS rule emitted | Backward compat — unchanged behavior |
| Style MIXES tokens + raw CSS | Both `tokenClasses` AND `cssClass` on div, CSS for raw only | CSS escape hatch |
| Style name overrides a preset | `hasUserOverride=true` → skips preset path, uses token/CSS path | Works correctly |
| `no_shadow:true` or `no_border:true` | Empty string in STYLE_TOKENS → class skipped | Correct — just doesn't add shadow |
| `corners are 'very rounded'` | Parser: value = `'very rounded'` (string). Key = `corners:very rounded` | Needs `are` fix in parser |
| `layout is '4 columns'` | value = `'4 columns'`. Key = `layout:4 columns` | Value is string literal — works |
| Unknown token value (typo: `'surfce'`) | Falls to `rawProperties` → CSS attempt. Produces bad but not broken output | Validator can warn later |
| `has_shadow:true` key format | Parser multi-word join: `has shadow` → `{name:'has_shadow', value:true}` | Key = `has_shadow:true` ✓ |

---

## 7. CSS Escape Hatch (per user request)

Any raw CSS property still works:

```clear
style my_section:
  background is 'surface'     ← token → bg-base-100 (inline)
  background_color is '#ff0'  ← raw CSS → .style-my_section { background-color: #ff0; }
  padding = 24                ← raw CSS → .style-my_section { padding: 24px; }
```

Both Tailwind classes AND the CSS class are applied to the div:
```html
<div class="bg-base-100 style-my_section">
```

---

## 8. TDD Cycles

### Cycle 1: Parser — `are` keyword

🔴 **Test first:**
```js
it('style block: corners are X parses correctly', () => {
  const src = `build for web\npage 'P' at '/':\n  section 'X':\n    text 'hi'\nstyle my:\n  corners are 'rounded'`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
});
```

🟢 **Implement:** Add `|| propTokens[1].value === 'are'` to `parseStyleDef` condition in `parser.js`.

🔄 **Refactor:** None needed.

---

### Cycle 2: `STYLE_TOKENS` map + `resolveStyleTokens()`

🔴 **Tests first** (unit tests for the function itself, exercising every category):
```js
it('resolveStyleTokens: background token', () => {
  const result = compileProgram(`build for web\npage 'P' at '/':\n  section 'Card' with style my:\n    text 'hi'\nstyle my:\n  background is 'canvas'`);
  expect(result.html).toContain('bg-base-200');
  expect(result.html).not.toContain('style-my');    // pure token = no CSS class
});
it('resolveStyleTokens: padding token', () => { ... toContain('p-6') ... });
it('resolveStyleTokens: has_shadow token', () => { ... toContain('shadow-sm') ... });
it('resolveStyleTokens: has_border token', () => { ... toContain('border border-base-300/40') ... });
it('resolveStyleTokens: corners token', () => { ... toContain('rounded-xl') ... });
it('resolveStyleTokens: layout token', () => { ... toContain('grid grid-cols-3') ... });
it('resolveStyleTokens: width token', () => { ... toContain('max-w-5xl mx-auto') ... });
it('resolveStyleTokens: mixed tokens + raw CSS', () => {
  // Has both token and raw CSS
  const result = compileProgram(`...style my:\n  background is 'surface'\n  font_size = 16`);
  expect(result.html).toContain('bg-base-100');   // token inline
  expect(result.css).toContain('font-size: 16px'); // raw CSS
  expect(result.html).toContain('style-my');       // CSS class applied (has raw props)
});
```

🟢 **Implement:** Add `STYLE_TOKENS` constant and `resolveStyleTokens()` to `compiler.js`.

🔄 **Refactor:** Verify map covers all vocab table entries from SYNTAX.md.

---

### Cycle 3: Section renderer + `stylesToCSS` integration

🔴 **Tests:**
```js
it('pure token style: no .style-X CSS rule emitted', () => {
  const result = compileProgram(`...style card:\n  background is 'surface'\n  has shadow`);
  expect(result.html).toContain('bg-base-100 shadow-sm');
  expect(result.css || '').not.toContain('.style-card');
});
it('raw CSS style still works unchanged', () => {
  const result = compileProgram(`...style old:\n  padding = 24`);
  expect(result.css).toContain('.style-old');
  expect(result.css).toContain('padding: 24px');
});
it('mixed style: tokens inline + raw CSS still generated', () => {
  const result = compileProgram(`...style mix:\n  background is 'canvas'\n  padding = 32`);
  expect(result.html).toContain('bg-base-200');
  expect(result.css).toContain('padding: 32px');
  expect(result.html).toContain('style-mix');
});
```

🟢 **Implement:** Section renderer change (Change 3) + `stylesToCSS` skip (Change 4).

🔄 **Refactor:** Confirm 1489 tests still pass. Update any snapshot tests that check class output.

---

### Cycle 4: GAN pass (after implementation)

Compile the 6 reference apps using token-composed styles. Compare with mocks. Fix any visual gaps found.

---

## 9. What Does NOT Change

- `BUILTIN_PRESET_CLASSES` — untouched. Presets are still presets.
- `friendlyPropToCSS()` — untouched. Raw CSS path unchanged.
- `extractStyles()` — untouched.
- `stylesToCSS()` — minimal change: skip token props (4 lines added).
- Validator — no changes needed. Unknown token values produce bad CSS but not errors (can improve later).
- Synonyms.js — `are` handled locally in `parseStyleDef`, not globally.

---

## 10. Success Criteria

- [ ] `corners are 'rounded'` parses without error
- [ ] `background is 'canvas'` in a style block → `bg-base-200` on the section div, no `.style-X` CSS
- [ ] `has shadow` → `shadow-sm` on the div
- [ ] `has border` → `border border-base-300/40` on the div
- [ ] Raw CSS properties (`padding = 24`) still work unchanged
- [ ] Mixed style (tokens + raw CSS): both inline Tailwind AND `.style-X` CSS class applied
- [ ] 1489 tests pass
- [ ] Bundle rebuilt: `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`

---

## Resume Prompt

> Read `plans/plan-style-tokens-04-09-2026.md`. We're implementing semantic style tokens in the Clear compiler. Branch: `feature/style-tokens`. The plan has 4 TDD cycles. Start with Cycle 1 (parser `are` keyword). Run `node clear.test.js` after each cycle — must stay 1489. Rebuild bundle when done.
