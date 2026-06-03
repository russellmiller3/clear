// =============================================================================
// PHASE 5.5 — DAISYUI FORM WIDGETS + NIXIE THEME
// =============================================================================
// Five new ASK_FOR flavors that close the parity gap with the reference Lenat
// app: datetime picker, radio selector, slider, plus the accordion section
// modifier and the chevron auto-emit on nested nav items. Plus a fourth
// Clear theme `nixie` for the amber CRT identity.
//
// Loaded by `clear.test.js` via a sibling import; uses the same describe/it
// helpers and the same compileProgram entry point.

import { describe, it, expect } from './lib/testUtils.js';
import { parse } from './parser.js';
import { compileProgram } from './index.js';

describe('Phase 5.5.1 — datetime input parser', () => {
  it('parses label-is datetime input', () => {
    const ast = parse(`'Due' is a datetime input that saves to due_at`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('datetime');
    expect(node.label).toBe('Due');
    expect(node.variable).toBe('due_at');
  });

  it('parses label-first datetime input via "as"', () => {
    const ast = parse(`'Starts At' as datetime input`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node.inputType).toBe('datetime');
    expect(node.label).toBe('Starts At');
    expect(node.variable).toBe('starts_at');
  });
});

describe('Phase 5.5.2 — datetime input compiler', () => {
  it('emits <input type="datetime-local"> with DaisyUI classes', () => {
    const result = compileProgram(`build for web
page 'Reminder':
  'Due' is a datetime input that saves to due_at`);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('type="datetime-local"');
    expect(result.html).toContain('input input-bordered');
  });

  it('wires datetime input into _state and _recompute', () => {
    const result = compileProgram(`build for web
page 'Reminder':
  'Due' is a datetime input that saves to due_at`);
    expect(result.javascript).toContain('_state.due_at = e.target.value');
    expect(result.javascript).toContain('_recompute()');
  });
});

describe('Phase 5.5.3 — radio selector parser+compiler', () => {
  it('parses radio with options as ASK_FOR kind radio', () => {
    const ast = parse(`'Pick' is radio with ['a','b','c'] that saves to letter`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('radio');
    expect(node.variable).toBe('letter');
    expect(node.choices).toEqual(['a', 'b', 'c']);
  });

  it('emits DaisyUI radio inputs, one per option', () => {
    const result = compileProgram(`build for web
page 'Pick One':
  'Pick' is radio with ['a','b'] that saves to letter`);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('type="radio"');
    expect(result.html).toContain('radio radio-primary');
    const matches = result.html.match(/type="radio"/g) || [];
    expect(matches.length).toBe(2);
  });
});

describe('Phase 5.5.4 — slider parser+compiler', () => {
  it('parses slider with from N to M as ASK_FOR kind slider', () => {
    const ast = parse(`'Value' is a slider from 0 to 100 that saves to value`);
    expect(ast.errors).toHaveLength(0);
    const node = ast.body.find(n => n.type === 'ask_for');
    expect(node).toBeDefined();
    expect(node.inputType).toBe('slider');
    expect(node.variable).toBe('value');
    expect(node.min).toBe(0);
    expect(node.max).toBe(100);
  });

  it('emits <input type="range"> with DaisyUI classes and min/max attrs', () => {
    const result = compileProgram(`build for web
page 'Volume':
  'Value' is a slider from 0 to 100 that saves to value`);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('type="range"');
    expect(result.html).toContain('class="range range-primary"');
    expect(result.html).toContain('min="0"');
    expect(result.html).toContain('max="100"');
  });
});

describe('Phase 5.5.5 — section as accordion', () => {
  it('parses section ... as accordion: with the accordion modifier', () => {
    const ast = parse(`section 'FAQ' as accordion:
  section 'Q1':
    text 'A1'
  section 'Q2':
    text 'A2'`);
    expect(ast.errors).toHaveLength(0);
    const sec = ast.body.find(n => n.type === 'section');
    expect(sec).toBeDefined();
    expect(Array.isArray(sec.inlineModifiers)).toBe(true);
    expect(sec.inlineModifiers).toContain('__accordion');
  });

  it('emits DaisyUI collapse classes for accordion children', () => {
    const result = compileProgram(`build for web
page 'Help':
  section 'FAQ' as accordion:
    section 'Q1':
      text 'A1'
    section 'Q2':
      text 'A2'`);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('collapse');
    expect(result.html).toContain('collapse-content');
  });
});

describe('Phase 5.5.6 — nav item chevron when nested', () => {
  it('emits a chevron-down icon when a nav item has sub-items', () => {
    const result = compileProgram(`build for web
page 'App':
  section 'Sidebar' with style app_sidebar:
    nav section 'Main':
      nav item 'Records' to '/records':
        nav item 'Open' to '/records/open'
        nav item 'Closed' to '/records/closed'
page 'Records' at '/records':
  heading 'Records'
page 'Open' at '/records/open':
  heading 'Open'
page 'Closed' at '/records/closed':
  heading 'Closed'`);
    expect(result.errors).toHaveLength(0);
    // A nav item with children carries a Lucide chevron-down icon and an
    // expandable class so the runtime can collapse/expand on click.
    expect(result.html).toContain('data-lucide="chevron-down"');
    expect(result.html).toContain('clear-nav-expandable');
  });
});

describe('Phase 5.5.7 — nixie theme', () => {
  it('emits the nixie theme CSS block when theme is nixie', () => {
    const result = compileProgram(`build for web
theme 'nixie'
page 'Console':
  heading 'Lenat'`);
    expect(result.errors).toHaveLength(0);
    const css = result.css || result.html;
    expect(css).toContain('[data-theme="nixie"]');
    // Amber accent + warm-dark base — the two signature tokens.
    expect(css).toMatch(/--color-primary:\s*oklch\(75% 0\.15 60deg\)/);
    expect(css).toMatch(/--color-base-100:\s*oklch\(12% 0\.02 60deg\)/);
  });

  it('the existing three themes still emit correctly alongside nixie', () => {
    for (const themeName of ['midnight', 'ivory', 'nova']) {
      const r = compileProgram(`build for web
theme '${themeName}'
page 'Console':
  heading 'X'`);
      expect(r.errors).toHaveLength(0);
      const css = r.css || r.html;
      expect(css).toContain(`[data-theme="${themeName}"]`);
    }
  });
});

describe('Phase 5.5.8 — form block parser', () => {
  it('accepts a form block containing an input and submit button', () => {
    const compiled_form = compileProgram(`build for web
page 'Chat' at '/':
  heading 'Chat'
  form:
    'Message' is a text input saved as message
    button 'Send':
      send message to '/api/chat'`);

    expect(compiled_form.errors).toHaveLength(0);
    expect(compiled_form.html).toContain('Message');
    expect(compiled_form.html).toContain('Send');
  });

  it('lowers a titled form block to the existing form-styled section', () => {
    const parsed_form = parse(`form 'Chat':
  'Message' is a text input saved as message`);
    const form_section = parsed_form.body[0];

    expect(parsed_form.errors).toHaveLength(0);
    expect(form_section.type).toBe('section');
    expect(form_section.title).toBe('Chat');
    expect(form_section.styleName).toBe('form');
  });

  it('leaves form payload variables alone when the line is an assignment', () => {
    const compiled_form_payload = compileProgram(`form is {}
button "Save" that sends form to '/api/save'`, { target: 'web' });

    expect(compiled_form_payload.errors).toHaveLength(0);
    expect(compiled_form_payload.warnings).toHaveLength(0);
  });
});
