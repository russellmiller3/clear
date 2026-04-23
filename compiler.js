// =============================================================================
// CLEAR LANGUAGE — COMPILER
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. This compiler deterministically transforms a Clear AST into
// JavaScript, Python, or both. Same input ALWAYS produces the same output.
// No AI in the compile step — it's a pure function.
//
// !! MAINTENANCE RULE: Update this TOC AND this diagram whenever you add,
// !! remove, or move a section. Use section names (not line numbers).
//
// ARCHITECTURE:
//
//   AST (from parser.js, validated by validator.js)
//       │
//       ▼
//   ┌──────────────────────────────────────────────────────┐
//   │  compileProgram(source, options)                      │
//   │                                                       │
//   │  1. tokenize(source) → parse(tokens) → AST            │
//   │  2. resolveModules(AST) → inline imported files        │
//   │  3. validate(AST) → errors/warnings                   │
//   │  4. Detect target(s) from AST:                        │
//   │     ┌─ web ──────────→ compileToReactiveJS()          │
//   │     │                  compileToHTML()                 │
//   │     ├─ js backend ──→ compileToJSBackend()            │
//   │     ├─ python ──────→ compileToPythonBackend()        │
//   │     └─ web + backend → all of the above               │
//   │                                                       │
//   │  Output: { html, javascript, serverJS, python,        │
//   │           errors, warnings }                          │
//   └──────────────────────────────────────────────────────┘
//
//   COMPILATION PIPELINE (for each output target):
//
//   AST body[]
//       │
//       ▼
//   ┌──────────────────────────────────────────────────────┐
//   │  compileNode(node, ctx) → string                      │
//   │                                                       │
//   │  ctx = { lang, indent, declared, stateVars, mode,     │
//   │         sourceMap, schemaNames, dbBackend,             │
//   │         endpointMethod, endpointHasId, isSeedEndpoint,│
//   │         insideAgent, _astBody }                       │
//   │                                                       │
//   │  Dispatches to _compileNodeInner → switch(node.type): │
//   │    ASSIGN ────→ const x = expr;                       │
//   │    ENDPOINT ──→ compileEndpoint() → app.get(...)      │
//   │    CRUD ──────→ compileCrud() → db.insert/update/etc  │
//   │    RESPOND ───→ compileRespond() → res.json(...)      │
//   │    AGENT ─────→ compileAgent() → async function       │
//   │    VALIDATE ──→ compileValidate() → _validate(...)    │
//   │    DATA_SHAPE → compileDataShape() → schema + table   │
//   │    IF_THEN ───→ if (...) { ... }                      │
//   │    (96 node types total — see _compileNodeInner)       │
//   │                                                       │
//   │  Expressions: exprToCode(expr, ctx) → string          │
//   │    Handles: literals, variables, binary ops,           │
//   │    member access, function calls, ask_ai, http_request │
//   └──────────────────────────────────────────────────────┘
//
//   UTILITY FUNCTIONS (tree-shaken, inlined in output):
//   │  _clearTry ... error context wrapping for CRUD
//   │  _clearError .. 3-level debug output (off/true/verbose)
//   │  _validate .... field-level validation
//   │  _pick ........ schema field filtering (mass assignment protection)
//   │  _esc ......... HTML entity escaping
//   │  _toast ....... UI toast notifications
//   │  _askAI ....... Anthropic API call with structured output
//   │  _clear_* ..... string/array/number utilities
//   │  _chatMd ..... markdown-to-HTML for chat messages
//   │  _chatRender . render message array as chat bubbles
//   │  _chatSend ... optimistic send with typing indicator
//   │  _chatClear .. clear messages + optional DELETE
//   └─ Only emitted when actually used (tree-shaking via _getUsedUtilities)
//
// 5 TOP-LEVEL OUTPUT PATHS:
//   1. Non-reactive JS (simple scripts, no UI state)
//   2. Reactive JS (inputs + state + _recompute cycle)
//   3. Backend JS (Express server with middleware + CRUD)
//   4. Backend Python (FastAPI server)
//   5. HTML scaffold (DaisyUI + Tailwind + theme CSS)
//
// DEPENDENCIES: parser.js (NodeType, parse)
// DEPENDENTS:   index.js (public API), cli/clear.js (CLI commands)
//
//
// TABLE OF CONTENTS:
//   PUBLIC API ........................ compileProgram(), compile(), resolveModules()
//   CLOUDFLARE WORKERS TARGET ........ emitCloudflareWorkerBundle() — Workers-for-Platforms
//                                      bundle emit (src/index.js + wrangler.toml + migrations)
//   E2E TEST GENERATION .............. generateE2ETests() — includes user-written test blocks
//   DEPLOY CONFIG .................... generateDeployConfig()
//   UNIFIED COMPILER ................. compileNode(), exprToCode(), compileBody()
//     Node compilers ................. compileEndpoint, compileCrud, compileRespond,
//                                     compileAgent, compileWorkflow, compileValidate,
//                                     compileDataShape, compileExternalFetch,
//                                     compileWebhook, compilePdf
//     _compileNodeInner .............. Main switch over all NodeTypes
//     exprToCode ..................... Expression-to-code for all expression nodes
//   RLS POLICY COMPILER .............. compileRLSPolicy()
//   JAVASCRIPT COMPILER .............. compileToJS(), isReactiveApp()
//   REACTIVE JS COMPILER ............. compileToReactiveJS() — state, _recompute,
//                                     chat input absorption pre-scan,
//                                     inputs, buttons, table action buttons,
//                                     event delegation, on-page-load
//   PYTHON COMPILER .................. compileToPython()
//   HTML SCAFFOLD .................... INLINE_LAYOUT_MODIFIERS, buildHTML(),
//                                     formatInlineText(), compileToHTML()
//   BACKEND SCAFFOLD ................. compileToJSBackend(), compileToBrowserServer(),
//                                     compileToPythonBackend()
//   STYLE BLOCK CSS .................. friendlyPropToCSS(), extractStyles(), stylesToCSS()
//   RUNTIME & CSS .................... CSS_RESET, THEME_CSS, _buildCSS(),
//                                     _clear_* utility functions
//   NAME & OPERATOR MAPPING .......... sanitizeName(), operatorToCode()
//
// =============================================================================

import { NodeType, parse } from './parser.js';
import { buildWorkerBundle } from './lib/packaging-cloudflare.js';

const CLEAR_VERSION = '1.0';

// Default row cap on `get all` / `look up all`. Large enough for typical list
// views, small enough that a 50K-row table can't kill the browser. Opt out
// with `get every X` / `look up every X` when you truly need all rows.
const DEFAULT_QUERY_LIMIT = 50;
// Default cap on `search X for query`. Search is fetch-all-then-filter; this
// at least keeps the returned payload bounded. A future pass should push
// search to SQL LIKE so the LIMIT applies server-side.
const DEFAULT_SEARCH_LIMIT = 100;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Compile a Clear AST into JavaScript, Python, or both.
 *
 * @param {object} ast - The AST from parse()
 * @param {object} [options] - Override options
 * @param {string} [options.target] - Force a target ("web", "backend", "both")
 * @returns {{ javascript?: string, python?: string, errors: Array<{line, message}> }}
 */
// All available utility functions -- used for tree-shaking
export const UTILITY_FUNCTIONS = [
  { name: '_clear_sum', code: 'function _clear_sum(arr) { return Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0; }', deps: [] },
  { name: '_clear_avg', code: 'function _clear_avg(arr) { return Array.isArray(arr) && arr.length ? _clear_sum(arr) / arr.length : 0; }', deps: ['_clear_sum'] },
  { name: '_clear_sum_field', code: 'function _clear_sum_field(arr, f) { if (!Array.isArray(arr)) return 0; return arr.reduce(function(a, item) { return a + Number(item[f] || 0); }, 0); }', deps: [] },
  { name: '_clear_avg_field', code: 'function _clear_avg_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return _clear_sum_field(arr, f) / arr.length; }', deps: ['_clear_sum_field'] },
  { name: '_clear_max_field', code: 'function _clear_max_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return Math.max.apply(null, arr.map(function(item) { return Number(item[f] || 0); })); }', deps: [] },
  { name: '_clear_min_field', code: 'function _clear_min_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return Math.min.apply(null, arr.map(function(item) { return Number(item[f] || 0); })); }', deps: [] },
  { name: '_clear_len', code: 'function _clear_len(val) { if (val == null) return 0; if (typeof val === "string" || Array.isArray(val)) return val.length; if (typeof val === "object") return Object.keys(val).length; return 0; }', deps: [] },
  { name: '_clear_uppercase', code: 'function _clear_uppercase(s) { return String(s).toUpperCase(); }', deps: [] },
  { name: '_clear_lowercase', code: 'function _clear_lowercase(s) { return String(s).toLowerCase(); }', deps: [] },
  { name: '_clear_trim', code: 'function _clear_trim(s) { return String(s).trim(); }', deps: [] },
  { name: '_clear_contains', code: 'function _clear_contains(s, q) { return String(s).includes(String(q)); }', deps: [] },
  { name: '_clear_starts_with', code: 'function _clear_starts_with(s, p) { return String(s).startsWith(String(p)); }', deps: [] },
  { name: '_clear_ends_with', code: 'function _clear_ends_with(s, p) { return String(s).endsWith(String(p)); }', deps: [] },
  { name: '_clear_replace', code: 'function _clear_replace(s, f, r) { return String(s).split(String(f)).join(String(r)); }', deps: [] },
  { name: '_clear_split', code: 'function _clear_split(s, d) { return String(s).split(String(d)); }', deps: [] },
  { name: '_clear_join', code: 'function _clear_join(a, d) { return Array.isArray(a) ? a.join(d === undefined ? ", " : String(d)) : String(a); }', deps: [] },
  { name: '_clear_char_at', code: 'function _clear_char_at(s, i) { return String(s).charAt(i); }', deps: [] },
  { name: '_clear_substring', code: 'function _clear_substring(s, start, end) { return String(s).slice(start, end); }', deps: [] },
  { name: '_clear_index_of', code: 'function _clear_index_of(s, search) { return String(s).indexOf(String(search)); }', deps: [] },
  { name: '_clear_is_letter', code: 'function _clear_is_letter(c) { return /^[a-zA-Z]$/.test(c); }', deps: [] },
  { name: '_clear_is_digit', code: 'function _clear_is_digit(c) { return /^[0-9]$/.test(c); }', deps: [] },
  { name: '_clear_char_code', code: 'function _clear_char_code(c) { return String(c).charCodeAt(0); }', deps: [] },
  { name: '_clear_format', code: "function _clear_format(v, f) {\n  if (v === null || v === undefined) return '';\n  if (f === 'dollars') return '$' + Number(v).toFixed(2);\n  if (f === 'percent') return (Number(v) * 100).toFixed(1) + '%';\n  return String(v);\n}", deps: [] },
  { name: '_clear_fetch', code: "async function _clear_fetch(url) {\n  const r = await fetch(url);\n  if (!r.ok) throw new Error('Could not load data from ' + url + ' (status ' + r.status + ')');\n  return await r.json();\n}", deps: [] },
  { name: '_clear_env', code: "function _clear_env(name) {\n  if (typeof process !== 'undefined' && process.env) return process.env[name] || '';\n  return '';\n}", deps: [] },
  { name: '_toast', code: `function _toast(msg, type) {
  let c = document.getElementById('_toast_container');
  if (!c) {
    c = document.createElement('div'); c.id = '_toast_container';
    c.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;';
    document.body.appendChild(c);
  }
  const icons = {
    error: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    success: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
  };
  const cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  const icon = icons[type] || icons.info;
  const el = document.createElement('div');
  el.className = 'alert ' + cls + ' shadow-lg text-sm';
  el.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;min-width:280px;max-width:400px;border-radius:0.75rem;opacity:0;transform:translateX(1rem);transition:all 0.3s cubic-bezier(0.4,0,0.2,1);position:relative;overflow:hidden;';
  el.innerHTML = icon + '<span style="flex:1">' + msg + '</span><div style="position:absolute;bottom:0;left:0;height:3px;background:currentColor;opacity:0.3;animation:_toast_timer 4s linear forwards;width:100%"></div>';
  if (!document.getElementById('_toast_style')) {
    const s = document.createElement('style'); s.id = '_toast_style';
    s.textContent = '@keyframes _toast_timer { from { width: 100% } to { width: 0% } }';
    document.head.appendChild(s);
  }
  c.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(1rem)'; setTimeout(() => el.remove(), 300); }, 4000);
}`, deps: [] },
  { name: '_esc', code: "function _esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }", deps: [] },
  // PERF-4: virtual scrolling for large tables. Below 100 rows: render everything
  // (DOM handles it fine). At 100+ rows: fixed 40px row height, scroll-triggered
  // windowed render of visible rows + 5-row buffer. Padding rows above/below
  // preserve scroll geometry. Re-binds scroll listener once per element; on
  // reactive re-renders, only the visible slice is repainted.
  { name: '_clear_render_table', code: `function _clear_render_table(tableEl, data, renderHead, renderRow) {
  if (!tableEl) return;
  var thead = tableEl.querySelector('thead tr');
  var tbody = tableEl.querySelector('tbody');
  if (!Array.isArray(data) || data.length === 0) {
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';
    return;
  }
  if (thead) thead.innerHTML = renderHead(data);
  var VIRT_THRESHOLD = 100;
  if (data.length <= VIRT_THRESHOLD) {
    tbody.innerHTML = data.map(renderRow).join('');
    return;
  }
  var ROW_HEIGHT = 40;
  var BUFFER = 5;
  var scroller = tableEl.parentElement;
  if (!scroller) { tbody.innerHTML = data.map(renderRow).join(''); return; }
  scroller.style.maxHeight = '560px';
  scroller.style.overflowY = 'auto';
  function paint() {
    var top = scroller.scrollTop;
    var h = scroller.clientHeight || 560;
    var first = Math.max(0, Math.floor(top / ROW_HEIGHT) - BUFFER);
    var last = Math.min(data.length, Math.ceil((top + h) / ROW_HEIGHT) + BUFFER);
    var topPad = first * ROW_HEIGHT;
    var botPad = (data.length - last) * ROW_HEIGHT;
    var html = '';
    if (topPad > 0) html += '<tr style="height:' + topPad + 'px"><td></td></tr>';
    for (var i = first; i < last; i++) html += renderRow(data[i], i);
    if (botPad > 0) html += '<tr style="height:' + botPad + 'px"><td></td></tr>';
    tbody.innerHTML = html;
  }
  if (!scroller._clear_virt_bound) {
    scroller._clear_virt_bound = true;
    scroller.addEventListener('scroll', paint, { passive: true });
  }
  paint();
}`, deps: [] },
  { name: '_pick', code: 'function _pick(obj, schema) { return Object.fromEntries(Object.entries(obj).filter(([k]) => k in schema).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])); }', deps: [] },
  { name: '_revive', code: 'function _revive(record) { if (!record) return record; const out = {}; for (const [k, v] of Object.entries(record)) { if (typeof v === "string" && (v[0] === "{" || v[0] === "[")) { try { out[k] = JSON.parse(v); } catch(_) { out[k] = v; } } else { out[k] = v; } } return out; }', deps: [] },
  { name: '_validate', code: `function _validate(body, rules) {
  if (body == null || typeof body !== 'object') return [{ field: '_body', message: 'Request body is required' }];
  const _errs = [];
  for (const r of rules) {
    let v = body[r.field];
    if (r.required && (v == null || v === '')) { _errs.push({ field: r.field, message: r.field + ' is required' }); continue; }
    if (v == null) continue;
    if (r.type === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) { body[r.field] = Number(v); v = body[r.field]; }
    if (r.type === 'number' && typeof v !== 'number') { _errs.push({ field: r.field, message: r.field + ' must be a number' }); continue; }
    if (r.type === 'boolean' && typeof v !== 'boolean') { _errs.push({ field: r.field, message: r.field + ' must be true or false' }); continue; }
    if (r.min != null && r.type === 'text' && String(v).length < r.min) _errs.push({ field: r.field, message: r.field + ' must be at least ' + r.min + (r.min === 1 ? ' character' : ' characters') });
    if (r.max != null && r.type === 'text' && String(v).length > r.max) _errs.push({ field: r.field, message: r.field + ' must be at most ' + r.max + (r.max === 1 ? ' character' : ' characters') });
    if (r.min != null && r.type !== 'text' && v < r.min) _errs.push({ field: r.field, message: r.field + ' must be at least ' + r.min });
    if (r.max != null && r.type !== 'text' && v > r.max) _errs.push({ field: r.field, message: r.field + ' must be at most ' + r.max });
    if (r.matches === 'email' && !/^[^@]+@[^@]+\\.[^@]+$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid email' });
    if (r.matches === 'time' && !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid time (HH:MM)' });
    if (r.matches === 'phone' && !/^[\\+]?[\\d\\s\\-\\.\\(\\)]{7,15}$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid phone number' });
    if (r.matches === 'url' && !/^https?:\\/\\/.+/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid URL' });
    if (r.oneOf && !r.oneOf.includes(v)) _errs.push({ field: r.field, message: r.field + ' must be one of: ' + r.oneOf.join(', ') });
  }
  return _errs.length ? _errs : null;
}`, deps: [] },
  { name: '_clearError', code: `function _clearError(err, ctx) {
  const debug = typeof process !== 'undefined' && process.env.CLEAR_DEBUG;
  const status = err.status || (err.message && (err.message.includes('required') || err.message.includes('must be') || err.message.includes('must be unique') || err.message.includes('already exists')) ? 400 : 500);
  const safeMsg = status === 400 ? err.message : 'Something went wrong';
  // Always compute hints and structured info (not just in debug mode)
  // Debug mode adds verbose context; non-debug still gets hints.
  const PII_FIELDS = ['password','secret','token','key','credit_card','ssn','api_key','api_secret'];
  function redact(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const k of Object.keys(out)) {
      if (PII_FIELDS.some(p => k.toLowerCase().includes(p))) out[k] = '[REDACTED]';
      else if (typeof out[k] === 'object') out[k] = redact(out[k]);
    }
    return out;
  }
  const map = typeof _clearMap !== 'undefined' ? _clearMap : null;
  let hint = '';
  const msg = err.message || '';
  if (msg.includes('required')) {
    const field = msg.match(/^(\\w+) is required/);
    let tableInfo = ctx.table || 'this table';
    if (field && map && map.tables && ctx.table && map.tables[ctx.table]) {
      const t = map.tables[ctx.table];
      tableInfo = ctx.table + " (defined at " + t.file + " line " + t.line + ")";
    }
    hint = field ? "'" + field[1] + "' is required in " + tableInfo + ". Add it to the form or remove 'required' from the table definition." : msg;
  } else if (msg.includes('must be unique') || msg.includes('already exists')) {
    hint = "A record with this value already exists. Check for duplicates before saving.";
  } else if (msg.includes('Authentication required') || msg.includes('No token')) {
    hint = "This endpoint needs login. Add 'needs login' to the endpoint definition.";
  } else if (msg.includes('Requires role') || msg.includes('requires role')) {
    const role = msg.match(/role '?(\\w+)'?/);
    hint = role ? "User needs '" + role[1] + "' role." : "User does not have the required role.";
  } else if (msg.includes('must be a')) {
    hint = msg + ". Check the form or API call.";
  } else if (msg.includes('API') || msg.includes('api')) {
    const svc = ctx.service || 'external';
    hint = svc + " API call failed. Check the API key and account.";
  } else if (msg.includes('aborted') || msg.includes('timed out') || msg.includes('timeout')) {
    hint = "Request timed out. Check if the service is running.";
  } else {
    hint = msg;
  }
  let suggested_fix = null;
  if (map) {
    if (msg.includes('required')) {
      const field = msg.match(/^(\\w+) is required/);
      if (field && ctx.table && map.tables && map.tables[ctx.table]) {
        const t = map.tables[ctx.table];
        suggested_fix = { file: t.file, line: t.line, action: 'info', explanation: "Ensure '" + field[1] + "' is included in the request body. The table at " + t.file + " line " + t.line + " requires it." };
      }
    } else if (msg.includes('Authentication required') || msg.includes('No token')) {
      if (ctx.line && ctx.file) {
        suggested_fix = { file: ctx.file, line: ctx.line, action: 'add_line_after', content: "  needs login", explanation: "Add 'needs login' to the endpoint definition." };
      }
    }
  }
  // Translate JS stack trace to a Clear line number using the embedded source map.
  // _clearLineMap is { jsLine: clearLine } injected at compile time.
  let clearLineFromStack = null;
  const lineMapRef = typeof _clearLineMap !== 'undefined' ? _clearLineMap : null;
  if (err.stack && lineMapRef) {
    const stackLines = err.stack.split('\\n');
    for (const sl of stackLines) {
      const m = sl.match(/\\bserver\\.js:(\\d+)/);
      if (m) {
        const jsLine = parseInt(m[1]);
        const mapKeys = Object.keys(lineMapRef).map(Number).sort((a, b) => a - b);
        for (let i = mapKeys.length - 1; i >= 0; i--) {
          if (mapKeys[i] <= jsLine) { clearLineFromStack = lineMapRef[mapKeys[i]]; break; }
        }
        break;
      }
    }
  }
  // Most specific Clear line wins: stack-traced statement > endpoint ctx > null
  const resolvedClearLine = clearLineFromStack || ctx.line || null;
  const result = {
    status,
    response: {
      error: safeMsg,
      clear_line: resolvedClearLine,
      clear_file: ctx.file || null,
      hint: hint,
      ...(debug ? { technical: msg, clear_source: ctx.source || null } : {})
    }
  };
  if (clearLineFromStack && clearLineFromStack !== ctx.line) {
    result.response.clear_line_endpoint = ctx.line || null;
  }
  if (suggested_fix) result.response.suggested_fix = suggested_fix;
  if (debug === 'verbose' && ctx) {
    const tableSchema = (map && map.tables && ctx.table) ? map.tables[ctx.table] : null;
    result.response.context = redact({
      endpoint: ctx.endpoint || null,
      input: ctx.input || null,
      schema: tableSchema ? tableSchema.fields : (ctx.schema || null),
      table: ctx.table || null
    });
  }
  return result;
}`, deps: [] },
  { name: '_clearTry', code: `async function _clearTry(fn, ctx) {
  try { return await fn(); } catch (err) {
    err._clearCtx = ctx;
    throw err;
  }
}`, deps: ['_clearError'] },
  { name: '_askAI', code: `async function _askAI(prompt, context, schema, model) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLEAR_AI_KEY;
  if (!key) throw new Error("Set ANTHROPIC_API_KEY environment variable with your Anthropic API key");
  const endpoint = process.env.CLEAR_AI_ENDPOINT || "https://api.anthropic.com/v1/messages";
  let content = context ? prompt + "\\n\\nContext: " + (typeof context === 'string' ? context : JSON.stringify(context)) : prompt;
  if (schema) {
    const fields = schema.map(f => "  " + JSON.stringify(f.name) + ": " + (f.type === 'number' ? '<number>' : f.type === 'boolean' ? '<true or false>' : f.type === 'list' ? '<array>' : '<string>')).join(",\\n");
    content += "\\n\\nRespond with ONLY a JSON object in this exact shape, no other text:\\n{\\n" + fields + "\\n}";
  }
  const payload = JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 1024, messages: [{ role: "user", content }] });
  const headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  function parseResult(text) {
    if (!schema) return text;
    // Extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON. Response: " + text.slice(0, 200));
    try { return JSON.parse(jsonMatch[0]); } catch (e) { throw new Error("AI returned invalid JSON: " + e.message + ". Response: " + text.slice(0, 200)); }
  }
  // Use fetch (works in most environments). If behind a proxy, fall back to curl.
  try {
    const r = await fetch(endpoint, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(30000) });
    if (!r.ok) { const e = await r.text(); throw new Error("AI request failed: " + r.status + " " + e); }
    const data = await r.json();
    return parseResult(data.content[0].text);
  } catch (fetchErr) {
    if (!process.env.HTTP_PROXY && !process.env.HTTPS_PROXY && !process.env.http_proxy) throw fetchErr;
    // Proxy environment: fetch may not respect HTTP_PROXY, fall back to curl
    const { execSync } = require("child_process");
    const tmp = "/tmp/_askAI_" + Date.now() + ".json";
    require("fs").writeFileSync(tmp, payload);
    try {
      const hdr = Object.entries(headers).map(([k,v]) => '-H "' + k + ": " + v + '"').join(" ");
      const out = execSync('curl -s -X POST ' + hdr + ' -d @' + tmp + ' "' + endpoint + '"', { encoding: "utf8", timeout: 30000 });
      require("fs").unlinkSync(tmp);
      const data = JSON.parse(out);
      if (data.error) throw new Error("AI error: " + data.error.message);
      return parseResult(data.content[0].text);
    } catch (curlErr) { try { require("fs").unlinkSync(tmp); } catch(_) {} throw curlErr; }
  }
}`, deps: [] },
  { name: '_askAIWithTools', code: `async function _askAIWithTools(prompt, context, tools, toolFns, model) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLEAR_AI_KEY;
  if (!key) throw new Error("Set ANTHROPIC_API_KEY environment variable with your Anthropic API key");
  const endpoint = process.env.CLEAR_AI_ENDPOINT || "https://api.anthropic.com/v1/messages";
  const headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  const _model = model || "claude-sonnet-4-20250514";
  const userContent = context ? prompt + "\\n\\nContext: " + (typeof context === "string" ? context : JSON.stringify(context)) : prompt;
  const messages = [{ role: "user", content: userContent }];
  const maxTurns = 10;
  for (let i = 0; i < maxTurns; i++) {
    const payload = { model: _model, max_tokens: 4096, messages, tools };
    const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
    if (!r.ok) { const e = await r.text(); throw new Error("AI request failed: " + r.status + " " + e); }
    const data = await r.json();
    const msg = data.content;
    messages.push({ role: "assistant", content: msg });
    const toolUses = msg.filter(b => b.type === "tool_use");
    if (toolUses.length === 0) return msg.find(b => b.type === "text")?.text || "";
    const results = [];
    for (const tu of toolUses) {
      const fn = toolFns[tu.name];
      if (!fn) { results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: "Unknown tool: " + tu.name }), is_error: true }); continue; }
      try {
        const result = await fn(...Object.values(tu.input));
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      } catch (toolErr) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: toolErr.message }), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent exceeded maximum tool use turns (10)");
}`, deps: [] },
  { name: '_askAIStream', code: `async function* _askAIStream(prompt, context, model) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLEAR_AI_KEY;
  if (!key) throw new Error("Set ANTHROPIC_API_KEY environment variable with your Anthropic API key");
  const endpoint = process.env.CLEAR_AI_ENDPOINT || "https://api.anthropic.com/v1/messages";
  const content = context ? prompt + "\\n\\nContext: " + (typeof context === 'string' ? context : JSON.stringify(context)) : prompt;
  const payload = JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 4096, stream: true, messages: [{ role: "user", content }] });
  const headers = { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  const r = await fetch(endpoint, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(60000) });
  if (!r.ok) { const e = await r.text(); throw new Error("AI stream failed: " + r.status + " " + e); }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          yield evt.delta.text;
        }
      } catch {}
    }
  }
}`, deps: [] },
  { name: '_classifyIntent', code: `async function _classifyIntent(input, categories) {
  const prompt = "Classify the following input into exactly one of these categories: " + categories.join(", ") + ".\\n\\nInput: " + String(input) + "\\n\\nRespond with ONLY the category name, nothing else.";
  const response = await _askAI(prompt, null, null, "claude-haiku-4-5-20251001");
  // Handle both string responses and object responses (e.g. from mocks returning {text: "..."})
  const text = (typeof response === 'object' && response !== null && response.text) ? response.text : String(response);
  const cleaned = text.trim().toLowerCase();
  for (const cat of categories) {
    if (cleaned === cat.toLowerCase() || cleaned.includes(cat.toLowerCase())) return cat;
  }
  return categories[categories.length - 1];
}`, deps: ['_askAI'] },
  // RAG: fetch web page text (strip HTML tags)
  { name: '_fetchPageText', code: `async function _fetchPageText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const html = await res.text();
    return html.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '').replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
  } catch (e) { console.warn('RAG fetch failed:', url, e.message); return ''; }
}`, deps: [] },
  // RAG: load local file text (txt, md, pdf, docx)
  { name: '_loadFileText', code: `async function _loadFileText(filePath) {
  const fs = require('fs');
  const ext = filePath.split('.').pop().toLowerCase();
  try {
    if (ext === 'txt' || ext === 'md') return fs.readFileSync(filePath, 'utf8');
    if (ext === 'pdf') { const pdf = require('pdf-parse'); const buf = fs.readFileSync(filePath); const data = await pdf(buf); return data.text; }
    if (ext === 'docx') { const mammoth = require('mammoth'); const result = await mammoth.extractRawText({ path: filePath }); return result.value; }
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) { console.warn('RAG file load failed:', filePath, e.message); return ''; }
}`, deps: [] },
  // RAG: keyword search against cached text, returns scored chunks
  { name: '_searchText', code: `function _searchText(text, queryWords, sourceName) {
  if (!text) return [];
  const chunks = text.match(/[^.!?\\n]+[.!?\\n]*/g) || [text];
  const results = [];
  for (const chunk of chunks) {
    const lower = chunk.toLowerCase();
    const score = queryWords.filter(w => lower.includes(w)).length;
    if (score > 0) results.push({ source: sourceName, data: chunk.trim(), score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}`, deps: [] },
  // Chat utilities: markdown rendering, message display, send/clear
  { name: '_chatMdInline', code: `function _chatMdInline(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
    .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
}`, deps: [] },
  { name: '_chatMdBlock', code: `function _chatMdBlock(s) {
  var lines = s.split('\\n');
  var out = '';
  var inList = false;
  var inTable = false;
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (/^\\|(.+)\\|/.test(line.trim())) {
      if (inList) { out += inList === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      if (!inTable) {
        out += '<table>';
        inTable = true;
        var cells = line.trim().split('|').filter(function(c) { return c.trim() !== ''; });
        out += '<thead><tr>' + cells.map(function(c) { return '<th>' + _chatMdInline(c.trim()) + '</th>'; }).join('') + '</tr></thead><tbody>';
        if (i + 1 < lines.length && /^\\|[\\s\\-:|]+\\|/.test(lines[i + 1].trim())) i++;
        i++;
        continue;
      } else {
        var cells = line.trim().split('|').filter(function(c) { return c.trim() !== ''; });
        out += '<tr>' + cells.map(function(c) { return '<td>' + _chatMdInline(c.trim()) + '</td>'; }).join('') + '</tr>';
        i++;
        continue;
      }
    } else if (inTable) {
      out += '</tbody></table>';
      inTable = false;
    }
    if (/^#{1,3} (.+)/.test(line)) {
      if (inList) { out += inList === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      var lvl = line.match(/^(#+)/)[1].length;
      out += '<h' + (lvl + 2) + ' style="margin:.5em 0 .2em;font-weight:600">' + _chatMdInline(line.replace(/^#+\\s+/, '')) + '</h' + (lvl + 2) + '>';
    } else if (/^[-*] (.+)/.test(line)) {
      if (inList !== 'ul') { if (inList) out += '</ol>'; out += '<ul style="margin:.3em 0 .3em 1.2em;padding:0">'; inList = 'ul'; }
      out += '<li>' + _chatMdInline(line.replace(/^[-*] /, '')) + '</li>';
    } else if (/^\\d+\\.\\s+(.+)/.test(line)) {
      if (inList !== 'ol') { if (inList) out += '</ul>'; out += '<ol style="margin:.3em 0 .3em 1.2em;padding:0">'; inList = 'ol'; }
      out += '<li>' + _chatMdInline(line.replace(/^\\d+\\.\\s+/, '')) + '</li>';
    } else if (line.trim() === '') {
      if (inList) { out += inList === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      out += '<br>';
    } else {
      if (inList) { out += inList === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      out += '<span>' + _chatMdInline(line) + '</span><br>';
    }
    i++;
  }
  if (inList) out += inList === 'ol' ? '</ol>' : '</ul>';
  if (inTable) out += '</tbody></table>';
  return out;
}`, deps: ['_chatMdInline'] },
  { name: '_chatMd', code: `function _chatMd(text) {
  var parts = [];
  var codeRe = /\\\`\\\`\\\`(\\w*)\\n?([\\s\\S]*?)\\\`\\\`\\\`/g;
  var last = 0, m;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', s: text.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1], s: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', s: text.slice(last) });
  return parts.map(function(p) {
    if (p.type === 'code') {
      return '<pre style="background:var(--color-base-200,#1e1e2e);color:var(--color-base-content,#cdd6f4);padding:.75rem;border-radius:.5rem;overflow-x:auto;font-size:13px;margin:.5em 0"><code>' +
        p.s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
    }
    return _chatMdBlock(p.s);
  }).join('');
}`, deps: ['_chatMdInline', '_chatMdBlock'] },
  { name: '_chatRender', code: `function _chatRender(el, messages, roleField, contentField) {
  if (!el) return;
  if (!Array.isArray(messages) || messages.length === 0) {
    el.innerHTML = '<p style="text-align:center;opacity:0.4;padding:2rem 0;font-size:14px">No messages yet</p>';
    return;
  }
  el.innerHTML = messages.map(function(msg) {
    var role = String(msg[roleField] || 'user').toLowerCase();
    var content = String(msg[contentField] || '');
    var isUser = role === 'user';
    var cls = isUser ? 'user' : 'assistant';
    var rendered = isUser ? _chatMdInline(content) : _chatMd(content);
    return '<div class="clear-chat-msg ' + cls + '">' + rendered + '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}`, deps: ['_chatMd', '_chatMdInline'] },
  { name: '_chatSend', code: `function _chatSend(inputId, msgsId, typingId, url, field, onDone) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  var msgsEl = document.getElementById(msgsId);
  if (msgsEl) {
    var bubble = document.createElement('div');
    bubble.className = 'clear-chat-msg user';
    bubble.innerHTML = _chatMdInline(msg);
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  var typingEl = document.getElementById(typingId);
  if (typingEl) typingEl.style.display = 'flex';
  var body = {};
  body[field] = msg;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function() {
      if (typingEl) typingEl.style.display = 'none';
      if (onDone) onDone();
    })
    .catch(function(err) {
      if (typingEl) typingEl.style.display = 'none';
      if (typeof _toast === 'function') _toast('Send failed: ' + err.message, 'error');
      if (onDone) onDone();
    });
}`, deps: ['_chatMdInline'] },
  { name: '_chatSendStream', code: `function _chatSendStream(inputId, msgsId, typingId, url, field, onDone) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  var msgsEl = document.getElementById(msgsId);
  if (msgsEl) {
    var bubble = document.createElement('div');
    bubble.className = 'clear-chat-msg user';
    bubble.innerHTML = _chatMdInline(msg);
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  var assistBubble = document.createElement('div');
  assistBubble.className = 'clear-chat-msg assistant';
  var contentSpan = document.createElement('span');
  assistBubble.appendChild(contentSpan);
  if (msgsEl) {
    msgsEl.appendChild(assistBubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  var body = {};
  body[field] = msg;
  var fullText = '';
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r) {
      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            contentSpan.innerHTML = _chatMd(fullText);
            if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
            if (onDone) onDone();
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.startsWith('data: ')) {
              var data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                var evt = JSON.parse(data);
                if (evt.text) {
                  fullText += evt.text;
                  contentSpan.textContent = fullText;
                  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
                }
              } catch(e) {}
            }
          }
          read();
        });
      }
      read();
    })
    .catch(function(err) {
      contentSpan.textContent = 'Error: ' + err.message;
      if (typeof _toast === 'function') _toast('Send failed: ' + err.message, 'error');
      if (onDone) onDone();
    });
}`, deps: ['_chatMdInline', '_chatMd'] },
  { name: '_chatClear', code: `function _chatClear(url, msgsId) {
  var el = document.getElementById(msgsId);
  if (el) el.innerHTML = '<p style="text-align:center;opacity:0.4;padding:2rem 0;font-size:14px">No messages yet</p>';
  if (url) {
    fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }).catch(function() {});
  }
}`, deps: [] },
];

// Tree-shake: scan compiled code and return only used utility function definitions
function _getUsedUtilities(compiledCode) {
  const needed = new Set();
  for (const util of UTILITY_FUNCTIONS) {
    // Check if the function name appears in the compiled code — either as a direct call
    // like _revive(...) or as a callback reference like .map(_revive)
    if (compiledCode.includes(util.name + '(') || compiledCode.includes(util.name + ')') || compiledCode.includes(util.name + ',') || compiledCode.includes(util.name + ';')) {
      needed.add(util.name);
      // Also include dependencies
      for (const dep of util.deps) needed.add(dep);
    }
  }
  // Return definitions in dependency order
  return UTILITY_FUNCTIONS.filter(u => needed.has(u.name)).map(u => u.code);
}

// Built-in adapter names -- these are NOT file imports
const ADAPTER_NAMES = new Set(['data', 'database', 'email', 'web-scraper', 'pdf', 'ml']);

// Derive namespace name from module path: 'lib/helpers' -> 'helpers', 'helpers.clear' -> 'helpers'
function deriveNamespace(moduleName) {
  // Take the last path segment
  const lastSegment = moduleName.split('/').pop();
  // Strip .clear extension if present
  return lastSegment.replace(/\.clear$/, '');
}

// Resolve file-based module imports: parse imported files and attach to USE nodes
// as namespace objects. Called BEFORE validation so the namespace variable is known.
export function resolveModules(ast, moduleResolver, resolutionStack = []) {
  if (!moduleResolver) return [];
  const errors = [];
  const resolvedModules = new Set();
  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i];
    if (node.type !== NodeType.USE) continue;
    const moduleName = node.module;
    if (ADAPTER_NAMES.has(moduleName)) continue;
    // External JS imports (use 'lib' from './lib.js') are not resolved here
    if (node.source) continue;

    // Circular dependency check — must happen before duplicate check
    if (resolutionStack.includes(moduleName)) {
      errors.push({ line: node.line, message: `Circular import: ${[...resolutionStack, moduleName].join(' -> ')}. Break the circle by moving shared code to a third file.` });
      continue;
    }

    if (resolvedModules.has(moduleName)) {
      // Mark duplicate so compileNode can skip it
      node._resolved = true;
      node._duplicate = true;
      continue;
    }
    resolvedModules.add(moduleName);

    const moduleSource = moduleResolver(moduleName);
    if (moduleSource === null) {
      errors.push({ line: node.line, message: `Could not find module '${moduleName}'. Create a file called '${moduleName}.clear' in the same directory.` });
      continue;
    }
    const moduleAst = parse(moduleSource);
    if (moduleAst.errors.length > 0) {
      for (const err of moduleAst.errors) {
        errors.push({ line: node.line, message: `Error in module '${moduleName}' line ${err.line}: ${err.message}` });
      }
      continue;
    }

    // Recursively resolve nested imports, passing the current module on the stack
    const nestedErrors = resolveModules(moduleAst, moduleResolver, [...resolutionStack, moduleName]);
    for (const err of nestedErrors) {
      errors.push({ line: node.line, message: `In module '${moduleName}': ${err.message}` });
    }
    // For inline-all (use everything from), import ALL node types.
    // For selective/namespaced imports, only functions/assigns/components.
    const importedNodes = node.importAll
      ? moduleAst.body.filter(n =>
          n.type !== NodeType.TARGET && n.type !== NodeType.THEME && n.type !== NodeType.DATABASE_DECL
        )
      : moduleAst.body.filter(n =>
          n.type === NodeType.FUNCTION_DEF || n.type === NodeType.ASSIGN || n.type === NodeType.COMPONENT_DEF
        );

    // Inline-all import: use everything from 'helpers'
    if (node.importAll) {
      // Check for name collisions with local definitions
      let hasCollision = false;
      for (const imported of importedNodes) {
        const collision = ast.body.find(n =>
          n !== node && (n.type === NodeType.FUNCTION_DEF || n.type === NodeType.ASSIGN) && n.name === imported.name
        );
        if (collision) {
          errors.push({ line: node.line, message: `'${imported.name}' exists in both your code and '${moduleName}'. Use \`use '${moduleName}'\` (namespaced) or rename one.` });
          hasCollision = true;
        }
      }
      node._resolved = true;
      if (!hasCollision) {
        // Tag each imported node with its source file for error translator
        for (const n of importedNodes) {
          n._sourceFile = moduleName;
          if (n.body) for (const child of n.body) child._sourceFile = child._sourceFile || moduleName;
        }
        // Splice imported nodes directly into the parent AST so all compile paths
        // (server JS, reactive JS, HTML scaffold) can see pages, endpoints, etc.
        ast.body.splice(i + 1, 0, ...importedNodes);
        i += importedNodes.length; // skip past spliced nodes
      }
      continue;
    }

    // Selective import: use double, triple from 'helpers'
    if (node.selectiveImports) {
      const availableNames = importedNodes.map(n => n.name);
      const selectedNodes = [];
      for (const name of node.selectiveImports) {
        const found = importedNodes.find(n => n.name === name);
        if (!found) {
          errors.push({ line: node.line, message: `'${moduleName}' doesn't have '${name}'. It has: ${availableNames.join(', ')}` });
          continue;
        }
        // Check for collision with local definitions
        const collision = ast.body.find(n =>
          n !== node && (n.type === NodeType.FUNCTION_DEF || n.type === NodeType.ASSIGN || n.type === NodeType.COMPONENT_DEF) && n.name === name
        );
        if (collision) {
          errors.push({ line: node.line, message: `Can't import '${name}' from '${moduleName}' — you already have a local '${name}' defined on line ${collision.line}. Rename one of them to avoid the conflict.` });
          continue;
        }
        selectedNodes.push(found);
      }
      // Splice selected nodes inline (right after the use node)
      node._resolved = true;
      node._selectiveNodes = selectedNodes;
      continue;
    }

    // Store parsed nodes on the USE node for compilation into a namespace object
    node._resolved = true;
    node._moduleNodes = importedNodes;
    node._namespace = deriveNamespace(moduleName);
  }
  return errors;
}

// Compile resolved module nodes into a namespace object: const helpers = { double: function(x) { ... }, ... };
function compileNamespaceObject(useNode, ctx, pad) {
  const ns = sanitizeName(useNode._namespace);
  const nodes = useNode._moduleNodes || [];
  const entries = [];

  // Compile each exported function/variable into a namespace property
  const moduleCtx = { ...ctx, declared: new Set(), stateVars: new Set(), indent: 0 };
  for (const mNode of nodes) {
    if (mNode.type === NodeType.FUNCTION_DEF) {
      const params = mNode.params.map(p => sanitizeName(p.name)).join(', ');
      // Single-expression function: body is [returnNode(expr)]
      const isSingleReturn = mNode.body && mNode.body.length === 1 && mNode.body[0].type === NodeType.RETURN;
      if (ctx.lang === 'python') {
        if (isSingleReturn) {
          const bodyExpr = exprToCode(mNode.body[0].expression, moduleCtx);
          entries.push(`"${mNode.name}": lambda ${params}: ${bodyExpr}`);
        } else {
          // Multi-line: not yet supported in namespace, fall back to lambda of last return
          const fnDeclared = new Set(mNode.params.map(p => sanitizeName(p.name)));
          const bodyCode = compileBody(mNode.body, moduleCtx, { declared: fnDeclared });
          entries.push(`"${mNode.name}": lambda ${params}: (${bodyCode.trim()})`);
        }
      } else {
        if (isSingleReturn) {
          const bodyExpr = exprToCode(mNode.body[0].expression, moduleCtx);
          entries.push(`${sanitizeName(mNode.name)}: function(${params}) { return ${bodyExpr}; }`);
        } else {
          const fnDeclared = new Set(mNode.params.map(p => sanitizeName(p.name)));
          const bodyCode = compileBody(mNode.body, { ...moduleCtx, indent: 1 }, { declared: fnDeclared });
          entries.push(`${sanitizeName(mNode.name)}: function(${params}) {\n${bodyCode}\n${pad}}`);
        }
      }
    } else if (mNode.type === NodeType.ASSIGN) {
      const valExpr = exprToCode(mNode.expression, moduleCtx);
      if (ctx.lang === 'python') {
        entries.push(`"${mNode.name}": ${valExpr}`);
      } else {
        entries.push(`${sanitizeName(mNode.name)}: ${valExpr}`);
      }
    } else if (mNode.type === NodeType.COMPONENT_DEF) {
      // Components compile like functions
      const params = mNode.props.map(sanitizeName).join(', ');
      const compDeclared = new Set(mNode.props.map(sanitizeName));
      const compCtx = { ...moduleCtx, indent: 1, declared: compDeclared, componentMode: true };
      const bodyParts = [];
      bodyParts.push('  let _html = \'\';');
      for (const child of mNode.body) {
        const compiled = compileNode(child, compCtx);
        if (compiled) bodyParts.push(compiled);
      }
      bodyParts.push('  return _html;');
      entries.push(`${sanitizeName(mNode.name)}: function(${params}) {\n${bodyParts.join('\n')}\n${pad}}`);
    }
  }

  if (ctx.lang === 'python') {
    ctx.declared.add(ns);
    return `${pad}${ns} = { ${entries.join(', ')} }`;
  }
  const keyword = ctx.declared.has(ns) ? '' : 'const ';
  ctx.declared.add(ns);
  return `${pad}${keyword}${ns} = { ${entries.join(', ')} };`;
}

// Insert /_eval/* Express handlers into compiled serverJS just before the
// `app.listen(...)` / `const PORT = ...` preamble. Called during compile
// when `evalMode: true` is set in compiler options. The alternative (a
// server-side regex splice at eval-run time) was fragile — any change to
// the compiled preamble would break the splice silently and every eval
// would then 404. This puts the splice under the compiler's single-AST
// invariant, so drift is impossible.
function _spliceEvalEndpoints(serverJS, endpointsJS) {
  if (!endpointsJS) return serverJS;
  const marker = /const PORT = process\.env\.PORT/;
  if (marker.test(serverJS)) {
    return serverJS.replace(marker, endpointsJS + '\nconst PORT = process.env.PORT');
  }
  return serverJS.replace(/app\.listen\(/, endpointsJS + '\napp.listen(');
}

// =============================================================================
// CLOUDFLARE WORKERS TARGET
// =============================================================================
//
// Emits a Workers-for-Platforms bundle from the AST: `src/index.js` (ESM
// export-default fetch handler), `wrangler.toml`, and `migrations/*.sql`.
// Called at the end of compile() only when target === 'cloudflare'.
// Delegated to `lib/packaging-cloudflare.js` so this file doesn't balloon.
//
// Phase 2 scope (cycle 2.1 landed here, 2.2+ expand): real Workers fetch
// handler + D1 CRUD emit. Every endpoint compiles through the normal
// compileBody pipeline with `ctx.target = 'cloudflare'` set, so CRUD nodes
// emit env.DB.prepare/bind/run (see compileCrudD1 below).

function emitCloudflareWorkerBundle(body, result) {
  const bundle = buildWorkerBundle(body, result);
  // Replace the Phase-1 stubbed src/index.js with the compiled Worker entry
  // that runs endpoint bodies through compileBody with ctx.target='cloudflare'.
  const compiledEntry = compileToCloudflareWorker(body, result);
  if (compiledEntry) bundle['src/index.js'] = compiledEntry;
  return bundle;
}

// =============================================================================
// CLOUDFLARE WORKER ENTRY (src/index.js) — Phase 2 D1 codegen
// =============================================================================
// Compile the AST into an ESM export-default fetch handler. Endpoints are
// routed by (method, pathname). Every endpoint body is compiled through the
// normal compileBody pipeline — since ctx.target='cloudflare' in this pass,
// CRUD nodes emit env.DB.prepare/bind/run (see compileCrudD1 above).
//
// Embeds the compiled HTML (result.html) so GET / still serves the app UI,
// preserving data-clear-line attributes for click-to-edit (future plan).

function compileToCloudflareWorker(body, result) {
  const html = typeof result?.html === 'string' ? result.html : '';
  const schemaNames = new Set();
  const schemaMap = {};
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) {
      schemaNames.add(node.name);
      schemaMap[node.name.toLowerCase()] = { fields: node.fields, fkFields: node.fields.filter((f) => f.fk) };
    }
  }
  const declared = new Set();
  const ctx = {
    lang: 'js',
    indent: 2,
    declared,
    stateVars: null,
    mode: 'backend',
    schemaNames,
    schemaMap,
    target: 'cloudflare',
    _astBody: body,
    _allNodes: body,
  };

  const endpoints = body.filter((n) => n.type === NodeType.ENDPOINT);

  const out = [];
  out.push('// Generated by Clear for Cloudflare Workers for Platforms (Phase 2 D1)');
  out.push('// DO NOT EDIT — regenerate by recompiling the .clear source');
  out.push('');
  out.push(`const __CLEAR_HTML__ = ${JSON.stringify(html)};`);
  out.push('');
  out.push('export default {');
  out.push('  async fetch(request, env, ctx) {');
  out.push('    const url = new URL(request.url);');
  out.push('    const pathname = url.pathname;');
  out.push('    const method = request.method;');
  out.push('');

  for (const ep of endpoints) {
    const methodUpper = (ep.method || 'GET').toUpperCase();
    const { match, params } = _cfPathMatchSnippet(ep.path);
    const hasIdParam = /\/:id(\/|$)/.test(ep.path || '');
    out.push(`    if (method === ${JSON.stringify(methodUpper)} && ${match}) {`);
    out.push(`      try {`);
    if (params.length > 0) {
      out.push(`        request.params = ${params};`);
    }

    // Body binding: request.json() for writes, query params for GET.
    const bodyUsesIncoming = endpointBodyUsesIncoming(ep.body);
    const needsBinding = ep.receivingVar || bodyUsesIncoming;
    const dataVar = ep.receivingVar || 'incoming';
    if (needsBinding) {
      if (methodUpper === 'GET') {
        out.push(`        const ${sanitizeName(dataVar)} = Object.fromEntries(url.searchParams.entries());`);
      } else {
        out.push(`        let ${sanitizeName(dataVar)} = {};`);
        out.push(`        try { ${sanitizeName(dataVar)} = await request.json(); } catch (_e) { ${sanitizeName(dataVar)} = {}; }`);
      }
    }

    // Compile body with ctx.target='cloudflare'
    const epDeclared = new Set();
    if (ep.receivingVar) epDeclared.add(sanitizeName(ep.receivingVar));
    if (bodyUsesIncoming) epDeclared.add('incoming');
    const bodyCode = compileBody(ep.body || [], ctx, {
      indent: 3,
      declared: epDeclared,
      endpointMethod: methodUpper,
      endpointHasId: hasIdParam,
      target: 'cloudflare',
    });
    if (bodyCode) out.push(bodyCode);
    out.push(`      } catch (err) {`);
    out.push(`        const _status = err.status || 500;`);
    out.push(`        const _msg = err.status ? err.message : 'Internal error';`);
    out.push(`        return new Response(JSON.stringify({ error: _msg }), { status: _status, headers: { 'Content-Type': 'application/json' } });`);
    out.push(`      }`);
    out.push(`    }`);
  }

  // Default GET / → compiled HTML
  out.push(`    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {`);
  out.push(`      return new Response(__CLEAR_HTML__, {`);
  out.push(`        headers: { 'Content-Type': 'text/html; charset=utf-8' }`);
  out.push(`      });`);
  out.push(`    }`);
  out.push('');
  out.push(`    return new Response('Not found', { status: 404 });`);
  out.push('  }');
  out.push('};');
  out.push('');
  return out.join('\n');
}

// Build a match snippet + params extraction snippet for a route path.
// "/api/todos/:id" → match: a regex-test against pathname, params: extracted param object.
// Kept as a literal equality check for paths without :params.
function _cfPathMatchSnippet(path) {
  if (!/:[a-z_][a-z0-9_]*/i.test(path || '')) {
    return { match: `pathname === ${JSON.stringify(path)}`, params: '' };
  }
  const paramNames = [];
  const regexSource = '^' + path.replace(/:[a-z_][a-z0-9_]*/gi, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  }) + '$';
  const match = `(new RegExp(${JSON.stringify(regexSource)})).test(pathname)`;
  const params =
    '(() => { const _m = pathname.match(new RegExp(' + JSON.stringify(regexSource) + ')) || []; return { ' +
    paramNames.map((n, i) => `${n}: _m[${i + 1}]`).join(', ') +
    ' }; })()';
  return { match, params };
}

export function compile(ast, options = {}) {
  const errors = [...ast.errors];
  const warnings = [];
  const target = options.target || ast.target || 'web';
  const sourceMap = options.sourceMap === true; // opt-in

  const VALID_TARGETS = ['web', 'backend', 'both', 'web_and_js_backend', 'web_and_python_backend', 'js_backend', 'python_backend', 'cloudflare'];
  if (!VALID_TARGETS.includes(target)) {
    errors.push({ line: 0, message: `Unknown target "${target}". Use: web, backend, or both. Example: build for web and python backend` });
    return { errors, warnings };
  }

  // Cloudflare Workers target is a compile-time deploy format, not a language/runtime.
  // When target === 'cloudflare', we still run the default (web + js backend) emit paths
  // so compileProgram returns the same serverJS/html we'd hand to Node. Then at the end
  // we emit a Workers-flavored `src/index.js` + `wrangler.toml` into result.workerBundle.
  // This keeps Phase 1 cleanly additive — the default target is untouched.
  const emitCloudflare = target === 'cloudflare';
  const runtimeTarget = emitCloudflare ? 'both' : target;

  const result = { errors, warnings };
  const needsWeb = ['web', 'both', 'web_and_js_backend', 'web_and_python_backend'].includes(runtimeTarget);
  const needsJSBackend = ['backend', 'both', 'web_and_js_backend', 'js_backend'].includes(runtimeTarget);
  const needsPythonBackend = ['backend', 'both', 'web_and_python_backend', 'python_backend'].includes(runtimeTarget);

  // Pre-scan: identify which agents will stream (async function* generators).
  // This runs BEFORE compilation so both backend (SSE endpoints) and frontend
  // (_chatSendStream vs _chatSend) can use it regardless of compilation order.
  const streamingAgentNames = new Set();
  for (const node of ast.body) {
    if (node.type === NodeType.AGENT) {
      let willStream = node.streamResponse !== false; // stream by default, opt out with 'do not stream'
      if (willStream) {
        // Auto-disable for structured output — can't stream partial JSON
        let hasStructured = false;
        (function check(nodes) {
          for (const n of nodes) {
            if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI && n.expression.schema?.length > 0) hasStructured = true;
            if (n.body) check(n.body);
            if (n.thenBranch) check(n.thenBranch);
            if (n.otherwiseBranch) check(n.otherwiseBranch);
          }
        })(node.body);
        if (hasStructured) willStream = false;
      }
      if (node.schedule) willStream = false;
      if (node.tools && node.tools.length > 0) willStream = false;
      if (node.skills && node.skills.length > 0) {
        for (const skillName of node.skills) {
          const skillNode = ast.body.find(n => n.type === NodeType.SKILL && n.name === skillName);
          if (skillNode?.tools?.length > 0) { willStream = false; break; }
        }
      }
      // Must have ask_ai calls in body to actually stream
      if (willStream) {
        let hasAskAI = false;
        (function checkAI(nodes) {
          for (const n of nodes) {
            if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI) hasAskAI = true;
            if (n.type === NodeType.ASK_AI) hasAskAI = true;
            if (n.body) checkAI(n.body);
            if (n.thenBranch) checkAI(n.thenBranch);
          }
        })(node.body);
        if (!hasAskAI) willStream = false;
      }
      if (willStream) streamingAgentNames.add(node.name);
    }
  }

  if (needsWeb) {
    result.javascript = compileToJS(ast.body, errors, sourceMap, streamingAgentNames);
    const htmlResult = compileToHTML(ast.body, result.javascript);
    result.html = htmlResult.html;
    result.css = htmlResult.css;
  }
  if (needsJSBackend) {
    // evalMode is a compile-time flag that appends /_eval/agent_<name>
    // Express handlers to the end of the serverJS so every agent is
    // directly POST-able for grading. Off by default; the Studio eval
    // runner flips it on for the child process it spawns, and user
    // apps in prod compile without it. Safer than server-side regex
    // splicing because the handlers are emitted from the same AST pass
    // that generates the rest of the routes — no drift risk.
    const evalEndpointsJS = options.evalMode === true ? generateEvalEndpoints(ast.body) : '';

    if (needsWeb) {
      result.serverJS = compileToJSBackend(ast.body, errors, sourceMap, streamingAgentNames);
      if (evalEndpointsJS) result.serverJS = _spliceEvalEndpoints(result.serverJS, evalEndpointsJS);
      // Also generate browser-compatible server for playground preview
      result.browserServer = compileToBrowserServer(ast.body, errors);
    } else {
      result.javascript = compileToJSBackend(ast.body, errors, sourceMap, streamingAgentNames);
      if (evalEndpointsJS) result.javascript = _spliceEvalEndpoints(result.javascript, evalEndpointsJS);
      // Backend-only apps also get a browser server for playground preview
      result.browserServer = compileToBrowserServer(ast.body, errors);
    }
  }
  if (needsPythonBackend) {
    result.python = compileToPythonBackend(ast.body, errors, sourceMap);
  }

  // Check for deploy nodes
  const deployNode = ast.body.find(n => n.type === NodeType.DEPLOY);
  if (deployNode) {
    result.deployConfig = generateDeployConfig(deployNode.platform, target);
  }

  // Generate E2E test script for backend apps
  if (needsJSBackend) {
    const testGen = generateE2ETests(ast.body);
    // New generator shape: { script, warnings }. Keep legacy string fallback.
    if (testGen && typeof testGen === 'object' && 'script' in testGen) {
      result.tests = testGen.script;
      if (Array.isArray(testGen.warnings) && testGen.warnings.length > 0) {
        result.warnings = (result.warnings || []).concat(testGen.warnings);
      }
    } else {
      result.tests = testGen;
    }
  }

  // Generate agent evals:
  //   .evals.schema — Clear test blocks (deterministic, mocked AI) [legacy, CLI]
  //   .evals.graded — JS eval harness (real AI, LLM-graded scorecard) [legacy, CLI]
  //   .evalSuite   — structured per-eval spec list (individually runnable,
  //                  Studio "Run Evals" button path). Shape:
  //                  [ { id, kind, agentName, endpointPath, input, rubric, expected } ]
  const agentEvals = generateAgentEvals(ast.body);
  if (agentEvals) {
    result.evals = agentEvals;
  }
  const suite = generateEvalSuite(ast.body);
  if (suite && suite.length > 0) {
    result.evalSuite = suite;
    // Pre-built Express handlers the eval runner injects into a COPY of
    // serverJS before spawning the eval child. Exposes every agent at
    // /_eval/agent_<name> so internal agents can be graded individually.
    result.evalEndpointsJS = generateEvalEndpoints(ast.body);
  }

  // Cloudflare Workers bundle — a separate emit path that produces a
  // `src/index.js` Fetch-handler + `wrangler.toml`. We only fire this when
  // the caller opted into target='cloudflare' so every existing caller
  // (CLI, Studio preview, tests) stays on the default Node emit path.
  if (emitCloudflare) {
    result.workerBundle = emitCloudflareWorkerBundle(ast.body, result);
  }

  return result;
}

/**
 * Structured eval suite for the Studio "Run Evals" button path.
 *
 * Three eval kinds per app:
 *   - e2e    — one per POST endpoint. Asserts the endpoint returns a non-empty
 *              response and, when an API key is available, asks Claude to
 *              grade whether the full workflow produced a useful result.
 *   - role   — one per agent reachable via a POST endpoint. Claude grades
 *              whether the agent did its job (as described by its body +
 *              directives). Skipped without API key.
 *   - format — one per agent reachable via a POST endpoint. Deterministic:
 *              asserts the response matches the agent's declared output
 *              shape (returning: fields or non-empty text).
 *
 * Agents with no direct endpoint (called only by other agents) are flagged
 * runnable:false with a note pointing to the E2E path that exercises them.
 */
function generateEvalSuite(body) {
  const agents = body.filter(n => n.type === NodeType.AGENT && !n.schedule);
  if (agents.length === 0) return [];

  // Which agents are reachable via a POST endpoint? Walk every POST body
  // for ASSIGN → RUN_AGENT and record the shortest endpoint that exposes
  // each agent. An agent may be reached through multiple endpoints; the
  // first one wins (order in source file).
  const endpointByAgent = new Map();
  const endpoints = body.filter(n => n.type === NodeType.ENDPOINT && n.method?.toUpperCase() === 'POST');
  for (const ep of endpoints) {
    (function walk(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT) {
          if (!endpointByAgent.has(n.expression.agentName)) {
            endpointByAgent.set(n.expression.agentName, ep.path);
          }
        }
        if (n.body) walk(n.body);
        if (n.thenBranch) walk(n.thenBranch);
        if (n.otherwiseBranch) walk(n.otherwiseBranch);
      }
    })(ep.body || []);
  }

  // For each agent, find its output schema (from returning: fields on the
  // first ask_ai call) — used to build Format eval expected-shape checks.
  function findOutputSchema(agentNode) {
    let found = null;
    (function walk(nodes) {
      if (!Array.isArray(nodes) || found) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI && n.expression.schema?.length > 0) {
          found = n.expression.schema;
          return;
        }
        if (n.body) walk(n.body);
        if (n.thenBranch) walk(n.thenBranch);
        if (n.otherwiseBranch) walk(n.otherwiseBranch);
      }
    })(agentNode.body);
    return found;
  }

  // === PROBE BUILDER ===
  // Builds a realistic test input for an agent from three signal sources,
  // in priority order:
  //   1. Known-noun dictionary — receiving var matches a common noun
  //      (question/topic/candidate/lead/message/...). Most agents hit this.
  //   2. Table-schema-aware — receiving var (singular or plural) matches a
  //      CREATE_TABLE in the same source. Build an object from its fields.
  //   3. Prompt-hint — scan the agent's ask-claude prompts for recognizable
  //      nouns (company, industry, email, ...). Compose an object probe.
  //   4. Fallback — `'hello'` with `probeQuality: 'generic'`. The eval UI
  //      should surface this so the user knows to override with an `evals:`
  //      scenario. Core templates must not fall through here.
  //
  // Returns `{ value, quality: 'real' | 'generic', source: string }`.

  // A short value that matches the shape implied by a CREATE_TABLE field.
  // Specific values first (company names, industries, etc.) so the grader
  // and any LLM downstream get something concrete to reason about. Generic
  // fallbacks like "sample X" caused Claude-backed agents to refuse — e.g.
  // "I can't rate a company called 'Sample company' without more info."
  function _sampleValueForField(field) {
    const t = (field.type || 'text').toLowerCase();
    const n = (field.name || '').toLowerCase();
    if (t === 'number' || t === 'integer' || t === 'float') return 42;
    if (t === 'boolean' || t === 'bool') return true;
    if (t === 'timestamp' || t === 'datetime' || n.endsWith('_at')) return new Date('2026-04-15T12:00:00Z').toISOString();
    if (n === 'email' || n.includes('email')) return 'alice@example.com';
    if (n === 'url' || n.includes('url')) return 'https://example.com';
    if (n === 'phone' || n.includes('phone')) return '+1-555-0100';
    // Concrete-name fields — give something the grader can check against.
    if (n === 'company') return 'Acme Corp';
    if (n === 'industry') return 'SaaS';
    if (n === 'customer') return 'Alice Smith';
    if (n === 'product') return 'Widget';
    if (n === 'topic') return 'quantum computing';
    if (n === 'title') return 'Intro to quantum computing';
    if (n === 'subject') return 'Cannot log in to my account';
    if (n === 'name' || n === 'label') return 'Alice Smith';
    if (n === 'question' || n === 'q') return 'What is quantum computing in one sentence?';
    if (n === 'message' || n === 'msg') return 'Hi, I need help with my order.';
    if (n === 'body') return 'I am unable to access my account. Could you help me reset my password?';
    if (n === 'content') return 'This is sample content for evaluation — around 20 words of plain text.';
    if (n === 'description') return 'A cozy café with strong coffee and quiet tables.';
    if (n === 'summary') return 'A short summary of the content.';
    if (n === 'text') return 'The quick brown fox jumps over the lazy dog.';
    if (n === 'role') return 'user';
    if (n === 'status') return 'open';
    if (n === 'resume') return 'Senior engineer with 8 years of backend experience.';
    if (n === 'comment') return 'Mostly good, but arrived late.';
    return 'sample ' + field.name;
  }

  // Known-noun dictionary. When an agent receives a value named after a
  // common noun, we can be very specific about a realistic probe shape.
  // Keep this dictionary covered by every receiving-var name used in the
  // 8 core templates + apps/multi-agent-research (verified by smoke test).
  const KNOWN_PROBES = {
    // Plain-string probes (simple scalars)
    question: 'What is quantum computing in one sentence?',
    message: 'Hi, I need help with my recent order.',
    text: 'The quick brown fox jumps over the lazy dog. It was surprisingly fast.',
    topic: 'quantum computing',
    subject: 'Cannot log in to my account',
    claim: 'The Earth orbits the Sun once every 365 days.',
    statement: 'The Earth orbits the Sun once every 365 days.',
    draft: 'Quantum computing is a new kind of computer. It is different from regular computers.',
    content: 'This is sample content for evaluation — around 20 words of plain text.',
    description: 'A cozy café with strong coffee and quiet tables.',
    name: 'Alice Smith',
    email: 'alice@example.com',
    url: 'https://example.com/sample',
    body: 'I am unable to access my account. Could you help me reset my password?',
    msg: 'Hi, I need help with my recent order.',
    q: 'What is quantum computing?',
    input: 'hello',

    // List-valued probes (agent iterates them)
    items: ['first sample item for rating', 'second sample item for rating'],
    questions: ['What is quantum computing?', 'How does entanglement work?'],
    findings: [
      'Quantum computers use qubits that can be in superposition, representing 0 and 1 at once.',
      'Entanglement lets two qubits share a state regardless of distance.',
      'Shor\'s algorithm would let a quantum computer factor large numbers much faster than classical hardware.'
    ],
    tickets: ['Order has not arrived', 'Wrong item in the box'],
    texts: ['First piece of text to analyze.', 'Second piece of text to analyze.'],
    messages: ['Can you help me?', 'I have a problem with my order.'],
    claims: ['The Earth is flat.', 'Water boils at 100°C at sea level.'],

    // Structured-object probes (agents that expect several fields together)
    candidate: { name: 'Jane Doe', resume: 'Senior engineer with 8 years of backend experience.', email: 'jane@example.com' },
    lead: { company: 'Acme Corp', industry: 'SaaS', employees: 500, contact: 'sales@acme.com' },
    request: { topic: 'quantum computing', depth: 'intro' },
    data: { title: 'Sample post', body: 'Sample content for evaluation.' },
    post: { title: 'Hello World', body: 'This is a sample post about quantum computing.' },
    user: { name: 'Alice', email: 'alice@example.com' },
    order: { id: 1, customer: 'Alice', total: 99.99, status: 'shipped' },
    product: { name: 'Widget', description: 'A small but useful gadget', price: 9.99 },
    ticket: { subject: 'Cannot log in', body: 'My password reset email never arrives.', priority: 'high' },
    item: { name: 'Sample Item', description: 'A red leather notebook with gold edges.', price: 29.99 },
    feedback: { rating: 4, comment: 'Mostly good, but arrived late.' },
  };

  // Scalar substitutions the prompt-hint composer uses when it finds a noun
  // mentioned in an agent's ask-claude prompts but the noun isn't a direct
  // receiving-var. Kept separate from KNOWN_PROBES so object-valued entries
  // there (candidate, lead, order...) don't accidentally get inlined as
  // single fields inside a composed probe.
  const HINT_SCALARS = {
    company: 'Acme Corp',
    industry: 'SaaS',
    employees: 500,
    email: 'alice@example.com',
    name: 'Alice Smith',
    topic: 'quantum computing',
    question: 'What is quantum computing?',
    product: 'Widget',
    order: 'order-1234',
    customer: 'Alice Smith',
    title: 'Sample Title',
    summary: 'A short summary of the content.',
  };

  // Nouns worth scanning for inside ask-claude prompts when all other
  // signals miss. Only the ones that map cleanly to a short string probe.
  const PROMPT_HINT_NOUNS = ['company', 'industry', 'employees', 'email', 'name', 'topic', 'question', 'product', 'order', 'customer', 'title', 'summary'];

  function _collectTableSchema(receivingVar) {
    if (!receivingVar) return null;
    const v = receivingVar.toLowerCase();
    // Clear parses `create a X table:` to NodeType.DATA_SHAPE (not CREATE_TABLE).
    const tables = body.filter(n => n.type === NodeType.DATA_SHAPE && n.name);
    const match = tables.find(t => {
      const tn = t.name.toLowerCase();
      // Match against singular → plural (candidate → Candidates), plural → plural,
      // exact, plural → singular, and -es plurals (addresses → address).
      return tn === v || tn === v + 's' || tn === v + 'es' || tn.replace(/s$/, '') === v || tn.replace(/es$/, '') === v;
    });
    if (!match || !Array.isArray(match.fields)) return null;
    const obj = {};
    for (const field of match.fields) {
      obj[field.name] = _sampleValueForField(field);
    }
    return obj;
  }

  function _collectPromptHintProbe(agentNode) {
    const prompts = [];
    (function walk(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI) {
          const p = n.expression.prompt;
          if (p && typeof p === 'object' && p.value) prompts.push(p.value);
        }
        if (n.body) walk(n.body);
        if (n.thenBranch) walk(n.thenBranch);
        if (n.otherwiseBranch) walk(n.otherwiseBranch);
      }
    })(agentNode.body);
    const haystack = prompts.join(' ').toLowerCase();
    const hits = PROMPT_HINT_NOUNS.filter(k => haystack.includes(k));
    if (hits.length < 2) return null;
    const obj = {};
    for (const k of hits) {
      if (Object.prototype.hasOwnProperty.call(HINT_SCALARS, k)) obj[k] = HINT_SCALARS[k];
    }
    return Object.keys(obj).length > 0 ? obj : null;
  }

  function buildProbe(agentNode) {
    const v = agentNode.receivingVar || 'input';
    // 1. Table-schema first — a table the user explicitly declared in the
    //    source file is the strongest signal. If the user wrote a custom
    //    `Candidates` table with 12 fields, our 3-field default probe would
    //    skip most of them. Favor the user's own shape.
    const schemaProbe = _collectTableSchema(v);
    if (schemaProbe) {
      return { value: schemaProbe, quality: 'real', source: 'table-schema' };
    }
    // 2. Known-noun — no matching table, use language-level default.
    if (Object.prototype.hasOwnProperty.call(KNOWN_PROBES, v)) {
      return { value: KNOWN_PROBES[v], quality: 'real', source: 'known-noun' };
    }
    // 3. Prompt-hint — compose from nouns mentioned in the agent's own prompts.
    const hintProbe = _collectPromptHintProbe(agentNode);
    if (hintProbe) {
      return { value: hintProbe, quality: 'real', source: 'prompt-hints' };
    }
    // 4. Generic fallback — UI should flag this so the user adds an override.
    return { value: 'hello', quality: 'generic', source: 'fallback' };
  }

  // Legacy shim — suite entries call this to get just the value. The full
  // probe metadata is attached to the spec separately below.
  function sampleInput(agentNode) {
    return buildProbe(agentNode).value;
  }

  // Build the grader's rubric from the agent's actual definition. Every
  // section of the agent declaration contributes: the prompts it sends to
  // Claude, the skills it uses (with those skills' instructions pulled in),
  // its tools, guardrails, memory, knowledge sources, and output shape.
  //
  // The grader reads this verbatim — so we want it rich and specific, not
  // a generic "does it do its job" template.
  function describeAgentRole(agentNode) {
    const sections = [];

    // 1. The prompts the agent sends to Claude — the primary job statement.
    const askAi = [];
    (function walk(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI) {
          const p = n.expression.prompt;
          if (p && typeof p === 'object' && p.value) askAi.push(p.value);
        }
        if (n.body) walk(n.body);
        if (n.thenBranch) walk(n.thenBranch);
        if (n.otherwiseBranch) walk(n.otherwiseBranch);
      }
    })(agentNode.body);
    if (askAi.length > 0) {
      sections.push(`Purpose — the agent sends these prompts to Claude: ${askAi.map(p => JSON.stringify(p)).join('; ')}.`);
    }

    // 2. Skills the agent uses — pull in their instructions so the grader
    //    knows the style/policy rules the agent is supposed to follow.
    if (agentNode.skills?.length) {
      sections.push(`Uses skills: ${agentNode.skills.join(', ')}.`);
      for (const skillName of agentNode.skills) {
        const skillNode = body.find(n => n.type === NodeType.SKILL && n.name === skillName);
        if (!skillNode) continue;
        if (Array.isArray(skillNode.instructions) && skillNode.instructions.length > 0) {
          sections.push(`Skill '${skillName}' instructions: ${skillNode.instructions.join(' ')}`);
        }
        if (Array.isArray(skillNode.tools) && skillNode.tools.length > 0) {
          sections.push(`Skill '${skillName}' tools: ${skillNode.tools.join(', ')}.`);
        }
      }
    }

    // 3. Tools the agent has direct access to (outside any skill bundle).
    if (agentNode.tools?.length) {
      sections.push(`Direct tools: ${agentNode.tools.map(t => t.name || t.description).join(', ')}.`);
    }

    // 4. Hard constraints — the agent must not do these things.
    if (agentNode.restrictions?.length) {
      sections.push(`Must not: ${agentNode.restrictions.map(r => r.text || r).join('; ')}.`);
    }

    // 5. Argument-level guardrails (regex filters on tool inputs).
    if (agentNode.blockArgumentsPattern) {
      sections.push(`Rejects tool-input arguments matching: /${agentNode.blockArgumentsPattern}/.`);
    }

    // 6. Knowledge sources the agent has access to (RAG).
    if (agentNode.knowsAbout?.length) {
      const sources = agentNode.knowsAbout.map(s => {
        if (typeof s === 'string') return s;
        return s.value || s.table || s.type || '';
      }).filter(Boolean);
      if (sources.length) sections.push(`Knows about (RAG sources): ${sources.join(', ')}.`);
    }

    // 7. Memory directives — conversation history / user preferences.
    const memory = [];
    if (agentNode.rememberConversation) memory.push('multi-turn conversation context');
    if (agentNode.rememberUser) memory.push('per-user preferences');
    if (memory.length) sections.push(`Maintains: ${memory.join(', ')}.`);

    // 8. Declared output shape — what fields the agent is supposed to return.
    const schema = findOutputSchema(agentNode);
    if (schema && schema.length > 0) {
      sections.push(`Declared output shape: ${schema.map(f => `${f.name}${f.type ? ` (${f.type})` : ''}`).join(', ')}.`);
    }

    // 9. Observability — whether the agent logs its decisions.
    if (agentNode.trackDecisions) {
      sections.push(`Logs decisions to the AgentLogs table.`);
    }

    return sections.join('\n');
  }

  // Find any `validate incoming:` block inside an endpoint body. Walks
  // nested blocks because validate can live inside `if`, `try`, etc.
  function _findValidateBlock(nodes) {
    if (!Array.isArray(nodes)) return null;
    for (const n of nodes) {
      if (n.type === NodeType.VALIDATE || n.type === 'validate') return n;
      if (n.body) { const v = _findValidateBlock(n.body); if (v) return v; }
    }
    return null;
  }

  // Build a probe body that honors both the agent's receiving-var AND the
  // endpoint's `validate incoming:` required fields. Without the validate
  // merge, probes return HTTP 400 before the agent even runs — page-analyzer
  // and lead-scorer both had this problem. The endpoint's validator is the
  // ground truth about what body shape the agent expects.
  //
  // Three shape paths based on how the endpoint reads the body:
  //   - `sending X` → endpoint names the body X. Required fields land at
  //     top-level, agent probe fields are spread in if it's an object.
  //   - No `sending X` → endpoint reads `data's field` / `req.body`. We
  //     put the agent probe under its receiving-var name and overlay
  //     required fields at the top level.
  //   - No endpoint (synthetic /_eval/*) → wrap as `{ input: probe }`, which
  //     is what the synthetic handler reads.
  function buildEndpointBody(ep, agent, probe) {
    const validateNode = _findValidateBlock(ep?.body || []);
    const validateFields = Array.isArray(validateNode?.rules)
      ? validateNode.rules.filter(r => r && r.constraints?.required)
      : [];
    // Base shape — wrap the probe under the agent's receiving-var name. This
    // is the ground truth for how every template without a validate block
    // has always worked (endpoint reads `data's X` → body must be `{X:...}`).
    const agentKey = agent?.receivingVar || 'input';
    const body = agent ? { [agentKey]: probe.value } : { input: probe.value };
    // If there's a validate block, its rules describe what fields must sit
    // at the body's TOP level (the endpoint validates `req.body`, not a
    // nested object). Overlay them. Matters for `sending X` + `validate X:`
    // templates (page-analyzer, lead-scorer) where the validator reads the
    // body directly and rejects anything that doesn't include the required
    // fields. When the agent's receiving-var key would duplicate one of
    // those top-level fields, the validate field wins.
    for (const f of validateFields) {
      body[f.name] = _sampleValueForField({ name: f.name, type: f.fieldType || f.type || 'text' });
    }
    return body;
  }

  const suite = [];

  // One E2E eval per POST endpoint. Validates the top-line app flow.
  for (const ep of endpoints) {
    // Skip endpoints that don't call an agent — those get endpoint-level
    // happy-path coverage from e2e.test.js already.
    let callsAgent = false;
    (function walk(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT) callsAgent = true;
        if (n.body) walk(n.body);
        if (n.thenBranch) walk(n.thenBranch);
        if (n.otherwiseBranch) walk(n.otherwiseBranch);
      }
    })(ep.body || []);
    if (!callsAgent) continue;

    // Build a reasonable JSON body from the first agent's receiving variable.
    const firstAgentName = [...endpointByAgent.entries()].find(([, path]) => path === ep.path)?.[0];
    const firstAgent = agents.find(a => a.name === firstAgentName);
    const firstProbe = firstAgent ? buildProbe(firstAgent) : { value: 'hello', quality: 'generic', source: 'fallback' };
    const body = buildEndpointBody(ep, firstAgent, firstProbe);

    suite.push({
      id: `e2e-${sanitizeName(ep.path.replace(/[/:]/g, '_'))}`,
      kind: 'e2e',
      label: `E2E happy path — POST ${ep.path}`,
      agentName: firstAgentName || null,
      endpointPath: ep.path,
      input: body,
      probeQuality: firstProbe.quality,
      probeSource: firstProbe.source,
      rubric: `The endpoint ${ep.path} should return a non-empty, relevant response when called with a realistic input. Judge the output on: 1) it's non-empty, 2) it looks like a real answer (not boilerplate or errors), 3) the top-level flow made sense given the input.`,
      expected: { kind: 'non-empty' }
    });
  }

  // Role + Format evals per agent — every agent gets graded individually,
  // whether it's exposed via an endpoint or called internally. For internal
  // agents, we point at a synthetic `/_eval/agent_<name>` endpoint that the
  // eval runner injects into the compiled app only when evals are running.
  // The synthetic endpoint wraps the agent's function so we can POST to it
  // directly and grade the output.
  for (const agent of agents) {
    const userPath = endpointByAgent.get(agent.name);
    const fnName = 'agent_' + sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'));
    const path = userPath || `/_eval/${fnName}`;
    const isSynthetic = !userPath;
    // Real endpoints expect the user's body shape including any required
    // validate fields; synthetic endpoints always read `req.body.input` so
    // the wrapper stays consistent with what the synthetic handler expects.
    const probe = buildProbe(agent);
    let input;
    if (isSynthetic) {
      input = { input: probe.value };
    } else {
      const userEndpoint = endpoints.find(e => e.path === userPath);
      input = buildEndpointBody(userEndpoint, agent, probe);
    }
    const role = describeAgentRole(agent);
    const schema = findOutputSchema(agent);

    // The rubric is the grader's complete brief on what this agent does.
    // Built entirely from the agent's definition — no generic template text.
    const rubric = role
      ? `Judge whether the '${agent.name}' agent did its job based on how it is defined in the source:\n\n${role}\n\nThe agent was given this input:\n\n<input>\n${JSON.stringify(input, null, 2)}\n</input>\n\nPass if the output is on-task, matches the declared shape, and respects any constraints. Fail otherwise.`
      : `Judge whether the '${agent.name}' agent produced a useful response for the input. Pass if the response is non-empty and on-topic.`;

    suite.push({
      id: `role-${sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'))}`,
      kind: 'role',
      label: `${agent.name} — does its job`,
      agentName: agent.name,
      endpointPath: path,
      synthetic: isSynthetic,
      input,
      probeQuality: probe.quality,
      probeSource: probe.source,
      definition: role || null,  // shown in UI so the user knows what's being graded
      rubric,
      expected: { kind: 'non-empty' }
    });

    suite.push({
      id: `format-${sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'))}`,
      kind: 'format',
      label: `${agent.name} — output format is correct`,
      agentName: agent.name,
      endpointPath: path,
      synthetic: isSynthetic,
      input,
      probeQuality: probe.quality,
      probeSource: probe.source,
      expected: schema
        ? { kind: 'fields', fields: schema.map(f => ({ name: f.name, type: f.type || 'text' })) }
        : { kind: 'non-empty' }
    });
  }

  // User-defined evals from per-agent `evals:` subsections. Each scenario
  // attached to `.evalScenarios` on an agent becomes a suite entry with
  // source='user-agent'. The scenario's input overrides the auto-probe for
  // that specific entry — other auto-generated rows for the agent stay.
  for (const agent of agents) {
    if (!Array.isArray(agent.evalScenarios) || agent.evalScenarios.length === 0) continue;
    const userPath = endpointByAgent.get(agent.name);
    const fnName = 'agent_' + sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'));
    const path = userPath || `/_eval/${fnName}`;
    const isSynthetic = !userPath;
    const receivingVar = agent.receivingVar || 'input';
    for (const sc of agent.evalScenarios) {
      const input = isSynthetic ? { input: sc.input } : { [receivingVar]: sc.input };
      const expected = sc.expectFields && sc.expectFields.length > 0
        ? { kind: 'fields', fields: sc.expectFields.map(f => ({ name: f, type: 'text' })) }
        : { kind: 'non-empty' };
      suite.push({
        id: `scenario-${sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'))}-${sanitizeName(sc.name.toLowerCase().replace(/\s+/g, '_'))}`,
        kind: 'user',
        label: `${agent.name} — ${sc.name}`,
        source: 'user-agent',
        agentName: agent.name,
        endpointPath: path,
        synthetic: isSynthetic,
        input,
        rubric: sc.rubric || null,
        expected,
      });
    }
  }

  // User-defined evals from top-level `eval 'name':` blocks. Each EVAL_DEF
  // node translates into exactly one suite entry. The translation maps:
  //   - scenarioKind='agent' → look up the agent's endpoint path (real or
  //     synthetic /_eval/), wrap input for that transport
  //   - scenarioKind='endpoint' → use the literal path the user wrote
  //   - rubric → LLM-graded expectation
  //   - expectFields → deterministic fields-based format check
  const userEvals = body.filter(n => n.type === NodeType.EVAL_DEF);
  for (const e of userEvals) {
    let endpointPath = null;
    let synthetic = false;
    let input = null;

    if (e.scenarioKind === 'agent') {
      const agent = agents.find(a => a.name === e.agentName);
      if (!agent) {
        // Validator will also flag; still emit the spec so the UI can surface it.
        suite.push({
          id: `user-${sanitizeName((e.name || 'eval').toLowerCase().replace(/\s+/g, '_'))}`,
          kind: 'user',
          label: e.name,
          source: 'user-top',
          agentName: e.agentName,
          endpointPath: null,
          runnable: false,
          note: `Eval '${e.name}' references agent '${e.agentName}', which isn't defined in this source.`,
        });
        continue;
      }
      const fnName = 'agent_' + sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'));
      const userPath = endpointByAgent.get(agent.name);
      endpointPath = userPath || `/_eval/${fnName}`;
      synthetic = !userPath;
      // Synthetic endpoints always read req.body.input; real endpoints read the
      // agent's receiving-var key. Preserve that invariant here too.
      if (synthetic) {
        input = { input: e.input };
      } else {
        input = { [agent.receivingVar || 'input']: e.input };
      }
    } else if (e.scenarioKind === 'endpoint') {
      endpointPath = e.endpointPath;
      input = (e.input && typeof e.input === 'object' && !Array.isArray(e.input))
        ? e.input
        : { input: e.input };
    }

    const expected = e.expectFields && e.expectFields.length > 0
      ? { kind: 'fields', fields: e.expectFields.map(f => ({ name: f, type: 'text' })) }
      : { kind: 'non-empty' };

    suite.push({
      id: `user-${sanitizeName((e.name || 'eval').toLowerCase().replace(/\s+/g, '_'))}`,
      kind: 'user',
      label: e.name,
      source: 'user-top',
      agentName: e.agentName || null,
      endpointPath,
      synthetic,
      input,
      rubric: e.rubric || null,
      expected,
    });
  }

  return suite;
}

/**
 * Given the list of agents in the program, return a string of Express
 * handler code that exposes each agent as `POST /_eval/agent_<name>`.
 * The eval runner injects this into a COPY of the compiled serverJS before
 * spinning up the eval child — the user's app never sees these handlers.
 *
 * Each handler:
 *   - reads `req.body.input` as the agent's single argument
 *   - calls the agent's compiled function
 *   - if the return value is an async iterator (streaming agent), drains
 *     it into a single string so the eval runner sees finished text
 *   - returns { result } JSON (or { error } on throw)
 */
export function generateEvalEndpoints(body) {
  const agents = body.filter(n => n.type === NodeType.AGENT && !n.schedule);
  if (agents.length === 0) return '';
  const lines = [];
  lines.push('');
  lines.push('// === EVAL-MODE ENDPOINTS (auto-injected) ===');
  lines.push('// Expose every agent at /_eval/<fn_name> so the eval runner can');
  lines.push('// grade each agent individually, even ones only called internally.');
  for (const agent of agents) {
    const fnName = 'agent_' + sanitizeName(agent.name.toLowerCase().replace(/\s+/g, '_'));
    lines.push(`app.post('/_eval/${fnName}', async (req, res) => {`);
    lines.push(`  try {`);
    lines.push(`    const _arg = req.body && req.body.input !== undefined ? req.body.input : req.body;`);
    lines.push(`    const _r = ${fnName}(_arg);`);
    lines.push(`    if (_r && typeof _r[Symbol.asyncIterator] === 'function') {`);
    lines.push(`      let _t = '';`);
    lines.push(`      for await (const _c of _r) _t += _c;`);
    lines.push(`      return res.json({ result: _t });`);
    lines.push(`    }`);
    lines.push(`    const _result = await _r;`);
    lines.push(`    return res.json({ result: _result });`);
    lines.push(`  } catch (e) { return res.status(500).json({ error: e.message || String(e) }); }`);
    lines.push(`});`);
  }
  return lines.join('\n') + '\n';
}

function generateE2ETests(body) {
  // Walk AST to collect endpoints and data shapes
  const endpoints = [];
  const schemas = {};
  // Track which URLs the frontend actually wires up via buttons / page actions.
  // Used below to decide whether to label CRUD flow tests as "User can..." (real
  // UI exists) or "API: ..." (endpoint-only — no UI button triggers the flow).
  const uiPostUrls = new Set(); // URLs that some button/action POSTs to
  function collect(nodes, inPage = false) {
    for (const node of nodes) {
      if (node.type === NodeType.ENDPOINT) {
        const ep = { method: node.method, path: node.path, line: node.line, hasAuth: false, hasValidation: false, receivingVar: node.receivingVar, rules: [], body: node.body || [] };
        for (const child of (node.body || [])) {
          if (child.type === NodeType.REQUIRES_AUTH) ep.hasAuth = true;
          if (child.type === NodeType.REQUIRES_ROLE) ep.hasAuth = true;
          if (child.type === NodeType.VALIDATE) {
            ep.hasValidation = true;
            ep.rules = child.rules || [];
          }
          if (child.type === NodeType.RESPOND && (child.successMessage || child.status === 201)) ep.returns201 = true;
        }
        endpoints.push(ep);
      }
      if (node.type === NodeType.DATA_SHAPE) {
        const fields = node.fields.map(f => ({ name: f.name, type: f.fieldType, required: f.required, default: f.defaultValue, fk: f.fk || null }));
        schemas[node.name] = fields;
      }
      // Inside pages, record any POST API_CALL — that's a real UI wiring
      if (inPage && node.type === NodeType.API_CALL && node.method === 'POST' && node.url) {
        uiPostUrls.add(node.url);
      }
      if (node.type === NodeType.PAGE) collect(node.body || [], true);
      else if (node.type === NodeType.SECTION || node.type === NodeType.BUTTON || node.type === NodeType.FORM) collect(node.body || [], inPage);
    }
  }
  collect(body);

  if (endpoints.length === 0) return null;

  // --- English test name helper ---
  // Converts endpoint metadata into human-readable test names like
  // "Creating a new todo succeeds" instead of "POST /api/todos with valid data returns 201"
  function resourceName(path) {
    // Skip URL params like :id to find the actual resource name
    const parts = path.split('/').filter(p => p && !p.startsWith(':'));
    const last = parts[parts.length - 1] || 'item';
    // Singularize: 'todos' → 'todo', 'categories' → 'category'
    if (last.endsWith('ies')) return last.slice(0, -3) + 'y';
    if (last.endsWith('s') && !last.endsWith('ss')) return last.slice(0, -1);
    return last;
  }
  function resourcePlural(path) {
    const parts = path.split('/').filter(p => p && !p.startsWith(':'));
    return parts[parts.length - 1] || 'items';
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function article(word) {
    // English exceptions: "u" making "yoo" sound gets "a" not "an"
    if (/^uni|^user|^use|^util/i.test(word)) return 'a';
    return /^[aeiou]/i.test(word) ? 'an' : 'a';
  }

  // --- FK dependency analysis ---
  // Detect fields ending in _id that reference another table's POST endpoint.
  // Example: Orders has product_id -> Products table -> POST /api/products
  // Build a map: { childEndpointPath: [{ parentField, parentEndpoint, parentPayload }] }
  const tableNames = Object.keys(schemas);
  const tableLower = tableNames.map(t => t.toLowerCase().replace(/s$/, '')); // "Products" -> "product"

  // Map: lowercase singular table name -> POST endpoint for that table
  const postByTable = {};
  for (const ep of endpoints) {
    if (ep.method !== 'POST' || !ep.hasValidation) continue;
    // Match POST /api/products -> "product"
    const pathParts = ep.path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]; // "products"
    const singular = resource.replace(/s$/, '');       // "product"
    postByTable[singular] = ep;
  }

  // For each POST endpoint, find FK dependencies via the schema it writes to
  // depMap: endpointPath -> [{ field, parentTable, parentEndpoint }]
  const depMap = {};
  for (const ep of endpoints) {
    if (ep.method !== 'POST') continue;
    const pathParts = ep.path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1];
    const singular = resource.replace(/s$/, '');

    // Find the schema this endpoint writes to
    const schemaName = tableNames.find(t => t.toLowerCase().replace(/s$/, '') === singular);
    if (!schemaName) continue;
    const fields = schemas[schemaName];

    for (const f of fields) {
      // Detect FK by explicit fk property or by _id naming convention
      let parentSingular = null;
      if (f.fk) {
        parentSingular = f.fk.toLowerCase();
      } else if (f.name.endsWith('_id')) {
        parentSingular = f.name.replace(/_id$/, '');
      }
      if (!parentSingular || parentSingular === singular) continue;
      if (!postByTable[parentSingular]) continue;

      if (!depMap[ep.path]) depMap[ep.path] = [];
      depMap[ep.path].push({
        field: f.name,
        parentTable: parentSingular,
        parentEndpoint: postByTable[parentSingular]
      });
    }
  }

  // Build valid payloads from validation rules (reusable helper)
  function buildPayload(ep) {
    const payload = {};
    for (const rule of ep.rules) {
      if (rule.constraints?.required) {
        payload[rule.name] = testValueForRule(rule);
      }
    }
    return payload;
  }

  // Generate a valid test value based on field type and constraints
  function testValueForRule(rule) {
    if (rule.fieldType === 'number') return 42;
    if (rule.constraints?.matches === 'email') return 'test@example.com';
    if (rule.constraints?.matches === 'time') return '09:00';
    if (rule.constraints?.matches === 'phone') return '+1-555-0100';
    if (rule.constraints?.matches === 'url') return 'https://example.com';
    if (rule.constraints?.oneOf) return rule.constraints.oneOf[0];
    return 'Test value';
  }

  const lines = [];
  lines.push('#!/usr/bin/env node');
  lines.push('// E2E tests -- auto-generated by Clear compiler');
  lines.push('// Run: node test.js');
  lines.push('// Requires: server running on localhost:3000');
  lines.push('');
  lines.push('const BASE = process.env.TEST_URL || "http://localhost:3000";');
  lines.push('let passed = 0, failed = 0;');
  lines.push('let _emailCounter = 0;');
  lines.push('let _uniqueCounter = 0;');
  // Module-level so both user tests and the _expectStatus helper can see them
  lines.push('let _response, _responseBody;');
  lines.push('let _lastCall = { method: "", path: "", line: 0 };');
  lines.push('function _uniqueEmail() { return "test" + (++_emailCounter) + "@example.com"; }');
  lines.push('function _uniqueText(base) { return base + "_" + (++_uniqueCounter); }');
  lines.push('');
  lines.push('// Note: for clean re-runs, delete clear-data.db before starting the server');
  lines.push('// unique constraints may cause 500s if stale data exists from a previous run');

  // If any endpoint requires auth, generate a test token
  const anyAuth = endpoints.some(ep => ep.hasAuth);
  if (anyAuth) {
    lines.push('');
    lines.push('// Generate a test auth token compatible with the server\'s JWT verification');
    lines.push('// Uses jsonwebtoken (same library as compiled server) with JWT_SECRET env var');
    lines.push('const jwt = require("jsonwebtoken");');
    lines.push('const _testSecret = process.env.JWT_SECRET || "clear-test-secret";');
    lines.push('const TEST_TOKEN = jwt.sign({ id: 1, role: "admin", email: "test@test.com" }, _testSecret, { expiresIn: "1h" });');
    lines.push('const AUTH_HEADERS = { "Authorization": "Bearer " + TEST_TOKEN, "Content-Type": "application/json" };');
  }

  // Track IDs from setup steps so dependent tests can use them
  const hasDeps = Object.keys(depMap).length > 0;
  if (hasDeps) {
    lines.push('');
    lines.push('// IDs created by setup steps, used by dependent tests');
    lines.push('const createdIds = {};');
  }

  lines.push('');
  lines.push('async function test(name, fn) {');
  lines.push('  try {');
  lines.push('    await fn();');
  lines.push('    passed++;');
  lines.push('    console.log("PASS:", name);');
  lines.push('  } catch (err) {');
  lines.push('    failed++;');
  lines.push('    console.log("FAIL:", name, "-", err.message);');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('function assert(condition, msg) { if (!condition) throw new Error(msg); }');
  lines.push('');
  lines.push('async function run() {');

  // --- Setup steps: create parent records for FK dependencies ---
  const setupParents = new Set(); // track which parents we've already set up
  for (const [childPath, deps] of Object.entries(depMap)) {
    for (const dep of deps) {
      const parentKey = dep.parentTable;
      if (setupParents.has(parentKey)) continue;
      setupParents.add(parentKey);

      const parentEp = dep.parentEndpoint;
      const parentPayload = buildPayload(parentEp);
      const parentHeaders = parentEp.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';

      const parentHasEmail = parentEp.rules.some(r => r.constraints?.matches === 'email');

      lines.push(`  // Setup: create a ${parentKey} so dependent tests have a valid ${parentKey}_id`);
      lines.push(`  await test("Setup: create ${article(parentKey)} ${parentKey} for related records", async () => {`);
      if (parentHasEmail) {
        lines.push(`    const payload = ${JSON.stringify(parentPayload)};`);
        for (const rule of parentEp.rules) {
          if (rule.constraints?.matches === 'email') {
            lines.push(`    payload["${rule.name}"] = _uniqueEmail();`);
          }
        }
        lines.push(`    const r = await fetch(BASE + "${parentEp.path}", {`);
        lines.push(`      method: "POST", headers: ${parentHeaders},`);
        lines.push(`      body: JSON.stringify(payload)`);
      } else {
        lines.push(`    const r = await fetch(BASE + "${parentEp.path}", {`);
        lines.push(`      method: "POST", headers: ${parentHeaders},`);
        lines.push(`      body: JSON.stringify(${JSON.stringify(parentPayload)})`);
      }
      lines.push(`    });`);
      lines.push(`    assert(r.status === 201, "Expected 201, got " + r.status);`);
      lines.push(`    const data = await r.json();`);
      lines.push(`    assert(data.id, "Setup ${parentKey} should return an id");`);
      lines.push(`    createdIds["${parentKey}"] = data.id;`);
      lines.push(`  });`);
      lines.push('');
    }
  }

  // For each GET endpoint, test it returns 200
  for (const ep of endpoints) {
    if (ep.method === 'GET') {
      const testPath = ep.path.replace(/:(\w+)/g, '1');
      const fetchOpts = ep.hasAuth ? ', { headers: AUTH_HEADERS }' : '';
      const hasParam = ep.path.includes(':');
      const res = resourcePlural(ep.path);
      const testName = hasParam
        ? `Looking up ${article(resourceName(ep.path))} ${resourceName(ep.path)} by ID works`
        : `Viewing all ${res} returns data`;
      lines.push(`  await test("${testName}", async () => {`);
      lines.push(`    const r = await fetch(BASE + "${testPath}"${fetchOpts});`);
      if (hasParam) {
        lines.push(`    assert(r.status === 200 || r.status === 404, "Expected 200 or 404, got " + r.status);`);
      } else {
        lines.push(`    assert(r.status === 200, "Expected 200, got " + r.status);`);
      }
      lines.push(`  });`);
      lines.push('');
    }
  }

  // For each POST endpoint with validation, test valid + invalid
  for (const ep of endpoints) {
    if (ep.method === 'POST' && ep.hasValidation) {
      // Build valid payload from rules
      const validPayload = {};
      for (const rule of ep.rules) {
        if (rule.constraints?.required) {
          validPayload[rule.name] = testValueForRule(rule);
        }
      }

      // Always use dynamic payload to handle FK deps, emails, and unique constraints
      const deps = depMap[ep.path] || [];
      const postHeaders = ep.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
      const expectedPostStatus = ep.returns201 ? 201 : 200;
      const rn = resourceName(ep.path);
      lines.push(`  await test("Creating a new ${rn} succeeds", async () => {`);
      const fkFields = new Set(deps.map(d => d.field));
      lines.push(`    const payload = ${JSON.stringify(validPayload)};`);
      for (const dep of deps) {
        lines.push(`    payload["${dep.field}"] = createdIds["${dep.parentTable}"];`);
      }
      for (const rule of ep.rules) {
        if (fkFields.has(rule.name)) continue; // FK value already set above
        if (rule.constraints?.matches === 'email') {
          lines.push(`    payload["${rule.name}"] = _uniqueEmail();`);
        } else if (rule.fieldType === 'text' && rule.constraints?.required) {
          lines.push(`    payload["${rule.name}"] = _uniqueText("${rule.name}");`);
        }
      }
      {
        lines.push(`    const r = await fetch(BASE + "${ep.path}", {`);
        lines.push(`      method: "POST", headers: ${postHeaders},`);
        lines.push(`      body: JSON.stringify(payload)`);
      }
      lines.push(`    });`);
      lines.push(`    assert(r.status === ${expectedPostStatus}, "Expected ${expectedPostStatus}, got " + r.status);`);
      if (ep.returns201) {
        lines.push(`    const data = await r.json();`);
        lines.push(`    assert(data.id, "Response should have an id");`);
      }
      lines.push(`  });`);
      lines.push('');

      // Test empty body -- auth-protected endpoints need auth headers to reach body check
      if (ep.hasAuth) {
        lines.push(`  await test("Creating ${article(resourceName(ep.path))} ${resourceName(ep.path)} without any data is rejected", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${ep.path}", { method: "POST", headers: { "Authorization": "Bearer " + TEST_TOKEN } });`);
        lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
        lines.push(`  });`);
      } else {
        lines.push(`  await test("Creating ${article(resourceName(ep.path))} ${resourceName(ep.path)} without any data is rejected", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${ep.path}", { method: "POST" });`);
        lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
        lines.push(`  });`);
      }
      lines.push('');

      // Test missing required fields
      const requiredFields = ep.rules.filter(r => r.constraints?.required);
      if (requiredFields.length > 0) {
        const emptyHeaders = ep.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        lines.push(`  await test("Creating ${article(resourceName(ep.path))} ${resourceName(ep.path)} with a blank ${requiredFields[0].name} is rejected", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${ep.path}", {`);
        lines.push(`      method: "POST", headers: ${emptyHeaders},`);
        lines.push(`      body: JSON.stringify({ ${requiredFields[0].name}: "" })`);
        lines.push(`    });`);
        lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
        lines.push(`  });`);
        lines.push('');
      }
    }
  }

  // For each DELETE endpoint with auth, test 401 without auth
  for (const ep of endpoints) {
    if (ep.method === 'DELETE' && ep.hasAuth) {
      const testPath = ep.path.replace(/:(\w+)/g, '999');
      lines.push(`  await test("Deleting ${article(resourceName(ep.path))} ${resourceName(ep.path)} requires login", async () => {`);
      lines.push(`    const r = await fetch(BASE + "${testPath}", { method: "DELETE" });`);
      lines.push(`    assert(r.status === 401, "Expected 401, got " + r.status);`);
      lines.push(`  });`);
      lines.push('');
    }
  }

  // Test validation max length
  for (const ep of endpoints) {
    if (ep.method === 'POST' && ep.hasValidation) {
      for (const rule of ep.rules) {
        if (rule.constraints?.max && rule.fieldType === 'text') {
          const longVal = 'x'.repeat(rule.constraints.max + 1);
          const maxHeaders = ep.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
          lines.push(`  await test("Creating ${article(resourceName(ep.path))} ${resourceName(ep.path)} with a ${rule.name} that's too long is rejected", async () => {`);
          lines.push(`    const r = await fetch(BASE + "${ep.path}", {`);
          lines.push(`      method: "POST", headers: ${maxHeaders},`);
          lines.push(`      body: JSON.stringify({ ${rule.name}: "${longVal}" })`);
          lines.push(`    });`);
          lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
          lines.push(`  });`);
          lines.push('');
          break; // One max-length test per endpoint is enough
        }
      }
    }
  }

  // Test RBAC: endpoints with role requirements
  for (const ep of endpoints) {
    if (ep.method !== 'GET' && ep.hasAuth) {
      const hasRole = ep.body?.some(n => n.type === NodeType.REQUIRES_ROLE);
      if (hasRole) {
        const testPath = ep.path.replace(/:(\w+)/g, '999');
        const rn2 = resourceName(ep.path);
        const action2 = { GET: 'Viewing', POST: 'Creating', PUT: 'Updating', DELETE: 'Deleting' }[ep.method] || ep.method;
        lines.push(`  await test("${action2} ${article(rn2)} ${rn2} requires the right role", async () => {`);
        lines.push(`    // Note: this test requires a way to send a valid JWT with wrong role`);
        lines.push(`    // For now, just verify the endpoint exists and rejects unauthenticated`);
        lines.push(`    const r = await fetch(BASE + "${testPath}", { method: "${ep.method}" });`);
        lines.push(`    assert(r.status === 401 || r.status === 403, "Expected 401 or 403, got " + r.status);`);
        lines.push(`  });`);
        lines.push('');
      }
    }
  }

  // Test mass assignment: POST with extra fields should not persist them
  // Pick the first POST endpoint WITHOUT FK dependencies (simpler test target)
  for (const ep of endpoints) {
    if (ep.method === 'POST' && ep.hasValidation) {
      const deps = depMap[ep.path] || [];
      if (deps.length > 0) continue; // skip FK-dependent endpoints for mass assignment test

      const validPayload = {};
      for (const rule of ep.rules) {
        if (rule.constraints?.required) {
          validPayload[rule.name] = testValueForRule(rule);
        }
      }
      if (Object.keys(validPayload).length > 0) {
        const maHeaders = ep.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        const maExpected = ep.returns201 ? 201 : 200;
        lines.push(`  await test("Extra fields are stripped when creating ${article(resourceName(ep.path))} ${resourceName(ep.path)}", async () => {`);
        // Always use dynamic payload to avoid unique constraint collisions
        lines.push(`    const payload = { ...${JSON.stringify(validPayload)}, admin: true, role: "superuser" };`);
        for (const rule of ep.rules) {
          if (rule.constraints?.matches === 'email') {
            lines.push(`    payload["${rule.name}"] = _uniqueEmail();`);
          } else if (rule.fieldType === 'text' && rule.constraints?.required) {
            lines.push(`    payload["${rule.name}"] = _uniqueText("${rule.name}");`);
          }
        }
        lines.push(`    const r = await fetch(BASE + "${ep.path}", {`);
        lines.push(`      method: "POST", headers: ${maHeaders},`);
        lines.push(`      body: JSON.stringify(payload)`);
        lines.push(`    });`);
        lines.push(`    assert(r.status === ${maExpected}, "Expected ${maExpected}, got " + r.status);`);
        lines.push(`    const data = await r.json();`);
        lines.push(`    assert(data.admin === undefined, "admin field should have been stripped");`);
        lines.push(`    assert(data.role === undefined, "role field should have been stripped");`);
        lines.push(`  });`);
        lines.push('');
        break; // One mass-assignment test is enough
      }
    }
  }

  // Test GET returns data after POST (integration)
  // Find a GET endpoint that matches a POST endpoint's resource (e.g., GET /api/todos after POST /api/todos)
  const postPaths = endpoints.filter(e => e.method === 'POST' && e.hasValidation && e.returns201).map(e => e.path);
  const matchingGet = endpoints.find(e => e.method === 'GET' && !e.path.includes(':') && postPaths.includes(e.path));
  if (matchingGet) {
    const fetchOpts = matchingGet.hasAuth ? ', { headers: AUTH_HEADERS }' : '';
    lines.push(`  await test("${capitalize(resourcePlural(matchingGet.path))} appear in the list after being created", async () => {`);
    lines.push(`    const r = await fetch(BASE + "${matchingGet.path}"${fetchOpts});`);
    lines.push(`    const data = await r.json();`);
    lines.push(`    assert(Array.isArray(data), "Expected array");`);
    lines.push(`    assert(data.length > 0, "Expected at least one record (from earlier POST test)");`);
    lines.push(`  });`);
    lines.push('');
  }

  // Test HTML serves — only for apps that compile to HTML (web or full-stack targets)
  const targetNode = body.find(n => n.type === NodeType.TARGET);
  const targetVal = targetNode?.value || '';
  const hasWebTarget = targetVal.includes('web') || targetVal.includes('both');
  const hasPages = hasWebTarget && body.some(n => n.type === NodeType.PAGE);
  if (hasPages) {
    lines.push(`  await test("The app loads in the browser", async () => {`);
    lines.push(`    const r = await fetch(BASE + "/");`);
    lines.push(`    assert(r.status === 200, "Expected 200, got " + r.status);`);
    lines.push(`    const html = await r.text();`);
    lines.push(`    assert(html.includes("<!DOCTYPE html>"), "Expected HTML document");`);
    lines.push(`  });`);
    lines.push('');
  }

  // === CRUD FLOW TESTS (happy-path user journeys) ===
  // For each resource with POST + GET endpoints, test the full create-then-view flow.
  // For resources with POST + GET + DELETE, also test create-then-delete.
  for (const postEp of endpoints) {
    if (postEp.method !== 'POST' || !postEp.hasValidation) continue;
    const res = resourcePlural(postEp.path);
    const rn = resourceName(postEp.path);
    const getEp = endpoints.find(e => e.method === 'GET' && e.path === postEp.path && !e.path.includes(':'));
    const deleteEp = endpoints.find(e => e.method === 'DELETE' && e.path.startsWith(postEp.path.replace(/\/$/, '') + '/:'));

    if (getEp) {
      const postHeaders = postEp.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
      const getOpts = getEp.hasAuth ? ', { headers: AUTH_HEADERS }' : '';
      const expectedStatus = postEp.returns201 ? 201 : 200;

      // Name the test honestly. Every flow test is explicitly labeled
      // "Endpoint:" (API contract only) or "UI:" (user clicks a real button).
      // If no UI button POSTs to this endpoint, emit the Endpoint version only
      // AND record a warning so the compiler can surface "your POST /api/foo
      // has no UI — users can't reach it."
      const hasUI = uiPostUrls.has(postEp.path);
      const testLabel = hasUI
        ? `UI: user can create ${article(rn)} ${rn} via the form and see it in the list`
        : `Endpoint: POSTing to ${postEp.path} then GETting ${getEp.path} returns the new ${rn} (no UI button wired — see compiler warning)`;
      lines.push(`  // --- Happy-path flow: create and view ${rn}${hasUI ? ' (UI-wired)' : ' (API-only)'} ---`);
      lines.push(`  await test(${JSON.stringify(testLabel)}, async () => {`);
      // Build payload
      lines.push(`    const payload = ${JSON.stringify(buildPayload(postEp))};`);
      const deps = depMap[postEp.path] || [];
      for (const dep of deps) {
        lines.push(`    payload["${dep.field}"] = createdIds["${dep.parentTable}"];`);
      }
      for (const rule of postEp.rules) {
        if (deps.some(d => d.field === rule.name)) continue;
        if (rule.constraints?.matches === 'email') {
          lines.push(`    payload["${rule.name}"] = _uniqueEmail();`);
        } else if (rule.fieldType === 'text' && rule.constraints?.required) {
          lines.push(`    payload["${rule.name}"] = _uniqueText("flow_${rule.name}");`);
        }
      }
      lines.push(`    // Create`);
      lines.push(`    const createResp = await fetch(BASE + "${postEp.path}", {`);
      lines.push(`      method: "POST", headers: ${postHeaders},`);
      lines.push(`      body: JSON.stringify(payload)`);
      lines.push(`    });`);
      lines.push(`    assert(createResp.status === ${expectedStatus}, "Create failed: " + createResp.status);`);
      lines.push(`    const created = await createResp.json();`);
      lines.push(`    // View all and check it's there`);
      lines.push(`    const listResp = await fetch(BASE + "${getEp.path}"${getOpts});`);
      lines.push(`    const list = await listResp.json();`);
      lines.push(`    assert(Array.isArray(list), "Expected array of ${res}");`);
      lines.push(`    assert(list.some(item => item.id === created.id), "Created ${rn} should appear in the list");`);
      lines.push(`  });`);
      lines.push('');

      // Create-then-delete flow (if DELETE endpoint exists)
      if (deleteEp && deleteEp.hasAuth) {
        const delLabel = hasUI
          ? `UI: user can create ${article(rn)} ${rn} then delete it`
          : `Endpoint: creating then deleting ${article(rn)} ${rn} via the API removes it from the list (no UI button wired)`;
        lines.push(`  await test(${JSON.stringify(delLabel)}, async () => {`);
        lines.push(`    const payload = ${JSON.stringify(buildPayload(postEp))};`);
        for (const dep of deps) {
          lines.push(`    payload["${dep.field}"] = createdIds["${dep.parentTable}"];`);
        }
        for (const rule of postEp.rules) {
          if (deps.some(d => d.field === rule.name)) continue;
          if (rule.constraints?.matches === 'email') {
            lines.push(`    payload["${rule.name}"] = _uniqueEmail();`);
          } else if (rule.fieldType === 'text' && rule.constraints?.required) {
            lines.push(`    payload["${rule.name}"] = _uniqueText("del_${rule.name}");`);
          }
        }
        lines.push(`    // Create`);
        lines.push(`    const createResp = await fetch(BASE + "${postEp.path}", {`);
        lines.push(`      method: "POST", headers: ${postHeaders},`);
        lines.push(`      body: JSON.stringify(payload)`);
        lines.push(`    });`);
        lines.push(`    const created = await createResp.json();`);
        lines.push(`    assert(created.id, "Should have an id");`);
        lines.push(`    // Delete`);
        const deletePath = deleteEp.path.replace(/:(\w+)/g, '" + created.id + "');
        lines.push(`    const delResp = await fetch(BASE + "${deletePath}", { method: "DELETE", headers: AUTH_HEADERS });`);
        lines.push(`    assert(delResp.status === 200, "Delete failed: " + delResp.status);`);
        lines.push(`    // Verify it's gone`);
        lines.push(`    const listResp = await fetch(BASE + "${getEp.path}"${getOpts});`);
        lines.push(`    const list = await listResp.json();`);
        lines.push(`    assert(!list.some(item => item.id === created.id), "Deleted ${rn} should not appear in the list");`);
        lines.push(`  });`);
        lines.push('');
      }
    }
  }

  // === AUTO-GENERATED FRONTEND ELEMENT TESTS ===
  // Only for apps that compile to HTML (web or full-stack targets)
  const pages = hasWebTarget ? body.filter(n => n.type === NodeType.PAGE) : [];
  if (pages.length > 0) {
    lines.push('  // --- Frontend Element Tests (auto-generated) ---');
    lines.push('');

    // Collect all interactive elements from all pages
    function collectElements(nodes, pageName) {
      const elements = { links: [], buttons: [], inputs: [], displays: [] };
      for (const n of nodes) {
        if (n.type === NodeType.CONTENT && n.contentType === 'link' && n.href) {
          elements.links.push({ text: n.text, href: n.href, page: pageName });
        }
        if (n.type === NodeType.BUTTON) {
          elements.buttons.push({ text: n.text || n.label, page: pageName });
        }
        if (n.type === NodeType.ASK_FOR || (n.ui && n.ui.inputType)) {
          elements.inputs.push({ label: n.ui?.label || n.variable || 'input', page: pageName });
        }
        if (n.type === NodeType.DISPLAY) {
          elements.displays.push({ name: n.variable || n.text || 'display', page: pageName });
        }
        // Recurse into sections, pages, etc.
        if (n.body) collectElements(n.body, pageName);
      }
      return elements;
    }

    const allElements = { links: [], buttons: [], inputs: [], displays: [] };
    for (const page of pages) {
      const pageName = page.title || page.name || 'page';
      const els = collectElements(page.body || [], pageName);
      allElements.links.push(...els.links);
      allElements.buttons.push(...els.buttons);
      allElements.inputs.push(...els.inputs);
      allElements.displays.push(...els.displays);
    }

    // Test: each page renders (route exists and returns HTML content)
    for (const page of pages) {
      const route = page.route || '/';
      lines.push(`  await test("The ${page.title || page.name} page renders", async () => {`);
      lines.push(`    const r = await fetch(BASE + "/");`);
      lines.push(`    const html = await r.text();`);
      lines.push(`    assert(html.includes("${page.title || page.name}"), "Page should contain title '${page.title || page.name}'");`);
      lines.push(`  });`);
      lines.push('');
    }

    // Test: each link has a valid href (not just "#")
    for (const link of allElements.links) {
      lines.push(`  await test("The ${link.text} link goes to the right page", async () => {`);
      lines.push(`    const r = await fetch(BASE + "/");`);
      lines.push(`    const html = await r.text();`);
      lines.push(`    assert(html.includes('href="#${link.href}"') || html.includes('href="${link.href}"'), "Link '${link.text}' should have href to '${link.href}', not '#'");`);
      lines.push(`  });`);
      lines.push('');
    }

    // Test: each button exists in the HTML
    for (const btn of allElements.buttons) {
      lines.push(`  await test("The ${btn.text} button is on the page", async () => {`);
      lines.push(`    const r = await fetch(BASE + "/");`);
      lines.push(`    const html = await r.text();`);
      lines.push(`    assert(html.includes("${btn.text}"), "Button '${btn.text}' should exist in HTML");`);
      lines.push(`  });`);
      lines.push('');
    }

    // Test: each display element is present (not showing "OUTPUT" placeholder)
    for (const disp of allElements.displays) {
      lines.push(`  await test("The ${disp.name} section is visible on the page", async () => {`);
      lines.push(`    const r = await fetch(BASE + "/");`);
      lines.push(`    const html = await r.text();`);
      lines.push(`    assert(html.includes("${disp.name}") || html.includes("output_"), "Display element for '${disp.name}' should exist");`);
      lines.push(`  });`);
      lines.push('');
    }
  }

  // === AUTO-GENERATED AGENT TESTS ===
  // For each agent: endpoint responds, guardrails block bad input,
  // structured output has expected fields, auth required if configured.
  const agents = body.filter(n => n.type === NodeType.AGENT);
  const pipelines = body.filter(n => n.type === NodeType.PIPELINE);

  if (agents.length > 0) {
    lines.push('  // --- Agent Tests (auto-generated) ---');
    lines.push('');
    for (const agent of agents) {
      const agentName = agent.name;

      // Find the endpoint that calls this agent
      const callingEp = endpoints.find(ep => {
        return ep.method === 'POST' && (ep.body || []).some(n =>
          n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT &&
          n.expression.agentName === agentName
        );
      });

      if (!callingEp) continue;
      const epHeaders = callingEp.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';

      // Test 1: Agent responds to a message.
      // The endpoint unpacks whatever field the .clear source declared — e.g.
      // `when user sends request to /api/research: call 'Research Topic'
      // with request's topic` expects `{ topic: ... }`, not `{ message: ... }`.
      // Use the agent's declared receiving variable name so the probe body
      // matches the endpoint's expected shape. Falls back to "message" for
      // agents with no receivingVar.
      const recvVar = agent.receivingVar || 'message';
      const probeVal = JSON.stringify('Hello, what can you help me with?');
      const probeBody = `JSON.stringify({ ${JSON.stringify(recvVar)}: ${probeVal} })`;
      lines.push(`  await test("The ${agentName} agent responds to messages", async () => {`);
      lines.push(`    const r = await fetch(BASE + "${callingEp.path}", {`);
      lines.push(`      method: "POST", headers: ${epHeaders},`);
      lines.push(`      body: ${probeBody}`);
      lines.push(`    });`);
      lines.push(`    assert(r.status >= 200 && r.status < 300, "Agent should respond, got " + r.status);`);
      lines.push(`  });`);
      lines.push('');

      // Test 2: Agent requires login (if auth-protected)
      if (callingEp.hasAuth) {
        lines.push(`  await test("The ${agentName} agent requires login", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${callingEp.path}", {`);
        lines.push(`      method: "POST", headers: { "Content-Type": "application/json" },`);
        lines.push(`      body: JSON.stringify({ ${JSON.stringify(recvVar)}: "test" })`);
        lines.push(`    });`);
        lines.push(`    assert(r.status === 401, "Agent should require login, got " + r.status);`);
        lines.push(`  });`);
        lines.push('');
      }

      // Test 3: Guardrails block dangerous input
      if (agent.argumentGuardrails && agent.argumentGuardrails.length > 0) {
        for (const pattern of agent.argumentGuardrails) {
          // Generate a test input that should be blocked
          const blockedInput = pattern.replace(/[|\\\\()]/g, ' ').split(' ').filter(Boolean)[0] || 'drop';
          lines.push(`  await test("The ${agentName} agent blocks '${blockedInput}' in tool arguments", async () => {`);
          lines.push(`    const r = await fetch(BASE + "${callingEp.path}", {`);
          lines.push(`      method: "POST", headers: ${epHeaders},`);
          lines.push(`      body: JSON.stringify({ message: "Please run: ${blockedInput} table users" })`);
          lines.push(`    });`);
          lines.push(`    const body = await r.json().catch(() => ({}));`);
          lines.push(`    // Agent should either reject or respond safely (not crash)`);
          lines.push(`    assert(r.status >= 200 && r.status < 500, "Agent should handle blocked input gracefully, got " + r.status);`);
          lines.push(`  });`);
          lines.push('');
        }
      }

      // Test 4: Structured output has expected fields (if schema defined)
      const askAiNodes = [];
      (function findSchema(nodes) {
        for (const n of nodes) {
          if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI && n.expression.schema?.length > 0) {
            askAiNodes.push(n.expression.schema);
          }
          if (n.body) findSchema(n.body);
        }
      })(agent.body);

      if (askAiNodes.length > 0) {
        const schema = askAiNodes[0];
        const fieldNames = schema.map(f => f.name).join(', ');
        lines.push(`  // Agent '${agentName}' expects structured output with fields: ${fieldNames}`);
        lines.push(`  // (Schema validation happens at compile time — see generateAgentEvals for runtime checks)`);
        lines.push('');
      }

      // Test 5: Agent policy restrictions are documented
      if (agent.restrictions && agent.restrictions.length > 0) {
        lines.push(`  // Agent '${agentName}' guardrails: ${agent.restrictions.map(r => r.text).join('; ')}`);
        lines.push('');
      }
    }
  }

  if (pipelines.length > 0) {
    lines.push('  // --- Pipeline Tests (auto-generated) ---');
    lines.push('');
    for (const pipeline of pipelines) {
      const steps = pipeline.steps.map(s => s.agentName).join(' → ');
      lines.push(`  // Pipeline '${pipeline.name}': ${steps}`);

      // Find an endpoint that calls this pipeline
      const callingEp = endpoints.find(ep => {
        return ep.method === 'POST' && (ep.body || []).some(n =>
          n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_PIPELINE &&
          n.expression.pipelineName === pipeline.name
        );
      });

      if (callingEp) {
        const epHeaders = callingEp.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        lines.push(`  await test("The ${pipeline.name} pipeline processes requests", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${callingEp.path}", {`);
        lines.push(`      method: "POST", headers: ${epHeaders},`);
        lines.push(`      body: JSON.stringify({ candidate_id: 1 })`);
        lines.push(`    });`);
        lines.push(`    assert(r.status === 200 || r.status === 201, "Expected success, got " + r.status);`);
        lines.push(`  });`);
        lines.push('');
      }
    }
  }

  // === USER-WRITTEN TEST BLOCKS ===
  // Collect TEST_DEF nodes from the AST and compile them into the test harness
  const testDefs = body.filter(n => n.type === NodeType.TEST_DEF);
  const qualityWarnings = []; // mechanical quality signals — internal only, not shown to user
  if (testDefs.length > 0) {
    lines.push('  // --- User-Written Tests (from test blocks in .clear source) ---');
    lines.push('  const _baseUrl = BASE;');
    lines.push('  // _response / _responseBody are globals (declared at top) so helpers can see them');
    lines.push('');

    const testCtx = {
      lang: 'js', indent: 2, declared: new Set(), stateVars: null,
      mode: 'backend', sourceMap: new Map(), schemaNames: new Set(),
      _astBody: body
    };

    for (const td of testDefs) {
      const bodyNodes = td.body.filter(n => n.type !== NodeType.MOCK_AI);

      // --- Mechanical test quality signals (training signal, not shown to user) ---
      const unitAsserts = bodyNodes.filter(n => n.type === NodeType.UNIT_ASSERT);
      for (const ua of unitAsserts) {
        if (ua.check === 'not_empty') {
          qualityWarnings.push({ line: ua.line || td.line || 0, severity: 'quality', code: 'weak_assertion',
            message: `Weak assertion: 'expect ${ua.rawLeft} is not empty' only checks existence, not the actual value. Assert the specific value instead.` });
        } else if (ua.check === 'eq' && ua.right?.type === 'literal_boolean' && ua.right?.value === true) {
          qualityWarnings.push({ line: ua.line || td.line || 0, severity: 'quality', code: 'weak_assertion',
            message: `Weak assertion: 'expect ${ua.rawLeft} is true' is a bare boolean check. Assert the specific value or behavior instead.` });
        }
      }
      if (unitAsserts.length === 1) {
        qualityWarnings.push({ line: td.line || 0, severity: 'quality', code: 'single_assertion',
          message: `Single assertion in test '${td.name}'. Consider adding a second assertion to verify a related behavior.` });
      }

      const bodyLines = bodyNodes.map(n => compileNode(n, { ...testCtx, indent: 2 })).filter(Boolean);
      lines.push(`  await test(${JSON.stringify(td.name)}, async () => {`);
      for (const bl of bodyLines) {
        // Each compiled line may be multi-line; indent each line inside the test
        for (const subLine of bl.split('\n')) {
          lines.push('  ' + subLine);
        }
      }
      lines.push('  });');
      lines.push('');
    }
  }

  lines.push('  console.log("");');
  lines.push('  console.log("Results:", passed, "passed,", failed, "failed");');
  lines.push('  process.exit(failed > 0 ? 1 : 0);');
  lines.push('}');
  lines.push('');

  // Shim expect/toBe/toHaveProperty for user-written test blocks
  const hasUnitAsserts = testDefs.some(td => (td.body || []).some(n => n.type === NodeType.UNIT_ASSERT));
  if (testDefs.length > 0) {
    lines.push('// Expect shim for user-written test assertions');
    lines.push('function expect(val) {');
    lines.push('  return {');
    lines.push('    toBe(expected) { if (val !== expected) throw new Error("Expected " + expected + ", got " + val); },');
    lines.push('    toBeTruthy() { if (!val) throw new Error("Expected truthy, got " + val); },');
    lines.push('    toHaveProperty(key) { if (!(key in (val || {}))) throw new Error("Expected property " + key); },');
    lines.push('    toBeGreaterThan(n) { if (!(val > n)) throw new Error("Expected > " + n + ", got " + val); }');
    lines.push('  };');
    lines.push('}');
    lines.push('');
    // Friendly status assertion. Philosophy: no HTTP jargon — a 14-year-old reading
    // the test failure should understand exactly what went wrong and how to fix it.
    // Every message explains the code in plain English and suggests a concrete fix.
    lines.push('function _expectStatus(response, expected) {');
    lines.push('  const actual = response.status;');
    lines.push('  if (actual === expected) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the request";');
    lines.push('  const bodyHint = _responseBody && _responseBody.error ? " Server said: \\"" + String(_responseBody.error).slice(0, 120) + "\\"." : "";');
    lines.push('  // Translate each status code into plain English. The hint names the problem');
    lines.push('  // AND points at the Clear code that needs to change.');
    lines.push('  let why = "";');
    lines.push('  if (actual === 404) {');
    lines.push('    why = "404 means \\"there is no endpoint at that URL.\\" Either the path in your test is wrong, or you forgot to write `when user calls " + _lastCall.method + " " + _lastCall.path + ":` in your Clear file.";');
    lines.push('  } else if (actual === 401) {');
    lines.push('    why = "401 means \\"you have to be logged in to do this.\\" The endpoint has `requires login` but the test didn\'t send an auth token.";');
    lines.push('  } else if (actual === 403) {');
    lines.push('    why = "403 means \\"you\'re logged in but not allowed to do this.\\" The endpoint has `requires role \'admin\'` (or similar) and the test user doesn\'t have that role.";');
    lines.push('  } else if (actual === 400) {');
    lines.push('    why = "400 means \\"the server didn\'t like the data you sent.\\" Usually a `validate` rule rejected it — a required field is missing, empty, or the wrong type.";');
    lines.push('  } else if (actual === 409) {');
    lines.push('    why = "409 means \\"something already exists with that value.\\" A field marked `unique` (like email) already has a record with that value — use a different value or delete the old record first.";');
    lines.push('  } else if (actual === 422) {');
    lines.push('    why = "422 means \\"the data was the right shape but failed a rule.\\" A `validate` block rejected it (wrong format, out of range, etc).";');
    lines.push('  } else if (actual === 429) {');
    lines.push('    why = "429 means \\"too many requests.\\" A `rate limit` rule is throttling the test. Wait, or raise the limit in your Clear code.";');
    lines.push('  } else if (actual >= 500 && actual < 600) {');
    lines.push('    why = "5xx means \\"the server crashed trying to handle this.\\" Check the app logs for a stack trace — usually an unhandled error in the endpoint body.";');
    lines.push('  } else if (expected === 201 && actual === 200) {');
    lines.push('    why = "200 means \\"success\\" and 201 means \\"success, and I created a new record.\\" Your endpoint returned success but not the \'created\' flavor. Add `with status 201` to the `send back` line after a save.";');
    lines.push('  } else if (expected === 200 && actual === 201) {');
    lines.push('    why = "201 means \\"created\\" and 200 means \\"success.\\" The test expected a plain success but got a created — change the test to expect 201, or change the endpoint to `send back X` without `with status 201`.";');
    lines.push('  } else if (expected === 204 && actual === 200) {');
    lines.push('    why = "204 means \\"done, nothing to send back\\" (used for deletes). The endpoint returned 200 with a body. Either change the test to 200, or drop the value from `send back` and add `with status 204`.";');
    lines.push('  } else if (actual === 200 && expected === 200) {');
    lines.push('    why = "This shouldn\'t happen — statuses match.";');
    lines.push('  } else if (actual === 201 && expected === 201) {');
    lines.push('    why = "This shouldn\'t happen — statuses match.";');
    lines.push('  } else if (actual >= 200 && actual < 300 && expected >= 400) {');
    lines.push('    why = "The test expected this to fail, but the server accepted it with " + actual + " (success). Either the validation rule you want is missing, or the test data is actually valid.";');
    lines.push('  } else {');
    lines.push('    why = "The server returned " + actual + " but the test expected " + expected + ". Statuses in the 2xx range mean success, 4xx means the request had a problem, 5xx means the server had a problem.";');
    lines.push('  }');
    lines.push('  throw new Error(call + " returned " + actual + " (expected " + expected + "). " + why + bodyHint + where);');
    lines.push('}');
    lines.push('');
    // Friendly has-property assertion: when a response body should have a field
    lines.push('function _expectBodyHas(body, key) {');
    lines.push('  if (body && typeof body === "object" && key in body) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the endpoint";');
    lines.push('  const got = body === null || body === undefined ? "nothing" : "{ " + Object.keys(body).slice(0, 5).join(", ") + " }";');
    lines.push('  throw new Error(call + " didn\'t return a \\"" + key + "\\" field — got " + got + ". Your endpoint\'s `send back` line needs to include \\"" + key + "\\"." + where);');
    lines.push('}');
    lines.push('');
    // Friendly success/failure + body-contains/length helpers
    lines.push('function _expectSuccess(response) {');
    lines.push('  if (response.status >= 200 && response.status < 300) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the request";');
    lines.push('  throw new Error(call + " returned " + response.status + " but the test expected any 2xx success." + where);');
    lines.push('}');
    lines.push('');
    lines.push('function _expectFailure(response) {');
    lines.push('  if (response.status >= 400) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the request";');
    lines.push('  throw new Error(call + " returned " + response.status + " (success) but the test expected it to fail with a 4xx or 5xx. Add a `validate` or `requires login` rule to the endpoint, or change the test data so the validation actually rejects it." + where);');
    lines.push('}');
    lines.push('');
    lines.push('function _expectBodyContains(body, value) {');
    lines.push('  const as = JSON.stringify(body);');
    lines.push('  if (as && as.includes(value)) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the endpoint";');
    lines.push('  throw new Error(call + " response didn\'t contain \\"" + value + "\\". Got: " + (as || "nothing") + "." + where);');
    lines.push('}');
    lines.push('');
    lines.push('function _expectBodyLength(body, min) {');
    lines.push('  const len = Array.isArray(body) ? body.length : (body && typeof body === "object" ? Object.keys(body).length : 0);');
    lines.push('  if (len > min) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the endpoint";');
    lines.push('  throw new Error(call + " returned " + len + " item(s) but the test expected more than " + min + ". Either the endpoint isn\'t reading from the table you think, or the test data hasn\'t been created yet." + where);');
    lines.push('}');
    lines.push('');
    lines.push('function _expectBodyTruthy(body) {');
    lines.push('  if (body) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  const call = _lastCall && _lastCall.method ? _lastCall.method + " " + _lastCall.path : "the endpoint";');
    lines.push('  throw new Error(call + " returned an empty body. Your endpoint should `send back` something." + where);');
    lines.push('}');
    lines.push('');
    lines.push('function _expectErrorContains(body, value) {');
    lines.push('  const as = JSON.stringify(body);');
    lines.push('  if (as && as.includes(value)) return;');
    lines.push('  const where = _lastCall && _lastCall.line ? " [clear:" + _lastCall.line + "]" : "";');
    lines.push('  throw new Error("Error response didn\'t mention \\"" + value + "\\". Got: " + (as || "nothing") + ". Check the `fail with error \'...\'` or `validate` message in your endpoint." + where);');
    lines.push('}');
    lines.push('');
  }
  if (hasUnitAsserts) {
    lines.push('// Unit-level value assertion — used by "expect x is 5", "expect x is greater than N", etc.');
    lines.push('// check: eq | ne | gt | lt | gte | lte | empty | not_empty');
    lines.push('function _unitAssert(actual, check, expected, line, expr) {');
    lines.push('  const where = line ? " [clear:" + line + "]" : "";');
    lines.push('  let ok = false;');
    lines.push('  if (check === "eq")        ok = actual == expected;');
    lines.push('  if (check === "ne")        ok = actual != expected;');
    lines.push('  if (check === "gt")        ok = actual > expected;');
    lines.push('  if (check === "lt")        ok = actual < expected;');
    lines.push('  if (check === "gte")       ok = actual >= expected;');
    lines.push('  if (check === "lte")       ok = actual <= expected;');
    lines.push('  if (check === "empty")     ok = actual === null || actual === undefined || actual === "" || (Array.isArray(actual) && actual.length === 0);');
    lines.push('  if (check === "not_empty") ok = actual !== null && actual !== undefined && actual !== "" && (!Array.isArray(actual) || actual.length > 0);');
    lines.push('  if (ok) return;');
    lines.push('  const got = actual === null || actual === undefined ? "nothing" : JSON.stringify(actual);');
    lines.push('  const want = { eq: "to equal", ne: "to not equal", gt: "to be greater than", lt: "to be less than", gte: "to be at least", lte: "to be at most", empty: "to be empty", not_empty: "to not be empty" };');
    lines.push('  const suffix = (check === "empty" || check === "not_empty") ? "" : " " + JSON.stringify(expected);');
    lines.push('  throw new Error("`" + expr + "` was expected " + (want[check] || check) + suffix + ", but got " + got + " instead." + where);');
    lines.push('}');
    lines.push('');
  }

  lines.push('run();');

  // === UI-REACHABILITY WARNINGS ===
  // For every POST endpoint with validation, check that some UI button actually
  // wires to it. If not, tell the author: the test labeled "Endpoint: ..." is
  // green, but a real user has no way to trigger this endpoint.
  const warnings = [];
  for (const ep of endpoints) {
    if (ep.method !== 'POST' || !ep.hasValidation) continue;
    // Skip auth-scaffold endpoints (/auth/login etc.) — those are built-in
    if (ep.path.startsWith('/auth/') || ep.path === '/api/seed') continue;
    if (uiPostUrls.has(ep.path)) continue;
    // Only warn if the app HAS a frontend — pure backends don't need UI wiring.
    const hasWebTarget = body.some(n => n.type === NodeType.TARGET && /web|both/.test(n.value || ''));
    if (!hasWebTarget) continue;
    warnings.push({
      line: ep.line || 1,
      severity: 'warning',
      message: `POST ${ep.path} has no UI button that triggers it. Users can't reach this endpoint from the app. Add a button with \`send <fields> as a new <resource> to '${ep.path}'\` inside a page, or remove the endpoint.`
    });
  }

  return { script: lines.join('\n'), warnings: [...warnings, ...qualityWarnings] };
}

/**
 * Generate agent evals — two types:
 *
 * 1. SCHEMA EVALS (deterministic, no AI needed):
 *    Call agent with mocked AI, verify output matches returning: schema.
 *    Tests field presence, types, required fields.
 *
 * 2. LLM-GRADED EVALS (requires AI, grades real agent output):
 *    Call agent with REAL AI (no mock), then send output to a grader LLM
 *    that scores against a rubric. Compiled to a runnable JS eval harness.
 *
 * Returns: { schema: "Clear test blocks", graded: "JS eval harness" }
 */
function generateAgentEvals(body) {
  const agents = body.filter(n => n.type === NodeType.AGENT && !n.schedule);
  const pipelines = body.filter(n => n.type === NodeType.PIPELINE);
  if (agents.length === 0 && pipelines.length === 0) return null;

  // === PART 1: Schema evals (Clear-native test blocks with mocks) ===
  const schemaLines = [];
  schemaLines.push('# === SCHEMA EVALS (auto-generated) ===');
  schemaLines.push('# Deterministic tests — mocked AI, verify output shape.');
  schemaLines.push('# Append to your .clear file and run: clear test app.clear');
  schemaLines.push('');

  for (const agent of agents) {
    const askAiNodes = [];
    function findAskAi(nodes) {
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI) {
          askAiNodes.push({ varName: n.name, schema: n.expression.schema || null });
        }
        if (n.body) findAskAi(n.body);
        if (n.thenBranch) findAskAi(n.thenBranch);
        if (n.otherwiseBranch) findAskAi(n.otherwiseBranch);
      }
    }
    findAskAi(agent.body);

    const hasSchema = askAiNodes.length > 0 && askAiNodes[0].schema && askAiNodes[0].schema.length > 0;
    const schema = hasSchema ? askAiNodes[0].schema : null;

    // Build mock fields from schema
    const mockFields = [];
    if (schema) {
      for (const field of schema) {
        if (field.type === 'number') mockFields.push(`    ${field.name} = 7`);
        else if (field.type === 'boolean') mockFields.push(`    ${field.name} is true`);
        else mockFields.push(`    ${field.name} is 'test_${field.name}'`);
      }
    } else {
      mockFields.push(`    response is 'Test response'`);
    }

    // Schema shape test
    schemaLines.push(`test '${agent.name} — output matches schema':`);
    schemaLines.push(`  mock claude responding:`);
    for (const f of mockFields) schemaLines.push(f);
    schemaLines.push(`  result = call '${agent.name}' with 'schema eval input'`);
    schemaLines.push(`  expect result is not nothing`);
    if (schema) {
      for (const field of schema) {
        if (field.type === 'number') {
          schemaLines.push(`  expect result's ${field.name} is 7`);
        } else if (field.type === 'boolean') {
          schemaLines.push(`  expect result's ${field.name} is true`);
        } else {
          schemaLines.push(`  expect result's ${field.name} is not nothing`);
        }
      }
    }
    schemaLines.push('');
  }

  // Pipeline schema evals
  for (const pipeline of pipelines) {
    schemaLines.push(`test '${pipeline.name} — pipeline completes all ${pipeline.steps.length} steps':`);
    for (const step of pipeline.steps) {
      schemaLines.push(`  mock claude responding:`);
      schemaLines.push(`    output is 'step ${step.agentName} done'`);
    }
    schemaLines.push(`  result = call pipeline '${pipeline.name}' with 'pipeline eval input'`);
    schemaLines.push(`  expect result is not nothing`);
    schemaLines.push('');
  }

  // === PART 2: LLM-graded evals (JS harness, real AI, scorecard) ===
  const gradedLines = [];
  gradedLines.push('#!/usr/bin/env node');
  gradedLines.push('// === LLM-GRADED AGENT EVALS (auto-generated) ===');
  gradedLines.push('// Calls agents with REAL AI, then grades output against a scorecard.');
  gradedLines.push('// Run: ANTHROPIC_API_KEY=sk-... node eval.js');
  gradedLines.push('// Requires: server running on localhost:3000');
  gradedLines.push('');
  gradedLines.push('const BASE = process.env.TEST_URL || "http://localhost:3000";');
  gradedLines.push('const EVAL_MODEL = process.env.EVAL_MODEL || "claude-sonnet-4-20250514";');
  gradedLines.push('');
  gradedLines.push('async function grade(agentName, input, output, rubric) {');
  gradedLines.push('  const key = process.env.ANTHROPIC_API_KEY;');
  gradedLines.push('  if (!key) { console.log("SKIP:", agentName, "— set ANTHROPIC_API_KEY"); return null; }');
  gradedLines.push('  const prompt = `Grade this agent output on a scale of 1-10 for each criterion.\\n\\nAgent: ${agentName}\\nInput: ${JSON.stringify(input)}\\nOutput: ${JSON.stringify(output)}\\n\\nRubric:\\n${rubric}\\n\\nRespond with ONLY a JSON object: { "scores": { "criterion": score }, "overall": number, "pass": boolean, "feedback": "string" }`;');
  gradedLines.push('  const r = await fetch("https://api.anthropic.com/v1/messages", {');
  gradedLines.push('    method: "POST",');
  gradedLines.push('    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },');
  gradedLines.push('    body: JSON.stringify({ model: EVAL_MODEL, max_tokens: 512, messages: [{ role: "user", content: prompt }] })');
  gradedLines.push('  });');
  gradedLines.push('  const data = await r.json();');
  gradedLines.push('  try { return JSON.parse(data.content[0].text.match(/\\{[\\s\\S]*\\}/)[0]); }');
  gradedLines.push('  catch { return { overall: 0, pass: false, feedback: "Failed to parse grader response" }; }');
  gradedLines.push('}');
  gradedLines.push('');
  gradedLines.push('async function schemaCheck(name, output, schema) {');
  gradedLines.push('  const missing = schema.filter(f => output[f.name] === undefined);');
  gradedLines.push('  const wrongType = schema.filter(f => {');
  gradedLines.push('    if (output[f.name] === undefined) return false;');
  gradedLines.push('    if (f.type === "number" && typeof output[f.name] !== "number") return true;');
  gradedLines.push('    if (f.type === "boolean" && typeof output[f.name] !== "boolean") return true;');
  gradedLines.push('    return false;');
  gradedLines.push('  });');
  gradedLines.push('  return { name, pass: missing.length === 0 && wrongType.length === 0, missing: missing.map(f => f.name), wrongType: wrongType.map(f => f.name) };');
  gradedLines.push('}');
  gradedLines.push('');
  gradedLines.push('async function run() {');
  gradedLines.push('  const results = [];');
  gradedLines.push('');

  for (const agent of agents) {
    const agentName = agent.name;
    // Find the endpoint that calls this agent
    const callingEp = body.filter(n => n.type === NodeType.ENDPOINT && n.method === 'POST').find(ep => {
      return (ep.body || []).some(n =>
        n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT &&
        n.expression.agentName === agentName
      );
    });

    if (!callingEp) continue;
    const path = callingEp.path;

    // Build rubric from agent context
    const rubricParts = [];
    if (agent.tools && agent.tools.length > 0) {
      rubricParts.push(`Tool use: Agent should use available tools (${agent.tools.map(t => t.name || t.description).join(', ')}) when appropriate`);
    }
    if (agent.restrictions && agent.restrictions.length > 0) {
      rubricParts.push(`Safety: Agent must respect guardrails: ${agent.restrictions.map(r => r.text).join(', ')}`);
    }
    rubricParts.push('Relevance: Response directly addresses the input');
    rubricParts.push('Tone: Response is professional and helpful');
    rubricParts.push('Completeness: Response covers all aspects of the question');
    const rubric = rubricParts.map((r, i) => `${i + 1}. ${r}`).join('\\n');

    // Schema check
    const askAiNodes = [];
    function findAskAi2(nodes) {
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI && n.expression.schema?.length > 0) {
          askAiNodes.push(n.expression.schema);
        }
        if (n.body) findAskAi2(n.body);
        if (n.thenBranch) findAskAi2(n.thenBranch);
        if (n.otherwiseBranch) findAskAi2(n.otherwiseBranch);
      }
    }
    findAskAi2(agent.body);
    const schemaJson = askAiNodes.length > 0 ? JSON.stringify(askAiNodes[0]) : 'null';

    // Test cases for this agent
    const testInputs = [
      `What can you help me with?`,
      `I have a problem with my order`,
    ];

    gradedLines.push(`  // --- ${agentName} ---`);
    for (const input of testInputs) {
      gradedLines.push(`  {`);
      gradedLines.push(`    const r = await fetch(BASE + "${path}", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: ${JSON.stringify(input)} }) });`);
      gradedLines.push(`    const output = await r.json();`);
      if (schemaJson !== 'null') {
        gradedLines.push(`    const schema = ${schemaJson};`);
        gradedLines.push(`    results.push(await schemaCheck("${agentName} schema", output, schema));`);
      }
      gradedLines.push(`    const gradeResult = await grade("${agentName}", ${JSON.stringify(input)}, output, "${rubric}");`);
      gradedLines.push(`    if (gradeResult) results.push({ name: "${agentName}: ${input.substring(0, 40)}", ...gradeResult });`);
      gradedLines.push(`  }`);
      gradedLines.push('');
    }
  }

  gradedLines.push('  // --- Results ---');
  gradedLines.push('  console.log("\\n=== AGENT EVAL RESULTS ===\\n");');
  gradedLines.push('  let passed = 0, failed = 0;');
  gradedLines.push('  for (const r of results) {');
  gradedLines.push('    const icon = r.pass ? "✅" : "❌";');
  gradedLines.push('    console.log(`${icon} ${r.name}: ${r.overall || (r.pass ? "PASS" : "FAIL")}${r.feedback ? " — " + r.feedback : ""}${r.missing?.length ? " (missing: " + r.missing.join(", ") + ")" : ""}${r.wrongType?.length ? " (wrong type: " + r.wrongType.join(", ") + ")" : ""}`);');
  gradedLines.push('    if (r.pass) passed++; else failed++;');
  gradedLines.push('  }');
  gradedLines.push('  console.log(`\\n${passed} passed, ${failed} failed`);');
  gradedLines.push('  process.exit(failed > 0 ? 1 : 0);');
  gradedLines.push('}');
  gradedLines.push('');
  gradedLines.push('run();');

  return {
    schema: schemaLines.join('\n'),
    graded: gradedLines.join('\n'),
  };
}

function generateDeployConfig(platform, target) {
  const VALID_PLATFORMS = ['vercel', 'docker', 'netlify'];
  if (!VALID_PLATFORMS.includes(platform)) {
    return { platform, config: `// Unknown deploy target "${platform}". Use: ${VALID_PLATFORMS.join(', ')}` };
  }

  switch (platform) {
    case 'vercel':
      return {
        platform: 'vercel',
        filename: 'vercel.json',
        config: JSON.stringify({
          version: 2,
          builds: [{ src: '*.js', use: '@vercel/node' }],
          routes: [{ src: '/(.*)', dest: '/$1' }],
        }, null, 2),
      };
    case 'docker': {
      const isNode = target !== 'python_backend';
      const dockerfile = isNode
        ? `FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install --production\nEXPOSE 3000\nCMD ["node", "server.js"]`
        : `FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nRUN pip install fastapi uvicorn\nEXPOSE 3000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]`;
      return {
        platform: 'docker',
        filename: 'Dockerfile',
        config: dockerfile,
      };
    }
    case 'netlify':
      return {
        platform: 'netlify',
        filename: 'netlify.toml',
        config: `[build]\n  command = "clear build main.clear"\n  publish = "dist"\n\n[[redirects]]\n  from = "/api/*"\n  to = "/.netlify/functions/:splat"\n  status = 200`,
      };
  }
}

// =============================================================================
// UNIFIED COMPILER — compileNode + exprToCode
// =============================================================================
// Single entry points for all node/expression compilation. The `ctx` object
// carries language, indent, declaration tracking, and reactive state info.
//
//   ctx = { lang: 'js'|'python', indent: 0, declared: Set, stateVars: null|Set, mode: 'web'|'backend' }
//
// When ctx.stateVars is non-null and contains a variable name, exprToCode
// emits `_state.x` instead of `x` (reactive mode).
// =============================================================================

function padFor(ctx) {
  return ctx.lang === 'python' ? '    '.repeat(ctx.indent) : '  '.repeat(ctx.indent);
}

/**
 * Convert a condition expression AST into a filter object string.
 * Handles simple equality: `published is true` -> { published: true }
 * Handles AND conditions: `a is 1 and b is 2` -> { a: 1, b: 2 }
 * Falls back to a function filter for complex expressions.
 */
function conditionToFilter(condExpr, ctx) {
  if (!condExpr) return '';

  // Simple equality: BINARY_OP with == or ===
  if (condExpr.type === NodeType.BINARY_OP && (condExpr.operator === '==' || condExpr.operator === '===')) {
    const key = extractFilterKey(condExpr.left, ctx);
    const val = exprToCode(condExpr.right, ctx);
    if (key) {
      if (ctx.lang === 'python') return `{"${key}": ${val}}`;
      return `{ ${key}: ${val} }`;
    }
  }

  // AND condition: both sides are equalities
  if (condExpr.type === NodeType.BINARY_OP && condExpr.operator === '&&') {
    const pairs = extractAndPairs(condExpr, ctx);
    if (pairs) {
      if (ctx.lang === 'python') {
        const entries = pairs.map(([k, v]) => `"${k}": ${v}`).join(', ');
        return `{${entries}}`;
      }
      const entries = pairs.map(([k, v]) => `${k}: ${v}`).join(', ');
      return `{ ${entries} }`;
    }
  }

  // Fallback: wrap expression as a filter function (for complex conditions)
  const expr = exprToCode(condExpr, ctx);
  if (ctx.lang === 'python') return `lambda r: ${expr}`;
  return `(r) => ${expr}`;
}

function extractFilterKey(expr, ctx) {
  // Variable reference: `published` -> "published"
  if (expr.type === NodeType.VARIABLE_REF) return sanitizeName(expr.name);
  // Member access: `incoming's id` -> "id"
  if (expr.type === NodeType.MEMBER_ACCESS) return expr.member;
  return null;
}

// Extracts equality pairs from a condition for Supabase .eq() chaining
function extractEqPairs(condExpr, ctx) {
  const pairs = [];
  if (condExpr.operator === '==' || condExpr.operator === '===') {
    const key = extractFilterKey(condExpr.left, ctx);
    const val = exprToCode(condExpr.right, ctx);
    if (key) pairs.push([key, val]);
  } else if (condExpr.operator === '&&') {
    pairs.push(...extractEqPairs(condExpr.left, ctx));
    pairs.push(...extractEqPairs(condExpr.right, ctx));
  }
  return pairs;
}

function extractAndPairs(expr, ctx) {
  if (expr.type === NodeType.BINARY_OP && expr.operator === '&&') {
    const left = extractAndPairs(expr.left, ctx);
    const right = extractAndPairs(expr.right, ctx);
    if (left && right) return [...left, ...right];
    return null;
  }
  if (expr.type === NodeType.BINARY_OP && (expr.operator === '==' || expr.operator === '===')) {
    const key = extractFilterKey(expr.left, ctx);
    const val = exprToCode(expr.right, ctx);
    if (key) return [[key, val]];
  }
  return null;
}

/**
 * Check if an endpoint body references 'incoming' anywhere in its AST.
 * Used to decide whether to generate the `const incoming = ...` binding.
 */
function endpointBodyUsesIncoming(bodyNodes) {
  function checkExpr(expr) {
    if (!expr) return false;
    if (expr.type === NodeType.VARIABLE_REF && expr.name === 'incoming') return true;
    if (expr.type === NodeType.MEMBER_ACCESS) return checkExpr(expr.object);
    if (expr.type === NodeType.BINARY_OP) return checkExpr(expr.left) || checkExpr(expr.right);
    if (expr.type === NodeType.UNARY_OP) return checkExpr(expr.operand);
    if (expr.type === NodeType.CALL) return (expr.args || []).some(checkExpr);
    if (expr.type === NodeType.LITERAL_LIST) return (expr.elements || []).some(checkExpr);
    if (expr.type === NodeType.LITERAL_RECORD) return (expr.entries || []).some(e => checkExpr(e.value));
    // Fall-through scan for wrapper expression nodes (SEARCH, FILTER, LOOKUP, AGGREGATE, etc).
    // Any sub-field that looks like an expression gets checked. Without this, `search Todos
    // for incoming's q` slipped past — ASSIGN.expression = SEARCH{query: member_access(incoming)},
    // but SEARCH wasn't in the type list above so checkExpr returned false for the wrapper.
    if (expr.query && checkExpr(expr.query)) return true;
    if (expr.value && checkExpr(expr.value)) return true;
    if (expr.condition && checkExpr(expr.condition)) return true;
    if (expr.expression && checkExpr(expr.expression)) return true;
    if (expr.args && Array.isArray(expr.args) && expr.args.some(checkExpr)) return true;
    return false;
  }
  function checkNode(node) {
    if (!node) return false;
    if (node.expression && checkExpr(node.expression)) return true;
    if (node.condition && checkExpr(node.condition)) return true;
    // ASSIGN and other nodes carry the RHS on .value — must check this too,
    // otherwise `results = search Todos for incoming's q` misses and the
    // compiled endpoint emits `incoming?.q` with no `const incoming = ...`
    // binding above it.
    if (node.value && checkExpr(node.value)) return true;
    // SEARCH / FILTER nodes carry an inline query expression worth scanning
    if (node.query && checkExpr(node.query)) return true;
    if (node.args && Array.isArray(node.args) && node.args.some(a => checkExpr(a))) return true;
    if (node.variable === 'incoming') return true;
    // Check CRUD nodes that reference incoming
    if (node.type === NodeType.CRUD && node.variable === 'incoming') return true;
    // Validate nodes reference incoming implicitly
    if (node.type === NodeType.VALIDATE) return true;
    // Recurse into body blocks
    if (node.body) return node.body.some(checkNode);
    if (node.thenBranch) {
      if (Array.isArray(node.thenBranch) ? node.thenBranch.some(checkNode) : checkNode(node.thenBranch)) return true;
    }
    if (node.otherwiseBranch) {
      if (Array.isArray(node.otherwiseBranch) ? node.otherwiseBranch.some(checkNode) : checkNode(node.otherwiseBranch)) return true;
    }
    return false;
  }
  return bodyNodes.some(checkNode);
}

/**
 * Check if a condition expression targets the 'id' field.
 * Used to decide findOne vs findAll for lookups.
 */
function conditionTargetsId(condExpr) {
  if (!condExpr) return false;
  if (condExpr.type === NodeType.BINARY_OP && (condExpr.operator === '==' || condExpr.operator === '===')) {
    const leftKey = extractFilterKey(condExpr.left);
    return leftKey === 'id';
  }
  return false;
}

/**
 * Compile a CONTENT node to an HTML string builder expression inside a component.
 * Uses _html += '<tag>...' to build the return value.
 */
function compileContentToHTML(node, ctx) {
  const pad = padFor(ctx);
  const tagMap = {
    heading: 'h1', subheading: 'h2', text: 'p', bold: 'strong',
    italic: 'em', small: 'small', link: 'a', divider: 'hr',
  };
  const tag = tagMap[node.contentType] || 'p';

  if (node.contentType === 'image') {
    const src = (node.text || '').replace(/'/g, "\\'");
    return `${pad}_html += '<img src="${src}" alt="" class="w-full rounded-lg" loading="lazy" />';`;
  }

  if (node.contentType === 'video') {
    const src = (node.text || '').replace(/'/g, "\\'");
    return `${pad}_html += '<video src="${src}" controls class="w-full rounded-lg"></video>';`;
  }

  if (node.contentType === 'audio') {
    const src = (node.text || '').replace(/'/g, "\\'");
    return `${pad}_html += '<audio src="${src}" controls class="w-full"></audio>';`;
  }

  if (node.contentType === 'divider') {
    return `${pad}_html += '<hr class="divider clear-divider">';`;
  }

  // Dynamic text (variable reference) vs static text (string literal)
  if (node.textExpr) {
    const varName = exprToCode(node.textExpr, ctx);
    if (node.contentType === 'link') {
      const href = node.href || '#';
      return `${pad}_html += '<a class="link link-primary clear-link" href="${href}">' + ${varName} + '</a>';`;
    }
    return `${pad}_html += '<${tag}>' + ${varName} + '</${tag}>';`;
  }

  // Static text
  const text = (node.text || '').replace(/'/g, "\\'");
  if (node.contentType === 'link') {
    const href = node.href || '#';
    return `${pad}_html += '<a class="link link-primary clear-link" href="${href}">${text}</a>';`;
  }
  return `${pad}_html += '<${tag}>${text}</${tag}>';`;
}

function parseFileSize(sizeStr) {
  const match = String(sizeStr).match(/^(\d+)\s*(kb|mb|gb|b)?$/i);
  if (!match) return 10 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'b').toLowerCase();
  if (unit === 'gb') return num * 1024 * 1024 * 1024;
  if (unit === 'mb') return num * 1024 * 1024;
  if (unit === 'kb') return num * 1024;
  return num;
}

export function compileNode(node, ctx) {
  const result = _compileNodeInner(node, ctx);
  if (result == null) return null;
  if (!node.line) return result;
  if (node.type === NodeType.COMMENT) return result;
  // In backend mode, always emit // clear:N markers at indent <= 2 (top-level + endpoint body)
  // so the JS-line→Clear-line source map has per-statement precision.
  // In frontend/web mode, only emit when sourceMap=true and indent <= 1.
  const maxIndent = ctx.mode === 'backend' ? 2 : 1;
  if (ctx.indent > maxIndent) return result;
  if (ctx.mode !== 'backend' && !ctx.sourceMap) return result;
  const pad = padFor(ctx);
  const prefix = ctx.lang === 'python' ? '#' : '//';
  return `${pad}${prefix} clear:${node.line}\n${result}`;
}

// Backend-only node types: skip these when compiling for web/reactive frontend
const BACKEND_ONLY_NODES = new Set([
  NodeType.ENDPOINT, NodeType.RESPOND, NodeType.DATA_SHAPE, NodeType.CRUD,
  NodeType.REQUIRES_ROLE, NodeType.DEFINE_ROLE, NodeType.GUARD,
  NodeType.LOG_REQUESTS, NodeType.ALLOW_CORS, NodeType.AUTH_SCAFFOLD, NodeType.VALIDATE, NodeType.FIELD_RULE,
  NodeType.RESPONDS_WITH, NodeType.RATE_LIMIT, NodeType.WEBHOOK,
  NodeType.CHECKOUT, NodeType.ACCEPT_FILE, NodeType.EXTERNAL_FETCH,
  NodeType.STREAM, NodeType.STREAM_AI, NodeType.BACKGROUND, NodeType.CRON, NodeType.SUBSCRIBE, NodeType.MIGRATION, NodeType.WAIT,
  NodeType.CONNECT_DB, NodeType.RAW_QUERY, NodeType.CONFIGURE_EMAIL, NodeType.SEND_EMAIL,
  NodeType.HTTP_REQUEST, NodeType.SERVICE_CALL,
  NodeType.AGENT, NodeType.WORKFLOW, NodeType.SKILL, NodeType.PIPELINE, NodeType.PARALLEL_AGENTS,
  NodeType.POLICY,
]);

// Helper: compile a list of AST nodes into joined code lines.
// Used 30+ times throughout the compiler for body/branch compilation.
function compileBody(nodes, ctx, overrides = {}) {
  const childCtx = { ...ctx, indent: ctx.indent + 1, ...overrides };
  return nodes.map(n => compileNode(n, childCtx)).filter(Boolean).join('\n');
}

// --- Extracted node compilers (called from _compileNodeInner dispatch) ---

function compileEndpoint(node, ctx, pad) {
  const bodyUsesIncoming = endpointBodyUsesIncoming(node.body);
  const dataVar = node.receivingVar || 'incoming';
  const needsBinding = node.receivingVar || bodyUsesIncoming;

  if (ctx.lang === 'python') {
    const pyPath = node.path.replace(/:(\w+)/g, '{$1}');
    const handlerName = `${node.method.toLowerCase()}_${sanitizeName(node.path.replace(/[/:]/g, '_'))}`;
    const bodyCtx = { ...ctx, indent: ctx.indent + 2, endpointMethod: node.method, endpointHasId: node.path.includes(':id') };
    const bodyCode = node.body.map(n => compileNode(n, bodyCtx)).filter(Boolean).join('\n');
    let code = `${pad}@app.${node.method.toLowerCase()}("${pyPath}")\n${pad}async def ${handlerName}(request: Request):\n`;
    code += `${pad}    try:\n`;
    if (needsBinding) {
      if (node.receivingVar) {
        code += `${pad}        ${sanitizeName(dataVar)} = await request.json()\n`;
        // If body also references 'incoming' for URL params, bind that too
        if (bodyUsesIncoming) {
          code += `${pad}        incoming = request.path_params\n`;
        }
      } else {
        code += `${pad}        ${sanitizeName(dataVar)} = request.path_params\n`;
      }
    }
    code += bodyCode + '\n';
    code += `${pad}    except Exception as err:\n`;
    code += `${pad}        _status = 400 if ('required' in str(err) or 'must be' in str(err)) else 500\n`;
    code += `${pad}        _safe = str(err) if _status == 400 else 'Something went wrong'\n`;
    code += `${pad}        _debug = os.environ.get('CLEAR_DEBUG', '')\n`;
    code += `${pad}        if _debug:\n`;
    code += `${pad}            return JSONResponse(content={"error": _safe, "clear_line": ${node.line}, "clear_file": "${node._sourceFile || 'main.clear'}", "hint": str(err), "technical": str(err)}, status_code=_status)\n`;
    code += `${pad}        return JSONResponse(content={"error": _safe}, status_code=_status)`;
    return code;
  }

  const epDeclared = new Set();
  // Seed receiving var so VARIABLE_REF compilation can see it as "in scope"
  // and skip magic-mapping when the same name (e.g. `user`) is also a Clear
  // keyword that otherwise resolves to req.user.
  if (node.receivingVar) epDeclared.add(sanitizeName(node.receivingVar));
  if (endpointBodyUsesIncoming(node.body)) epDeclared.add('incoming');
  const hasIdParam = node.path.includes(':id');
  const isSeedEndpoint = node.path.includes('/seed') || node.path.includes('/setup') || node.path.includes('/init');
  const bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 2, declared: epDeclared, endpointMethod: node.method, endpointHasId: hasIdParam, isSeedEndpoint });
  let epCode = `${pad}// clear:${node.line} — ${node.method.toUpperCase()} ${node.path}\n`;
  epCode += `${pad}app.${node.method.toLowerCase()}('${node.path}', async (req, res) => {\n`;
  epCode += `${pad}  try {\n`;
  // Guard seed endpoints from running in production + auto-dedup
  if (isSeedEndpoint) {
    epCode += `${pad}    if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seed endpoint is disabled in production' });\n`;
    // Auto-dedup: find the first table being inserted into, skip if it already has data
    const firstInsert = node.body.find(n => n.type === NodeType.CRUD && (n.operation === 'insert' || n.isInsert));
    if (firstInsert && firstInsert.target) {
      const dedupTable = pluralizeName(firstInsert.target);
      epCode += `${pad}    const _existing = await db.findAll('${dedupTable}');\n`;
      epCode += `${pad}    if (_existing.length > 0) return res.json({ message: 'already seeded' });\n`;
    }
  }
  if (needsBinding) {
    if (node.receivingVar) {
      const isGet = (node.method || '').toUpperCase() === 'GET';
      if (isGet) {
        // GET endpoints use query params, not body
        epCode += `${pad}    const ${sanitizeName(dataVar)} = req.query;\n`;
      } else {
        epCode += `${pad}    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Request body is required (send JSON with Content-Type: application/json)' });\n`;
        epCode += `${pad}    const ${sanitizeName(dataVar)} = req.body;\n`;
      }
      // If body also references 'incoming' for URL params, bind that too
      if (bodyUsesIncoming) {
        epCode += `${pad}    const incoming = req.params;\n`;
      }
    } else {
      // No receiving clause — security posture for POST/PUT/DELETE is req.params ONLY
      // (prevents body-injected fields from reaching the handler unvalidated). GET
      // endpoints have no body at all, so bare `incoming` on a GET means query params
      // when the path has no URL param, URL params when it does.
      const isGet = (node.method || '').toUpperCase() === 'GET';
      const hasUrlParam = /\/:/.test(node.path || '');
      const source = isGet && !hasUrlParam ? 'req.query' : 'req.params';
      epCode += `${pad}    const ${sanitizeName(dataVar)} = ${source};\n`;
    }
  }
  epCode += bodyCode + '\n';
  const srcFile = node._sourceFile || 'main.clear';
  epCode += `${pad}  } catch (err) {\n`;
  epCode += `${pad}    console.error('[${node.method.toUpperCase()} ${node.path}] Error:', err.message);\n`;
  epCode += `${pad}    const _ctx = Object.assign({ endpoint: '${node.method.toUpperCase()} ${node.path}', line: ${node.line}, file: '${srcFile}' }, err._clearCtx || {});\n`;
  if (needsBinding && node.receivingVar) {
    epCode += `${pad}    if (typeof process !== 'undefined' && process.env.CLEAR_DEBUG === 'verbose') _ctx.input = req.body;\n`;
  }
  epCode += `${pad}    const _info = _clearError(err, _ctx);\n`;
  epCode += `${pad}    res.status(_info.status).json(_info.response);\n`;
  epCode += `${pad}  }\n`;
  epCode += `${pad}});`;
  return epCode;
}

// Pluralize a word: Activity -> activities, Model -> models, Address -> addresses
function pluralizeName(word) {
  const lower = word.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('es')) return lower;
  if (lower.endsWith('y') && !'aeiou'.includes(lower[lower.length - 2])) {
    return lower.slice(0, -1) + 'ies'; // activity -> activities
  }
  if (lower.endsWith('sh') || lower.endsWith('ch') || lower.endsWith('x') || lower.endsWith('z')) {
    return lower + 'es'; // address -> addresses (approx)
  }
  return lower + 's';
}

// Find the first unique field in a CRUD target's schema (for seed idempotency)
function findUniqueField(node, ctx) {
  if (!ctx.schemaNames) return null;
  // Walk up to find the DATA_SHAPE for this CRUD target
  // We can't access the AST here, but we can check the schemaNames set
  // The actual unique info is in the compiled Schema variable, not available at compile time.
  // Instead, check the AST body passed through context for DATA_SHAPE nodes.
  if (!ctx._astBody) return null;
  const target = node.target;
  const targetPlural = target ? target[0].toUpperCase() + pluralizeName(target).slice(1) : '';
  for (const n of ctx._astBody) {
    if (n.type !== NodeType.DATA_SHAPE) continue;
    if (n.name === target || n.name === targetPlural || n.name + 's' === target) {
      const uniqueField = n.fields.find(f => f.unique);
      return uniqueField ? uniqueField.name : null;
    }
  }
  return null;
}

function compileCrud(node, ctx, pad) {
  const table = node.target ? pluralizeName(node.target) : 'unknown';
  const lineComment = node.line ? ` // clear:${node.line}` : '';

  // Cloudflare Workers (D1 SQLite) path — emits env.DB.prepare/bind/run.
  // D1 is SQLite over HTTP, so every query must parameterize through .bind()
  // to block SQL injection. No template-literal interpolation of user values.
  // See plans/plan-clear-cloud-wfp-04-23-2026.md Phase 2 + runtime/db-d1.js shim.
  if (ctx.target === 'cloudflare' && ctx.lang !== 'python') {
    return compileCrudD1(node, ctx, pad, table, lineComment);
  }

  if (ctx.lang === 'python') {
    // Supabase Python path (supabase-py SDK)
    if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
      if (node.operation === 'lookup') {
        const varName = sanitizeName(node.variable);
        const isSingle = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
        let query = `supabase.table("${table}").select("*")`;
        if (node.condition) {
          const pairs = extractEqPairs(node.condition, ctx);
          for (const [k, v] of pairs) query += `.eq("${k}", ${v})`;
        }
        if (isSingle) query += '.single()';
        return `${pad}_resp = ${query}.execute()\n${pad}${varName} = _resp.data`;
      }
      if (node.operation === 'save') {
        const varCode = sanitizeName(node.variable);
        if (node.resultVar) {
          return `${pad}_resp = supabase.table("${table}").insert(${varCode}).execute()\n${pad}${sanitizeName(node.resultVar)} = _resp.data[0] if _resp.data else {}`;
        }
        return `${pad}supabase.table("${table}").update(${varCode}).eq("id", ${varCode}["id"]).execute()`;
      }
      if (node.operation === 'remove') {
        let query = `supabase.table("${table}").delete()`;
        if (node.condition) {
          const pairs = extractEqPairs(node.condition, ctx);
          for (const [k, v] of pairs) query += `.eq("${k}", ${v})`;
        }
        return `${pad}${query}.execute()`;
      }
    }
    // Default Python path (in-memory db)
    if (node.operation === 'lookup') {
      const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
      const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
      return `${pad}${sanitizeName(node.variable)} = db.${isSingleLookup ? 'query_one' : 'query'}("${table}"${where})`;
    }
    if (node.operation === 'save') {
      if (node.resultVar) return `${pad}${sanitizeName(node.resultVar)} = db.save("${table}", ${sanitizeName(node.variable)})`;
      // In PUT endpoints with :id, inject the URL param so db.update finds the right record
      if (ctx.endpointHasId) {
        const varCode = sanitizeName(node.variable);
        return `${pad}${varCode}["id"] = request.path_params["id"]\n${pad}db.update("${table}", ${varCode})`;
      }
      return `${pad}db.update("${table}", ${sanitizeName(node.variable)})`;
    }
    if (node.operation === 'remove') {
      // When inside a DELETE endpoint with :id and no explicit condition, auto-inject id filter
      if (ctx.endpointHasId && !node.condition) {
        return `${pad}id = request.path_params["id"]\n${pad}db.remove("${table}", {"id": id})`;
      }
      const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
      return `${pad}db.remove("${table}"${where})`;
    }
    return `${pad}# CRUD: ${node.operation}`;
  }

  if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
    if (node.operation === 'lookup') {
      const varName = sanitizeName(node.variable);
      const isSingle = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
      let query = `supabase.from('${table}').select('*')`;
      if (node.condition) {
        const pairs = extractEqPairs(node.condition, ctx);
        for (const [k, v] of pairs) query += `.eq('${k}', ${v})`;
      }
      if (isSingle) query += '.single()';
      // Pagination: .range(start, end)
      if (node.page && node.perPage) {
        const perPage = typeof node.perPage === 'number' ? node.perPage : parseInt(node.perPage, 10) || 25;
        const page = typeof node.page === 'number' ? node.page : `(${exprToCode({ type: NodeType.VARIABLE_REF, name: String(node.page) }, ctx)})`;
        query += `.range((${page} - 1) * ${perPage}, ${page} * ${perPage} - 1)`;
      } else if (!isSingle && !node.noLimit) {
        query += `.limit(${DEFAULT_QUERY_LIMIT})`;
      }
      return `${pad}const { data: ${varName}, error: _err } = await ${query};\n${pad}if (_err) throw _err;`;
    }
    if (node.operation === 'save') {
      const varCode = sanitizeName(node.variable);
      const names = ctx.schemaNames || new Set();
      let schemaName;
      if (names.has(node.target)) schemaName = node.target + 'Schema';
      else if (names.has(node.target + 's')) schemaName = node.target + 's' + 'Schema';
      else if (names.has(node.target.replace(/s$/, ''))) schemaName = node.target.replace(/s$/, '') + 'Schema';
      else schemaName = node.target + 'Schema';
      if (node.resultVar) {
        return `${pad}const { data: ${sanitizeName(node.resultVar)}, error: _err } = await supabase.from('${table}').insert(_pick(${varCode}, ${schemaName})).select().single();\n${pad}if (_err) throw _err;`;
      }
      return `${pad}const { error: _err } = await supabase.from('${table}').update(${varCode}).eq('id', ${varCode}.id);\n${pad}if (_err) throw _err;`;
    }
    if (node.operation === 'remove') {
      let query = `supabase.from('${table}').delete()`;
      if (node.condition) {
        const pairs = extractEqPairs(node.condition, ctx);
        for (const [k, v] of pairs) query += `.eq('${k}', ${v})`;
      }
      return `${pad}const { error: _err } = await ${query};\n${pad}if (_err) throw _err;`;
    }
  }

  if (node.operation === 'lookup') {
    const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
    const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
    let lookupCode;
    if (isSingleLookup) {
      lookupCode = `${pad}const ${sanitizeName(node.variable)} = _revive(await db.findOne('${table}'${where}));`;
    } else if (node.noLimit) {
      lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}'${where})).map(_revive);`;
    } else {
      const filterArg = node.condition ? conditionToFilter(node.condition, ctx) : '{}';
      lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}', ${filterArg}, { limit: ${DEFAULT_QUERY_LIMIT} })).map(_revive);`;
    }
    // PERF-5: explicit pagination pushes LIMIT + OFFSET into SQL instead of
    // fetching all rows then slicing client-side. Works for literal page
    // numbers (offset precomputed) and runtime variables (offset expression).
    if (node.page && node.perPage && !isSingleLookup) {
      const perPage = typeof node.perPage === 'number' ? node.perPage : parseInt(node.perPage, 10) || 25;
      const varName = sanitizeName(node.variable);
      const filterArg = node.condition ? conditionToFilter(node.condition, ctx) : '{}';
      let offsetExpr;
      if (typeof node.page === 'number') {
        offsetExpr = String((node.page - 1) * perPage);
      } else {
        offsetExpr = `(${sanitizeName(String(node.page))} - 1) * ${perPage}`;
      }
      lookupCode = `${pad}const ${varName} = (await db.findAll('${table}', ${filterArg}, { limit: ${perPage}, offset: ${offsetExpr} })).map(_revive);`;
    }
    // FK join stitching: for each FK field, load the related record
    if (!isSingleLookup && ctx.schemaMap) {
      const targetName = node.target || '';
      const schema = ctx.schemaMap[targetName.toLowerCase()];
      if (schema && schema.fkFields.length > 0) {
        const varName = sanitizeName(node.variable);
        for (const fkField of schema.fkFields) {
          const fkTable = pluralizeName(fkField.fk).toLowerCase();
          const fkName = sanitizeName(fkField.name);
          lookupCode += `\n${pad}for (const _item of ${varName}) { if (_item.${fkName}) _item.${fkName} = await db.findOne('${fkTable}', { id: _item.${fkName} }); }`;
        }
      }
    }
    return lookupCode;
  }
  if (node.operation === 'save') {
    const varCode = sanitizeName(node.variable);
    // Schema name must match what compileDataShape generates: DataShapeName + 'Schema'
    // CRUD target may be singular ("Todo") while data shape is plural ("Todos") or vice versa.
    // Look up the actual declared name from ctx.schemaNames.
    const names = ctx.schemaNames || new Set();
    let schemaName;
    // Try exact match, then pluralized, then de-pluralized
    const pluralized = node.target[0].toUpperCase() + pluralizeName(node.target).slice(1);
    if (names.has(node.target)) schemaName = node.target + 'Schema';
    else if (names.has(node.target + 's')) schemaName = node.target + 's' + 'Schema';
    else if (names.has(pluralized)) schemaName = pluralized + 'Schema';
    else if (names.has(node.target.replace(/s$/, ''))) schemaName = node.target.replace(/s$/, '') + 'Schema';
    else if (names.has(node.target.replace(/ies$/, 'y'))) schemaName = node.target.replace(/ies$/, 'y') + 'Schema';
    else schemaName = node.target + 'Schema'; // fallback
    const srcFile = node._sourceFile || 'main.clear';
    const tryCtx = `{ op: 'insert', table: '${table}', line: ${node.line}, file: '${srcFile}', source: ${JSON.stringify(node._rawSource || '')} }`;
    // Seed idempotency: for seed/setup/init endpoints, check if record exists before inserting
    if (ctx.isSeedEndpoint) {
      // Find unique fields in schema to use as dedup key
      const uniqueField = findUniqueField(node, ctx);
      if (uniqueField) {
        const existingVar = `_existing_${sanitizeName(varCode)}`;
        const dedupCheck = `${pad}const ${existingVar} = await db.findOne('${table}', { ${uniqueField}: ${varCode}.${uniqueField} });\n`;
        if (node.resultVar) {
          return dedupCheck +
            `${pad}const ${sanitizeName(node.resultVar)} = ${existingVar} || await _clearTry(() => db.insert('${table}', _pick(${varCode}, ${schemaName})), ${tryCtx});${lineComment}`;
        }
        return dedupCheck +
          `${pad}if (!${existingVar}) await _clearTry(() => db.insert('${table}', _pick(${varCode}, ${schemaName})), ${tryCtx});${lineComment}`;
      }
    }
    // "with field is value" overrides — merge local variables on top of the
    // picked request fields. e.g. `save request as new Report with report is
    // final_report` → { ...picked_from_request, report: final_report }.
    const picked = `_pick(${varCode}, ${schemaName})`;
    let insertArg = picked;
    if (node.overrides && node.overrides.length > 0) {
      const spreads = node.overrides.map(o => `${sanitizeName(o.field)}: ${sanitizeName(o.value)}`).join(', ');
      insertArg = `{ ...${picked}, ${spreads} }`;
    }
    if (node.resultVar) return `${pad}const ${sanitizeName(node.resultVar)} = await _clearTry(() => db.insert('${table}', ${insertArg}), ${tryCtx});${lineComment}`;
    if (node.isInsert) return `${pad}await _clearTry(() => db.insert('${table}', ${insertArg}), ${tryCtx});${lineComment}`;
    // In PUT endpoints with :id, inject the URL param so db.update finds the right record
    const updateCtx = `{ op: 'update', table: '${table}', line: ${node.line}, file: '${srcFile}', source: ${JSON.stringify(node._rawSource || '')} }`;
    if (ctx.endpointHasId) {
      // Use _pick to filter incoming fields through the schema (mass-assignment protection).
      // The id comes from the URL param, not the body — set it after picking so db.update
      // can find the right record. After update, re-fetch the full record from DB so the
      // variable has all fields with correct types (numeric id, all columns). Without this,
      // the variable only contains the partial request body, so `send back X` returns an
      // incomplete response.
      return `${pad}const _picked_${varCode} = _pick(${varCode}, ${schemaName});\n${pad}_picked_${varCode}.id = req.params.id;\n${pad}await _clearTry(() => db.update('${table}', _picked_${varCode}), ${updateCtx});${lineComment}\n${pad}Object.assign(${varCode}, await db.findOne('${table}', { id: _picked_${varCode}.id }) || {});`;
    }
    return `${pad}await _clearTry(() => db.update('${table}', _pick(${varCode}, ${schemaName})), ${updateCtx});${lineComment}`;
  }
  if (node.operation === 'remove') {
    const removeCtx = `{ op: 'remove', table: '${table}', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: ${JSON.stringify(node._rawSource || '')} }`;
    // When inside a DELETE endpoint with :id and no explicit condition, auto-inject id filter
    if (ctx.endpointHasId && !node.condition) {
      return `${pad}await _clearTry(() => db.remove('${table}', { id: req.params.id }), ${removeCtx});${lineComment}`;
    }
    const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
    return `${pad}await _clearTry(() => db.remove('${table}'${where}), ${removeCtx});${lineComment}`;
  }
  return `${pad}// CRUD: ${node.operation}`;
}

// =============================================================================
// CRUD — CLOUDFLARE D1 (SQLITE) EMIT PATH
// =============================================================================
//
// Invoked when `ctx.target === 'cloudflare'`. Emits env.DB.prepare(SQL).bind(...).run/all/first()
// for every CRUD op. SECURITY: every user value flows through .bind(), never
// template-literal interpolation. A WHERE `email = 'alice'` input becomes
// `WHERE email = ?` + `.bind(value)`, so `' OR 1=1 --' safely fails to match.
//
// D1 call shapes:
//   INSERT  → prepare('INSERT INTO t (a, b) VALUES (?, ?)').bind(a, b).run()
//   SELECT * → prepare('SELECT * FROM t').all()  → returns { results: [...] }
//   SELECT 1 → prepare('SELECT * FROM t WHERE id = ?').bind(id).first()
//   UPDATE  → prepare('UPDATE t SET a=?, b=? WHERE id = ?').bind(a, b, id).run()
//   DELETE  → prepare('DELETE FROM t WHERE id = ?').bind(id).run()
//
// UPDATE invariant: we refuse to run an UPDATE without an id on the record
// (mirrors the runtime/db.js guard landed in session 42). Silent no-op updates
// hide the "save initial to Counters with no id" class of Meph bugs.

function compileCrudD1(node, ctx, pad, table, lineComment) {
  if (node.operation === 'save') {
    return compileCrudD1Save(node, ctx, pad, table, lineComment);
  }
  return `${pad}// CRUD (cloudflare): ${node.operation}`;
}

// Extract column names for a table from schemaMap (fallback: pick from record at runtime).
function _d1ColumnsForTarget(targetName, ctx) {
  if (!ctx.schemaMap || !targetName) return null;
  // Try several capitalization/plural forms
  const keys = [targetName, targetName + 's', pluralizeName(targetName), targetName.toLowerCase()]
    .concat(ctx.schemaMap ? [pluralizeName(targetName).toLowerCase()] : []);
  for (const k of keys) {
    const m = ctx.schemaMap[(k || '').toLowerCase()];
    if (m && Array.isArray(m.fields)) {
      return m.fields.map((f) => f.name);
    }
  }
  return null;
}

function compileCrudD1Save(node, ctx, pad, table, lineComment) {
  const varCode = sanitizeName(node.variable);
  const cols = _d1ColumnsForTarget(node.target, ctx);

  // INSERT path: when caller is `save X as new T` (node.resultVar or isInsert),
  // or when outer context has no id on the record (would be UPDATE territory).
  const isExplicitInsert = node.resultVar || node.isInsert;

  // "with field is value" overrides merge local vars on top of incoming
  const overrides = Array.isArray(node.overrides) ? node.overrides : [];

  if (isExplicitInsert) {
    // Build: env.DB.prepare('INSERT INTO t (a, b) VALUES (?, ?)').bind(rec.a, rec.b).run()
    // Column list: from schema if known, otherwise pick Object.keys(record) at runtime.
    if (cols && cols.length > 0) {
      const colList = cols.join(', ');
      const placeholders = cols.map(() => '?').join(', ');
      // Override expressions replace column reads from the record
      const overrideMap = Object.create(null);
      for (const o of overrides) overrideMap[o.field] = sanitizeName(o.value);
      const bindArgs = cols.map((c) => overrideMap[c] !== undefined
        ? overrideMap[c]
        : `${varCode}?.${c} ?? null`).join(', ');

      const stmt = `await env.DB.prepare('INSERT INTO ${table} (${colList}) VALUES (${placeholders})').bind(${bindArgs}).run()`;
      if (node.resultVar) {
        // Return the inserted row with its id; D1's .run() yields { meta: { last_row_id } }.
        // Re-fetch via SELECT to have parity with db.insert's return shape.
        const rv = sanitizeName(node.resultVar);
        return `${pad}const _d1_res_${rv} = ${stmt};\n${pad}const ${rv} = await env.DB.prepare('SELECT * FROM ${table} WHERE id = ?').bind(_d1_res_${rv}.meta.last_row_id).first();${lineComment}`;
      }
      return `${pad}${stmt};${lineComment}`;
    }
    // Unknown schema — dynamic column discovery at runtime from the record.
    // Still parameterizes values via .bind(...args); column names are sanitized
    // by _d1SafeCol (throws if not /^[a-z_][a-z0-9_]*$/i).
    return `${pad}{
${pad}  const _d1_keys = Object.keys(${varCode} || {}).filter(k => k !== 'id' && /^[a-z_][a-z0-9_]*$/i.test(k));
${pad}  const _d1_sql = 'INSERT INTO ${table} (' + _d1_keys.join(', ') + ') VALUES (' + _d1_keys.map(() => '?').join(', ') + ')';
${pad}  const _d1_vals = _d1_keys.map(k => ${varCode}[k]);
${pad}  ${node.resultVar ? `const _d1_res_${sanitizeName(node.resultVar)} = ` : ''}await env.DB.prepare(_d1_sql).bind(..._d1_vals).run();
${pad}  ${node.resultVar ? `const ${sanitizeName(node.resultVar)} = await env.DB.prepare('SELECT * FROM ${table} WHERE id = ?').bind(_d1_res_${sanitizeName(node.resultVar)}.meta.last_row_id).first();` : ''}
${pad}}${lineComment}`;
  }

  // UPDATE path is cycle 2.5 — placeholder for now.
  return `${pad}// CRUD (cloudflare) save-update: stub for cycle 2.5`;
}

function compileRespond(node, ctx, pad) {
  const val = exprToCode(node.expression, ctx);
  const isStringLiteral = node.expression.type === NodeType.LITERAL_STRING;

  // Inside an agent or plain function def, send back = plain return (not res.json)
  if (ctx.insideAgent || ctx.insideFunction) {
    if (ctx.lang === 'python') return `${pad}return ${val}`;
    return `${pad}return ${val};`;
  }

  // Inside a stream block, send as SSE event
  if (ctx.streamMode) {
    if (ctx.lang === 'python') return `${pad}yield f"data: {json.dumps(${val})}\\n\\n"`;
    return `${pad}res.write(\`data: \${JSON.stringify(${val})}\\n\\n\`);`;
  }

  // Python responses
  if (ctx.lang === 'python') {
    const pyVal = isStringLiteral ? `{"message": ${val}}` : val;
    if (node.status) return `${pad}return JSONResponse(content=${pyVal}, status_code=${node.status})`;
    return `${pad}return ${pyVal}`;
  }

  // Cloudflare Workers: web Fetch API, not Express. `res` does not exist.
  // Emit `new Response(JSON.stringify(body), { status, headers })` and return it.
  if (ctx.target === 'cloudflare') {
    const jsonHeaders = `{ 'Content-Type': 'application/json' }`;
    if (node.successMessage) {
      const successStatus = ctx.endpointMethod === 'POST' ? 201 : 200;
      const jsVal = isStringLiteral ? `{ message: ${val} }` : `{ ...${val}, message: 'success' }`;
      return `${pad}return new Response(JSON.stringify(${jsVal}), { status: ${successStatus}, headers: ${jsonHeaders} });`;
    }
    if (node.status) {
      const jsVal = isStringLiteral ? `{ message: ${val} }` : val;
      return `${pad}return new Response(JSON.stringify(${jsVal}), { status: ${node.status}, headers: ${jsonHeaders} });`;
    }
    const jsVal = isStringLiteral ? `{ message: ${val} }` : val;
    return `${pad}return new Response(JSON.stringify(${jsVal}), { headers: ${jsonHeaders} });`;
  }

  // JS responses -- correct HTTP status by method
  if (node.successMessage) {
    const successStatus = ctx.endpointMethod === 'POST' ? 201 : 200;
    const jsVal = isStringLiteral ? `{ message: ${val} }` : `{ ...${val}, message: "success" }`;
    return `${pad}return res.status(${successStatus}).json(${jsVal});`;
  }
  if (node.status) {
    const jsVal = isStringLiteral ? `{ message: ${val} }` : val;
    return `${pad}return res.status(${node.status}).json(${jsVal});`;
  }
  const jsVal = isStringLiteral ? `{ message: ${val} }` : val;
  return `${pad}return res.json(${jsVal});`;
}

function compileAgent(node, ctx, pad) {
  const fnName = 'agent_' + sanitizeName(node.name.toLowerCase().replace(/\s+/g, '_'));
  const agentDeclared = new Set();
  let bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 1, declared: agentDeclared, insideAgent: true });

  // Emit startup code for URL/file knowledge sources (loaded once at module level)
  let startupCode = '';
  if (node.knowsAbout && node.knowsAbout.length > 0) {
    const sources = node.knowsAbout.map(src => typeof src === 'string' ? { type: 'table', value: src } : src);
    const urlSources = sources.filter(s => s.type === 'url');
    const fileSources = sources.filter(s => s.type === 'file');
    for (let i = 0; i < urlSources.length; i++) {
      startupCode += `${pad}let _knowledge_url_${i} = '';\n${pad}_fetchPageText(${JSON.stringify(urlSources[i].value)}).then(t => { _knowledge_url_${i} = t; }).catch(e => console.warn('RAG: could not load ${urlSources[i].value}:', e.message));\n`;
    }
    for (let i = 0; i < fileSources.length; i++) {
      startupCode += `${pad}let _knowledge_file_${i} = '';\n${pad}_loadFileText(${JSON.stringify(fileSources[i].value)}).then(t => { _knowledge_file_${i} = t; }).catch(e => console.warn('RAG: could not load ${fileSources[i].value}:', e.message));\n`;
    }
  }

  // Scheduled agent: runs on interval or cron, no input parameter
  if (node.schedule) {
    const { value, unit, at } = node.schedule;
    if (ctx.lang === 'python') {
      return `${startupCode}${pad}async def ${fnName}():\n${bodyCode}\n${pad}# Schedule: runs every ${value} ${unit}(s)${at ? ' at ' + at : ''}`;
    }
    // If "at" time specified, use cron-style scheduling
    if (at) {
      const cronExpr = _timeToCron(at, value, unit);
      return `${startupCode}${pad}async function ${fnName}() {\n${bodyCode}\n${pad}}\n${pad}const _cron_${fnName} = require('node-cron');\n${pad}_cron_${fnName}.schedule('${cronExpr}', ${fnName});\n${pad}console.log("Scheduled agent '${node.name}' running ${cronExpr}");`;
    }
    // Otherwise use setInterval
    const ms = unit === 'second' ? value * 1000
      : unit === 'minute' ? value * 60000
      : unit === 'hour' ? value * 3600000
      : unit === 'day' ? value * 86400000
      : value * 3600000; // default hour
    return `${startupCode}${pad}async function ${fnName}() {\n${bodyCode}\n${pad}}\n${pad}setInterval(${fnName}, ${ms});\n${pad}console.log("Scheduled agent '${node.name}' running every ${value} ${unit}(s)");`;
  }

  const param = node.receivingVar ? sanitizeName(node.receivingVar) : '';
  const innerPad = pad + '  ';

  // === COMPOSABLE AGENT FEATURES ===
  // All features modify bodyCode and/or preamble, then the final code is assembled at the end.
  // Order matters: stream → model → skills → tools → tracking → conversation/memory/RAG
  let preamble = ''; // Code inserted at top of agent function body

  // -1. Streaming: ON by default for text agents, OFF for structured output
  //   Default (null)      → stream text, don't stream structured (returning:)
  //   `do not stream`     → never stream (for pipeline steps)
  //   `stream response`   → force stream (redundant for text, documents intent)
  //   `do not stream`     → opt out explicitly
  //   Structured output   → never stream (JSON must be complete)
  let shouldStream = node.streamResponse !== false; // stream by default, opt out with 'do not stream'
  if (shouldStream) {
    // Auto-disable for structured output — can't stream partial JSON
    let hasStructuredOutput = false;
    (function checkStructured(nodes) {
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI && n.expression.schema?.length > 0) hasStructuredOutput = true;
        if (n.body) checkStructured(n.body);
        if (n.thenBranch) checkStructured(n.thenBranch);
        if (n.otherwiseBranch) checkStructured(n.otherwiseBranch);
      }
    })(node.body);
    if (hasStructuredOutput) shouldStream = false;
  }
  // Scheduled agents don't stream (no HTTP response to pipe to)
  if (node.schedule) shouldStream = false;
  // Tool-use agents don't stream (tool loop needs full request-response cycle)
  // Check both direct tools and skills that provide tools
  if (node.tools && node.tools.length > 0) shouldStream = false;
  if (node.skills && node.skills.length > 0) {
    const astBody = ctx._astBody || [];
    for (const skillName of node.skills) {
      const skillNode = astBody.find(n => n.type === NodeType.SKILL && n.name === skillName);
      if (skillNode?.tools?.length > 0) { shouldStream = false; break; }
    }
  }

  // Only actually stream if the body has _askAI calls to replace
  if (shouldStream && ctx.lang === 'python' && bodyCode.includes('_ask_ai(')) {
    // Python streaming: replace _ask_ai with _ask_ai_stream
    const streamVars = new Set();
    bodyCode = bodyCode.replace(
      /(\w+) = await _ask_ai\(([^)]*)\)/g,
      (m, varName, args) => { streamVars.add(varName); return `${varName} = _ask_ai_stream(${args})`; }
    );
    if (streamVars.size > 0) {
      for (const v of streamVars) {
        bodyCode = bodyCode.replace(
          new RegExp(`return ${v}`, 'g'),
          `async for _chunk in ${v}:\n${pad}        yield _chunk`
        );
      }
    } else {
      shouldStream = false;
    }
  } else if (shouldStream && ctx.lang !== 'python' && bodyCode.includes('_askAI(')) {
    // Track which variables hold stream results (so we know which returns to convert)
    const streamVars = new Set();
    // Reassigned variables MUST stay non-streaming. If we converted
    // `let draft = await _askAI(...)` to `_askAIStream(...)` but a later
    // `draft = await _askAI('...', draft)` fed the generator back in as
    // context, Claude would receive [object AsyncGenerator] instead of a
    // string. Polished Report in multi-agent-research hit this — second
    // call got no real draft text, produced nonsense. Scan for
    // `<var> = ` (reassignment without `let`) and skip streaming for
    // those vars. Only truly single-assignment vars get streamed.
    const reassignedVars = new Set();
    for (const m of bodyCode.matchAll(/(?:^|\n)\s*(\w+)\s*=(?!=)/g)) {
      // Ignore declarations (`let`, `const`, `var`), keep bare reassignments only.
      const before = bodyCode.slice(0, m.index + m[0].length - m[1].length - 1);
      const lastWord = (before.match(/\b(let|const|var)\s*$/) || [])[1];
      if (!lastWord) reassignedVars.add(m[1]);
    }
    bodyCode = bodyCode.replace(
      /let (\w+) = await _askAI\(([^)]*)\)/g,
      (m, varName, args) => {
        if (reassignedVars.has(varName)) return m; // keep awaited — need real string for next call
        streamVars.add(varName);
        return `let ${varName} = _askAIStream(${args})`;
      }
    );
    // Also handle _askAIWithTools
    bodyCode = bodyCode.replace(
      /let (\w+) = await _askAIWithTools\(([^)]*)\)/g,
      (m, varName, args) => {
        if (reassignedVars.has(varName)) return m;
        streamVars.add(varName);
        return `let ${varName} = _askAIStream(${args})`;
      }
    );
    // Only convert returns of stream variables to yield
    if (streamVars.size > 0) {
      for (const v of streamVars) {
        bodyCode = bodyCode.replace(
          new RegExp(`return ${v};`, 'g'),
          `for await (const _chunk of ${v}) { yield _chunk; }`
        );
      }
    } else {
      // No _askAI assignment found, disable streaming
      shouldStream = false;
    }
  } else {
    shouldStream = false;
  }

  // If this agent was pre-classified as streaming but we're now emitting it
  // as a plain async function (no generator), remove it from the shared set
  // so call-site codegen uses `await agent_X(...)` instead of
  // `for await (const _c of agent_X(...))`. The pre-scan's static analysis
  // is coarser than the per-agent compile's decisions (e.g. it doesn't
  // account for ask-claude vars that get reassigned inside `repeat until`
  // loops), so the two CAN disagree. When they do, the per-agent decision
  // wins — it's the one that actually shapes the emitted function.
  if (!shouldStream && ctx.streamingAgentNames && ctx.streamingAgentNames.has(node.name)) {
    ctx.streamingAgentNames.delete(node.name);
  }

  // 0. Model selection: using 'claude-sonnet-4-6' — inject model param into _askAI calls
  if (node.model) {
    const modelStr = JSON.stringify(node.model);
    if (ctx.lang === 'python') {
      // _ask_ai(prompt, context, schema) → _ask_ai(prompt, context, None, model)
      bodyCode = bodyCode.replace(
        /await _ask_ai\(([^)]+)\)/g,
        `await _ask_ai($1, ${modelStr})`
      );
      // Also handle streaming: _ask_ai_stream(prompt, context) → _ask_ai_stream(prompt, context, model)
      bodyCode = bodyCode.replace(
        /_ask_ai_stream\(([^)]*)\)/g,
        (m, args) => `_ask_ai_stream(${args}, ${modelStr})`
      );
    } else {
      // _askAI(prompt, context) → _askAI(prompt, context, null, model)
      bodyCode = bodyCode.replace(
        /await _askAI\(([^)]*)\)/g,
        (m, args) => `await _askAI(${args}, null, ${modelStr})`
      );
      // Also handle streaming: _askAIStream(prompt, context) → _askAIStream(prompt, context, model)
      bodyCode = bodyCode.replace(
        /_askAIStream\(([^)]*)\)/g,
        (m, args) => `_askAIStream(${args}, ${modelStr})`
      );
    }
  }

  // 1. Skills: merge skill tools + instructions into agent (mutates node.tools + bodyCode)
  if (node.skills && node.skills.length > 0) {
    const astBody = ctx._astBody || [];
    let skillInstructions = '';
    for (const skillName of node.skills) {
      const skillNode = astBody.find(n => n.type === NodeType.SKILL && n.name === skillName);
      if (!skillNode) continue;
      if (skillNode.tools && skillNode.tools.length > 0) {
        if (!node.tools) node.tools = [];
        for (const toolName of skillNode.tools) {
          if (!node.tools.some(t => t.type === 'ref' && t.name === toolName)) {
            node.tools.push({ type: 'ref', name: toolName });
          }
        }
      }
      if (skillNode.instructions && skillNode.instructions.length > 0) {
        skillInstructions += skillNode.instructions.join('\\n') + '\\n';
      }
    }
    if (skillInstructions) {
      const safeInstr = skillInstructions.replace(/"/g, '\\"');
      // Handle both string literal prompts and variable prompts
      bodyCode = bodyCode.replace(
        /await _askAI\(("([^"]*)")/g,
        (m, fullMatch, prompt) => `await _askAI("${safeInstr}\\n${prompt}"`
      );
      bodyCode = bodyCode.replace(
        /await _askAI\(([a-zA-Z_]\w*),/g,
        (m, varName) => `await _askAI("${safeInstr}\\n" + ${varName},`
      );
    }
  }

  // 2. Tool use: can use: fn1, fn2 — add _tools/_toolFns preamble, replace _askAI with _askAIWithTools
  if (node.tools && node.tools.length > 0) {
    const refTools = node.tools.filter(t => t.type === 'ref');
    if (refTools.length > 0) {
      const astBody = ctx._astBody || [];
      const toolDefs = [];
      const toolFnNames = [];
      for (const tool of refTools) {
        const fnDef = astBody.find(n => n.type === NodeType.FUNCTION_DEF && n.name === tool.name);
        const params = fnDef ? fnDef.params : [];
        const paramNames = params.map(p => p.name);
        const properties = {};
        for (const name of paramNames) {
          properties[name] = { type: 'string' };
        }
        const required = paramNames.length > 0 ? paramNames : undefined;
        toolDefs.push({
          name: tool.name,
          description: `${tool.name}(${paramNames.join(', ')})`,
          input_schema: { type: 'object', properties, ...(required ? { required } : {}) },
        });
        toolFnNames.push(sanitizeName(tool.name));
      }
      const toolsJson = JSON.stringify(toolDefs);
      const toolFnsObj = toolFnNames.map(n => `${n}`).join(', ');
      preamble += `${innerPad}const _tools = ${toolsJson};\n`;
      preamble += `${innerPad}const _toolFns = { ${toolFnsObj} };\n`;
      // Replace _askAI calls with _askAIWithTools in bodyCode
      // Can't use simple regex [^)]* because prompts may contain literal parentheses
      // e.g. "explain the refund timeline (5-7 business days)"
      // Instead: iteratively find each _askAI( call, count parens to find the matching ), splice
      const marker = 'await _askAI(';
      let searchFrom = 0;
      while (true) {
        const idx = bodyCode.indexOf(marker, searchFrom);
        if (idx < 0) break;
        let depth = 1, i = idx + marker.length;
        while (i < bodyCode.length && depth > 0) {
          if (bodyCode[i] === '(') depth++;
          else if (bodyCode[i] === ')') depth--;
          i++;
        }
        const args = bodyCode.substring(idx + marker.length, i - 1);
        const replacement = `await _askAIWithTools(${args}, _tools, _toolFns)`;
        bodyCode = bodyCode.substring(0, idx) + replacement + bodyCode.substring(i);
        searchFrom = idx + replacement.length;
      }
    }
  }

  // 2b. Argument guardrails: block arguments matching 'pattern1', 'pattern2'
  if (node.argumentGuardrails && node.argumentGuardrails.length > 0 && ctx.lang !== 'python') {
    const escaped = node.argumentGuardrails.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    preamble += `${innerPad}const _guardrailRx = /${escaped}/i;\n`;
    // Wrap each tool function with guardrail check (tool fns are in preamble)
    preamble = preamble.replace(
      /const _toolFns = \{([^}]+)\}/,
      (match, fns) => {
        const fnNames = fns.split(',').map(s => s.trim()).filter(Boolean);
        const wrapped = fnNames.map(n => `${n}: (...args) => { if (_guardrailRx.test(JSON.stringify(args))) throw new Error('Blocked by guardrail'); return ${n}(...args); }`);
        return `const _toolFns = { ${wrapped.join(', ')} }`;
      }
    );
  }

  // 3. Observability: track agent decisions — wrap _askAI/_askAIWithTools calls with logging
  if (node.trackDecisions) {
    const agentNameStr = JSON.stringify(node.name);
    if (ctx.lang === 'python') {
      preamble += `${innerPad}import time as _time\n`;
      preamble += `${innerPad}async def _agent_log(action, _input, fn):\n`;
      preamble += `${innerPad}    _start = _time.time()\n`;
      preamble += `${innerPad}    _result = await fn()\n`;
      preamble += `${innerPad}    _ms = int((_time.time() - _start) * 1000)\n`;
      preamble += `${innerPad}    await db.insert("AgentLogs", {"agent_name": ${agentNameStr}, "action": action, "input": str(_input)[:500], "output": str(_result)[:500], "latency_ms": _ms})\n`;
      preamble += `${innerPad}    return _result\n`;
      bodyCode = bodyCode.replace(
        /await _ask_ai\(([^)]+)\)/g,
        `await _agent_log("ask_ai", ${param}, lambda: _ask_ai($1))`
      );
    } else {
      preamble += `${innerPad}const _agentLog = async (action, _input, fn) => {\n`;
      preamble += `${innerPad}  const _start = Date.now();\n`;
      preamble += `${innerPad}  const _result = await fn();\n`;
      preamble += `${innerPad}  const _ms = Date.now() - _start;\n`;
      preamble += `${innerPad}  try { await db.insert('AgentLogs', { agent_name: ${agentNameStr}, action, input: JSON.stringify(_input).slice(0, 500), output: JSON.stringify(_result).slice(0, 500), latency_ms: _ms }); } catch(e) { console.warn('[clear:agent-log]', e.message); }\n`;
      preamble += `${innerPad}  return _result;\n`;
      preamble += `${innerPad}};\n`;
    }
    // Wrap _askAI and _askAIWithTools calls with logging
    // Can't use [^)]* — prompts may contain literal parentheses e.g. "(5-7 business days)"
    if (ctx.lang !== 'python') {
      const logMarkers = ['await _askAIWithTools(', 'await _askAI('];
      for (const logMarker of logMarkers) {
        let logSearch = 0;
        while (true) {
          const logIdx = bodyCode.indexOf(logMarker, logSearch);
          if (logIdx < 0) break;
          let logDepth = 1, logI = logIdx + logMarker.length;
          while (logI < bodyCode.length && logDepth > 0) {
            if (bodyCode[logI] === '(') logDepth++;
            else if (bodyCode[logI] === ')') logDepth--;
            logI++;
          }
          const fnName = logMarker.replace('await ', '').replace('(', '');
          const logArgs = bodyCode.substring(logIdx + logMarker.length, logI - 1);
          const replacement = `await _agentLog("ask_ai", ${param}, () => ${fnName}(${logArgs}))`;
          bodyCode = bodyCode.substring(0, logIdx) + replacement + bodyCode.substring(logI);
          logSearch = logIdx + replacement.length;
        }
      }
    }
  }

  // 4. Conversation: remember conversation context — load/save history in preamble + postamble
  let postamble = ''; // Code appended after body
  if (node.rememberConversation && ctx.lang !== 'python') {
    preamble += `${innerPad}let _conv = db.findAll ? (await db.findAll('Conversations', { user_id: _userId }))[0] : null;\n`;
    preamble += `${innerPad}if (!_conv) _conv = await db.insert('Conversations', { user_id: _userId, messages: '[]' });\n`;
    preamble += `${innerPad}const _history = JSON.parse(_conv.messages || '[]');\n`;
    preamble += `${innerPad}_history.push({ role: 'user', content: typeof ${param} === 'string' ? ${param} : JSON.stringify(${param}) });\n`;
    postamble += `${innerPad}_history.push({ role: 'assistant', content: typeof response === 'string' ? response : JSON.stringify(response) });\n`;
    postamble += `${innerPad}try { await db.update('Conversations', { ..._conv, messages: JSON.stringify(_history.slice(-50)) }); } catch(e) { console.warn('[clear:conversation]', e.message); }\n`;
  }

  // 5. Memory: remember user's preferences — load facts, inject into prompt, extract REMEMBER tags
  if (node.rememberPreferences && ctx.lang !== 'python') {
    preamble += `${innerPad}const _memories = db.findAll ? await db.findAll('Memories', { user_id: _userId }) : [];\n`;
    preamble += `${innerPad}const _memContext = _memories.length ? '\\nUser preferences: ' + _memories.map(m => m.fact).join('; ') : '';\n`;
    // Inject memory context into prompt
    bodyCode = bodyCode.replace(
      /await (_askAI(?:WithTools|Stream)?)\("([^"]*)",/g,
      (m, fn, prompt) => `await ${fn}("${prompt}" + _memContext,`
    );
    bodyCode = bodyCode.replace(
      /await (_askAI(?:WithTools|Stream)?)\(([a-zA-Z_]\w+),/g,
      (m, fn, varName) => `await ${fn}(${varName} + _memContext,`
    );
    postamble += `${innerPad}if (typeof response === 'string') {\n`;
    postamble += `${innerPad}  const _newFacts = response.match(/\\[REMEMBER: (.+?)\\]/g);\n`;
    postamble += `${innerPad}  if (_newFacts) for (const f of _newFacts) { try { await db.insert('Memories', { user_id: _userId, fact: f.replace(/\\[REMEMBER: (.+)\\]/, '$1') }); } catch(e) {} }\n`;
    postamble += `${innerPad}}\n`;
  }

  // 6. RAG: knows about: Table1, 'https://url', 'file.pdf' — keyword search before _askAI
  if (node.knowsAbout && node.knowsAbout.length > 0 && ctx.lang !== 'python') {
    // Normalize: old format (plain strings) and new format ({ type, value } objects)
    const sources = node.knowsAbout.map(src =>
      typeof src === 'string' ? { type: 'table', value: src } : src
    );
    const tableSources = sources.filter(s => s.type === 'table');
    const urlSources = sources.filter(s => s.type === 'url');
    const fileSources = sources.filter(s => s.type === 'file');
    preamble += `${innerPad}const _query = (typeof ${param} === 'string' ? ${param} : JSON.stringify(${param})).toLowerCase().split(/\\s+/);\n`;
    preamble += `${innerPad}const _ragContext = [];\n`;
    // Table sources — query DB per request
    for (const src of tableSources) {
      preamble += `${innerPad}{ const _recs = db.findAll ? await db.findAll('${src.value}', {}) : [];\n`;
      preamble += `${innerPad}  for (const _rec of _recs) { const _text = Object.values(_rec).join(' ').toLowerCase(); const _score = _query.filter(w => _text.includes(w)).length; if (_score > 0) _ragContext.push({ source: '${src.value}', data: _rec, score: _score }); } }\n`;
    }
    // URL sources — search against cached page text
    for (const src of urlSources) {
      preamble += `${innerPad}_ragContext.push(..._searchText(_knowledge_url_${urlSources.indexOf(src)}, _query, '${src.value}'));\n`;
    }
    // File sources — search against cached file text
    for (const src of fileSources) {
      preamble += `${innerPad}_ragContext.push(..._searchText(_knowledge_file_${fileSources.indexOf(src)}, _query, '${src.value}'));\n`;
    }
    preamble += `${innerPad}_ragContext.sort((a, b) => b.score - a.score);\n`;
    preamble += `${innerPad}const _ragStr = _ragContext.slice(0, 5).length ? '\\n\\nRelevant context:\\n' + _ragContext.slice(0, 5).map(r => JSON.stringify(r.data)).join('\\n') : '';\n`;
    // Inject RAG context into prompts
    bodyCode = bodyCode.replace(
      /await (_askAI(?:WithTools|Stream)?)\("([^"]*)",/g,
      (m, fn, prompt) => `await ${fn}("${prompt}" + _ragStr,`
    );
    bodyCode = bodyCode.replace(
      /await (_askAI(?:WithTools|Stream)?)\(([a-zA-Z_]\w+),/g,
      (m, fn, varName) => `await ${fn}(${varName} + _ragStr,`
    );
    // Also handle _askAIStream (no await prefix for generators)
    bodyCode = bodyCode.replace(
      /(_askAIStream)\("([^"]*)",/g,
      (m, fn, prompt) => `${fn}("${prompt}" + _ragStr,`
    );
    bodyCode = bodyCode.replace(
      /(_askAIStream)\(([a-zA-Z_]\w+),/g,
      (m, fn, varName) => `${fn}(${varName} + _ragStr,`
    );
  }

  // Inject postamble BEFORE the last return — otherwise it's dead code
  if (postamble) {
    const lastReturn = bodyCode.lastIndexOf('return ');
    if (lastReturn !== -1) {
      bodyCode = bodyCode.slice(0, lastReturn) + postamble + '\n' + bodyCode.slice(lastReturn);
      postamble = ''; // already injected
    }
  }

  // Final assembly — add _userId param for conversation/memory agents
  const genStar = shouldStream && ctx.lang !== 'python' ? '*' : '';
  const finalParam = (node.rememberConversation || node.rememberPreferences)
    ? (param ? `${param}, _userId` : '_userId')
    : param;
  if (ctx.lang === 'python') {
    return `${startupCode}${pad}async def ${fnName}(${finalParam}):\n${preamble}${bodyCode}${postamble ? '\n' + postamble : ''}`;
  }
  return `${startupCode}${pad}async function${genStar} ${fnName}(${finalParam}) {\n${preamble}${bodyCode}${postamble ? '\n' + postamble : ''}\n${pad}}`;
}

// Workflow compiler — Phases 85-90
// Compiles workflow 'Name' with state: blocks into async functions with
// state threading, conditional routing, repeat-until cycles, parallel branches,
// durable execution (DB checkpoint or Temporal), and observability.
function compileWorkflow(node, ctx, pad) {
  const fnName = 'workflow_' + sanitizeName(node.name.toLowerCase().replace(/\s+/g, '_'));
  const innerPad = pad + '  ';
  const deepPad = innerPad + '  ';

  const stateVarName = sanitizeName(node.stateVar);

  // Build state initialization with defaults from state has:
  let stateInit = `${innerPad}let _state = Object.assign({`;
  const defaults = node.stateFields.map(f => {
    let val = 'null';
    if (f.default !== null && f.default !== undefined) {
      if (typeof f.default === 'string') val = JSON.stringify(f.default);
      else if (typeof f.default === 'boolean') val = String(f.default);
      else val = String(f.default);
    }
    return `${sanitizeName(f.name)}: ${val}`;
  });
  stateInit += defaults.join(', ') + `}, ${stateVarName});\n`;

  // Helper: rewrite state var references in expressions to _state
  function rewriteStateRef(code) {
    if (stateVarName === '_state') return code;
    // Replace stateVar?.field or stateVar.field with _state.field (JS dot notation)
    // Using `?.` optional chaining because Clear now generates ?. for possessive access
    code = code.replace(new RegExp('\\b' + stateVarName + '\\?\\.', 'g'), '_state.');
    code = code.replace(new RegExp('\\b' + stateVarName + '\\.', 'g'), '_state.');
    // Replace stateVar["field"] with _state["field"] (Python bracket notation)
    code = code.replace(new RegExp('\\b' + stateVarName + '\\[', 'g'), '_state[');
    return code;
  }

  // Observability: state history tracking (Phase 90)
  let trackCode = '';
  if (node.trackProgress) {
    stateInit += `${innerPad}const _history = [];\n`;
    trackCode = `${innerPad}_state._history = _history;\n`;
  }

  // Compile each step
  function compileStep(step, indent) {
    const p = ' '.repeat(indent);
    const agentFn = 'agent_' + sanitizeName(step.agentName.toLowerCase().replace(/\s+/g, '_'));
    let code = '';
    if (node.trackProgress) {
      code += `${p}_history.push({ step: ${JSON.stringify(step.name)}, state: JSON.parse(JSON.stringify(_state)), timestamp: new Date().toISOString() });\n`;
    }
    if (node.saveProgressTo) {
      code += `${p}await db.insert('${node.saveProgressTo}', { workflow: ${JSON.stringify(node.name)}, step: ${JSON.stringify(step.name)}, state: JSON.stringify(_state), created_at: new Date().toISOString() });\n`;
    }
    if (step.savesTo) {
      code += `${p}_state.${sanitizeName(step.savesTo)} = await ${agentFn}(_state);\n`;
    } else {
      code += `${p}_state = await ${agentFn}(_state);\n`;
    }
    return code;
  }

  function compileSteps(steps, indent) {
    const p = ' '.repeat(indent);
    let code = '';
    for (const step of steps) {
      if (step.kind === 'step') {
        code += compileStep(step, indent);
      } else if (step.kind === 'conditional') {
        const condCode = step.condition ? rewriteStateRef(exprToCode(step.condition, ctx)) : 'true';
        code += `${p}if (${condCode}) {\n`;
        code += compileSteps(step.thenSteps, indent + 2);
        if (step.elseSteps && step.elseSteps.length > 0) {
          code += `${p}} else {\n`;
          code += compileSteps(step.elseSteps, indent + 2);
        }
        code += `${p}}\n`;
      } else if (step.kind === 'repeat') {
        const condCode = step.condition ? rewriteStateRef(exprToCode(step.condition, ctx)) : 'true';
        const max = step.maxIterations || 10;
        code += `${p}for (let _iter = 0; _iter < ${max}; _iter++) {\n`;
        code += `${p}  if (${condCode}) break;\n`;
        code += compileSteps(step.steps, indent + 2);
        code += `${p}}\n`;
      } else if (step.kind === 'parallel') {
        const names = [];
        const calls = [];
        for (const ps of step.steps) {
          const agentFn = 'agent_' + sanitizeName(ps.agentName.toLowerCase().replace(/\s+/g, '_'));
          if (ps.savesTo) {
            names.push(sanitizeName(ps.savesTo));
          } else {
            names.push('_p' + names.length);
          }
          calls.push(`${agentFn}(_state)`);
        }
        if (node.trackProgress) {
          code += `${p}_history.push({ step: 'parallel', branches: ${JSON.stringify(step.steps.map(s => s.name))}, timestamp: new Date().toISOString() });\n`;
        }
        // Use unique temp names for parallel results since agents return full state
        const tempNames = step.steps.map((_, i) => `_p${i}`);
        code += `${p}const [${tempNames.join(', ')}] = await Promise.all([${calls.join(', ')}]);\n`;
        // Assign parallel results back to state — extract specific field from returned state
        for (let si = 0; si < step.steps.length; si++) {
          const ps = step.steps[si];
          if (ps.savesTo) {
            code += `${p}_state.${sanitizeName(ps.savesTo)} = ${tempNames[si]}.${sanitizeName(ps.savesTo)};\n`;
          }
        }
        // For steps without savesTo, merge last result
        const noSave = step.steps.filter(s => !s.savesTo);
        if (noSave.length > 0 && step.steps.every(s => !s.savesTo)) {
          code += `${p}_state = Object.assign(_state, ${tempNames.join(', ')});\n`;
        }
      }
    }
    return code;
  }

  let bodyCode = compileSteps(node.steps, (pad.length / 2 + 1) * 2);

  // Temporal target (Phase 88)
  if (node.runsOnTemporal) {
    let code = `${pad}// Temporal workflow: ${node.name}\n`;
    code += `${pad}import { proxyActivities } from '@temporalio/workflow';\n`;
    // Generate activity proxies from steps
    const agentNames = new Set();
    function collectAgents(steps) {
      for (const s of steps) {
        if (s.kind === 'step' && s.agentName) agentNames.add(s.agentName);
        if (s.kind === 'conditional') { collectAgents(s.thenSteps); collectAgents(s.elseSteps || []); }
        if (s.kind === 'repeat') collectAgents(s.steps);
        if (s.kind === 'parallel') collectAgents(s.steps);
      }
    }
    collectAgents(node.steps);
    const activityNames = [...agentNames].map(n => 'agent_' + sanitizeName(n.toLowerCase().replace(/\s+/g, '_')));
    code += `${pad}const { ${activityNames.join(', ')} } = proxyActivities({ startToCloseTimeout: '5m' });\n\n`;
    code += `${pad}export async function ${fnName}(${sanitizeName(node.stateVar)}) {\n`;
    code += stateInit;
    code += bodyCode;
    code += trackCode;
    code += `${innerPad}return _state;\n`;
    code += `${pad}}`;
    return code;
  }

  // Python workflow
  if (ctx.lang === 'python') {
    const pyPad = pad;
    const pyInner = pad + '    ';

    // State initialization (Python dict — keys must be quoted strings)
    const pyDefaults = node.stateFields.map(f => {
      let val = 'None';
      if (f.default !== null && f.default !== undefined) {
        if (typeof f.default === 'string') val = JSON.stringify(f.default);
        else if (typeof f.default === 'boolean') val = f.default ? 'True' : 'False';
        else val = String(f.default);
      }
      return `"${sanitizeName(f.name)}": ${val}`;
    });
    let pyStateInit = `${pyInner}_state = {${pyDefaults.join(', ')}}\n`;
    pyStateInit += `${pyInner}_state.update(${stateVarName})\n`;

    if (node.trackProgress) {
      pyStateInit += `${pyInner}_history = []\n`;
    }

    function pyCompileStep(step, indent) {
      const p = ' '.repeat(indent);
      const agentFn = 'agent_' + sanitizeName(step.agentName.toLowerCase().replace(/\s+/g, '_'));
      let code = '';
      if (node.trackProgress) {
        code += `${p}_history.append({"step": ${JSON.stringify(step.name)}, "state": dict(_state), "timestamp": datetime.datetime.now().isoformat()})\n`;
      }
      if (node.saveProgressTo) {
        code += `${p}db.save("${node.saveProgressTo.toLowerCase()}", {"workflow": ${JSON.stringify(node.name)}, "step": ${JSON.stringify(step.name)}, "state": json.dumps(_state), "created_at": datetime.datetime.now().isoformat()})\n`;
      }
      if (step.savesTo) {
        code += `${p}_state["${sanitizeName(step.savesTo)}"] = (await ${agentFn}(_state))["${sanitizeName(step.savesTo)}"]\n`;
      } else {
        code += `${p}_state = await ${agentFn}(_state)\n`;
      }
      return code;
    }

    function pyCompileSteps(steps, indent) {
      const p = ' '.repeat(indent);
      let code = '';
      for (const step of steps) {
        if (step.kind === 'step') {
          code += pyCompileStep(step, indent);
        } else if (step.kind === 'conditional') {
          const condCode = step.condition ? rewriteStateRef(exprToCode(step.condition, ctx)) : 'True';
          // Convert JS comparisons to Python
          const pyCond = condCode.replace(/ == /g, ' == ').replace(/\bnull\b/g, 'None');
          code += `${p}if ${pyCond}:\n`;
          code += pyCompileSteps(step.thenSteps, indent + 4);
          if (step.elseSteps && step.elseSteps.length > 0) {
            code += `${p}else:\n`;
            code += pyCompileSteps(step.elseSteps, indent + 4);
          }
        } else if (step.kind === 'repeat') {
          const condCode = step.condition ? rewriteStateRef(exprToCode(step.condition, ctx)) : 'True';
          const pyCond = condCode.replace(/\bnull\b/g, 'None');
          const max = step.maxIterations || 10;
          code += `${p}for _iter in range(${max}):\n`;
          code += `${p}    if ${pyCond}:\n`;
          code += `${p}        break\n`;
          code += pyCompileSteps(step.steps, indent + 4);
        } else if (step.kind === 'parallel') {
          const tempNames = step.steps.map((_, i) => `_p${i}`);
          const calls = step.steps.map(ps => {
            const agentFn = 'agent_' + sanitizeName(ps.agentName.toLowerCase().replace(/\s+/g, '_'));
            return `${agentFn}(_state)`;
          });
          if (node.trackProgress) {
            code += `${p}_history.append({"step": "parallel", "branches": ${JSON.stringify(step.steps.map(s => s.name))}, "timestamp": datetime.datetime.now().isoformat()})\n`;
          }
          code += `${p}${tempNames.join(', ')} = await asyncio.gather(${calls.join(', ')})\n`;
          for (let si = 0; si < step.steps.length; si++) {
            const ps = step.steps[si];
            if (ps.savesTo) {
              code += `${p}_state["${sanitizeName(ps.savesTo)}"] = ${tempNames[si]}.get("${sanitizeName(ps.savesTo)}")\n`;
            }
          }
          const noSave = step.steps.filter(s => !s.savesTo);
          if (noSave.length > 0 && step.steps.every(s => !s.savesTo)) {
            code += `${p}_state.update(${tempNames[tempNames.length - 1]})\n`;
          }
        }
      }
      return code;
    }

    let pyBody = pyCompileSteps(node.steps, pad.length + 4);

    let pyTrack = '';
    if (node.trackProgress) {
      pyTrack = `${pyInner}_state["_history"] = _history\n`;
    }

    let code = `${pyPad}async def ${fnName}(${stateVarName}):\n`;
    code += pyStateInit;
    code += pyBody;
    code += pyTrack;
    code += `${pyInner}return _state\n`;

    // T1 #5 fix: Auto-generate endpoint for Python workflow
    const pySlug = sanitizeName(node.name.toLowerCase().replace(/\s+/g, '-'));
    if (ctx.mode === 'backend') {
      code += `\n${pyPad}# Auto-generated endpoint for workflow '${node.name}'\n`;
      code += `${pyPad}@app.post("/api/run-${pySlug}")\n`;
      code += `${pyPad}async def run_${sanitizeName(node.name.toLowerCase().replace(/\s+/g, '_'))}(request: Request):\n`;
      code += `${pyInner}data = await request.json()\n`;
      code += `${pyInner}result = await ${fnName}(data)\n`;
      code += `${pyInner}return JSONResponse(result)\n`;
    }

    // T1 #7 fix: Generate stub agents for Python
    const pyReferencedAgents = new Set();
    function pyCollectAgentRefs(steps) {
      for (const s of steps) {
        if (s.kind === 'step' && s.agentName) pyReferencedAgents.add(s.agentName);
        if (s.kind === 'conditional') { pyCollectAgentRefs(s.thenSteps); pyCollectAgentRefs(s.elseSteps || []); }
        if (s.kind === 'repeat') pyCollectAgentRefs(s.steps);
        if (s.kind === 'parallel') pyCollectAgentRefs(s.steps);
      }
    }
    pyCollectAgentRefs(node.steps);

    const pyDefinedAgents = new Set();
    if (ctx._allNodes) {
      for (const n of ctx._allNodes) {
        if (n.type === NodeType.AGENT && n.name) {
          pyDefinedAgents.add(n.name.toLowerCase().replace(/\s+/g, '_'));
        }
      }
    }

    for (const agentName of pyReferencedAgents) {
      const agentFnName = 'agent_' + sanitizeName(agentName.toLowerCase().replace(/\s+/g, '_'));
      const agentKey = agentName.toLowerCase().replace(/\s+/g, '_');
      if (!pyDefinedAgents.has(agentKey)) {
        code += `\n${pyPad}# Stub agent '${agentName}' — referenced by workflow but not defined\n`;
        code += `${pyPad}# TODO: Define 'agent ${agentName}' in your Clear code to replace this stub\n`;
        code += `${pyPad}async def ${agentFnName}(state):\n`;
        code += `${pyInner}return state\n`;
      }
    }

    return code;
  }

  // Standard workflow (non-Temporal, JavaScript)
  let code = `${pad}async function ${fnName}(${sanitizeName(node.stateVar)}) {\n`;
  code += stateInit;
  code += bodyCode;
  code += trackCode;
  code += `${innerPad}return _state;\n`;
  code += `${pad}}\n`;

  // T1 #5 fix: Auto-generate endpoint to trigger the workflow
  const slug = sanitizeName(node.name.toLowerCase().replace(/\s+/g, '-'));
  if (ctx.mode === 'backend') {
    code += `\n${pad}// Auto-generated endpoint for workflow '${node.name}'\n`;
    code += `${pad}app.post('/api/run-${slug}', async (req, res) => {\n`;
    code += `${innerPad}try {\n`;
    code += `${innerPad}  const result = await ${fnName}(req.body || {});\n`;
    code += `${innerPad}  res.json(result);\n`;
    code += `${innerPad}} catch (err) {\n`;
    code += `${innerPad}  res.status(500).json({ error: err.message });\n`;
    code += `${innerPad}}\n`;
    code += `${pad}});`;
  }

  // T1 #7 fix: Generate stub functions for any agents referenced in workflow steps
  // that aren't defined elsewhere in the program
  const referencedAgents = new Set();
  function collectAgentRefs(steps) {
    for (const s of steps) {
      if (s.kind === 'step' && s.agentName) referencedAgents.add(s.agentName);
      if (s.kind === 'conditional') { collectAgentRefs(s.thenSteps); collectAgentRefs(s.elseSteps || []); }
      if (s.kind === 'repeat') collectAgentRefs(s.steps);
      if (s.kind === 'parallel') collectAgentRefs(s.steps);
    }
  }
  collectAgentRefs(node.steps);

  // Check which agents are already defined in the program
  const definedAgents = new Set();
  if (ctx._allNodes) {
    for (const n of ctx._allNodes) {
      if (n.type === NodeType.AGENT && n.name) {
        definedAgents.add(n.name.toLowerCase().replace(/\s+/g, '_'));
      }
    }
  }

  for (const agentName of referencedAgents) {
    const agentFnName = 'agent_' + sanitizeName(agentName.toLowerCase().replace(/\s+/g, '_'));
    const agentKey = agentName.toLowerCase().replace(/\s+/g, '_');
    if (!definedAgents.has(agentKey)) {
      code += `\n\n${pad}// Stub agent '${agentName}' — referenced by workflow but not defined\n`;
      code += `${pad}// TODO: Define 'agent ${agentName}' in your Clear code to replace this stub\n`;
      code += `${pad}async function ${agentFnName}(state) { return state; }`;
    }
  }

  return code;
}

// Policy compiler — generates runtime guard middleware from Enact-style policy rules
function compilePolicy(node, ctx, pad) {
  if (ctx.lang === 'python') return compilePolicyPython(node, ctx, pad);

  let code = `${pad}// === POLICY GUARDS (Enact) ===\n`;

  for (const rule of node.rules) {
    switch (rule.kind) {
      // Database Safety
      case 'block_ddl':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'block_ddl', check: (op, table, data) => { if (['drop', 'truncate', 'alter', 'create'].some(w => (op || '').toLowerCase().includes(w))) throw Object.assign(new Error('Policy violation: schema changes (DDL) are blocked by policy'), { status: 403 }); } });\n`;
        break;
      case 'dont_delete_row':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_delete_row', check: (op) => { if (op === 'remove') throw Object.assign(new Error('Policy violation: all row deletions are blocked by policy'), { status: 403 }); } });\n`;
        break;
      case 'dont_delete_without_where':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_delete_without_where', check: (op, table, data, filter) => { if (op === 'remove' && (!filter || Object.keys(filter).length === 0)) throw Object.assign(new Error('Policy violation: DELETE without a filter is blocked — would delete all rows in ' + table), { status: 403 }); } });\n`;
        break;
      case 'dont_update_without_where':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_update_without_where', check: (op, table, data, filter) => { if (op === 'update' && (!filter || Object.keys(filter).length === 0)) throw Object.assign(new Error('Policy violation: UPDATE without a filter is blocked — would overwrite all rows in ' + table), { status: 403 }); } });\n`;
        break;
      case 'protect_tables': {
        const tables = JSON.stringify(rule.tables.map(t => t.toLowerCase()));
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'protect_tables', check: (op, table) => { if (${tables}.includes((table || '').toLowerCase())) throw Object.assign(new Error('Policy violation: table ' + table + ' is protected by policy'), { status: 403 }); } });\n`;
        break;
      }

      // Code Freeze
      case 'code_freeze_active':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'code_freeze_active', check: () => { if (process.env.ENACT_FREEZE === '1') throw Object.assign(new Error('Policy violation: code freeze is active (ENACT_FREEZE=1)'), { status: 503 }); } });\n`;
        break;
      case 'maintenance_window':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'maintenance_window', check: () => { const h = new Date().getUTCHours(); const m = new Date().getUTCMinutes(); const now = h * 60 + m; const start = ${parseInt(rule.start)} * 60; const end = ${parseInt(rule.end)} * 60; const inWindow = start <= end ? (now >= start && now < end) : (now >= start || now < end); if (!inWindow) throw Object.assign(new Error('Policy violation: outside maintenance window (${rule.start}-${rule.end} UTC)'), { status: 503 }); } });\n`;
        break;

      // Prompt Injection
      case 'block_prompt_injection': {
        const fieldsCheck = rule.fields ? `const _fields = ${JSON.stringify(rule.fields)}; const _vals = _fields.map(f => data?.[f]).filter(Boolean);` : `const _vals = typeof data === 'string' ? [data] : Object.values(data || {}).filter(v => typeof v === 'string');`;
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'block_prompt_injection', check: (op, table, data) => { ${fieldsCheck} const _patterns = [/ignore.*(?:previous|above|prior).*instructions/i, /you are now/i, /system:\\s/i, /\\[INST\\]/i, /<<<.*>>>/i, /forget.*(?:rules|instructions|guidelines)/i, /pretend you/i, /act as (?:a |an )?(?:different|new)/i]; for (const v of _vals) { for (const p of _patterns) { if (p.test(v)) throw Object.assign(new Error('Policy violation: prompt injection detected in input'), { status: 400 }); } } } });\n`;
        break;
      }

      // Access Control
      case 'dont_read_sensitive_tables': {
        const tables = JSON.stringify(rule.tables.map(t => t.toLowerCase()));
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_read_sensitive_tables', check: (op, table) => { if (op === 'read' && ${tables}.includes((table || '').toLowerCase())) throw Object.assign(new Error('Policy violation: reading from ' + table + ' is blocked by policy'), { status: 403 }); } });\n`;
        break;
      }
      case 'require_role': {
        const roles = JSON.stringify(rule.roles);
        code += `${pad}// Policy: require_role — checked in endpoint middleware\n`;
        code += `${pad}app.use((req, res, next) => { if (req.path.startsWith('/api/')) { const role = req.user?.role || req.body?.actor_role; if (!role || !${roles}.includes(role)) return res.status(403).json({ error: 'Policy violation: requires role ' + ${roles}.join(' or ') }); } next(); });\n`;
        break;
      }

      // Email
      case 'no_mass_emails':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'no_mass_emails', check: (op, table, data) => { if (op === 'send_email' && data?.to && (Array.isArray(data.to) ? data.to.length > 1 : data.to.includes(','))) throw Object.assign(new Error('Policy violation: mass emails (>1 recipient) are blocked by policy'), { status: 403 }); } });\n`;
        break;
      case 'no_repeat_emails':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'no_repeat_emails', check: (op, table, data) => { if (op === 'send_email') { /* Requires DB lookup — guard registered, enforcement in email adapter */ } } });\n`;
        break;

      // Filesystem
      case 'dont_delete_file':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_delete_file', check: (op) => { if (op === 'delete_file') throw Object.assign(new Error('Policy violation: file deletions are blocked by policy'), { status: 403 }); } });\n`;
        break;
      case 'restrict_paths': {
        const paths = JSON.stringify(rule.paths);
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'restrict_paths', check: (op, table, data) => { const p = data?.path || data?.file || ''; if (p && !${paths}.some(allowed => p.startsWith(allowed))) throw Object.assign(new Error('Policy violation: path ' + p + ' is outside allowed directories'), { status: 403 }); } });\n`;
        break;
      }
      case 'block_extensions': {
        const exts = JSON.stringify(rule.extensions);
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'block_extensions', check: (op, table, data) => { const p = data?.path || data?.file || ''; if (p && ${exts}.some(ext => p.endsWith(ext))) throw Object.assign(new Error('Policy violation: operations on ' + p.split('.').pop() + ' files are blocked by policy'), { status: 403 }); } });\n`;
        break;
      }
      case 'dont_read_sensitive_paths': {
        const paths = JSON.stringify(rule.paths);
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_read_sensitive_paths', check: (op, table, data) => { const p = data?.path || data?.file || ''; if (op === 'read_file' && ${paths}.some(sp => p.startsWith(sp))) throw Object.assign(new Error('Policy violation: reading from sensitive path ' + p + ' is blocked'), { status: 403 }); } });\n`;
        break;
      }

      // CRM
      case 'dont_duplicate_contacts':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'dont_duplicate_contacts', check: (op, table, data) => { if (op === 'insert' && table?.toLowerCase().includes('contact') && data?.email) { const existing = db.findOne(table, { email: data.email }); if (existing) throw Object.assign(new Error('Policy violation: contact with email ' + data.email + ' already exists'), { status: 409 }); } } });\n`;
        break;

      // Slack
      case 'require_channel_allowlist': {
        const channels = JSON.stringify(rule.channels);
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'require_channel_allowlist', check: (op, table, data) => { if (op === 'send_slack' && data?.channel && !${channels}.includes(data.channel)) throw Object.assign(new Error('Policy violation: channel ' + data.channel + ' is not in the allow list'), { status: 403 }); } });\n`;
        break;
      }
      case 'block_dms':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'block_dms', check: (op, table, data) => { if (op === 'send_slack' && data?.channel && (data.channel.startsWith('D') || data.channel.startsWith('U'))) throw Object.assign(new Error('Policy violation: direct messages are blocked by policy'), { status: 403 }); } });\n`;
        break;

      // Cloud Storage
      case 'require_human_approval_for_delete':
        code += `${pad}db._guards = db._guards || [];\n`;
        code += `${pad}db._guards.push({ type: 'require_human_approval_for_delete', check: (op, table, data) => { if (op === 'delete_file' || op === 'remove') { /* Requires HITL receipt verification — guard registered */ } } });\n`;
        break;

      // Custom
      case 'custom':
        code += `${pad}// Custom policy: ${rule.text}\n`;
        break;
    }
  }

  // Hook guards into db operations
  if (node.rules.some(r => r.kind.startsWith('dont_') || r.kind.startsWith('block_') || r.kind === 'protect_tables' || r.kind === 'code_freeze_active' || r.kind === 'maintenance_window')) {
    code += `${pad}// Wire policy guards into db operations\n`;
    code += `${pad}const _origInsert = db.insert.bind(db);\n`;
    code += `${pad}const _origUpdate = db.update.bind(db);\n`;
    code += `${pad}const _origRemove = db.remove.bind(db);\n`;
    code += `${pad}db.insert = function(table, record) { (db._guards || []).forEach(g => g.check('insert', table, record)); return _origInsert(table, record); };\n`;
    code += `${pad}db.update = function(table, filter, data) { (db._guards || []).forEach(g => g.check('update', table, data || filter, filter)); return _origUpdate(table, filter, data); };\n`;
    code += `${pad}db.remove = function(table, filter) { (db._guards || []).forEach(g => g.check('remove', table, null, filter)); return _origRemove(table, filter); };\n`;
  }

  return code;
}

function compilePolicyPython(node, ctx, pad) {
  let code = `${pad}# === POLICY GUARDS (Enact) ===\n`;
  code += `${pad}_policy_guards = []\n`;

  for (const rule of node.rules) {
    switch (rule.kind) {
      case 'block_ddl':
        code += `${pad}_policy_guards.append({"type": "block_ddl", "check": lambda op, table=None, data=None, **kw: (_ for _ in ()).throw(Exception("Policy: DDL blocked")) if op in ("drop","truncate","alter","create") else None})\n`;
        break;
      case 'dont_delete_row':
        code += `${pad}_policy_guards.append({"type": "dont_delete_row"})\n`;
        break;
      case 'dont_delete_without_where':
        code += `${pad}_policy_guards.append({"type": "dont_delete_without_where"})\n`;
        break;
      case 'protect_tables': {
        const tables = JSON.stringify(rule.tables.map(t => t.toLowerCase()));
        code += `${pad}_policy_guards.append({"type": "protect_tables", "tables": ${tables}})\n`;
        break;
      }
      case 'block_prompt_injection':
        code += `${pad}_policy_guards.append({"type": "block_prompt_injection"})\n`;
        break;
      case 'no_mass_emails':
        code += `${pad}_policy_guards.append({"type": "no_mass_emails"})\n`;
        break;
      default:
        code += `${pad}_policy_guards.append({"type": "${rule.kind}"})\n`;
    }
  }
  return code;
}

function compileAuthScaffoldPython(pad) {
  const lines = [];
  lines.push(`${pad}from passlib.hash import bcrypt as _bcrypt`);
  lines.push(`${pad}import jwt as _pyjwt`);
  lines.push(`${pad}import os, secrets`);
  lines.push(`${pad}_JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))`);
  lines.push(`${pad}_users = []`);
  lines.push('');
  lines.push(`${pad}@app.post("/auth/signup")`);
  lines.push(`${pad}async def _auth_signup(request: Request):`);
  lines.push(`${pad}    incoming = await request.json()`);
  lines.push(`${pad}    email = incoming.get("email")`);
  lines.push(`${pad}    password = incoming.get("password")`);
  lines.push(`${pad}    if not email or not password:`);
  lines.push(`${pad}        raise HTTPException(status_code=400, detail="Email and password are required")`);
  lines.push(`${pad}    if any(u["email"] == email for u in _users):`);
  lines.push(`${pad}        raise HTTPException(status_code=400, detail="Email already registered")`);
  lines.push(`${pad}    password_hash = _bcrypt.hash(password)`);
  lines.push(`${pad}    user = {"id": len(_users) + 1, "email": email, "password_hash": password_hash, "role": "user"}`);
  lines.push(`${pad}    _users.append(user)`);
  lines.push(`${pad}    token = _pyjwt.encode({"id": user["id"], "email": email, "role": "user"}, _JWT_SECRET, algorithm="HS256")`);
  lines.push(`${pad}    return {"token": token, "user": {"id": user["id"], "email": email, "role": "user"}}`);
  lines.push('');
  lines.push(`${pad}@app.post("/auth/login")`);
  lines.push(`${pad}async def _auth_login(request: Request):`);
  lines.push(`${pad}    incoming = await request.json()`);
  lines.push(`${pad}    email = incoming.get("email")`);
  lines.push(`${pad}    password = incoming.get("password")`);
  lines.push(`${pad}    if not email or not password:`);
  lines.push(`${pad}        raise HTTPException(status_code=400, detail="Email and password are required")`);
  lines.push(`${pad}    user = next((u for u in _users if u["email"] == email), None)`);
  lines.push(`${pad}    if not user or not _bcrypt.verify(password, user["password_hash"]):`);
  lines.push(`${pad}        raise HTTPException(status_code=401, detail="Invalid email or password")`);
  lines.push(`${pad}    token = _pyjwt.encode({"id": user["id"], "email": email, "role": user["role"]}, _JWT_SECRET, algorithm="HS256")`);
  lines.push(`${pad}    return {"token": token, "user": {"id": user["id"], "email": email, "role": user["role"]}}`);
  lines.push('');
  lines.push(`${pad}@app.get("/auth/me")`);
  lines.push(`${pad}async def _auth_me(request: Request):`);
  lines.push(`${pad}    auth_header = request.headers.get("authorization", "")`);
  lines.push(`${pad}    if not auth_header.startswith("Bearer "):`);
  lines.push(`${pad}        raise HTTPException(status_code=401, detail="Not authenticated")`);
  lines.push(`${pad}    try:`);
  lines.push(`${pad}        payload = _pyjwt.decode(auth_header[7:], _JWT_SECRET, algorithms=["HS256"])`);
  lines.push(`${pad}        user = next((u for u in _users if u["id"] == payload["id"]), None)`);
  lines.push(`${pad}        if not user: raise HTTPException(status_code=404, detail="User not found")`);
  lines.push(`${pad}        return {"id": user["id"], "email": user["email"], "role": user["role"]}`);
  lines.push(`${pad}    except _pyjwt.PyJWTError:`);
  lines.push(`${pad}        raise HTTPException(status_code=401, detail="Invalid or expired token")`);
  return lines.join('\n');
}

function compileValidate(node, ctx, pad) {
  if (ctx.lang === 'python') {
    const lines = [`${pad}_errors = []`];
    for (const rule of node.rules) {
      const f = rule.name;
      const acc = `incoming.get("${f}")`;
      if (rule.constraints.required)
        lines.push(`${pad}if ${acc} is None and ${acc} != 0 and ${acc} is not False:\n${pad}    _errors.append({"field": "${f}", "message": "${f} is required"})`);
      if (rule.fieldType === 'number')
        lines.push(`${pad}if ${acc} is not None and not isinstance(${acc}, (int, float)):\n${pad}    _errors.append({"field": "${f}", "message": f"${f} must be a number, got {type(${acc}).__name__}"})`);
      if (rule.fieldType === 'boolean')
        lines.push(`${pad}if ${acc} is not None and not isinstance(${acc}, bool):\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be true or false"})`);
      if (rule.constraints.min !== undefined) {
        const charWord = rule.constraints.min === 1 ? 'character' : 'characters';
        if (rule.fieldType === 'text')
          lines.push(`${pad}if ${acc} and len(str(${acc})) < ${rule.constraints.min}:\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be at least ${rule.constraints.min} ${charWord}"})`);
        else
          lines.push(`${pad}if ${acc} is not None and ${acc} < ${rule.constraints.min}:\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be at least ${rule.constraints.min}"})`);
      }
      if (rule.constraints.max !== undefined) {
        const charWord = rule.constraints.max === 1 ? 'character' : 'characters';
        if (rule.fieldType === 'text')
          lines.push(`${pad}if ${acc} and len(str(${acc})) > ${rule.constraints.max}:\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be at most ${rule.constraints.max} ${charWord}"})`);
        else
          lines.push(`${pad}if ${acc} is not None and ${acc} > ${rule.constraints.max}:\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be at most ${rule.constraints.max}"})`);
      }
      if (rule.constraints.matches === 'email')
        lines.push(`${pad}import re\n${pad}if ${acc} and not re.match(r"[^@]+@[^@]+\\.[^@]+", str(${acc})):\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be a valid email"})`);
      if (rule.constraints.matches === 'time')
        lines.push(`${pad}import re\n${pad}if ${acc} and not re.match(r"^([01]\\d|2[0-3]):[0-5]\\d$", str(${acc})):\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be a valid time (HH:MM)"})`);
      if (rule.constraints.matches === 'phone')
        lines.push(`${pad}import re\n${pad}if ${acc} and not re.match(r"^[\\+]?[\\d\\s\\-\\.\\(\\)]{7,15}$", str(${acc})):\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be a valid phone number"})`);
      if (rule.constraints.matches === 'url')
        lines.push(`${pad}import re\n${pad}if ${acc} and not re.match(r"^https?://.+", str(${acc})):\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be a valid URL"})`);
      if (rule.constraints.oneOf) {
        const opts = rule.constraints.oneOf.map(o => `"${o}"`).join(', ');
        lines.push(`${pad}if ${acc} not in [${opts}]:\n${pad}    _errors.append({"field": "${f}", "message": "${f} must be one of: ${rule.constraints.oneOf.join(', ')}"})`);
      }
    }
    lines.push(`${pad}if _errors:\n${pad}    raise HTTPException(status_code=400, detail=_errors)`);
    return lines.join('\n');
  }
  // JS: generate a _validate helper call with rules array
  const rules = node.rules.map(rule => {
    const r = { field: rule.name };
    if (rule.fieldType) r.type = rule.fieldType;
    if (rule.constraints.required) r.required = true;
    if (rule.constraints.min !== undefined) r.min = rule.constraints.min;
    if (rule.constraints.max !== undefined) r.max = rule.constraints.max;
    if (rule.constraints.matches) r.matches = rule.constraints.matches;
    if (rule.constraints.oneOf) r.oneOf = rule.constraints.oneOf;
    return JSON.stringify(r);
  });
  return `${pad}const _vErrs = _validate(req.body, [${rules.join(', ')}]);\n${pad}if (_vErrs) return res.status(400).json({ errors: _vErrs });`;
}

function compileDataShape(node, ctx, pad) {
  if (ctx.lang === 'python') {
    // Supabase: tables managed in dashboard, emit comment only
    if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
      const tableName = pluralizeName(node.name);
      return `${pad}# Data shape: ${node.name} (table '${tableName}' must exist in Supabase dashboard)`;
    }
    const sqlTypes = { text: 'TEXT', number: 'INTEGER', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP', fk: 'INTEGER' };
    const cols = node.fields.map(f => {
      let col = `${f.name} ${sqlTypes[f.fieldType] || 'TEXT'}`;
      if (f.required) col += ' NOT NULL';
      if (f.unique) col += ' UNIQUE';
      if (f.defaultValue !== null && f.defaultValue !== undefined) col += ` DEFAULT '${f.defaultValue}'`;
      if (f.auto && f.fieldType === 'timestamp') col += ' DEFAULT NOW()';
      if (f.fk) col += ` REFERENCES ${f.fk.toLowerCase()}s(id)`;
      return col;
    }).join(', ');
    const tableName = pluralizeName(node.name);
    let uniqueConstraints = '';
    if (node.compoundUniques) {
      uniqueConstraints = node.compoundUniques.map(fields => `, UNIQUE(${fields.join(', ')})`).join('');
    }
    let result = `${pad}# Data shape: ${node.name}\n${pad}db.execute("CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, ${cols}${uniqueConstraints})")`;
    if (node.policies && node.policies.length > 0) {
      result += `\n${pad}db.execute("ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY")`;
      for (const policy of node.policies) {
        result += `\n${pad}db.execute("${compileRLSPolicy(policy, tableName)}")`;
      }
    }
    return result;
  }
  const fields = node.fields.map(f => {
    const props = [`type: "${f.fieldType}"`];
    if (f.required) props.push('required: true');
    if (f.unique) props.push('unique: true');
    if (f.defaultValue !== null && f.defaultValue !== undefined) props.push(`default: ${JSON.stringify(f.defaultValue)}`);
    if (f.auto) props.push('auto: true');
    if (f.fk) props.push(`ref: "${f.fk}"`);
    if (f.hidden) props.push('hidden: true');
    return `  ${sanitizeName(f.name)}: { ${props.join(', ')} }`;
  }).join(',\n');
  const tableName = pluralizeName(node.name);
  let result = `${pad}// Data shape: ${node.name}\n${pad}const ${node.name}Schema = {\n${fields}\n${pad}};`;
  if (ctx.mode === 'backend' && !(ctx.dbBackend && ctx.dbBackend.includes('supabase'))) {
    result += `\n${pad}db.createTable('${tableName}', ${node.name}Schema);`;
  } else if (ctx.mode === 'backend' && ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
    result += `\n${pad}// Table '${tableName}' must exist in Supabase dashboard`;
  }
  return result;
}

function compileExternalFetch(node, ctx, pad) {
  const timeoutMs = node.config.timeout
    ? node.config.timeout.value * (node.config.timeout.unit === 'minutes' ? 60000 : 1000)
    : 10000;

  if (ctx.lang === 'python') {
    let code = `${pad}# Fetch: ${node.url}\n`;
    code += `${pad}try:\n`;
    code += `${pad}    async with httpx.AsyncClient(timeout=${timeoutMs / 1000}) as _client:\n`;
    code += `${pad}        _response = await _client.get("${node.url}")\n`;
    code += `${pad}        _fetched_data = _response.json()\n`;
    if (node.config.errorFallback) {
      code += `${pad}except Exception:\n`;
      code += `${pad}    _fetched_data = ${exprToCode(node.config.errorFallback, ctx)}`;
    } else {
      code += `${pad}except Exception as _err:\n`;
      code += `${pad}    raise HTTPException(status_code=502, detail=f"External fetch failed: {_err}")`;
    }
    return code;
  }

  let code = `${pad}// Fetch: ${node.url}\n`;
  code += `${pad}let _fetched_data;\n`;
  code += `${pad}try {\n`;
  code += `${pad}  const _controller = new AbortController();\n`;
  code += `${pad}  const _timeout = setTimeout(() => _controller.abort(), ${timeoutMs});\n`;
  code += `${pad}  const _response = await fetch('${node.url}', { signal: _controller.signal });\n`;
  code += `${pad}  clearTimeout(_timeout);\n`;
  code += `${pad}  _fetched_data = await _response.json();\n`;
  if (node.config.errorFallback) {
    code += `${pad}} catch (_err) {\n`;
    code += `${pad}  _fetched_data = ${exprToCode(node.config.errorFallback, ctx)};\n`;
  } else {
    code += `${pad}} catch (_err) {\n`;
    code += `${pad}  const _fetchErr = new Error(\`External API call failed: \${_err.message}\`); _fetchErr._clearCtx = { service: 'external', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: 'call api ${node.url}' }; throw _fetchErr;\n`;
  }
  code += `${pad}}`;
  return code;
}

function compileWebhook(node, ctx, pad) {
  if (ctx.lang === 'python') {
    const handlerName = `webhook_${sanitizeName(node.path.replace(/[/:]/g, '_'))}`;
    const bodyCode = compileBody(node.body, ctx);
    let code = `${pad}@app.post("${node.path}")\n${pad}async def ${handlerName}(request: Request):\n`;
    code += `${pad}    incoming = await request.json()\n`;
    if (node.secret) {
      const secretCode = exprToCode(node.secret, ctx);
      code += `${pad}    import hmac, hashlib\n`;
      code += `${pad}    signature = request.headers.get("stripe-signature", "")\n`;
      code += `${pad}    expected = hmac.new(${secretCode}.encode(), await request.body(), hashlib.sha256).hexdigest()\n`;
      code += `${pad}    if not hmac.compare_digest(signature, expected):\n`;
      code += `${pad}        raise HTTPException(status_code=401, detail="Invalid signature")\n`;
    }
    code += bodyCode;
    return code;
  }

  const epDeclared = new Set();
  const bodyCode = compileBody(node.body, ctx, { declared: epDeclared });
  let code = `${pad}app.post('${node.path}', async (req, res) => {\n`;
  code += `${pad}  const incoming = req.body;\n`;
  if (node.secret) {
    const secretCode = exprToCode(node.secret, ctx);
    code += `${pad}  const crypto = require('crypto');\n`;
    code += `${pad}  const signature = req.headers['stripe-signature'] || '';\n`;
    code += `${pad}  const expected = crypto.createHmac('sha256', ${secretCode}).update(JSON.stringify(req.body)).digest('hex');\n`;
    code += `${pad}  if (signature !== expected) { return res.status(401).json({ error: "Invalid signature" }); }\n`;
  }
  code += bodyCode;
  code += `\n${pad}});`;
  return code;
}

function compilePdf(node, ctx, pad) {
  const pathCode = exprToCode(node.path, ctx);
  const elements = (node.content || []).map(child => {
    if (!child) return null;
    if (child.type === NodeType.CONTENT) {
      const textCode = child.text ? exprToCode(child.text, ctx) : '""';
      switch (child.contentType) {
        case 'heading': return { op: 'heading', text: textCode };
        case 'subheading': return { op: 'subheading', text: textCode };
        case 'text': return { op: 'text', text: textCode };
        case 'bold_text': case 'bold': return { op: 'bold', text: textCode };
        case 'italic_text': case 'italic': return { op: 'italic', text: textCode };
        case 'small_text': case 'small': return { op: 'small', text: textCode };
        case 'divider': return { op: 'divider' };
        default: return { op: 'text', text: textCode };
      }
    }
    if (child.type === NodeType.SHOW && child.format === 'table') return { op: 'table', data: exprToCode(child.expression, ctx) };
    if (child.type === NodeType.SHOW) return { op: 'text', text: exprToCode(child.expression, ctx) };
    return null;
  }).filter(Boolean);

  if (ctx.lang === 'python') {
    let code = `${pad}from reportlab.lib.pagesizes import letter\n`;
    code += `${pad}from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable\n`;
    code += `${pad}from reportlab.lib.styles import getSampleStyleSheet\n`;
    code += `${pad}from reportlab.lib import colors\n`;
    code += `${pad}_pdf_styles = getSampleStyleSheet()\n`;
    code += `${pad}_pdf_elements = []\n`;
    for (const el of elements) {
      if (el.op === 'heading') code += `${pad}_pdf_elements.append(Paragraph(str(${el.text}), _pdf_styles["Heading1"]))\n`;
      else if (el.op === 'subheading') code += `${pad}_pdf_elements.append(Paragraph(str(${el.text}), _pdf_styles["Heading2"]))\n`;
      else if (el.op === 'bold') code += `${pad}_pdf_elements.append(Paragraph("<b>" + str(${el.text}) + "</b>", _pdf_styles["Normal"]))\n`;
      else if (el.op === 'italic') code += `${pad}_pdf_elements.append(Paragraph("<i>" + str(${el.text}) + "</i>", _pdf_styles["Normal"]))\n`;
      else if (el.op === 'small') code += `${pad}_pdf_elements.append(Paragraph(str(${el.text}), _pdf_styles["Normal"]))\n`;
      else if (el.op === 'divider') code += `${pad}_pdf_elements.append(HRFlowable(width="100%", color=colors.grey))\n`;
      else if (el.op === 'table') code += `${pad}_pdf_elements.append(Table([[str(k) for k in ${el.data}[0].keys()]] + [[str(v) for v in row.values()] for row in ${el.data}]))\n`;
      else code += `${pad}_pdf_elements.append(Paragraph(str(${el.text}), _pdf_styles["Normal"]))\n`;
    }
    code += `${pad}SimpleDocTemplate(${pathCode}, pagesize=letter).build(_pdf_elements)`;
    return code;
  }

  let code = `${pad}(function(_pdfPath) {\n`;
  code += `${pad}  const PDFDocument = require("pdfkit");\n`;
  code += `${pad}  const _fs = require("fs");\n`;
  code += `${pad}  const _doc = new PDFDocument();\n`;
  code += `${pad}  _doc.pipe(_fs.createWriteStream(_pdfPath));\n`;
  for (const el of elements) {
    if (el.op === 'heading') code += `${pad}  _doc.fontSize(24).font("Helvetica-Bold").text(String(${el.text}));\n${pad}  _doc.moveDown(0.5);\n`;
    else if (el.op === 'subheading') code += `${pad}  _doc.fontSize(18).font("Helvetica-Bold").text(String(${el.text}));\n${pad}  _doc.moveDown(0.3);\n`;
    else if (el.op === 'bold') code += `${pad}  _doc.fontSize(12).font("Helvetica-Bold").text(String(${el.text}));\n`;
    else if (el.op === 'italic') code += `${pad}  _doc.fontSize(12).font("Helvetica-Oblique").text(String(${el.text}));\n`;
    else if (el.op === 'small') code += `${pad}  _doc.fontSize(9).font("Helvetica").text(String(${el.text}));\n`;
    else if (el.op === 'divider') code += `${pad}  _doc.moveDown(0.3);\n${pad}  _doc.moveTo(72, _doc.y).lineTo(540, _doc.y).stroke();\n${pad}  _doc.moveDown(0.3);\n`;
    else if (el.op === 'table') {
      code += `${pad}  (function(data) {\n`;
      code += `${pad}    const headers = Object.keys(data[0]);\n`;
      code += `${pad}    const colWidth = 460 / headers.length;\n`;
      code += `${pad}    _doc.font("Helvetica-Bold").fontSize(10);\n`;
      code += `${pad}    headers.forEach((h, i) => _doc.text(h, 72 + i * colWidth, _doc.y, { width: colWidth, continued: i < headers.length - 1 }));\n`;
      code += `${pad}    _doc.moveDown(0.5);\n`;
      code += `${pad}    _doc.font("Helvetica").fontSize(10);\n`;
      code += `${pad}    data.forEach(row => { headers.forEach((h, i) => _doc.text(String(row[h] ?? ""), 72 + i * colWidth, _doc.y, { width: colWidth, continued: i < headers.length - 1 })); _doc.moveDown(0.3); });\n`;
      code += `${pad}  })(${el.data});\n`;
    }
    else code += `${pad}  _doc.fontSize(12).font("Helvetica").text(String(${el.text}));\n`;
  }
  code += `${pad}  _doc.end();\n`;
  code += `${pad})(${pathCode});`;
  return code;
}

function _compileNodeInner(node, ctx) {
  // Skip backend-only nodes when compiling for web frontend
  if (ctx.mode === 'web' && BACKEND_ONLY_NODES.has(node.type)) return null;

  const pad = padFor(ctx);

  switch (node.type) {
    case NodeType.COMMENT: {
      const prefix = ctx.lang === 'python' ? '#' : '//';
      if (node.text.includes('\n')) {
        return node.text.split('\n').map(line => `${pad}${prefix} ${line}`).join('\n');
      }
      return `${pad}${prefix} ${node.text}`;
    }

    case NodeType.TARGET:
    case NodeType.THEME:
      return null;

    case NodeType.SCRIPT:
      // Raw JavaScript/Python escape hatch — emit code as-is
      return node.code.split('\n').map(l => pad + l).join('\n');

    case NodeType.RUN_COMMAND: {
      // Shell command execution: run command 'npm install'
      // If capture=true, this is used as an expression (result = run command 'cmd')
      // and will be wrapped in an ASSIGN node — handled by exprToCode
      const cmdStr = JSON.stringify(node.command);
      if (node.capture) {
        // Expression form: returns stdout as string
        if (ctx.lang === 'python') {
          return `${pad}subprocess.run(${cmdStr}, shell=True, capture_output=True, text=True, check=True).stdout.strip()`;
        }
        return `${pad}execSync(${cmdStr}, { encoding: 'utf-8' }).trim()`;
      }
      if (ctx.lang === 'python') {
        return `${pad}subprocess.run(${cmdStr}, shell=True, check=True)`;
      }
      return `${pad}execSync(${cmdStr}, { stdio: 'inherit' });`;
    }

    case NodeType.STORE: {
      const varRef = ctx.stateVars && ctx.stateVars.has(node.variable) ? `_state.${sanitizeName(node.variable)}` : sanitizeName(node.variable);
      const key = JSON.stringify(node.key);
      if (ctx.lang === 'python') return `${pad}# store not supported in Python backend`;
      return `${pad}try { localStorage.setItem(${key}, JSON.stringify(${varRef})); } catch(_) {}`;
    }

    case NodeType.RESTORE: {
      const name = sanitizeName(node.variable);
      const stateRef = ctx.stateVars && ctx.stateVars.has(node.variable) ? `_state.${name}` : name;
      const key = JSON.stringify(node.key);
      if (ctx.lang === 'python') return `${pad}# restore not supported in Python backend`;
      return `${pad}try { const _v = localStorage.getItem(${key}); if (_v !== null) ${stateRef} = JSON.parse(_v); } catch(_) {}`;
    }

    case NodeType.ASSIGN: {
      const rawName = sanitizeName(node.name);
      const name = ctx.lang === 'python' ? sanitizeNamePython(node.name) : rawName;

      // EXTERNAL_FETCH as RHS: generates multi-statement try/catch, bind result to name
      if (node.expression && node.expression.type === NodeType.EXTERNAL_FETCH) {
        const fetchNode = node.expression;
        const timeoutMs = fetchNode.config?.timeout
          ? fetchNode.config.timeout.value * (fetchNode.config.timeout.unit === 'minutes' ? 60000 : 1000)
          : 10000;
        const urlCode = typeof fetchNode.url === 'string' ? `'${fetchNode.url}'` : exprToCode(fetchNode.url, ctx);
        if (!ctx.declared.has(rawName)) ctx.declared.add(rawName);
        if (ctx.lang === 'python') {
          return `${pad}async with httpx.AsyncClient(timeout=${timeoutMs / 1000}) as _client:\n` +
                 `${pad}    _r = await _client.get(${urlCode})\n` +
                 `${pad}    ${name} = _r.json()`;
        }
        return `${pad}let ${name};\n` +
               `${pad}try {\n` +
               `${pad}  const _ctrl = new AbortController();\n` +
               `${pad}  const _tmt = setTimeout(() => _ctrl.abort(), ${timeoutMs});\n` +
               `${pad}  const _res = await fetch(${urlCode}, { signal: _ctrl.signal });\n` +
               `${pad}  clearTimeout(_tmt);\n` +
               `${pad}  ${name} = await _res.json();\n` +
               `${pad}} catch (_err) {\n` +
               `${pad}  throw new Error(\`fetch from ${typeof fetchNode.url === 'string' ? fetchNode.url : 'url'} failed: \${_err.message}\`);\n` +
               `${pad}}`;
      }

      // API_CALL as RHS: result = post to '/api/ask' with question
      if (node.expression && node.expression.type === NodeType.API_CALL) {
        const apiNode = node.expression;
        const url = JSON.stringify(apiNode.url);
        if (!ctx.declared.has(rawName)) ctx.declared.add(rawName);
        if (apiNode.method === 'GET') {
          return `${pad}let ${name} = await fetch(${url}).then(r => r.json());`;
        }
        // POST/PUT/DELETE with fields
        let bodyExpr;
        if (apiNode.fields && apiNode.fields.length > 0) {
          const fieldObj = apiNode.fields.map(f => {
            const sn = sanitizeName(f);
            return `${sn}: ${ctx.stateVars && ctx.stateVars.has(sn) ? '_state.' + sn : sn}`;
          }).join(', ');
          bodyExpr = `{ ${fieldObj} }`;
        } else {
          bodyExpr = ctx.stateVars ? '_state' : '{}';
        }
        return `${pad}let ${name} = await fetch(${url}, { method: '${apiNode.method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${bodyExpr}) }).then(r => r.json());`;
      }

      // RUN_COMMAND with capture: result = run command 'cmd'
      if (node.expression && node.expression.type === NodeType.RUN_COMMAND && node.expression.capture) {
        const cmdStr = JSON.stringify(node.expression.command);
        if (!ctx.declared.has(rawName)) ctx.declared.add(rawName);
        if (ctx.lang === 'python') {
          return `${pad}${name} = subprocess.run(${cmdStr}, shell=True, capture_output=True, text=True, check=True).stdout.strip()`;
        }
        return `${pad}const ${name} = execSync(${cmdStr}, { encoding: 'utf-8' }).trim();`;
      }

      const expr = exprToCode(node.expression, ctx);
      if (ctx.lang === 'js') {
        // Property access (order.status) never gets "let"
        const isPropAccess = name.includes('.');
        // State variable (in reactive mode) — assign to _state.X
        if (!isPropAccess && ctx.stateVars && ctx.stateVars.has(rawName)) {
          return `${pad}_state.${rawName} = ${expr};`;
        }
        const keyword = isPropAccess || ctx.declared.has(rawName) ? '' : 'let ';
        if (!isPropAccess) ctx.declared.add(rawName);
        return `${pad}${keyword}${name} = ${expr};`;
      }
      return `${pad}${name} = ${expr}`;
    }

    case NodeType.SHOW:
      if (ctx.lang === 'python') return `${pad}print(${exprToCode(node.expression, ctx)})`;
      // Web mode inside a page: render to DOM element (matches show_N placeholder from HTML scaffold)
      if (ctx.insidePage && node.expression) {
        // Component calls are handled separately (don't use show_N)
        if (node.expression.type === NodeType.CALL && node.expression.name && /^[A-Z]/.test(node.expression.name)) {
          return `${pad}console.log(${exprToCode(node.expression, ctx)});`;
        }
        if (ctx._showCounter == null) ctx._showCounter = 0;
        const showId = `show_${ctx._showCounter++}`;
        return `${pad}{ const _el = document.getElementById('${showId}'); if (_el) _el.textContent = ${exprToCode(node.expression, ctx)}; }`;
      }
      return `${pad}console.log(${exprToCode(node.expression, ctx)});`;

    case NodeType.RETURN:
      if (ctx.lang === 'python') return `${pad}return ${exprToCode(node.expression, ctx)}`;
      return `${pad}return ${exprToCode(node.expression, ctx)};`;

    case NodeType.BREAK:
      return ctx.lang === 'python' ? `${pad}break` : `${pad}break;`;

    case NodeType.CONTINUE:
      return ctx.lang === 'python' ? `${pad}continue` : `${pad}continue;`;

    case NodeType.IF_THEN: {
      const cond = exprToCode(node.condition, ctx);
      // Block form (array body) vs inline form (single node)
      const compileBranch = (branch, branchCtx) => {
        if (Array.isArray(branch)) {
          return branch.map(n => compileNode(n, branchCtx)).filter(Boolean).join('\n');
        }
        return compileNode(branch, branchCtx);
      };
      if (ctx.lang === 'python') {
        const thenCode = compileBranch(node.thenBranch, { ...ctx, indent: ctx.indent + 1 });
        if (node.otherwiseBranch) {
          const elseCode = compileBranch(node.otherwiseBranch, { ...ctx, indent: ctx.indent + 1 });
          return `${pad}if ${cond}:\n${thenCode}\n${pad}else:\n${elseCode}`;
        }
        return `${pad}if ${cond}:\n${thenCode}`;
      }
      // JS: each branch gets its own scope
      const thenDeclared = new Set(ctx.declared);
      const thenCode = compileBranch(node.thenBranch, { ...ctx, indent: ctx.indent + 1, declared: thenDeclared });
      if (node.otherwiseBranch) {
        const elseDeclared = new Set(ctx.declared);
        const elseCode = compileBranch(node.otherwiseBranch, { ...ctx, indent: ctx.indent + 1, declared: elseDeclared });
        return `${pad}if (${cond}) {\n${thenCode}\n${pad}} else {\n${elseCode}\n${pad}}`;
      }
      return `${pad}if (${cond}) {\n${thenCode}\n${pad}}`;
    }

    case NodeType.FUNCTION_DEF: {
      const params = node.params.map(p => sanitizeName(p.name)).join(', ');
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}def ${sanitizeName(node.name)}(${params}):\n${bodyCode}`;
      }
      // JS: emit JSDoc if any params have types or there's a returnType
      const _typeMap = { text: 'string', number: 'number', list: 'Array', boolean: 'boolean', map: 'Object', any: '*' };
      const _typedParams = node.params.filter(p => p.type);
      const _hasTypes = _typedParams.length > 0 || node.returnType;
      let _jsdoc = '';
      if (_hasTypes) {
        const _pDocs = _typedParams.map(p => `${pad} * @param {${_typeMap[p.type] || p.type}} ${sanitizeName(p.name)}`).join('\n');
        const _rDoc = node.returnType ? `${pad} * @returns {${_typeMap[node.returnType] || node.returnType}}` : '';
        _jsdoc = `${pad}/**\n${_pDocs ? _pDocs + '\n' : ''}${_rDoc ? _rDoc + '\n' : ''}${pad} */\n`;
      }
      // JS: functions get their own scope — params are pre-declared
      // insideFunction: true so that `send back` compiles to `return` instead of `res.json`
      const fnDeclared = new Set(node.params.map(p => sanitizeName(p.name)));
      const bodyCode = compileBody(node.body, ctx, { declared: fnDeclared, insideFunction: true });
      // Auto-detect async: if body contains await (CRUD, API calls, agent calls), make function async
      const isAsync = bodyCode.includes('await ');
      return `${_jsdoc}${pad}${isAsync ? 'async ' : ''}function ${sanitizeName(node.name)}(${params}) {\n${bodyCode}\n${pad}}`;
    }

    case NodeType.AGENT:
      return compileAgent(node, ctx, pad);

    case NodeType.PIPELINE: {
      const fnName = 'pipeline_' + sanitizeName(node.name.toLowerCase().replace(/\s+/g, '_'));
      const param = sanitizeName(node.inputVar);
      if (ctx.lang === 'python') {
        let code = `${pad}async def ${fnName}(${param}):\n`;
        code += `${pad}    _pipe = ${param}\n`;
        for (const step of node.steps) {
          const agentFn = 'agent_' + sanitizeName(step.agentName.toLowerCase().replace(/\s+/g, '_'));
          code += `${pad}    _pipe = await ${agentFn}(_pipe)\n`;
        }
        code += `${pad}    return _pipe`;
        return code;
      }
      let code = `${pad}async function ${fnName}(${param}) {\n`;
      code += `${pad}  let _pipe = ${param};\n`;
      for (const step of node.steps) {
        const agentFn = 'agent_' + sanitizeName(step.agentName.toLowerCase().replace(/\s+/g, '_'));
        code += `${pad}  _pipe = await ${agentFn}(_pipe);\n`;
      }
      code += `${pad}  return _pipe;\n`;
      code += `${pad}}`;
      return code;
    }

    case NodeType.PARALLEL_AGENTS: {
      const names = node.assignments.map(a => sanitizeName(a.name));
      const calls = node.assignments.map(a => exprToCode(a.expression, ctx));
      if (ctx.lang === 'python') {
        const tasks = calls.join(', ');
        const vars = names.join(', ');
        return `${pad}${vars} = await asyncio.gather(${tasks})`;
      }
      const tasks = calls.join(', ');
      const vars = names.join(', ');
      return `${pad}const [${vars}] = await Promise.all([${tasks}]);`;
    }

    case NodeType.WORKFLOW:
      return compileWorkflow(node, ctx, pad);

    case NodeType.POLICY:
      return compilePolicy(node, ctx, pad);

    case NodeType.MOCK_AI:
      // Consumed by TEST_DEF compilation — emits nothing standalone
      return null;

    case NodeType.SKILL:
      // Skills compile to nothing — consumed by agents that use them
      return null;

    case NodeType.HUMAN_CONFIRM: {
      const msg = exprToCode(node.message, ctx);
      if (ctx.lang === 'python') {
        let code = `${pad}# Human-in-the-loop: create approval request\n`;
        code += `${pad}_approval = await db.insert("Approvals", {"action": "confirm", "details": str(${msg}), "status": "pending"})\n`;
        code += `${pad}return JSONResponse(content={"approval_id": _approval.get("id"), "message": ${msg}, "status": "pending"}, status_code=202)`;
        return code;
      }
      let code = `${pad}// Human-in-the-loop: create approval request\n`;
      code += `${pad}const _approval = await db.insert('Approvals', { action: 'confirm', details: String(${msg}), status: 'pending' });\n`;
      code += `${pad}return res.status(202).json({ approval_id: _approval.id, message: ${msg}, status: 'pending' });`;
      return code;
    }

    case NodeType.REPEAT: {
      const count = exprToCode(node.count, ctx);
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}for _i in range(${count}):\n${bodyCode}`;
      }
      const loopDeclared = new Set(ctx.declared);
      const bodyCode = compileBody(node.body, ctx, { declared: loopDeclared });
      return `${pad}for (let _i = 0; _i < ${count}; _i++) {\n${bodyCode}\n${pad}}`;
    }

    case NodeType.FOR_EACH: {
      const varName = sanitizeName(node.variable);
      const iter = exprToCode(node.iterable, ctx);

      // Two-variable form: "for each key, value in map:" → Object.entries / .items()
      if (node.variable2) {
        const var2Name = sanitizeName(node.variable2);
        if (ctx.lang === 'python') {
          const bodyCode2 = compileBody(node.body, ctx);
          return `${pad}for ${varName}, ${var2Name} in ${iter}.items():
${bodyCode2}`;
        }
        const loopDeclared2 = new Set(ctx.declared);
        const bodyCode2 = compileBody(node.body, ctx, { declared: loopDeclared2 });
        return `${pad}for (const [${varName}, ${var2Name}] of Object.entries(${iter})) {
${bodyCode2}
${pad}}`;
      }

      // Use `for await` when iterating over async generators (streaming AI)
      const isAsync = iter.includes('_askAIStream') || iter.includes('_stream') || ctx.streamMode;
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return isAsync
          ? `${pad}async for ${varName} in ${iter}:\n${bodyCode}`
          : `${pad}for ${varName} in ${iter}:\n${bodyCode}`;
      }
      const loopDeclared = new Set(ctx.declared);
      const bodyCode = compileBody(node.body, ctx, { declared: loopDeclared });
      return isAsync
        ? `${pad}for await (const ${varName} of ${iter}) {\n${bodyCode}\n${pad}}`
        : `${pad}for (const ${varName} of ${iter}) {\n${bodyCode}\n${pad}}`;
    }

    case NodeType.WHILE: {
      const cond = exprToCode(node.condition, ctx);
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}while ${cond}:\n${bodyCode}`;
      }
      const loopDeclared = new Set(ctx.declared);
      const bodyCode = compileBody(node.body, ctx, { declared: loopDeclared });
      return `${pad}while (${cond}) {\n${bodyCode}\n${pad}}`;
    }

    case NodeType.REPEAT_UNTIL: {
      // `repeat until X, max N times:` — bounded refinement loop. Runs the
      // body, then checks the condition; breaks if true. N guarantees
      // termination even when the condition stays false (agent can't
      // improve past some quality bar → stop with the best attempt).
      const cond = exprToCode(node.condition, ctx);
      const max = node.maxIterations;
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}for _i in range(${max}):\n${bodyCode}\n${pad}    if ${cond}:\n${pad}        break`;
      }
      const loopDeclared = new Set(ctx.declared);
      const bodyCode = compileBody(node.body, ctx, { declared: loopDeclared });
      return `${pad}for (let _i = 0; _i < ${max}; _i++) {\n${bodyCode}\n${pad}  if (${cond}) break;\n${pad}}`;
    }

    case NodeType.TRY_HANDLE: {
      // Normalize: support both new handlers array and legacy errorVar/handleBody
      const _handlers = node.handlers || [{ errorType: null, body: node.handleBody || [] }];

      function errorTypeToCondition(errorType, lang) {
        if (!errorType) return null;
        const lower = errorType.toLowerCase();
        const statusMap = { 'not found': 404, 'forbidden': 403, 'unauthorized': 401, 'bad request': 400, 'server error': 500 };
        const status = statusMap[lower];
        if (status) {
          if (lang === 'python') return `_err.status == ${status}`;
          return `_err.status === ${status} || _err.message?.toLowerCase().includes('${lower}')`;
        }
        if (lang === 'python') return `str(_err).lower().find('${lower}') >= 0`;
        return `_err.message?.toLowerCase().includes('${lower}')`;
      }

      // `error` is bound in every handler body so Clear code can write `error's message` etc.
      function makeHandlerCtx(baseCtx, extraIndent) {
        const d = new Set(baseCtx.declared);
        d.add('error');
        return { ...baseCtx, declared: d, indent: baseCtx.indent + (extraIndent || 0) };
      }

      if (ctx.lang === 'python') {
        const tryCode = compileBody(node.tryBody, ctx);
        const errVar = '_err';
        const hasTyped = _handlers.some(h => h.errorType);
        // `error = _err` gives handler bodies access to the caught exception
        const errBind = (bodyPad) => `${bodyPad}error = ${errVar}\n`;
        let catchBody = '';
        _handlers.forEach((h, i) => {
          const cond = errorTypeToCondition(h.errorType, 'python');
          const bodyCtx = makeHandlerCtx(ctx, (cond || (hasTyped && i > 0)) ? 1 : 0);
          const bodyPad = padFor({ ...bodyCtx, indent: bodyCtx.indent + 1 });
          const bodyCode = errBind(bodyPad) + compileBody(h.body, bodyCtx);
          if (i === 0 && !cond) {
            catchBody += bodyCode;
          } else if (i === 0 && cond) {
            catchBody += `${pad}    if ${cond}:\n${bodyCode}`;
          } else if (cond) {
            catchBody += `\n${pad}    elif ${cond}:\n${bodyCode}`;
          } else {
            catchBody += `\n${pad}    else:\n${bodyCode}`;
          }
        });
        let pyCode = `${pad}try:\n${tryCode}\n${pad}except Exception as ${errVar}:\n${catchBody}`;
        if (node.finallyBody) {
          const finallyCode = compileBody(node.finallyBody, ctx);
          pyCode += `\n${pad}finally:\n${finallyCode}`;
        }
        return pyCode;
      }

      const tryDeclared = new Set(ctx.declared);
      const tryCode = compileBody(node.tryBody, ctx, { declared: tryDeclared });
      const errVar = '_err';
      const hasTypedJS = _handlers.some(h => h.errorType);
      // `const error = _err;` gives handler bodies access to the caught exception
      const errBind = (bodyPad) => `${bodyPad}const error = ${errVar};\n`;
      let catchBody = '';
      _handlers.forEach((h, i) => {
        const cond = errorTypeToCondition(h.errorType, 'js');
        const bodyCtx = makeHandlerCtx(ctx, (cond || (hasTypedJS && i > 0)) ? 1 : 0);
        const bodyPad = padFor({ ...bodyCtx, indent: bodyCtx.indent + 1 });
        const bodyCode = errBind(bodyPad) + compileBody(h.body, bodyCtx);
        if (i === 0 && !cond) {
          catchBody += bodyCode;
        } else if (i === 0 && cond) {
          catchBody += `${pad}  if (${cond}) {\n${bodyCode}\n${pad}  }`;
        } else if (cond) {
          catchBody += ` else if (${cond}) {\n${bodyCode}\n${pad}  }`;
        } else {
          catchBody += ` else {\n${bodyCode}\n${pad}  }`;
        }
      });
      let jsCode = `${pad}try {\n${tryCode}\n${pad}} catch (${errVar}) {\n${catchBody}\n${pad}}`;
      if (node.finallyBody) {
        const finallyCode = compileBody(node.finallyBody, ctx);
        jsCode += ` finally {\n${finallyCode}\n${pad}}`;
      }
      return jsCode;
    }

    case NodeType.RETRY: {
      const n = node.count || 3;
      const retryBody = compileBody(node.body, ctx);
      if (ctx.lang === 'python') {
        return `${pad}# Retry up to ${n} times\n${pad}for _attempt in range(${n}):\n${pad}    try:\n${retryBody.split('\n').map(l => '    ' + l).join('\n')}\n${pad}        break\n${pad}    except Exception as _retry_err:\n${pad}        if _attempt == ${n - 1}:\n${pad}            raise _retry_err\n${pad}        import asyncio; await asyncio.sleep(2 ** _attempt)`;
      }
      return `${pad}// Retry up to ${n} times\n${pad}for (let _attempt = 0; _attempt < ${n}; _attempt++) {\n${pad}  try {\n${retryBody}\n${pad}    break;\n${pad}  } catch (_retryErr) {\n${pad}    if (_attempt === ${n - 1}) throw _retryErr;\n${pad}    await new Promise(r => setTimeout(r, Math.pow(2, _attempt) * 1000));\n${pad}  }\n${pad}}`;
    }

    case NodeType.TIMEOUT: {
      const ms = node.ms || 5000;
      const timeoutBody = compileBody(node.body, ctx);
      if (ctx.lang === 'python') {
        return `${pad}# Timeout: ${ms}ms\n${pad}import asyncio\n${pad}try:\n${pad}    await asyncio.wait_for(asyncio.ensure_future((lambda: (${timeoutBody.trim()}))() or asyncio.sleep(0)), timeout=${ms / 1000})\n${pad}except asyncio.TimeoutError:\n${pad}    raise Exception("Operation timed out after ${ms}ms")`;
      }
      return `${pad}// Timeout: ${ms}ms\n${pad}await Promise.race([\n${pad}  (async () => {\n${timeoutBody}\n${pad}  })(),\n${pad}  new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timed out after ${ms}ms')), ${ms}))\n${pad}]);`;
    }

    case NodeType.RACE: {
      const tasks = node.body.map(n => compileNode(n, ctx)).filter(Boolean);
      if (ctx.lang === 'python') {
        const pyTasks = tasks.map((t, i) => `${pad}    asyncio.ensure_future(${t.trim()})`).join(',\n');
        return `${pad}# First to finish\n${pad}import asyncio\n${pad}_done, _pending = await asyncio.wait([${tasks.map((_, i) => `_task_${i}`).join(', ')}], return_when=asyncio.FIRST_COMPLETED)\n${pad}_result = _done.pop().result()`;
      }
      const jsTasks = tasks.map(t => `${pad}  (async () => { ${t.trim()} })()`).join(',\n');
      return `${pad}// First to finish\n${pad}await Promise.race([\n${jsTasks}\n${pad}]);`;
    }

    case NodeType.TRANSACTION: {
      const txBody = compileBody(node.body, ctx);
      if (ctx.lang === 'python') {
        return `${pad}# As one operation (transaction)\n${pad}try:\n${pad}    await db.execute("BEGIN")\n${txBody}\n${pad}    await db.execute("COMMIT")\n${pad}except Exception as _tx_err:\n${pad}    await db.execute("ROLLBACK")\n${pad}    raise _tx_err`;
      }
      return `${pad}// As one operation (transaction)\n${pad}try {\n${pad}  await db.run('BEGIN');\n${txBody}\n${pad}  await db.run('COMMIT');\n${pad}} catch (_txErr) {\n${pad}  await db.run('ROLLBACK');\n${pad}  throw _txErr;\n${pad}}`;
    }

    case NodeType.USE:
      if (node.isNpm) {
        // npm package import: use npm 'stripe' as stripe_client
        if (ctx.lang === 'python') {
          const pyPkg = node.npmPackage.replace(/[^a-zA-Z0-9_]/g, '_');
          const pyAlias = node.npmAlias !== pyPkg ? ` as ${node.npmAlias}` : '';
          return `${pad}import ${pyPkg}${pyAlias}`;
        }
        // JS backend: emitted at header — skip here to avoid duplicate
        if (ctx.mode === 'backend') return null;
        return `${pad}const ${node.npmAlias} = require('${node.npmPackage}');`;
      }
      if (node.source) {
        // External JS import: use 'name' from 'path'
        if (ctx.lang === 'python') return `${pad}import ${sanitizeName(node.module)}`;
        return `${pad}const ${sanitizeName(node.module)} = await import(${JSON.stringify(node.source)});`;
      }
      // Resolved Clear module
      if (node._resolved) {
        if (node._duplicate) return null; // already emitted
        // Selective import: compile selected nodes inline (no namespace wrapper)
        if (node._selectiveNodes) {
          const lines = [];
          for (const mNode of node._selectiveNodes) {
            const compiled = compileNode(mNode, ctx);
            if (compiled) lines.push(compiled);
          }
          return lines.join('\n') || null;
        }
        // importAll with collision: _resolved is true but no nodes to emit
        if (node.importAll) return null;
        return compileNamespaceObject(node, ctx, pad);
      }
      if (ctx.lang === 'python') return `${pad}import ${sanitizeName(node.module)}`;
      return `${pad}import * as ${sanitizeName(node.module)} from './${node.module}.js';`;

    case NodeType.PAGE: {
      if (ctx.mode === 'backend') {
        // In backend mode, only compile backend-relevant children (endpoints, data shapes)
        const backendChildren = node.body.filter(n =>
          n.type === NodeType.ENDPOINT || n.type === NodeType.DATA_SHAPE || n.type === NodeType.CRUD ||
          n.type === NodeType.WEBHOOK || n.type === NodeType.BACKGROUND
        );
        if (backendChildren.length === 0) return null;
        return backendChildren.map(n => compileNode(n, ctx)).filter(Boolean).join('\n');
      }
      const pageCtx = { ...ctx, insidePage: true };
      const bodyCode = node.body.map(n => compileNode(n, pageCtx)).filter(Boolean).join('\n');
      if (ctx.lang === 'python') return `${pad}# Page: ${node.title}\n${bodyCode}`;
      return `${pad}// Page: ${node.title}\n${pad}document.title = ${JSON.stringify(node.title)};\n${bodyCode}`;
    }

    case NodeType.SECTION: {
      if (ctx.mode === 'backend') return null; // frontend-only
      const sectionCtx = { ...ctx, insidePage: true };
      const bodyCode = node.body.map(n => compileNode(n, sectionCtx)).filter(Boolean).join('\n');
      if (!bodyCode.trim()) return null; // No JS output — skip empty section comment
      if (ctx.lang === 'python') return `${pad}# Section: ${node.title}\n${bodyCode}`;
      return `${pad}// Section: ${node.title}\n${bodyCode}`;
    }

    case NodeType.ASK_FOR: {
      if (ctx.mode === 'backend') return null; // frontend-only
      if (ctx.lang === 'python') return `${pad}# Input: ${node.label} (${node.inputType})`;
      const inputId = `input_${sanitizeName(node.variable)}`;
      // Rich text editors wire themselves up in _initRichTextEditors — they
      // update _state on each text-change and have no <input> to listen to.
      if (node.inputType === 'rich text') {
        return `${pad}// Input: ${node.label} (rich text — bound by _initRichTextEditors)`;
      }
      const inputType = node.inputType === 'number' ? 'number' : node.inputType === 'percent' ? 'number' : 'text';
      return `${pad}// Input: ${node.label}\n${pad}document.getElementById('${inputId}').addEventListener('input', (e) => {\n${pad}  _state.${sanitizeName(node.variable)} = ${inputType === 'number' ? 'Number(e.target.value)' : 'e.target.value'};\n${pad}  _recompute();\n${pad}});`;
    }

    case NodeType.DISPLAY: {
      if (ctx.mode === 'backend') return null; // frontend-only
      if (ctx.lang === 'python') {
        const val = exprToCode(node.expression, ctx);
        return `${pad}print(${val})  # Display: ${node.label || 'value'}`;
      }
      const outputId = `output_${node.label ? sanitizeName(node.label.replace(/\s+/g, '_')) : 'value'}`;
      const val = exprToCode(node.expression, ctx);
      const formatFn = node.format === 'dollars' || node.format === 'currency' ? `Number(${val}).toLocaleString('en-US', { style: 'currency', currency: 'USD' })`
        : node.format === 'percent' || node.format === 'percentage' ? `(Number(${val}) * 100).toFixed(1) + '%'`
        : node.format === 'date' ? `new Date(${val}).toLocaleDateString()`
        : node.format === 'json' ? `JSON.stringify(${val}, null, 2)`
        : val;
      const propName = node.format === 'json' ? 'innerText' : 'textContent';
      return `${pad}document.getElementById('${outputId}').${propName} = ${formatFn};`;
    }

    case NodeType.BUTTON: {
      if (ctx.mode === 'backend') return null; // frontend-only
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}# Button: ${node.label}\n${pad}def on_${sanitizeName(node.label.replace(/\s+/g, '_'))}():\n${bodyCode}`;
      }
      const btnId = `btn_${sanitizeName(node.label.replace(/\s+/g, '_'))}`;
      const hasApiCall = node.body.some(n => n.type === NodeType.API_CALL);
      const bodyCode = compileBody(node.body, ctx);
      const asyncPrefix = hasApiCall ? 'async ' : '';
      return `${pad}document.getElementById('${btnId}').addEventListener('click', ${asyncPrefix}() => {\n${bodyCode}\n${pad}  _recompute();\n${pad}});`;
    }

    case NodeType.ENDPOINT:
      return compileEndpoint(node, ctx, pad);

    case NodeType.RESPOND:
      return compileRespond(node, ctx, pad);

    case NodeType.REQUIRES_AUTH: {
      if (ctx.lang === 'python') {
        // Extract JWT from Authorization header and verify
        return `${pad}_auth_header = request.headers.get("authorization", "")\n${pad}if not _auth_header.startswith("Bearer "):\n${pad}    raise HTTPException(status_code=401, detail="Authentication required")\n${pad}try:\n${pad}    import jwt as _jwt\n${pad}    _token = _auth_header[7:]\n${pad}    request.state.user = _jwt.decode(_token, _JWT_SECRET, algorithms=["HS256"])\n${pad}except Exception:\n${pad}    raise HTTPException(status_code=401, detail="Invalid or expired token")`;
      }
      // Client-side auth guard: check localStorage token, redirect to /login if missing
      if (ctx.mode === 'web') {
        return `${pad}if (!localStorage.getItem('token')) { window.location.href = '/login'; return; }`;
      }
      return `${pad}if (!req.user) { return res.status(401).json({ error: "Authentication required" }); }`;
    }

    case NodeType.REQUIRES_ROLE: {
      const role = node.role;
      if (ctx.lang === 'python') {
        return `${pad}if request.user.get("role") != "${role}":\n${pad}    raise HTTPException(status_code=403, detail="Requires role: ${role}")`;
      }
      // Auth check (401) is assumed to be before this -- only check role here
      return `${pad}if (req.user.role !== "${role}") { return res.status(403).json({ error: "Requires role: ${role}" }); }`;
    }

    case NodeType.DEFINE_ROLE: {
      const perms = node.permissions.map(p => `"${p}"`).join(', ');
      if (ctx.lang === 'python') {
        return `${pad}ROLES["${node.role}"] = [${perms}]`;
      }
      return `${pad}const ROLE_${sanitizeName(node.role).toUpperCase()} = { name: "${node.role}", permissions: [${perms}] };`;
    }

    case NodeType.GUARD: {
      const expr = exprToCode(node.expression, ctx);
      const msg = node.message || 'Access denied';
      if (ctx.insideAgent) {
        if (ctx.lang === 'python') return `${pad}if not (${expr}):\n${pad}    raise ValueError("${msg}")`;
        return `${pad}if (!(${expr})) { throw new Error("${msg}"); }`;
      }
      if (ctx.lang === 'python') {
        return `${pad}if not (${expr}):\n${pad}    raise HTTPException(status_code=403, detail="${msg}")`;
      }
      return `${pad}if (!(${expr})) { return res.status(403).json({ error: "${msg}" }); }`;
    }

    case NodeType.THROW: {
      const errMsg = exprToCode(node.expression, ctx);
      if (ctx.lang === 'python') return `${pad}raise Exception(${errMsg})`;
      return `${pad}throw new Error(${errMsg});`;
    }

    case NodeType.DEPLOY:
      // Deploy nodes don't produce code — they're handled by the compile() orchestrator
      return null;

    case NodeType.STYLE_DEF:
    case NodeType.CONTENT:
      return null;

    case NodeType.DATA_SHAPE:
      return compileDataShape(node, ctx, pad);

    case NodeType.DATABASE_DECL: {
      const b = node.backend;
      if (b.includes('local') || b.includes('memory')) {
        if (ctx.lang === 'python') return `${pad}# Database: local memory`;
        return `${pad}// Database: local memory (JSON file backup)`;
      }
      if (b.includes('sqlite')) {
        const path = node.connection ? exprToCode(node.connection, ctx) : '"data.db"';
        if (ctx.lang === 'python') return `${pad}import sqlite3\n${pad}_db_conn = sqlite3.connect(${path})`;
        return `${pad}// Database: SQLite at ${path}`;
      }
      if (b.includes('postgres')) {
        const url = node.connection ? exprToCode(node.connection, ctx) : '"localhost"';
        if (ctx.lang === 'python') {
          return `${pad}import asyncpg\n${pad}_db_pool = None\n${pad}async def _get_db():\n${pad}    global _db_pool\n${pad}    if not _db_pool:\n${pad}        _db_pool = await asyncpg.create_pool(${url})\n${pad}    return _db_pool`;
        }
        return `${pad}const { Pool } = require('pg');\n${pad}const _pool = new Pool({ connectionString: ${url} });`;
      }
      if (b.includes('supabase')) {
        if (ctx.lang === 'python') return `${pad}# Database: Supabase (client initialized at top of file)`;
        return `${pad}// Database: Supabase (client initialized at top of file)`;
      }
      return `${pad}// Database: ${node.backend}`;
    }

    case NodeType.CONNECT_DB: {
      const url = node.config.url || '';
      // Detect env('KEY') or env(KEY) pattern and compile to process.env.KEY
      const envMatch = url.match(/^env\(?['"]?(.+?)['"]?\)?$/);
      const urlCode = (envMatch && envMatch[1] !== url)
        ? (ctx.lang === 'python' ? `os.environ["${envMatch[1]}"]` : `process.env.${envMatch[1]}`)
        : JSON.stringify(url);
      if (ctx.lang === 'python') {
        return `${pad}import asyncpg\n${pad}_db_pool = None\n${pad}async def _get_db():\n${pad}    global _db_pool\n${pad}    if not _db_pool:\n${pad}        _db_pool = await asyncpg.create_pool(${urlCode})\n${pad}    return _db_pool`;
      }
      return `${pad}const { Pool } = require('pg');\n${pad}const _pool = new Pool({ connectionString: ${urlCode} });`;
    }

    case NodeType.RAW_QUERY: {
      const sql = JSON.stringify(node.sql);
      const params = node.params ? exprToCode(node.params, ctx) : null;
      if (ctx.lang === 'python') {
        if (node.operation === 'run') {
          return params
            ? `${pad}await (await _get_db()).execute(${sql}, ${params})`
            : `${pad}await (await _get_db()).execute(${sql})`;
        }
        return params
          ? `${pad}${sanitizeName(node.variable)} = await (await _get_db()).fetch(${sql}, ${params})`
          : `${pad}${sanitizeName(node.variable)} = await (await _get_db()).fetch(${sql})`;
      }
      if (node.operation === 'run') {
        return params
          ? `${pad}await _pool.query(${sql}, [${params}]);`
          : `${pad}await _pool.query(${sql});`;
      }
      const varName = sanitizeName(node.variable);
      return params
        ? `${pad}const ${varName} = (await _pool.query(${sql}, [${params}])).rows;`
        : `${pad}const ${varName} = (await _pool.query(${sql})).rows;`;
    }

    case NodeType.CONFIGURE_EMAIL: {
      // Config values are now expression AST nodes
      const exprVal = (key, fallback) => {
        const v = node.config[key];
        if (!v) return JSON.stringify(fallback);
        return exprToCode(v, ctx);
      };
      if (ctx.lang === 'python') {
        return `${pad}import smtplib\n${pad}from email.mime.text import MIMEText\n${pad}_email_config = {"service": ${exprVal('service', 'gmail')}, "user": ${exprVal('user', '')}, "password": ${exprVal('password', '')}}`;
      }
      return `${pad}const nodemailer = require('nodemailer');\n${pad}const _emailTransport = nodemailer.createTransport({ service: ${exprVal('service', 'gmail')}, auth: { user: ${exprVal('user', '')}, pass: ${exprVal('password', '')} } });`;
    }

    case NodeType.SEND_EMAIL: {
      const exprVal = (key) => {
        const v = node.config[key];
        if (!v) return '""';
        return exprToCode(v, ctx);
      };
      // Inline recipient from "send email to X:" takes precedence over config block "to"
      const toCode = node.config._inlineRecipient
        ? exprToCode(node.config._inlineRecipient, ctx)
        : exprVal('to');
      if (ctx.lang === 'python') {
        return `${pad}_msg = MIMEText(str(${exprVal('body')}))\n${pad}_msg["Subject"] = str(${exprVal('subject')})\n${pad}_msg["To"] = str(${toCode})\n${pad}_msg["From"] = _email_config["user"]\n${pad}with smtplib.SMTP_SSL("smtp.gmail.com", 465) as _server:\n${pad}    _server.login(_email_config["user"], _email_config["password"])\n${pad}    _server.send_message(_msg)`;
      }
      return `${pad}await _emailTransport.sendMail({ to: ${toCode}, subject: ${exprVal('subject')}, text: String(${exprVal('body')}) });`;
    }

    // Phase 45: External API calls
    case NodeType.HTTP_REQUEST: {
      const urlCode = exprToCode(node.url, ctx);
      const config = node.config || {};
      const hasBody = config.body;
      const method = config.method || (hasBody ? 'POST' : 'GET');
      // Build headers object
      let headersCode = '';
      if (config.headers && config.headers.length > 0) {
        const headerEntries = config.headers.map(h =>
          `${JSON.stringify(h.name)}: ${exprToCode(h.value, ctx)}`
        ).join(', ');
        headersCode = `{ ${headerEntries} }`;
      }
      // Build timeout
      const timeoutMs = config.timeout
        ? (config.timeout.unit === 'minutes' ? config.timeout.value * 60000 : config.timeout.value * 1000)
        : 30000;
      // Build body
      const bodyCode = hasBody ? `JSON.stringify(${exprToCode(config.body, ctx)})` : 'undefined';

      if (ctx.lang === 'python') {
        let code = `${pad}import httpx\n`;
        const headersPy = headersCode ? headersCode.replace(/:/g, ':').replace(/'/g, '"') : 'None';
        const bodyPy = hasBody ? `json=${exprToCode(config.body, ctx)}` : '';
        code += `${pad}async with httpx.AsyncClient(timeout=${timeoutMs / 1000}) as _client:\n`;
        code += `${pad}    _resp = await _client.${method.toLowerCase()}(${urlCode}${headersCode ? ', headers=' + headersPy : ''}${bodyPy ? ', ' + bodyPy : ''})\n`;
        code += `${pad}    _resp.raise_for_status()\n`;
        code += `${pad}    _api_result = _resp.json()`;
        return code;
      }

      // JS: wrap in async IIFE for result assignment
      let code = `${pad}await (async () => {\n`;
      code += `${pad}  const _ctrl = new AbortController();\n`;
      code += `${pad}  const _timer = setTimeout(() => _ctrl.abort(), ${timeoutMs});\n`;
      code += `${pad}  try {\n`;
      code += `${pad}    const _res = await fetch(${urlCode}, {\n`;
      code += `${pad}      method: '${method}',\n`;
      if (headersCode) code += `${pad}      headers: ${headersCode},\n`;
      if (hasBody) code += `${pad}      body: ${bodyCode},\n`;
      code += `${pad}      signal: _ctrl.signal\n`;
      code += `${pad}    });\n`;
      code += `${pad}    if (!_res.ok) { const _e = new Error(\`External API error: \${_res.status} \${_res.statusText}\`); _e._clearCtx = { service: 'external', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: 'call api' }; throw _e; }\n`;
      code += `${pad}    const _ct = _res.headers.get("content-type") || "";\n`;
      code += `${pad}    return _ct.includes("json") ? _res.json() : _res.text();\n`;
      code += `${pad}  } finally { clearTimeout(_timer); }\n`;
      code += `${pad})()`;
      return code;
    }

    // Phase 45: Service presets (Stripe, SendGrid, Twilio)
    case NodeType.SERVICE_CALL: {
      const svc = node.service;
      const exprVal = (key) => {
        const v = node.config[key];
        if (!v) return 'undefined';
        if (typeof v === 'object' && v.type) return exprToCode(v, ctx);
        return JSON.stringify(v);
      };

      if (svc === 'stripe') {
        // Stripe Charges API — uses form-encoded, not JSON
        const code = `${pad}await (async () => {\n` +
          `${pad}  const _body = new URLSearchParams({ amount: String(${exprVal('amount')}), currency: ${exprVal('currency') || '"usd"'}, source: ${exprVal('token')}, description: ${exprVal('description') || '""'} });\n` +
          `${pad}  const _res = await fetch('https://api.stripe.com/v1/charges', {\n` +
          `${pad}    method: 'POST',\n` +
          `${pad}    headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },\n` +
          `${pad}    body: _body.toString()\n` +
          `${pad}  });\n` +
          `${pad}  if (!_res.ok) { const _e = new Error('Stripe API error: ' + _res.status + ' ' + (await _res.text()).slice(0, 200)); _e._clearCtx = { service: 'Stripe', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: 'charge via stripe' }; throw _e; }\n` +
          `${pad}  return _res.json();\n` +
          `${pad}})()`;
        return code;
      }

      if (svc === 'sendgrid') {
        const code = `${pad}await (async () => {\n` +
          `${pad}  const _res = await fetch('https://api.sendgrid.com/v3/mail/send', {\n` +
          `${pad}    method: 'POST',\n` +
          `${pad}    headers: { 'Authorization': 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' },\n` +
          `${pad}    body: JSON.stringify({ personalizations: [{ to: [{ email: ${exprVal('to')} }] }], from: { email: ${exprVal('from')} }, subject: ${exprVal('subject')}, content: [{ type: 'text/plain', value: ${exprVal('body')} }] })\n` +
          `${pad}  });\n` +
          `${pad}  if (!_res.ok) { const _e = new Error('SendGrid API error: ' + _res.status + ' ' + (await _res.text()).slice(0, 200)); _e._clearCtx = { service: 'SendGrid', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: 'send email via sendgrid' }; throw _e; }\n` +
          `${pad}  return { ok: true, status: _res.status };\n` +
          `${pad}})()`;
        return code;
      }

      if (svc === 'twilio') {
        const code = `${pad}await (async () => {\n` +
          `${pad}  const _sid = process.env.TWILIO_SID;\n` +
          `${pad}  const _token = process.env.TWILIO_TOKEN;\n` +
          `${pad}  const _body = new URLSearchParams({ To: ${exprVal('to')}, From: process.env.TWILIO_FROM || ${exprVal('from')}, Body: ${exprVal('body')} });\n` +
          `${pad}  const _res = await fetch(\`https://api.twilio.com/2010-04-01/Accounts/\${_sid}/Messages.json\`, {\n` +
          `${pad}    method: 'POST',\n` +
          `${pad}    headers: { 'Authorization': 'Basic ' + Buffer.from(_sid + ':' + _token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },\n` +
          `${pad}    body: _body.toString()\n` +
          `${pad}  });\n` +
          `${pad}  if (!_res.ok) { const _e = new Error('Twilio API error: ' + _res.status + ' ' + (await _res.text()).slice(0, 200)); _e._clearCtx = { service: 'Twilio', line: ${node.line}, file: '${node._sourceFile || 'main.clear'}', source: 'send sms via twilio' }; throw _e; }\n` +
          `${pad}  return _res.json();\n` +
          `${pad}})()`;
        return code;
      }

      return `${pad}// Unknown service: ${svc}`;
    }

    case NodeType.CREATE_PDF:
      return compilePdf(node, ctx, pad);

    case NodeType.SAVE_CSV: {
      const safePath = JSON.stringify(node.path);
      const dataCode = exprToCode(node.data, ctx);
      if (ctx.lang === 'python') {
        return `${pad}import csv as _csv\n${pad}with open(${safePath}, "w", newline="") as _f:\n${pad}    _w = _csv.DictWriter(_f, fieldnames=list(${dataCode}[0].keys()))\n${pad}    _w.writeheader()\n${pad}    _w.writerows(${dataCode})`;
      }
      return `${pad}(function(data, path) { const headers = Object.keys(data[0]); const lines = [headers.join(",")]; for (const row of data) { lines.push(headers.map(h => String(row[h] ?? "")).join(",")); } require("fs").writeFileSync(path, lines.join("\\n")); })(${dataCode}, ${safePath});`;
    }

    case NodeType.FILE_OP: {
      const safePath = JSON.stringify(node.path);
      const dataCode = node.data ? exprToCode(node.data, ctx) : '""';
      if (node.operation === 'write') {
        if (ctx.lang === 'python') {
          return `${pad}with open(${safePath}, "w") as _f:\n${pad}    _f.write(str(${dataCode}))`;
        }
        return `${pad}require("fs").writeFileSync(${safePath}, String(${dataCode}));`;
      }
      if (node.operation === 'append') {
        if (ctx.lang === 'python') {
          return `${pad}with open(${safePath}, "a") as _f:\n${pad}    _f.write(str(${dataCode}))`;
        }
        return `${pad}require("fs").appendFileSync(${safePath}, String(${dataCode}));`;
      }
      // read/exists are expression-level, handled in exprToCode
      return `${pad}// file op: ${node.operation}`;
    }

    case NodeType.CRUD:
      return compileCrud(node, ctx, pad);

    case NodeType.TEST_DEF: {
      // Check if body contains mock AI nodes
      const mockNodes = node.body.filter(n => n.type === NodeType.MOCK_AI);
      const nonMockBody = node.body.filter(n => n.type !== NodeType.MOCK_AI);
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(nonMockBody, ctx);
        return `${pad}def test_${sanitizeName(node.name)}():\n${bodyCode}`;
      }
      const bodyCode = compileBody(nonMockBody, ctx, { declared: new Set() });
      if (mockNodes.length > 0) {
        // Build mock responses. _askAI returns a plain string for text responses,
        // and an object for structured output (with schema). Match that behavior:
        // - single `text` field → return the string directly
        // - multiple fields → return object (structured output)
        const mocks = mockNodes.map(m => {
          if (m.fields.length === 1 && m.fields[0].name === 'text') {
            // Plain text mock — _askAI returns a string, not {text: "..."}
            return typeof m.fields[0].value === 'string' ? JSON.stringify(m.fields[0].value) : String(m.fields[0].value);
          }
          const obj = m.fields.map(f => {
            const val = typeof f.value === 'string' ? JSON.stringify(f.value) : f.value;
            return `${JSON.stringify(f.name)}: ${val}`;
          }).join(', ');
          return `{ ${obj} }`;
        });
        let code = `${pad}test(${JSON.stringify(node.name)}, async () => {\n`;
        code += `${pad}  const _origAskAI = typeof _askAI !== 'undefined' ? _askAI : null;\n`;
        code += `${pad}  const _origAskAITools = typeof _askAIWithTools !== 'undefined' ? _askAIWithTools : null;\n`;
        code += `${pad}  const _origClassify = typeof _classifyIntent !== 'undefined' ? _classifyIntent : null;\n`;
        if (mocks.length === 1) {
          code += `${pad}  _askAI = async () => (${mocks[0]});\n`;
          code += `${pad}  _askAIWithTools = async () => (${mocks[0]});\n`;
        } else {
          code += `${pad}  const _mockResponses = [${mocks.join(', ')}];\n`;
          code += `${pad}  let _mockIdx = 0;\n`;
          code += `${pad}  const _mockFn = async () => _mockResponses[_mockIdx++];\n`;
          code += `${pad}  _askAI = _mockFn;\n`;
          code += `${pad}  _askAIWithTools = _mockFn;\n`;
        }
        // Mock _classifyIntent to use the mocked _askAI (it calls _askAI internally,
        // so with the mock in place it will work correctly for text responses)
        code += `${pad}  _classifyIntent = async (input, cats) => { const r = await _askAI(input); const c = String(r).trim().toLowerCase(); for (const cat of cats) { if (c.includes(cat.toLowerCase())) return cat; } return cats[cats.length - 1]; };\n`;
        code += `${pad}  try {\n`;
        code += bodyCode.split('\n').map(l => '  ' + l).join('\n') + '\n';
        code += `${pad}  } finally { if (_origAskAI) _askAI = _origAskAI; if (_origAskAITools) _askAIWithTools = _origAskAITools; if (_origClassify) _classifyIntent = _origClassify; }\n`;
        code += `${pad}});`;
        return code;
      }
      return `${pad}test(${JSON.stringify(node.name)}, async () => {\n${bodyCode}\n${pad}});`;
    }

    case NodeType.EXPECT: {
      if (ctx.lang === 'python') return `${pad}assert ${exprToCode(node.expression, ctx)}`;
      return `${pad}expect(${exprToCode(node.expression, ctx)}).toBeTruthy();`;
    }

    case NodeType.UNIT_ASSERT: {
      const left = exprToCode(node.left, ctx);
      const check = JSON.stringify(node.check);
      const right = node.right ? exprToCode(node.right, ctx) : 'null';
      const line = node.line || 0;
      const raw = JSON.stringify(node.rawLeft);
      if (ctx.lang === 'python') {
        // Python: simple assert with readable message
        const ops = { eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' };
        if (node.check === 'empty') return `${pad}assert not ${left}, f"Expected '${node.rawLeft}' to be empty, got {${left}}"`;
        if (node.check === 'not_empty') return `${pad}assert ${left}, f"Expected '${node.rawLeft}' to not be empty, got {${left}}"`;
        return `${pad}assert ${left} ${ops[node.check] || '=='} ${right}, f"Expected '${node.rawLeft}' to be {${right}}, got {${left}}"`;
      }
      return `${pad}_unitAssert(${left}, ${check}, ${right}, ${line}, ${raw});`;
    }

    case NodeType.HTTP_TEST_CALL: {
      // Compiles to: _response = await fetch(baseUrl + path, { method, body })
      // Also records _lastCall = {method, path, line} so the next status assertion
      // can produce a friendly error like "POST /api/todos returned 404 — no such endpoint"
      const method = JSON.stringify(node.method);
      const path = JSON.stringify(node.path);
      const line = node.line || 0;
      const record = `${pad}_lastCall = { method: ${method}, path: ${path}, line: ${line} };\n`;
      if (node.bodyFields && node.bodyFields.length > 0) {
        const bodyObj = node.bodyFields.map(f => `${JSON.stringify(f.name)}: ${exprToCode(f.value, ctx)}`).join(', ');
        let code = record;
        code += `${pad}_response = await fetch(_baseUrl + ${path}, {\n`;
        code += `${pad}  method: ${method},\n`;
        code += `${pad}  headers: { 'Content-Type': 'application/json' },\n`;
        code += `${pad}  body: JSON.stringify({ ${bodyObj} })\n`;
        code += `${pad}});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);`;
        return code;
      }
      let code = record;
      code += `${pad}_response = await fetch(_baseUrl + ${path}, { method: ${method} });\n`;
      code += `${pad}_responseBody = await _response.json().catch(() => null);`;
      return code;
    }

    case NodeType.EXPECT_RESPONSE: {
      if (node.property === 'status' && node.check === 'equals') {
        // _expectStatus produces a human-readable error like:
        //   "POST /api/notes returned 404 — that endpoint doesn't exist on the server [clear:87]"
        return `${pad}_expectStatus(_response, ${node.value});`;
      }
      if (node.property === 'status' && node.check === 'success') {
        return `${pad}_expectSuccess(_response);`;
      }
      if (node.property === 'status' && node.check === 'failure') {
        return `${pad}_expectFailure(_response);`;
      }
      if (node.property === 'body' && node.check === 'has_field') {
        return `${pad}_expectBodyHas(_responseBody, ${JSON.stringify(node.field)});`;
      }
      if (node.property === 'body' && node.check === 'contains') {
        return `${pad}_expectBodyContains(_responseBody, ${JSON.stringify(node.value)});`;
      }
      if (node.property === 'body' && node.check === 'error_contains') {
        // "X should fail with error 'message'" — assert error response contains the message
        return `${pad}_expectFailure(_response);\n${pad}_expectErrorContains(_responseBody, ${JSON.stringify(node.value)});`;
      }
      if (node.property === 'body' && node.check === 'length') {
        if (node.value != null) {
          return `${pad}_expectBodyLength(_responseBody, ${node.value});`;
        }
        return `${pad}_expectBodyTruthy(_responseBody);`;
      }
      // "expect todos has 'Buy groceries'" → check variable contains value
      if (node.property === 'variable' && node.check === 'contains') {
        return `${pad}assert(JSON.stringify(_state?.${sanitizeName(node.field)} || _responseBody).includes(${JSON.stringify(node.value)}), "${node.field} should contain " + ${JSON.stringify(node.value)});`;
      }
      return `${pad}expect(_response.ok).toBeTruthy();`;
    }

    case NodeType.TEST_INTENT: {
      // Intent-based test steps: "can user create a todo", "does deleting require login"
      // The compiler resolves resource names to endpoints using the AST context.
      const astBody = ctx._astBody || [];
      const endpoints = astBody.filter(n => n.type === NodeType.ENDPOINT);
      const res = node.resource.toLowerCase();

      // Find the matching endpoint by resource name in the path
      function findEndpoint(method) {
        return endpoints.find(ep => {
          if (method && ep.method !== method) return false;
          const pathParts = ep.path.split('/').filter(Boolean);
          const last = pathParts[pathParts.length - 1].replace(/^:/, '').toLowerCase();
          // Match singular or plural: "todo" matches "todos"
          return last === res || last === res + 's' || last.replace(/s$/, '') === res || last.replace(/ies$/, 'y') === res;
        });
      }

      if (node.intent === 'create') {
        const ep = findEndpoint('POST');
        if (!ep) return `${pad}// Could not find POST endpoint for ${node.resource}`;
        const path = JSON.stringify(ep.path);
        const headers = ep.body?.some(n => n.type === NodeType.REQUIRES_AUTH)
          ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        if (node.expectFailure) {
          // "can user create a todo without a title" → send incomplete data, expect 400
          let code = `${pad}_response = await fetch(_baseUrl + ${path}, {\n`;
          code += `${pad}  method: "POST", headers: ${headers},\n`;
          code += `${pad}  body: JSON.stringify({})\n`;
          code += `${pad}});\n`;
          code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
          code += `${pad}assert(_response.status === 400, "Should reject incomplete data, got " + _response.status);`;
          return code;
        }
        // Build payload from fields or validation rules
        let payload = '{}';
        if (node.fields.length > 0) {
          const entries = node.fields.map(f => `${JSON.stringify(f.name)}: ${exprToCode(f.value, ctx)}`).join(', ');
          payload = `{ ${entries} }`;
        }
        let code = `${pad}_response = await fetch(_baseUrl + ${path}, {\n`;
        code += `${pad}  method: "POST", headers: ${headers},\n`;
        code += `${pad}  body: JSON.stringify(${payload})\n`;
        code += `${pad}});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
        code += `${pad}assert(_response.status >= 200 && _response.status < 300, "Create should succeed, got " + _response.status);`;
        return code;
      }

      if (node.intent === 'view') {
        const ep = findEndpoint('GET');
        if (!ep) return `${pad}// Could not find GET endpoint for ${node.resource}`;
        const path = JSON.stringify(ep.path);
        const opts = ep.body?.some(n => n.type === NodeType.REQUIRES_AUTH) ? ', { headers: AUTH_HEADERS }' : '';
        let code = `${pad}_response = await fetch(_baseUrl + ${path}${opts});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
        code += `${pad}assert(_response.status === 200, "View should return 200, got " + _response.status);`;
        return code;
      }

      if (node.intent === 'search') {
        // "can user search todos" → find GET endpoint with 'search' in path
        const searchEp = endpoints.find(ep => ep.method === 'GET' && ep.path.includes('search'));
        if (!searchEp) return `${pad}// Could not find search endpoint`;
        const path = JSON.stringify(searchEp.path);
        const opts = searchEp.body?.some(n => n.type === NodeType.REQUIRES_AUTH) ? ', { headers: AUTH_HEADERS }' : '';
        let code = `${pad}_response = await fetch(_baseUrl + ${path}${opts});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
        code += `${pad}assert(_response.status === 200, "Search should return 200, got " + _response.status);`;
        return code;
      }

      if (node.intent === 'delete') {
        const ep = findEndpoint('DELETE');
        if (!ep) return `${pad}// Could not find DELETE endpoint for ${node.resource}`;
        const path = ep.path.replace(/:(\w+)/g, '1');
        const opts = ep.body?.some(n => n.type === NodeType.REQUIRES_AUTH) ? ', { method: "DELETE", headers: AUTH_HEADERS }' : ', { method: "DELETE" }';
        let code = `${pad}_response = await fetch(_baseUrl + "${path}"${opts});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);`;
        return code;
      }

      if (node.intent === 'require_login') {
        // "does creating a todo require login" → POST without auth, expect 401
        const methodMap = { create: 'POST', delete: 'DELETE', update: 'PUT', view: 'GET' };
        const method = methodMap[node.action] || 'POST';
        const ep = findEndpoint(method);
        if (!ep) return `${pad}// Could not find ${method} endpoint for ${node.resource}`;
        const path = ep.path.replace(/:(\w+)/g, '1');
        let code = `${pad}_response = await fetch(_baseUrl + "${path}", {\n`;
        code += `${pad}  method: "${method}",\n`;
        if (method === 'POST' || method === 'PUT') {
          code += `${pad}  headers: { "Content-Type": "application/json" },\n`;
          code += `${pad}  body: JSON.stringify({ test: true })\n`;
        }
        code += `${pad}});\n`;
        code += `${pad}assert(_response.status === 401, "Should require login, got " + _response.status);`;
        return code;
      }

      if (node.intent === 'ask_agent') {
        // "can user ask agent 'Support' with message is 'hello'"
        // Find the endpoint that calls this agent by name
        const agentEps = endpoints.filter(ep => ep.method === 'POST');
        const callingEp = agentEps.find(ep => {
          return (ep.body || []).some(n =>
            n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT &&
            n.expression.agentName === node.resource
          );
        });
        if (!callingEp) return `${pad}// Could not find endpoint for agent '${node.resource}'`;
        const headers = callingEp.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        let payload = '{ message: "test" }';
        if (node.fields.length > 0) {
          const entries = node.fields.map(f => `${JSON.stringify(f.name)}: ${exprToCode(f.value, ctx)}`).join(', ');
          payload = `{ ${entries} }`;
        }
        let code = `${pad}_response = await fetch(_baseUrl + "${callingEp.path}", {\n`;
        code += `${pad}  method: "POST", headers: ${headers},\n`;
        code += `${pad}  body: JSON.stringify(${payload})\n`;
        code += `${pad}});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
        if (node.expectFailure) {
          code += `${pad}assert(_response.status >= 400, "Agent should reject this input, got " + _response.status);`;
        } else {
          code += `${pad}assert(_response.status >= 200 && _response.status < 300, "Agent should respond, got " + _response.status);`;
        }
        return code;
      }

      if (node.intent === 'shows') {
        // "does the todo list show 'Buy groceries'" → GET + check response
        const ep = findEndpoint('GET');
        if (!ep) return `${pad}// Could not find GET endpoint for ${node.resource}`;
        const path = JSON.stringify(ep.path);
        const opts = ep.body?.some(n => n.type === NodeType.REQUIRES_AUTH) ? ', { headers: AUTH_HEADERS }' : '';
        let code = `${pad}_response = await fetch(_baseUrl + ${path}${opts});\n`;
        code += `${pad}_responseBody = await _response.json().catch(() => null);\n`;
        code += `${pad}assert(JSON.stringify(_responseBody).includes(${JSON.stringify(node.value)}), "${node.resource} should show ${node.value}");`;
        return code;
      }

      return `${pad}// Unknown test intent: ${node.intent} ${node.resource}`;
    }

    // P13: Native AI streaming in endpoints
    case NodeType.STREAM_AI: {
      const prompt = exprToCode(node.prompt, ctx);
      const context = node.context ? exprToCode(node.context, ctx) : 'null';
      // Opt-out: `ask claude '...' with X without streaming` → single JSON
      // response (waits for the full answer, returns it once). Useful when
      // downstream consumers need the complete text (summaries, validation).
      if (node.noStream) {
        if (ctx.lang === 'python') {
          return `${pad}return { "text": await _ask_ai(${prompt}, ${context}) }`;
        }
        return `${pad}return res.json({ text: await _askAI(${prompt}, ${context}) });`;
      }
      if (ctx.lang === 'python') {
        let code = `${pad}from starlette.responses import StreamingResponse\n`;
        code += `${pad}async def _ai_stream():\n`;
        code += `${pad}    async for _chunk in _ask_ai_stream(${prompt}, ${context}):\n`;
        code += `${pad}        yield f"data: {json.dumps({'text': _chunk})}\\n\\n"\n`;
        code += `${pad}return StreamingResponse(_ai_stream(), media_type="text/event-stream")`;
        return code;
      }
      let code = `${pad}res.writeHead(200, {\n`;
      code += `${pad}  'Content-Type': 'text/event-stream',\n`;
      code += `${pad}  'Cache-Control': 'no-cache',\n`;
      code += `${pad}  'Connection': 'keep-alive',\n`;
      code += `${pad}});\n`;
      code += `${pad}for await (const _chunk of _askAIStream(${prompt}, ${context})) {\n`;
      code += `${pad}  res.write('data: ' + JSON.stringify({ text: _chunk }) + '\\n\\n');\n`;
      code += `${pad}}\n`;
      code += `${pad}res.end();`;
      return code;
    }

    // Phase 20: Advanced Features
    case NodeType.STREAM: {
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        let code = `${pad}from starlette.responses import StreamingResponse\n`;
        code += `${pad}async def event_generator():\n`;
        code += bodyCode.replace(/return /g, 'yield ') + '\n';
        code += `${pad}return StreamingResponse(event_generator(), media_type="text/event-stream")`;
        return code;
      }
      // Wrap stream body in an Express SSE endpoint
      const streamCtx = { ...ctx, indent: ctx.indent + 2, streamMode: true };
      const bodyCode = node.body.map(n => compileNode(n, streamCtx)).filter(Boolean).join('\n');
      let code = `${pad}app.get('/stream', (req, res) => {\n`;
      code += `${pad}  res.writeHead(200, {\n`;
      code += `${pad}    'Content-Type': 'text/event-stream',\n`;
      code += `${pad}    'Cache-Control': 'no-cache',\n`;
      code += `${pad}    Connection: 'keep-alive',\n`;
      code += `${pad}  });\n`;
      code += `${pad}  // Heartbeat to detect disconnected clients\n`;
      code += `${pad}  const _heartbeat = setInterval(() => {\n`;
      code += `${pad}    res.write(':\\n\\n');\n`;
      code += `${pad}  }, 30000);\n`;
      code += `${pad}  req.on('close', () => {\n`;
      code += `${pad}    clearInterval(_heartbeat);\n`;
      code += `${pad}  });\n`;
      code += `${pad}  // Stream body\n`;
      code += `${pad}  (async () => {\n`;
      code += bodyCode + '\n';
      code += `${pad}  })();\n`;
      code += `${pad}});`;
      return code;
    }

    case NodeType.BACKGROUND: {
      const scheduleMs = node.schedule
        ? node.schedule.value * (node.schedule.unit === 'minute' ? 60000 : node.schedule.unit === 'hour' ? 3600000 : 1000)
        : 3600000;
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        let code = `${pad}# Background job: ${node.name}\n`;
        code += `${pad}import asyncio\n`;
        code += `${pad}async def job_${sanitizeName(node.name)}():\n`;
        code += `${pad}    while True:\n`;
        code += bodyCode.split('\n').map(l => `    ${l}`).join('\n') + '\n';
        code += `${pad}        await asyncio.sleep(${scheduleMs / 1000})\n`;
        code += `\n${pad}# _startup_task_: start_${sanitizeName(node.name)}\n`;
        code += `${pad}async def start_${sanitizeName(node.name)}():\n`;
        code += `${pad}    asyncio.create_task(job_${sanitizeName(node.name)}())`;
        return code;
      }
      const bodyCode = compileBody(node.body, ctx, { declared: new Set() });
      let code = `${pad}// Background job: ${node.name}\n`;
      code += `${pad}setInterval(async () => {\n`;
      code += `${pad}  try {\n`;
      code += bodyCode.split('\n').map(l => `  ${l}`).join('\n') + '\n';
      code += `${pad}  } catch (_err) {\n`;
      code += `${pad}    console.error('Background job error:', _err);\n`;
      code += `${pad}  }\n`;
      code += `${pad}}, ${scheduleMs});`;
      return code;
    }

    case NodeType.CRON: {
      if (ctx.lang === 'python') {
        // Compile body at indent 1 — compileBody adds +1, making it indent 2 = 8 spaces
        const cronCtx = { ...ctx, indent: 1 };
        const bodyCode = compileBody(node.body, cronCtx);
        if (node.mode === 'interval') {
          const secMap = { second: 1, minute: 60, hour: 3600 };
          const secs = node.value * (secMap[node.unit] || 60);
          let code = `${pad}# Scheduled: every ${node.value} ${node.unit}(s)\n`;
          code += `${pad}import asyncio\n`;
          code += `${pad}async def _cron_interval_${node.value}_${node.unit}():\n`;
          code += `${pad}    while True:\n`;
          code += `${pad}        await asyncio.sleep(${secs})\n`;
          code += bodyCode + '\n';
          code += `${pad}# _startup_task_: _start_cron_${node.value}_${node.unit}\n`;
          code += `${pad}async def _start_cron_${node.value}_${node.unit}():\n`;
          code += `${pad}    asyncio.create_task(_cron_interval_${node.value}_${node.unit}())`;
          return code;
        } else {
          const h = node.hour, m = node.minute;
          let code = `${pad}# Scheduled: every day at ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}\n`;
          code += `${pad}import asyncio, datetime\n`;
          code += `${pad}async def _cron_daily_${h}_${m}():\n`;
          code += `${pad}    while True:\n`;
          code += `${pad}        now = datetime.datetime.now()\n`;
          code += `${pad}        target = now.replace(hour=${h}, minute=${m}, second=0, microsecond=0)\n`;
          code += `${pad}        if target <= now:\n`;
          code += `${pad}            target += datetime.timedelta(days=1)\n`;
          code += `${pad}        await asyncio.sleep((target - now).total_seconds())\n`;
          code += bodyCode + '\n';
          code += `${pad}# _startup_task_: _start_cron_${h}_${m}\n`;
          code += `${pad}async def _start_cron_${h}_${m}():\n`;
          code += `${pad}    asyncio.create_task(_cron_daily_${h}_${m}())`;
          return code;
        }
      }
      // JS
      const bodyCode = compileBody(node.body, ctx, { declared: new Set() });
      if (node.mode === 'interval') {
        const msMap = { second: 1000, minute: 60000, hour: 3600000 };
        const ms = node.value * (msMap[node.unit] || 60000);
        let code = `${pad}// Scheduled: every ${node.value} ${node.unit}(s)\n`;
        code += `${pad}setInterval(async () => {\n`;
        code += `${pad}  try {\n`;
        code += bodyCode.split('\n').map(l => `  ${l}`).join('\n') + '\n';
        code += `${pad}  } catch (_err) {\n`;
        code += `${pad}    console.error('Scheduled task error:', _err);\n`;
        code += `${pad}  }\n`;
        code += `${pad}}, ${ms});`;
        return code;
      } else {
        // mode === 'at': every day at HH:MM
        const h = node.hour;
        const m = node.minute;
        let code = `${pad}// Scheduled: every day at ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}\n`;
        code += `${pad}(function _scheduleDailyAt${h}_${m}() {\n`;
        code += `${pad}  const _runAt = async () => {\n`;
        code += `${pad}    try {\n`;
        code += bodyCode.split('\n').map(l => `    ${l}`).join('\n') + '\n';
        code += `${pad}    } catch (_err) {\n`;
        code += `${pad}      console.error('Scheduled task error:', _err);\n`;
        code += `${pad}    }\n`;
        code += `${pad}  };\n`;
        code += `${pad}  const _nextMs = () => {\n`;
        code += `${pad}    const now = new Date();\n`;
        code += `${pad}    const next = new Date(now);\n`;
        code += `${pad}    next.setHours(${h}, ${m}, 0, 0);\n`;
        code += `${pad}    if (next <= now) next.setDate(next.getDate() + 1);\n`;
        code += `${pad}    return next - now;\n`;
        code += `${pad}  };\n`;
        code += `${pad}  const _tick = () => { _runAt(); setTimeout(_tick, 86400000); };\n`;
        code += `${pad}  setTimeout(_tick, _nextMs());\n`;
        code += `${pad}})();`;
        return code;
      }
    }

    case NodeType.BROADCAST: {
      const msg = node.value ? exprToCode(node.value, ctx) : 'message';
      if (ctx.lang === 'python') {
        return `${pad}for _client in _ws_clients:\n${pad}    await _client.send_json(${msg})`;
      }
      return `${pad}wss.clients.forEach(_c => { if (_c.readyState === 1) _c.send(JSON.stringify(${msg})); });`;
    }
    case NodeType.SUBSCRIBE: {
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        let code = `${pad}# Subscribe: ${node.channel}\n`;
        code += `${pad}from fastapi.websockets import WebSocket\n`;
        code += `${pad}@app.websocket("/ws/${sanitizeName(node.channel)}")\n`;
        code += `${pad}async def ws_${sanitizeName(node.channel)}(websocket: WebSocket):\n`;
        code += `${pad}    await websocket.accept()\n`;
        code += `${pad}    while True:\n`;
        code += `${pad}        message = await websocket.receive_json()\n`;
        code += bodyCode.split('\n').map(l => `    ${l}`).join('\n');
        return code;
      }
      const bodyCode = compileBody(node.body, ctx, { declared: new Set() });
      const wsName = `wss_${sanitizeName(node.channel)}`;
      let code = `${pad}// Subscribe: ${node.channel}\n`;
      code += `${pad}const WebSocket = require('ws');\n`;
      code += `${pad}const ${wsName} = new WebSocket.Server({ noServer: true });\n`;
      code += `${pad}const _clients_${sanitizeName(node.channel)} = new Set();\n`;
      code += `${pad}${wsName}.on('connection', (ws) => {\n`;
      code += `${pad}  _clients_${sanitizeName(node.channel)}.add(ws);\n`;
      code += `${pad}  // Heartbeat: detect dead connections\n`;
      code += `${pad}  ws._isAlive = true;\n`;
      code += `${pad}  ws.on('pong', () => { ws._isAlive = true; });\n`;
      code += `${pad}  ws.on('message', (message) => {\n`;
      code += bodyCode + '\n';
      code += `${pad}  });\n`;
      code += `${pad}  ws.on('close', () => {\n`;
      code += `${pad}    _clients_${sanitizeName(node.channel)}.delete(ws);\n`;
      code += `${pad}  });\n`;
      code += `${pad}});\n`;
      code += `${pad}// Heartbeat interval: ping all clients every 30s\n`;
      code += `${pad}setInterval(() => {\n`;
      code += `${pad}  ${wsName}.clients.forEach((ws) => {\n`;
      code += `${pad}    if (!ws._isAlive) return ws.terminate();\n`;
      code += `${pad}    ws._isAlive = false;\n`;
      code += `${pad}    ws.ping();\n`;
      code += `${pad}  });\n`;
      code += `${pad}}, 30000);`;
      return code;
    }

    case NodeType.MIGRATION: {
      const sqlTypes = { text: 'TEXT', number: 'INTEGER', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP' };
      if (ctx.lang === 'python') {
        let code = `${pad}# Migration: ${node.name}\n`;
        for (const op of node.operations) {
          if (op.op === 'add_column') {
            const table = pluralizeName(op.table);
            let col = `${op.column} ${sqlTypes[op.type] || 'TEXT'}`;
            if (op.default !== null && op.default !== undefined) col += ` DEFAULT '${op.default}'`;
            code += `${pad}db.execute("ALTER TABLE ${table} ADD COLUMN ${col}")\n`;
          } else if (op.op === 'remove_column') {
            const table = pluralizeName(op.table);
            code += `${pad}db.execute("ALTER TABLE ${table} DROP COLUMN ${op.column}")\n`;
          }
        }
        return code;
      }
      let code = `${pad}// Migration: ${node.name}\n`;
      for (const op of node.operations) {
        if (op.op === 'add_column') {
          const table = pluralizeName(op.table);
          let col = `${op.column} ${sqlTypes[op.type] || 'TEXT'}`;
          if (op.default !== null && op.default !== undefined) col += ` DEFAULT '${op.default}'`;
          code += `${pad}await db.run('ALTER TABLE ${table} ADD COLUMN ${col}');\n`;
        } else if (op.op === 'remove_column') {
          const table = pluralizeName(op.table);
          code += `${pad}await db.run('ALTER TABLE ${table} DROP COLUMN ${op.column}');\n`;
        }
      }
      return code;
    }

    case NodeType.WAIT: {
      const ms = node.unit === 'second' ? node.duration * 1000
        : node.unit === 'minute' ? node.duration * 60000
        : node.unit === 'hour' ? node.duration * 3600000
        : node.duration;
      if (ctx.lang === 'python') {
        return `${pad}await asyncio.sleep(${ms / 1000})`;
      }
      return `${pad}await new Promise(resolve => setTimeout(resolve, ${ms}));`;
    }

    // Phase 19: File Uploads & External APIs
    case NodeType.ACCEPT_FILE: {
      const maxBytes = parseFileSize(node.config.maxSize || '10mb');
      const types = node.config.allowedTypes;
      if (ctx.lang === 'python') {
        let code = `${pad}# File upload\n`;
        code += `${pad}from fastapi import UploadFile, File\n`;
        code += `${pad}async def handle_upload(file: UploadFile = File(...)):\n`;
        code += `${pad}    if file.size > ${maxBytes}:\n`;
        code += `${pad}        raise HTTPException(status_code=400, detail="File too large, max ${node.config.maxSize || '10mb'}")\n`;
        if (types.length > 0) {
          code += `${pad}    allowed = ${JSON.stringify(types)}\n`;
          code += `${pad}    if file.content_type not in allowed:\n`;
          code += `${pad}        raise HTTPException(status_code=400, detail=f"File type {file.content_type} not allowed")\n`;
        }
        code += `${pad}    contents = await file.read()\n`;
        code += `${pad}    return {"filename": file.filename, "size": len(contents)}`;
        return code;
      }
      let code = `${pad}// File upload\n`;
      code += `${pad}const upload = multer({\n`;
      code += `${pad}  limits: { fileSize: ${maxBytes} },\n`;
      if (types.length > 0) {
        code += `${pad}  fileFilter: (req, file, cb) => {\n`;
        code += `${pad}    const allowed = ${JSON.stringify(types)};\n`;
        code += `${pad}    if (allowed.includes(file.mimetype)) cb(null, true);\n`;
        code += `${pad}    else cb(new Error('File type not allowed'));\n`;
        code += `${pad}  },\n`;
      }
      code += `${pad}});`;
      return code;
    }

    case NodeType.EXTERNAL_FETCH:
      return compileExternalFetch(node, ctx, pad);

    // Phase 18: Billing & Payments
    // 1:1 rule: compile to config only, user writes their own endpoint
    case NodeType.CHECKOUT: {
      const c = node.config;
      if (ctx.lang === 'python') {
        let code = `${pad}# Checkout config: ${node.name}\n`;
        code += `${pad}CHECKOUT_${sanitizeName(node.name).toUpperCase()} = {\n`;
        if (c.price) code += `${pad}    "price": "${typeof c.price === 'string' ? c.price : ''}",\n`;
        if (c.mode) code += `${pad}    "mode": "${c.mode}",\n`;
        if (c.success_url) code += `${pad}    "success_url": "${c.success_url}",\n`;
        if (c.cancel_url) code += `${pad}    "cancel_url": "${c.cancel_url}",\n`;
        code += `${pad}}`;
        return code;
      }
      let code = `${pad}// Checkout config: ${node.name}\n`;
      code += `${pad}const CHECKOUT_${sanitizeName(node.name).toUpperCase()} = {\n`;
      if (c.price) code += `${pad}  price: '${typeof c.price === 'string' ? c.price : ''}',\n`;
      if (c.mode) code += `${pad}  mode: '${c.mode}',\n`;
      if (c.success_url) code += `${pad}  success_url: '${c.success_url}',\n`;
      if (c.cancel_url) code += `${pad}  cancel_url: '${c.cancel_url}',\n`;
      code += `${pad}};`;
      return code;
    }

    // NodeType.USAGE_LIMIT case removed 2026-04-21 — zero app usage. See
    // docs/one-to-one-mapping-audit.md.

    // Phase 17: Webhooks (NodeType.OAUTH_CONFIG case removed 2026-04-21 — zero app usage)
    case NodeType.WEBHOOK:
      return compileWebhook(node, ctx, pad);

    // Phase 16: Input Validation
    case NodeType.VALIDATE:
      return compileValidate(node, ctx, pad);

    case NodeType.FIELD_RULE:
      return null; // compiled as part of VALIDATE

    case NodeType.RESPONDS_WITH: {
      if (ctx.lang === 'python') {
        const fields = node.fields.map(f => `${pad}#   ${f.name}: ${f.fieldType}`).join('\n');
        return `${pad}# Response schema:\n${fields}`;
      }
      const fields = node.fields.map(f => `${pad}//   ${f.name}: ${f.fieldType}`).join('\n');
      return `${pad}// Response schema:\n${fields}`;
    }

    case NodeType.RATE_LIMIT: {
      const ms = node.period === 'second' ? 1000 : node.period === 'minute' ? 60000 : node.period === 'hour' ? 3600000 : 60000;
      if (ctx.lang === 'python') {
        // slowapi rate limiting for FastAPI
        return `${pad}# Rate limit: ${node.count} per ${node.period}\n${pad}from slowapi import Limiter\n${pad}from slowapi.util import get_remote_address\n${pad}_limiter = Limiter(key_func=get_remote_address)\n${pad}app.state.limiter = _limiter`;
      }
      return `${pad}// Rate limit: ${node.count} per ${node.period}\n${pad}app.use(rateLimit({ windowMs: ${ms}, max: ${node.count} }));`;
    }

    case NodeType.LIST_PUSH: {
      const val = exprToCode(node.value, ctx);
      const list = sanitizeName(node.list);
      if (ctx.stateVars && ctx.stateVars.has(list)) {
        return `${pad}_state.${list}.push(${val});`;
      }
      if (ctx.lang === 'python') return `${pad}${list}.append(${val})`;
      return `${pad}${list}.push(${val});`;
    }

    case NodeType.LIST_SORT: {
      const list = sanitizeName(node.list);
      const field = sanitizeName(node.field);
      const dir = node.descending ? -1 : 1;
      const listRef = (ctx.stateVars && ctx.stateVars.has(list)) ? `_state.${list}` : list;
      if (ctx.lang === 'python') return `${pad}${list}.sort(key=lambda x: x.get("${field}", ""), reverse=${node.descending ? 'True' : 'False'})`;
      return `${pad}${listRef}.sort((a, b) => a.${field} > b.${field} ? ${dir} : a.${field} < b.${field} ? ${-dir} : 0);`;
    }

    case NodeType.MAP_SET: {
      const map = exprToCode(node.map, ctx);
      const key = exprToCode(node.key, ctx);
      const val = exprToCode(node.value, ctx);
      if (ctx.lang === 'python') return `${pad}${map}[${key}] = ${val}`;
      return `${pad}${map}[${key}] = ${val};`;
    }

    case NodeType.NAVIGATE: {
      const url = JSON.stringify(node.url);
      if (ctx.lang === 'python') return `${pad}# Navigate to ${node.url}`;
      return `${pad}window.location.hash = ${url};`;
    }

    case NodeType.REFRESH:
      if (ctx.lang === 'python') return `${pad}# refresh page (client-side only)`;
      return `${pad}window.location.reload();`;

    case NodeType.LIST_REMOVE: {
      const val = exprToCode(node.value, ctx);
      const list = sanitizeName(node.list);
      if (ctx.stateVars && ctx.stateVars.has(list)) {
        return `${pad}_state.${list} = _state.${list}.filter(_item => _item !== ${val});`;
      }
      if (ctx.lang === 'python') return `${pad}${list} = [_item for _item in ${list} if _item != ${val}]`;
      return `${pad}${list} = ${list}.filter(_item => _item !== ${val});`;
    }

    case NodeType.LOGIN_ACTION: {
      // login with email and password → POST to /auth/login, store JWT, redirect
      if (ctx.lang === 'python') return `${pad}# Login action — frontend only`;
      if (ctx.mode === 'backend') return null; // frontend-only node
      const loginFields = node.fields.map(f => `${sanitizeName(f)}: _state.${sanitizeName(f)}`).join(', ');
      const lines = [];
      lines.push(`${pad}{ const _loginData = { ${loginFields} };`);
      lines.push(`${pad}  const _r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_loginData) });`);
      lines.push(`${pad}  const _d = await _r.json();`);
      lines.push(`${pad}  if (_d.token) { localStorage.setItem('token', _d.token); window.location.href = '/'; }`);
      lines.push(`${pad}  else { alert(_d.error || 'Login failed'); } }`);
      return lines.join('\n');
    }

    case NodeType.UPLOAD_TO: {
      // File upload: upload <var> to '<url>'
      // Compiles to FormData + fetch POST with multipart/form-data
      const uploadUrl = JSON.stringify(node.url);
      if (ctx.lang === 'python') return `${pad}# File upload to ${node.url}`;
      if (ctx.mode === 'backend') {
        // Backend: accept multipart upload — already handled by ACCEPT_FILE
        return `${pad}// File upload to ${node.url} — use 'accept file:' on the endpoint`;
      }
      // Frontend web mode: build FormData from file input(s)
      const lines = [];
      lines.push(`${pad}{ const _fd = new FormData();`);
      for (const v of node.variables) {
        const inputId = 'input_' + sanitizeName(v);
        lines.push(`${pad}  const _fileEl = document.getElementById('${inputId}');`);
        lines.push(`${pad}  if (_fileEl && _fileEl.files[0]) _fd.append('${sanitizeName(v)}', _fileEl.files[0]);`);
      }
      lines.push(`${pad}  await fetch(${uploadUrl}, { method: 'POST', body: _fd }); }`);
      return lines.join('\n');
    }

    case NodeType.API_CALL: {
      const url = JSON.stringify(node.url);
      if (ctx.lang === 'python') return `${pad}# API call: ${node.method} ${node.url}`;

      // Auto-upgrade: if the endpoint streams, use the streaming reader
      // regardless of whether the user wrote `stream ...` or `get ... from`.
      // Streaming is the default for `ask claude` in endpoints — the client
      // should Just Work without an extra keyword.
      const streamsFromAst = ctx.streamingEndpoints && ctx.streamingEndpoints.has(node.url);
      const isStreamMethod = node.method === 'STREAM' || streamsFromAst;
      // If the user wrote `get X from '/url' with fields` and the endpoint is
      // a POST (streaming or not), upgrade to POST so the fields are sent.
      // For non-streaming POSTs this fetches once and stores JSON in _state[X].
      const isSendAndReceive = node.method === 'GET' && node.fields && node.fields.length > 0 && !streamsFromAst;

      if (node.method === 'GET' && !streamsFromAst && !isSendAndReceive) {
        const target = node.targetVar ? sanitizeName(node.targetVar) : 'response';
        const srcInfo = node.line ? ` [clear:${node.line}${node._sourceFile ? ' ' + node._sourceFile : ''}]` : '';
        return `${pad}_state.${target} = await fetch(${url}).then(r => { if (!r.ok) throw new Error('Failed to load data'); return r.json(); }).catch(e => { console.error('[GET ${node.url}]${srcInfo}', e.message); return _state.${target}; });`;
      }
      if (isSendAndReceive) {
        // POST with fields, parse JSON response into _state[targetVar]
        const target = sanitizeName(node.targetVar);
        const fieldObj = '{ ' + node.fields.map(f => `${sanitizeName(f)}: _state.${sanitizeName(f)}`).join(', ') + ' }';
        const srcInfo = node.line ? ` [clear:${node.line}${node._sourceFile ? ' ' + node._sourceFile : ''}]` : '';
        const lines = [];
        lines.push(`${pad}{ const _r = await fetch(${url}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${fieldObj}) });`);
        lines.push(`${pad}  if (!_r.ok) { const _e = await _r.json().catch(() => ({})); console.error('[POST ${node.url}]${srcInfo}', _e.error || 'request failed'); throw new Error(_e.error || 'request failed'); }`);
        lines.push(`${pad}  const _d = await _r.json();`);
        lines.push(`${pad}  _state.${target} = (_d && typeof _d === 'object' && 'text' in _d) ? _d.text : _d;`);
        lines.push(`${pad}}`);
        return lines.join('\n');
      }
      if (isStreamMethod) {
        // Frontend streaming consumer: POST body, read response as SSE text
        // stream, append each `data:` payload's text to _state[targetVar] and
        // recompute so `display <var>` grows live as chunks arrive. Matches
        // the backend emission from `ask claude` / `stream ask claude`
        // (which writes SSE frames with `{ text: "..." }` JSON payloads).
        // Triggered by explicit `stream X from URL` OR by auto-detection
        // when the target URL is a streaming endpoint in the same app.
        const target = sanitizeName(node.targetVar || 'response');
        const fieldObj = (node.fields && node.fields.length > 0)
          ? '{ ' + node.fields.map(f => `${sanitizeName(f)}: _state.${sanitizeName(f)}`).join(', ') + ' }'
          : '_state';
        const srcInfo = node.line ? ` [clear:${node.line}${node._sourceFile ? ' ' + node._sourceFile : ''}]` : '';
        const lines = [];
        lines.push(`${pad}{ _state.${target} = ''; _recompute();`);
        lines.push(`${pad}  const _r = await fetch(${url}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${fieldObj}) });`);
        lines.push(`${pad}  if (!_r.ok) { const _e = await _r.text().catch(() => ''); console.error('[STREAM ${node.url}]${srcInfo}', _e); throw new Error('Stream request failed: ' + _r.status); }`);
        lines.push(`${pad}  const _reader = _r.body.getReader();`);
        lines.push(`${pad}  const _dec = new TextDecoder();`);
        lines.push(`${pad}  let _buf = '';`);
        lines.push(`${pad}  while (true) {`);
        lines.push(`${pad}    const { done: _done, value: _val } = await _reader.read();`);
        lines.push(`${pad}    if (_done) break;`);
        lines.push(`${pad}    _buf += _dec.decode(_val, { stream: true });`);
        lines.push(`${pad}    const _frames = _buf.split('\\n\\n');`);
        lines.push(`${pad}    _buf = _frames.pop();`);
        lines.push(`${pad}    for (const _f of _frames) {`);
        lines.push(`${pad}      const _line = _f.trim();`);
        lines.push(`${pad}      if (!_line.startsWith('data:')) continue;`);
        lines.push(`${pad}      const _payload = _line.slice(5).trim();`);
        lines.push(`${pad}      if (_payload === '[DONE]') continue;`);
        lines.push(`${pad}      try {`);
        lines.push(`${pad}        const _evt = JSON.parse(_payload);`);
        lines.push(`${pad}        if (typeof _evt.text === 'string') { _state.${target} += _evt.text; _recompute(); }`);
        lines.push(`${pad}        else if (_evt.error) { _state.${target} += '[error: ' + _evt.error + ']'; _recompute(); }`);
        lines.push(`${pad}      } catch (_e) { /* skip non-JSON frame */ }`);
        lines.push(`${pad}    }`);
        lines.push(`${pad}  }`);
        lines.push(`${pad}}`);
        return lines.join('\n');
      }
      // POST/PUT/DELETE: send specific fields, form inputs, or full state
      let bodyExpr;
      if (node.fields && node.fields.length > 0) {
        // Specific fields: post to '/api/tasks' with title, description
        const fieldObj = node.fields.map(f => `${sanitizeName(f)}: _state.${sanitizeName(f)}`).join(', ');
        bodyExpr = `{ ${fieldObj} }`;
      } else if (node.sendFormData && ctx.stateVars) {
        // "with form data" — send only input-bound state vars, not the whole _state
        const inputFields = [...ctx.stateVars].filter(v => !v.startsWith('_'));
        if (inputFields.length > 0) {
          const fieldObj = inputFields.map(f => `${f}: _state.${f}`).join(', ');
          bodyExpr = `{ ${fieldObj} }`;
        } else {
          bodyExpr = '_state';
        }
      } else {
        bodyExpr = '_state';
      }
      // Helper: compile a fetch call with error checking
      const srcInfo = node.line ? ` [clear:${node.line}${node._sourceFile ? ' ' + node._sourceFile : ''}]` : '';
      const fetchWithErrorCheck = (fetchUrl, method, body) => {
        const lines = [];
        lines.push(`${pad}{ const _r = await fetch(${fetchUrl}, { method: '${method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${body}) });`);
        lines.push(`${pad}  if (!_r.ok) { const _e = await _r.json().catch(() => ({})); console.error('[${method} ${node.url}]${srcInfo}', _e.error || '${method} failed'); throw new Error(_e.error || _e.message || '${method} failed'); } }`);
        return lines.join('\n');
      };
      // Auto-upsert: if this is a POST and a matching PUT/PATCH endpoint exists,
      // check _editing_id to decide whether to create or update
      if (node.method === 'POST' && ctx.updateEndpoints) {
        const postMatch = node.url.match(/\/api\/(\w+)$/);
        if (postMatch) {
          const resource = postMatch[1].toLowerCase();
          const upInfo = ctx.updateEndpoints[resource];
          if (upInfo) {
            const lines = [];
            lines.push(`${pad}if (_state._editing_id) {`);
            lines.push(fetchWithErrorCheck(JSON.stringify(upInfo.url) + ' + _state._editing_id', upInfo.method, bodyExpr));
            lines.push(`${pad}  _state._editing_id = null;`);
            lines.push(`${pad}} else {`);
            lines.push(fetchWithErrorCheck(url, node.method, bodyExpr));
            lines.push(`${pad}}`);
            return lines.join('\n');
          }
        }
      }
      return fetchWithErrorCheck(url, node.method, bodyExpr);
    }

    case NodeType.COMPONENT_DEF: {
      const params = node.props.map(sanitizeName).join(', ');

      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}def ${sanitizeName(node.name)}(${params}):\n${bodyCode}`;
      }
      // JS: compile component as a function that returns HTML string
      const compDeclared = new Set(node.props.map(sanitizeName));
      const compCtx = { ...ctx, indent: ctx.indent + 1, declared: compDeclared, componentMode: true };
      const bodyParts = [];
      bodyParts.push(`${padFor(compCtx)}let _html = '';`);
      for (const child of node.body) {
        if (child.type === NodeType.CONTENT) {
          const htmlLine = compileContentToHTML(child, compCtx);
          if (htmlLine) bodyParts.push(htmlLine);
        } else if (child.type === NodeType.SHOW) {
          const val = exprToCode(child.expression, compCtx);
          // show X in component: append value directly (could be HTML from slot or plain text)
          bodyParts.push(`${padFor(compCtx)}_html += ${val};`);
        } else {
          const compiled = compileNode(child, compCtx);
          if (compiled) bodyParts.push(compiled);
        }
      }
      bodyParts.push(`${padFor(compCtx)}return _html;`);
      return `${pad}function ${sanitizeName(node.name)}(${params}) {\n${bodyParts.join('\n')}\n${pad}}`;
    }

    case NodeType.COMPONENT_USE: {
      // Compile children to HTML string, then call component with it
      const childParts = [];
      for (const child of node.children) {
        if (child.type === NodeType.CONTENT) {
          const tag = { heading: 'h1', subheading: 'h2', text: 'p', bold: 'strong', italic: 'em', small: 'small', divider: 'hr' }[child.contentType] || 'p';
          if (child.contentType === 'divider') childParts.push("'<hr>'");
          else childParts.push(`'<${tag}>${(child.text || '').replace(/'/g, "\\'")}</${tag}>'`);
        } else if (child.type === NodeType.SHOW) {
          childParts.push(`'<p>' + ${exprToCode(child.expression, ctx)} + '</p>'`);
        }
      }
      const childrenExpr = childParts.length > 0 ? childParts.join(' + ') : "''";
      if (ctx.lang === 'python') return `${pad}# Component: ${node.name}`;
      return `${pad}// Render: ${node.name} with children\n${pad}${sanitizeName(node.name)}(${childrenExpr});`;
    }

    case NodeType.TOAST: {
      const msg = JSON.stringify(node.message);
      const variantMap = { success: 'alert-success', warning: 'alert-warning', error: 'alert-error', info: 'alert-info' };
      const alertClass = variantMap[node.variant] || 'alert-success';
      return `${pad}_toast(${msg}, "${alertClass}");`;
    }

    case NodeType.PANEL_ACTION: {
      const slug = sanitizeName(node.target.replace(/\s+/g, '_').toLowerCase());
      const panelId = `panel-${slug}`;
      if (node.action === 'toggle') {
        return `${pad}{ const _p = document.getElementById('${panelId}'); if (_p) { if (_p.style.display === 'none') _p.style.display = ''; else _p.style.display = 'none'; } }`;
      }
      if (node.action === 'open') {
        // Check if it's a modal (dialog element) or a regular panel
        return `${pad}{ const _p = document.getElementById('${panelId}'); if (_p) { if (_p.tagName === 'DIALOG') _p.showModal(); else _p.style.display = ''; } }`;
      }
      if (node.action === 'close') {
        // "close modal" -- find the nearest dialog ancestor or target
        if (node.target === 'this') {
          return `${pad}{ const _d = this.closest('dialog'); if (_d) _d.close(); }`;
        }
        return `${pad}{ const _p = document.getElementById('${panelId}'); if (_p) { if (_p.tagName === 'DIALOG') _p.close(); else _p.style.display = 'none'; } }`;
      }
      return null;
    }

    case NodeType.TAB:
      return null; // Tabs are compiled as part of their parent TAB_GROUP section

    case NodeType.HIDE_ELEMENT: {
      // hide <element> → set display:none on the target element
      const hideSlug = sanitizeName(node.target.replace(/\s+/g, '_').toLowerCase());
      return `${pad}{ const _el = document.getElementById('${hideSlug}') || document.querySelector('[data-name="${hideSlug}"]'); if (_el) _el.style.display = 'none'; }`;
    }

    case NodeType.CLIPBOARD_COPY: {
      // copy X to clipboard → navigator.clipboard.writeText
      const clipVar = sanitizeName(node.variable);
      const clipVal = ctx.stateVars && ctx.stateVars.has(clipVar) ? `_state.${clipVar}` : clipVar;
      return `${pad}navigator.clipboard.writeText(String(${clipVal})).then(() => _toast('Copied to clipboard', 'success')).catch(() => _toast('Copy failed', 'error'));`;
    }

    case NodeType.DOWNLOAD_FILE: {
      // download X as 'filename' → Blob + anchor click
      const dlVar = sanitizeName(node.variable);
      const dlVal = ctx.stateVars && ctx.stateVars.has(dlVar) ? `_state.${dlVar}` : dlVar;
      const dlFilename = JSON.stringify(node.filename || 'download.txt');
      return `${pad}{ const _blob = new Blob([typeof ${dlVal} === 'object' ? JSON.stringify(${dlVal}, null, 2) : String(${dlVal})], { type: 'text/plain' }); const _a = document.createElement('a'); _a.href = URL.createObjectURL(_blob); _a.download = ${dlFilename}; _a.click(); URL.revokeObjectURL(_a.href); }`;
    }

    case NodeType.LOADING_ACTION: {
      // show loading / hide loading → overlay spinner
      if (node.action === 'show') {
        const loadMsg = node.message ? JSON.stringify(node.message) : "'Loading...'";
        return `${pad}{ let _lo = document.getElementById('_loading_overlay'); if (!_lo) { _lo = document.createElement('div'); _lo.id = '_loading_overlay'; _lo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;'; _lo.innerHTML = '<div class="flex flex-col items-center gap-3"><span class="loading loading-spinner loading-lg text-primary"></span><p class="text-base-content font-medium">' + ${loadMsg} + '</p></div>'; document.body.appendChild(_lo); } else { _lo.style.display = 'flex'; } }`;
      }
      // hide loading
      return `${pad}{ const _lo = document.getElementById('_loading_overlay'); if (_lo) _lo.style.display = 'none'; }`;
    }

    case NodeType.MATCH: {
      const matchVal = exprToCode(node.expression, ctx);
      if (ctx.lang === 'python') {
        let code = `${pad}match ${matchVal}:\n`;
        for (const c of node.cases) {
          code += `${pad}    case ${exprToCode(c.value, ctx)}:\n`;
          code += compileBody(c.body, ctx, { indent: ctx.indent + 2 }) + '\n';
        }
        if (node.defaultBody) {
          code += `${pad}    case _:\n`;
          code += compileBody(node.defaultBody, ctx, { indent: ctx.indent + 2 });
        }
        return code;
      }
      // JS: compile to if/else-if chain
      // Hoist variable declarations from branches to avoid block-scoping issues
      // Without this, `let x = ...` in the first branch is invisible to else branches
      const lines = [];
      const allBranches = node.cases.map(c => c.body);
      if (node.defaultBody) allBranches.push(node.defaultBody);
      const hoisted = new Set();
      for (const branch of allBranches) {
        for (const n of branch) {
          if (n.type === NodeType.ASSIGN && n.name && !ctx.declared.has(n.name)) {
            hoisted.add(n.name);
          }
        }
      }
      for (const v of hoisted) {
        lines.push(`${pad}let ${sanitizeName(v)};`);
        ctx.declared.add(v);
      }
      for (let ci = 0; ci < node.cases.length; ci++) {
        const c = node.cases[ci];
        const val = exprToCode(c.value, ctx);
        const keyword = ci === 0 ? 'if' : '} else if';
        lines.push(`${pad}${keyword} (${matchVal} == ${val}) {`);
        for (const n of c.body) {
          const compiled = compileNode(n, { ...ctx, indent: ctx.indent + 1 });
          if (compiled) lines.push(compiled);
        }
      }
      if (node.defaultBody) {
        lines.push(`${pad}} else {`);
        for (const n of node.defaultBody) {
          const compiled = compileNode(n, { ...ctx, indent: ctx.indent + 1 });
          if (compiled) lines.push(compiled);
        }
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }

    case NodeType.LOG_REQUESTS: {
      // JS: handled in scaffold (compileToJSBackend) for correct middleware ordering
      if (ctx.lang === 'python') {
        return `${pad}@app.middleware("http")\n${pad}async def log_requests(request, call_next):\n${pad}    import time\n${pad}    start = time.time()\n${pad}    response = await call_next(request)\n${pad}    ms = round((time.time() - start) * 1000)\n${pad}    print(f"{request.method} {request.url.path} {response.status_code} {ms}ms")\n${pad}    return response`;
      }
      return null; // emitted in scaffold before auth middleware
    }

    case NodeType.ALLOW_CORS: {
      // JS: handled in scaffold (compileToJSBackend) for correct middleware ordering
      if (ctx.lang === 'python') {
        return `${pad}from fastapi.middleware.cors import CORSMiddleware\n${pad}app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])`;
      }
      return null; // emitted in scaffold before auth middleware
    }

    case NodeType.AUTH_SCAFFOLD: {
      // JS: handled in scaffold (compileToJSBackend) — emits full auth system
      if (ctx.lang === 'python') {
        return compileAuthScaffoldPython(pad);
      }
      return null; // emitted in scaffold
    }

    // Nodes handled by dedicated loops in the reactive compiler -- skip here
    case NodeType.ON_PAGE_LOAD:
    case NodeType.ON_CHANGE:
    case NodeType.ASK_FOR:
    case NodeType.DISPLAY:
    case NodeType.CHART:
      return null;

    default:
      if (ctx.lang === 'python') return `${pad}print(${exprToCode(node, ctx)})`;
      return `${pad}console.log(${exprToCode(node, ctx)});`;
  }
}

export function exprToCode(expr, ctx) {
  switch (expr.type) {
    case NodeType.LITERAL_NUMBER:
      return String(expr.value);

    case NodeType.LITERAL_STRING: {
      // Structured interpolation: {expr} with arbitrary expressions
      if (expr.parts) {
        if (ctx.lang === 'python') {
          // Use f-string when all expressions are simple (var refs, member access, arithmetic)
          // For complex expressions, use str() concatenation
          const isSimpleExpr = (e) =>
            e.type === NodeType.VARIABLE_REF ||
            e.type === NodeType.MEMBER_ACCESS ||
            e.type === NodeType.BINARY_OP ||
            e.type === NodeType.LITERAL_NUMBER;
          const allSimple = expr.parts.every(p => p.text !== undefined || isSimpleExpr(p.expr));
          if (allSimple) {
            // Emit as f-string: f"Hello, {name}!"
            const fParts = expr.parts.map(p =>
              p.text !== undefined
                ? p.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\{/g, '{{').replace(/\}/g, '}}')
                : `{${exprToCode(p.expr, ctx)}}`
            );
            return `f"${fParts.join('')}"`;
          }
          const pyParts = expr.parts.map(p =>
            p.text !== undefined
              ? JSON.stringify(p.text)
              : `str(${exprToCode(p.expr, ctx)})`
          );
          return pyParts.length === 1 ? pyParts[0] : pyParts.join(' + ');
        }
        const jsParts = expr.parts.map(p => {
          if (p.text !== undefined) {
            // Escape backslashes, backticks, and ${ in literal text
            let t = p.text;
            t = t.split('\\').join('\\\\');
            t = t.split('`').join('\\`');
            t = t.split('${').join('\\${');
            return t;
          }
          return '${' + exprToCode(p.expr, ctx) + '}';
        });
        return '`' + jsParts.join('') + '`';
      }

      const val = expr.value;
      // Fallback: simple {var} interpolation (plain identifiers only)
      if (val.includes('{') && val.includes('}')) {
        if (ctx.lang === 'python') {
          return `f"${val.replace(/"/g, '\\"')}"`;
        }
        // JS: convert {var} to ${var} in a template literal
        const tmpl = val.replace(/\{(\w+)\}/g, (_, v) => {
          const ref = ctx.stateVars?.has(v) ? `_state.${v}` : v;
          return '${' + ref + '}';
        });
        return '`' + tmpl + '`';
      }
      return JSON.stringify(val);
    }

    case NodeType.MAP_KEYS: {
      const mapSrc = exprToCode(expr.source, ctx);
      return ctx.lang === 'python' ? `list(${mapSrc}.keys())` : `Object.keys(${mapSrc})`;
    }

    case NodeType.MAP_VALUES: {
      const mapSrc = exprToCode(expr.source, ctx);
      return ctx.lang === 'python' ? `list(${mapSrc}.values())` : `Object.values(${mapSrc})`;
    }

    case NodeType.MAP_EXISTS: {
      const mapKey = exprToCode(expr.key, ctx);
      const mapObj = exprToCode(expr.map, ctx);
      return `(${mapKey} in ${mapObj})`;
    }

    case NodeType.MAP_APPLY: {
      const applyFn = sanitizeName(expr.fn);
      const applyList = exprToCode(expr.list, ctx);
      if (ctx.lang === 'python') return `[${applyFn}(x) for x in ${applyList}]`;
      return `${applyList}.map(${applyFn})`;
    }

    case NodeType.FILTER_APPLY: {
      const filterFn = sanitizeName(expr.fn);
      const filterList = exprToCode(expr.list, ctx);
      if (ctx.lang === 'python') return `[x for x in ${filterList} if ${filterFn}(x)]`;
      return `${filterList}.filter(${filterFn})`;
    }

    case NodeType.LITERAL_BOOLEAN:
      if (ctx.lang === 'python') return expr.value ? 'True' : 'False';
      return expr.value ? 'true' : 'false';

    case NodeType.LITERAL_NOTHING:
      return ctx.lang === 'python' ? 'None' : 'null';

    case NodeType.LITERAL_LIST:
      return `[${expr.elements.map(e => exprToCode(e, ctx)).join(', ')}]`;

    case NodeType.LITERAL_RECORD: {
      if (ctx.lang === 'python') {
        const fields = expr.entries.map(e => `"${e.key}": ${exprToCode(e.value, ctx)}`);
        return `{ ${fields.join(', ')} }`;
      }
      const fields = expr.entries.map(e => `${sanitizeName(e.key)}: ${exprToCode(e.value, ctx)}`);
      return `{ ${fields.join(', ')} }`;
    }

    case NodeType.MEMBER_ACCESS:
      // Dynamic key: scope at key_name -> scope[key_name]
      if (expr.dynamicKey) {
        const obj = exprToCode(expr.object, ctx);
        const key = exprToCode(expr.dynamicKey, ctx);
        if (ctx.lang === 'python') return `${obj}[${key}]`;
        return `${obj}[${key}]`;
      }
      if (ctx.lang === 'python') {
        const objCode = exprToCode(expr.object, ctx);
        // Exception objects use attribute access, not dict access.
        // `error` is the only user-visible exception variable in Clear.
        const isException = expr.object.type === NodeType.VARIABLE_REF && expr.object.name === 'error';
        if (isException) return `${objCode}.${sanitizeName(expr.member)}`;
        return `${objCode}["${expr.member}"]`;
      }
      // Use optional chaining (?.) for possessive read access.
      // This prevents the classic "Cannot read properties of null" crash —
      // if any object in the chain is null/undefined, the whole expression
      // returns undefined instead of crashing. Clear's one-op-per-line rule
      // means the null will surface at the next usage, loudly and specifically.
      // Exception: `error` is a known JS Error object — use hard `.` for `.message`
      // since optional chaining on Error properties is unnecessary noise.
      const isErrorObj = expr.object.type === NodeType.VARIABLE_REF && expr.object.name === 'error';
      if (isErrorObj) return `${exprToCode(expr.object, ctx)}.${sanitizeName(expr.member)}`;
      return `${exprToCode(expr.object, ctx)}?.${sanitizeName(expr.member)}`;

    case NodeType.VARIABLE_REF: {
      const name = sanitizeName(expr.name);
      // `caller` / `current user` (canonical `_current_user`) compiles to req.user.
      // Bare `user` in backend context is legacy shorthand for the same — BUT
      // only when no local `user` binding is in scope. A receiving var named
      // `user` (e.g. POST /api/users receiving user) introduces a local that
      // shadows the magic; respect the shadow so `send back user` returns the
      // body, not req.user.
      if (name === '_current_user') {
        return ctx.lang === 'python' ? 'request.user' : 'req.user';
      }
      if (name === 'user' && ctx.mode === 'backend' && !(ctx.declared && ctx.declared.has('user'))) {
        return ctx.lang === 'python' ? 'request.user' : 'req.user';
      }
      if (ctx.stateVars && ctx.stateVars.has(name)) return `_state.${name}`;
      // Inside filter condition: bare field names become item.field (JS) or item["field"] (Python)
      if (ctx.filterItemPrefix) {
        if (ctx.lang === 'python') return `${ctx.filterItemPrefix}["${name}"]`;
        return `${ctx.filterItemPrefix}.${name}`;
      }
      return name;
    }

    case NodeType.BINARY_OP: {
      const op = ctx.lang === 'python' ? mapOperatorPython(expr.operator) : expr.operator;
      const left = exprToCode(expr.left, ctx);
      const right = exprToCode(expr.right, ctx);
      // Skip outer parens for simple comparisons and logical ops (reduces ((x == null)) noise)
      const simpleOps = ['==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', 'and', 'or', 'in', 'not in'];
      if (simpleOps.includes(op)) return `${left} ${op} ${right}`;
      return `(${left} ${op} ${right})`;
    }

    case NodeType.UNARY_OP:
      if (ctx.lang === 'python') {
        if (expr.operator === 'not') return `not (${exprToCode(expr.operand, ctx)})`;
        return `(${expr.operator}${exprToCode(expr.operand, ctx)})`;
      }
      if (expr.operator === 'not') return `!(${exprToCode(expr.operand, ctx)})`;
      return `(${expr.operator}${exprToCode(expr.operand, ctx)})`;

    case NodeType.CALL: {
      // Method call on an expression: helpers's double(5) -> helpers.double(5)
      if (expr.callee) {
        const calleeCode = exprToCode(expr.callee, ctx);
        const args = expr.args.map(a => exprToCode(a, ctx)).join(', ');
        return `${calleeCode}(${args})`;
      }
      // Backend-mode overrides for runtime functions
      if (expr.name === 'fetch_data' && ctx.mode === 'backend') {
        const url = exprToCode(expr.args[0], ctx);
        if (ctx.lang === 'python') return `(await httpx.AsyncClient().get(${url})).json()`;
        return `(await (await fetch(${url})).json())`;
      }
      // env() compiles differently in backend mode (direct process.env access)
      if (expr.name === 'env' && ctx.mode === 'backend') {
        const key = exprToCode(expr.args[0], ctx);
        if (ctx.lang === 'python') return `os.environ.get(${key}, "")`;
        return `(process.env[${key}] || "")`;
      }

      // Internal collection operations compile to inline expressions
      if (expr.name === '_first') {
        const arr = exprToCode(expr.args[0], ctx);
        return ctx.lang === 'python' ? `${arr}[0]` : `${arr}[0]`;
      }
      if (expr.name === '_last') {
        const arr = exprToCode(expr.args[0], ctx);
        return ctx.lang === 'python' ? `${arr}[-1]` : `${arr}[${arr}.length - 1]`;
      }
      if (expr.name === '_rest') {
        const arr = exprToCode(expr.args[0], ctx);
        return ctx.lang === 'python' ? `${arr}[1:]` : `${arr}.slice(1)`;
      }
      if (expr.name === '_map_prop') {
        const arr = exprToCode(expr.args[0], ctx);
        const prop = expr.args[1].value; // string literal
        return ctx.lang === 'python' ? `[item["${prop}"] for item in ${arr}]` : `${arr}.map(item => item.${sanitizeName(prop)})`;
      }
      if (expr.name === '_combine') {
        const left = exprToCode(expr.args[0], ctx);
        const right = exprToCode(expr.args[1], ctx);
        return ctx.lang === 'python' ? `{**${left}, **${right}}` : `{ ...${left}, ...${right} }`;
      }
      const args = expr.args.map(a => exprToCode(a, ctx)).join(', ');
      // Add await for user-defined async functions (detected by pre-scan)
      const awaitPrefix = ctx._asyncFunctions?.has(expr.name) ? 'await ' : '';
      // User-defined functions always shadow built-in aliases.
      // e.g. `define function sum(a, b)` → sum(2,3) calls the user's function, not _clear_sum.
      if (ctx._userFunctions?.has(expr.name)) {
        return `${awaitPrefix}${sanitizeName(expr.name)}(${args})`;
      }
      const fnName = ctx.lang === 'python' ? mapFunctionNamePython(expr.name) : mapFunctionNameJS(expr.name);
      return `${awaitPrefix}${fnName}(${args})`;
    }

    case NodeType.JSON_PARSE: {
      const src = exprToCode(expr.source, ctx);
      if (ctx.lang === 'python') return `json.loads(${src})`;
      return `JSON.parse(${src})`;
    }

    case NodeType.JSON_STRINGIFY: {
      const src = exprToCode(expr.source, ctx);
      if (ctx.lang === 'python') return `json.dumps(${src})`;
      return `JSON.stringify(${src})`;
    }

    case NodeType.HTTP_REQUEST: {
      // call api 'url' as expression (e.g., result = call api 'https://...')
      const urlCode = exprToCode(expr.url, ctx);
      const config = expr.config || {};
      const hasBody = config.body;
      const method = config.method || (hasBody ? 'POST' : 'GET');
      const timeoutMs = config.timeout
        ? (config.timeout.unit === 'minutes' ? config.timeout.value * 60000 : config.timeout.value * 1000)
        : 30000;
      let headersCode = '';
      if (config.headers && config.headers.length > 0) {
        const entries = config.headers.map(h => `${JSON.stringify(h.name)}: ${exprToCode(h.value, ctx)}`).join(', ');
        headersCode = `{ ${entries} }`;
      }
      const bodyCode = hasBody ? `JSON.stringify(${exprToCode(config.body, ctx)})` : 'undefined';
      let code = `await (async () => {\n`;
      code += `  const _ctrl = new AbortController();\n`;
      code += `  const _timer = setTimeout(() => _ctrl.abort(), ${timeoutMs});\n`;
      code += `  try {\n`;
      code += `    const _res = await fetch(${urlCode}, { method: '${method}'`;
      if (headersCode) code += `, headers: ${headersCode}`;
      if (hasBody) code += `, body: ${bodyCode}`;
      code += `, signal: _ctrl.signal });\n`;
      code += `    if (!_res.ok) { const _e = new Error(\`External API error: \${_res.status} \${_res.statusText}\`); _e._clearCtx = { service: 'external', line: ${expr.line || 0}, file: '${expr._sourceFile || 'main.clear'}', source: 'call api' }; throw _e; }\n`;
      code += `    const _ct = _res.headers.get("content-type") || "";\n`;
      code += `    return _ct.includes("json") ? _res.json() : _res.text();\n`;
      code += `  } catch (_err) {\n`;
      code += `    if (!_err._clearCtx) { _err._clearCtx = { service: 'external', line: ${expr.line || 0}, file: '${expr._sourceFile || 'main.clear'}', source: 'call api' }; }\n`;
      code += `    throw _err;\n`;
      code += `  } finally { clearTimeout(_timer); }\n`;
      code += `})()`;
      return code;
    }

    case NodeType.ASK_AI: {
      const prompt = exprToCode(expr.prompt, ctx);
      // Multi-context: merge comma-separated vars into JSON object
      let context;
      if (expr.context && expr.context.type === 'multi_context') {
        const entries = expr.context.contexts.map(c => {
          const code = exprToCode(c, ctx);
          const key = c.name || c.value || code.replace(/[^a-zA-Z0-9_]/g, '_');
          return `${JSON.stringify(key)}: ${code}`;
        });
        context = `JSON.stringify({ ${entries.join(', ')} })`;
      } else {
        context = expr.context ? exprToCode(expr.context, ctx) : null;
      }
      const schema = expr.schema ? JSON.stringify(expr.schema) : null;
      const model = expr.model ? JSON.stringify(expr.model) : null;
      // Streaming mode: use _askAIStream async generator
      if (ctx.streamMode) {
        return context ? `_askAIStream(${prompt}, ${context}, ${model || 'null'})` : `_askAIStream(${prompt}, null, ${model || 'null'})`;
      }
      if (ctx.lang === 'python') {
        if (schema) return `await _ask_ai(${prompt}, ${context || 'None'}, ${schema})`;
        return context ? `await _ask_ai(${prompt}, ${context})` : `await _ask_ai(${prompt})`;
      }
      if (schema || model) return `await _askAI(${prompt}, ${context || 'null'}, ${schema || 'null'}, ${model || 'null'})`;
      return context ? `await _askAI(${prompt}, ${context})` : `await _askAI(${prompt})`;
    }

    case NodeType.CLASSIFY: {
      const inputCode = exprToCode(expr.input, ctx);
      const cats = expr.categories.map(c => JSON.stringify(c)).join(', ');
      return `await _classifyIntent(${inputCode}, [${cats}])`;
    }

    case NodeType.RUN_AGENT: {
      const fnName = 'agent_' + sanitizeName(expr.agentName.toLowerCase().replace(/\s+/g, '_'));
      const arg = expr.argument ? exprToCode(expr.argument, ctx) : '';
      return `await ${fnName}(${arg})`;
    }

    case NodeType.RUN_PIPELINE: {
      const fnName = 'pipeline_' + sanitizeName(expr.pipelineName.toLowerCase().replace(/\s+/g, '_'));
      const arg = expr.argument ? exprToCode(expr.argument, ctx) : '';
      return `await ${fnName}(${arg})`;
    }

    case NodeType.RUN_WORKFLOW: {
      const fnName = 'workflow_' + sanitizeName(expr.workflowName.toLowerCase().replace(/\s+/g, '_'));
      const arg = expr.argument ? exprToCode(expr.argument, ctx) : '{}';
      return `await ${fnName}(${arg})`;
    }

    case NodeType.RAW_QUERY: {
      const sql = JSON.stringify(expr.sql);
      const params = expr.params ? exprToCode(expr.params, ctx) : null;
      if (ctx.lang === 'python') {
        return params
          ? `await (await _get_db()).fetch(${sql}, ${params})`
          : `await (await _get_db()).fetch(${sql})`;
      }
      return params
        ? `(await _pool.query(${sql}, [${params}])).rows`
        : `(await _pool.query(${sql})).rows`;
    }

    case NodeType.COUNT_BY: {
      const list = sanitizeName(expr.list);
      const field = expr.field;
      if (ctx.lang === 'python') {
        return `(lambda data, key: {k: sum(1 for r in data if r[key] == k) for k in set(r[key] for r in data)})(${list}, "${field}")`;
      }
      return `${list}.reduce((counts, item) => { const k = item.${sanitizeName(field)}; counts[k] = (counts[k] || 0) + 1; return counts; }, {})`;
    }

    case NodeType.UNIQUE_VALUES: {
      const list = sanitizeName(expr.list);
      const field = expr.field;
      if (ctx.lang === 'python') {
        return `list(set(r["${field}"] for r in ${list}))`;
      }
      return `[...new Set(${list}.map(item => item.${sanitizeName(field)}))]`;
    }

    case NodeType.GROUP_BY: {
      const list = sanitizeName(expr.list);
      const field = expr.field;
      if (ctx.lang === 'python') {
        return `(lambda data, key: {k: [r for r in data if r[key] == k] for k in set(r[key] for r in data)})(${list}, "${field}")`;
      }
      return `${list}.reduce((groups, item) => { const k = item.${sanitizeName(field)}; (groups[k] = groups[k] || []).push(item); return groups; }, {})`;
    }

    case NodeType.FILTER: {
      const list = sanitizeName(expr.list);
      // Compile condition with variable refs prefixed by _item.
      const itemCtx = { ...ctx, filterItemPrefix: '_item' };
      const cond = exprToCode(expr.condition, itemCtx);
      if (ctx.lang === 'python') {
        return `[_item for _item in ${list} if ${cond}]`;
      }
      return `${list}.filter(_item => ${cond})`;
    }

    case NodeType.SEARCH: {
      const table = expr.table ? pluralizeName(expr.table) : 'unknown';
      const query = exprToCode(expr.query, ctx);
      if (ctx.lang === 'python') {
        return `[r for r in await db.find_all('${table}', {}) if ${query}.lower() in ' '.join(str(v) for v in r.values()).lower()][:${DEFAULT_SEARCH_LIMIT}]`;
      }
      return `(await db.findAll('${table}', {})).filter(_r => Object.values(_r).some(_v => String(_v).toLowerCase().includes(String(${query}).toLowerCase()))).slice(0, ${DEFAULT_SEARCH_LIMIT})`;
    }

    case NodeType.SQL_AGGREGATE: {
      const table = pluralizeName(expr.table).toLowerCase();
      const fn = expr.fn.toUpperCase();
      const field = expr.field;
      // Build filter object from optional where-condition. extractEqPairs
      // returns [] for non-equality conditions (like > or <) — emit a
      // runtime error string so user gets a clear message at request time.
      let filterArg = '{}';
      if (expr.condition) {
        const pairs = extractEqPairs(expr.condition, ctx);
        if (pairs.length === 0) {
          return `(() => { throw new Error('SQL aggregates only support equality filters. Use look up all then aggregate in memory for complex filters like > or <.'); })()`;
        }
        if (ctx.lang === 'python') {
          const entries = pairs.map(([k, v]) => `"${k}": ${v}`).join(', ');
          filterArg = `{${entries}}`;
        } else {
          const entries = pairs.map(([k, v]) => `${k}: ${v}`).join(', ');
          filterArg = `{ ${entries} }`;
        }
      }
      // Supabase: no aggregate API — fall back to client-side reduce
      if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
        if (fn === 'COUNT') {
          return `(((await supabase.from('${table}').select('*')).data) || []).length`;
        }
        const fnMap = { SUM: '_clear_sum_field', AVG: '_clear_avg_field', MIN: '_clear_min_field', MAX: '_clear_max_field' };
        const jsFn = fnMap[fn] || '_clear_sum_field';
        return `${jsFn}(((await supabase.from('${table}').select('*')).data) || [], '${field}')`;
      }
      // Python: no db.aggregate — fetch-then-reduce
      if (ctx.lang === 'python') {
        if (fn === 'COUNT') {
          return `len(await db.query('${table}', ${filterArg}))`;
        }
        if (fn === 'AVG') {
          return `(lambda _r: sum(_r)/len(_r) if _r else 0)([r['${field}'] or 0 for r in await db.query('${table}', ${filterArg})])`;
        }
        const op = fn === 'SUM' ? 'sum' : fn === 'MIN' ? 'min' : 'max';
        return `${op}([r['${field}'] or 0 for r in await db.query('${table}', ${filterArg})])`;
      }
      // JS default (SQLite/Postgres): delegate to db.aggregate
      return `await db.aggregate('${table}', '${fn}', '${field}', ${filterArg})`;
    }

    case NodeType.LOAD_CSV: {
      const safePath = JSON.stringify(expr.path);
      if (ctx.lang === 'python') {
        return `(lambda p: (lambda rows: [dict(zip(rows[0], r)) for r in rows[1:]])(list(__import__("csv").reader(open(p)))))(${safePath})`;
      }
      // JS: inline CSV parser — split lines, first line is headers, rest are data rows
      return `(function(p) { const lines = require("fs").readFileSync(p, "utf-8").trim().split("\\n"); const headers = lines[0].split(",").map(h => h.trim()); return lines.slice(1).map(line => { const vals = line.split(","); const obj = {}; headers.forEach((h, i) => { const v = (vals[i] || "").trim(); obj[h] = isNaN(v) || v === "" ? v : Number(v); }); return obj; }); })(${safePath})`;
    }

    case NodeType.FETCH_PAGE: {
      const url = exprToCode(expr.url, ctx);
      if (ctx.lang === 'python') {
        return `(lambda u: __import__("requests").get(u).text)(${url})`;
      }
      // JS: axios GET, return HTML text
      return `(await require("axios").get(${url})).data`;
    }

    case NodeType.FIND_ELEMENTS: {
      const selector = exprToCode(expr.selector, ctx);
      const source = exprToCode(expr.source, ctx);
      if (ctx.lang === 'python') {
        if (expr.mode === 'first') {
          return `(lambda html, sel: (lambda el: {"text": el.get_text(strip=True), "href": el.get("href", ""), "src": el.get("src", ""), "class": " ".join(el.get("class", [])), "id": el.get("id", "")} if el else None)(__import__("bs4").BeautifulSoup(html, "html.parser").select_one(sel)))(${source}, ${selector})`;
        }
        return `[{"text": el.get_text(strip=True), "href": el.get("href", ""), "src": el.get("src", ""), "class": " ".join(el.get("class", [])), "id": el.get("id", "")} for el in __import__("bs4").BeautifulSoup(${source}, "html.parser").select(${selector})]`;
      }
      // JS: cheerio
      if (expr.mode === 'first') {
        return `(function(html, sel) { const $ = require("cheerio").load(html); const el = $(sel).first(); return el.length ? { text: el.text().trim(), href: el.attr("href") || "", src: el.attr("src") || "", class: el.attr("class") || "", id: el.attr("id") || "" } : null; })(${source}, ${selector})`;
      }
      return `(function(html, sel) { const $ = require("cheerio").load(html); return $(sel).map((i, el) => ({ text: $(el).text().trim(), href: $(el).attr("href") || "", src: $(el).attr("src") || "", class: $(el).attr("class") || "", id: $(el).attr("id") || "" })).get(); })(${source}, ${selector})`;
    }

    case NodeType.TRAIN_MODEL: {
      const data = exprToCode(expr.data, ctx);
      const target = JSON.stringify(expr.target);
      if (ctx.lang === 'python') {
        return `(lambda data, target: (lambda X, y, m: (m.fit(X, y), {"_model": m, "accuracy": round(m.score(X, y), 4), "important_features": dict(zip([c for c in data[0].keys() if c != target], [round(f, 4) for f in m.feature_importances_])) if hasattr(m, "feature_importances_") else {}})[-1])([{k: v for k, v in row.items() if k != target} for row in data], [row[target] for row in data], __import__("sklearn.ensemble", fromlist=["RandomForestClassifier"]).RandomForestClassifier(n_estimators=100, random_state=42)))(${data}, ${target})`;
      }
      // JS: REST call to Python ML service
      return `await (async function(data, target) { const resp = await require("node-fetch")("http://localhost:8000/train", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ data, target }) }); return await resp.json(); })(${data}, ${target})`;
    }

    case NodeType.PREDICT: {
      const model = exprToCode(expr.model, ctx);
      const features = expr.features.map(f => JSON.stringify(f));
      if (ctx.lang === 'python') {
        return `(lambda model, features: {"prediction": model["_model"].predict([features])[0], "features": dict(zip(${JSON.stringify(expr.features)}, features))})(${model}, [${features.join(', ')}])`;
      }
      // JS: REST call
      return `await (async function(model, features) { const resp = await require("node-fetch")("http://localhost:8000/predict", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ model_id: model.model_id, features }) }); return await resp.json(); })(${model}, {${expr.features.map(f => `${JSON.stringify(f)}: ${sanitizeName(f)}`).join(', ')}})`;
    }

    case NodeType.TEXT_BLOCK: {
      const textLines = expr.lines || [];
      if (ctx.lang === 'python') {
        // Python: f-string with triple quotes
        const body = textLines.join('\\n');
        return `f"""${body}"""`;
      }
      // JS: template literal with interpolation
      const body = textLines.map(line =>
        line.replace(/\{(\w+)\}/g, '${$1}')
      ).join('\\n');
      return '`' + body + '`';
    }

    case NodeType.DO_ALL: {
      const tasks = expr.tasks || [];
      if (ctx.lang === 'python') {
        const taskCode = tasks.map(t => exprToCode(t, ctx)).join(', ');
        return `await asyncio.gather(${taskCode})`;
      }
      // JS: Promise.all
      const taskCode = tasks.map(t => exprToCode(t, ctx)).join(', ');
      return `await Promise.all([${taskCode}])`;
    }

    case NodeType.CURRENT_TIME: {
      if (expr.subtype === 'today') {
        if (ctx.lang === 'python') return 'datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)';
        return 'new Date(new Date().setHours(0,0,0,0))';
      }
      if (ctx.lang === 'python') return 'datetime.datetime.now()';
      return 'new Date()';
    }

    case NodeType.FORMAT_DATE: {
      const d = exprToCode(expr.date, ctx);
      const fmt = JSON.stringify(expr.format);
      if (ctx.lang === 'python') return `${d}.strftime(${fmt}.replace("YYYY", "%Y").replace("MM", "%m").replace("DD", "%d").replace("HH", "%H").replace("mm", "%M").replace("ss", "%S"))`;
      // JS: simple format replacement using toISOString and string methods
      return `(function(d, f) { const p = (n) => String(n).padStart(2, "0"); return f.replace("YYYY", d.getFullYear()).replace("MM", p(d.getMonth()+1)).replace("DD", p(d.getDate())).replace("HH", p(d.getHours())).replace("mm", p(d.getMinutes())).replace("ss", p(d.getSeconds())); })(${d}, ${fmt})`;
    }

    case NodeType.DAYS_BETWEEN: {
      const s = exprToCode(expr.start, ctx);
      const e = exprToCode(expr.end, ctx);
      if (ctx.lang === 'python') return `abs((${e} - ${s}).days)`;
      return `Math.abs(Math.round((new Date(${e}) - new Date(${s})) / 86400000))`;
    }

    case NodeType.REGEX_FIND: {
      const src = exprToCode(expr.source, ctx);
      const pat = JSON.stringify(expr.pattern);
      if (ctx.lang === 'python') return `re.findall(${pat}, ${src})`;
      return `(${src}.match(new RegExp(${pat}, "g")) || [])`;
    }

    case NodeType.REGEX_MATCH: {
      const src = exprToCode(expr.source, ctx);
      const pat = JSON.stringify(expr.pattern);
      if (ctx.lang === 'python') return `bool(re.search(${pat}, ${src}))`;
      return `new RegExp(${pat}).test(${src})`;
    }

    case NodeType.REGEX_REPLACE: {
      const src = exprToCode(expr.source, ctx);
      const repl = exprToCode(expr.replacement, ctx);
      const pat = JSON.stringify(expr.pattern);
      if (ctx.lang === 'python') return `re.sub(${pat}, ${repl}, ${src})`;
      return `${src}.replace(new RegExp(${pat}, "g"), ${repl})`;
    }

    case NodeType.FILE_OP: {
      const safePath = JSON.stringify(expr.path);
      if (expr.operation === 'read') {
        if (ctx.lang === 'python') return `open(${safePath}, "r").read()`;
        return `require("fs").readFileSync(${safePath}, "utf-8")`;
      }
      if (expr.operation === 'exists') {
        if (ctx.lang === 'python') return `os.path.exists(${safePath})`;
        return `require("fs").existsSync(${safePath})`;
      }
      return ctx.lang === 'python' ? '# ERROR: unknown file op' : '/* ERROR: unknown file op */';
    }

    default:
      return ctx.lang === 'python' ? '# ERROR' : '/* ERROR */';
  }
}

// =============================================================================
// RLS POLICY COMPILER
// =============================================================================

function compileRLSPolicy(policy, tableName) {
  const actionMap = {
    read: 'SELECT', select: 'SELECT',
    update: 'UPDATE', insert: 'INSERT', create: 'INSERT',
    delete: 'DELETE', write: 'ALL',
  };

  const sqlActions = policy.actions.map(a => actionMap[a] || a.toUpperCase());
  // Use the first action for the policy command, or ALL if multiple
  const policyCmd = sqlActions.length > 1 ? 'ALL' : sqlActions[0] || 'SELECT';
  const policyName = `${tableName}_${policy.subject}_${policy.actions.join('_')}`;

  let using = 'true';
  if (policy.subject === 'anyone') {
    using = policy.condition || 'true';
  } else if (policy.subject === 'owner') {
    using = 'user_id = auth.uid()';
  } else if (policy.subject === 'role') {
    using = `current_user_role() = '${policy.role}'`;
  } else if (policy.subject === 'same_org') {
    using = 'org_id = current_user_org_id()';
  }

  return `CREATE POLICY ${policyName} ON ${tableName} FOR ${policyCmd} USING (${using})`;
}

// =============================================================================
// JAVASCRIPT COMPILER
// =============================================================================

function compileToJS(body, errors, sourceMap = false, streamingAgentNames = new Set()) {
  // Check if this is a reactive web app (has page with ask_for or button nodes)
  if (isReactiveApp(body)) {
    return compileToReactiveJS(body, errors, sourceMap, streamingAgentNames);
  }

  const lines = [];
  lines.push(`// Generated by Clear v${CLEAR_VERSION}`);
  const jsDiagram = generateDiagram(body, '//');
  if (jsDiagram) lines.push(jsDiagram);
  lines.push('');

  // Track which variables have been declared (for let vs reassignment)
  const declared = new Set();

  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'web', sourceMap };
  const bodyLines = [];
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      bodyLines.push(result);
    }
  }

  // Tree-shake: only emit utility functions that are actually used
  const bodyText = bodyLines.join('\n');
  const usedUtils = _getUsedUtilities(bodyText);
  if (usedUtils.length > 0) {
    for (const util of usedUtils) lines.push(util);
    lines.push('');
  }

  lines.push(...bodyLines);

  return lines.join('\n');
}

/**
 * Check if the AST represents a reactive web app (has inputs, buttons, or
 * any pattern that requires the reactive runtime: on-page-load fetches,
 * table displays, or on-change handlers).
 *
 * A page with `on page load: get X from '/api/...'` + `display X as table`
 * is reactive even if it has no buttons or inputs — it needs the async IIFE
 * to fetch data and _recompute() to render it into the DOM table.
 */
function isReactiveApp(body) {
  function check(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.ASK_FOR || node.type === NodeType.BUTTON || node.type === NodeType.CHART || node.type === NodeType.ON_CHANGE || node.type === NodeType.COMPONENT_USE) return true;
      // Conditional blocks with UI content need reactive path for show/hide toggling
      if (node.type === NodeType.IF_THEN && node.isBlock) return true;
      // Inline component call: show Card(name) — needs reactive path for DOM injection
      if (node.type === NodeType.SHOW && node.expression && node.expression.type === NodeType.CALL && /^[A-Z]/.test(node.expression.name)) return true;
      if (node.type === NodeType.DISPLAY && node.actions && node.actions.length > 0) return true;
      // A table/list/cards/gallery/map/calendar/qr display requires _recompute() to render into the DOM.
      if (node.type === NodeType.DISPLAY && (node.format === 'table' || node.format === 'list' || node.format === 'cards' || node.format === 'chat' || node.format === 'gallery' || node.format === 'map' || node.format === 'calendar' || node.format === 'qr' || node.format === 'qrcode')) return true;
      // An on-page-load block with API calls requires the async IIFE + _recompute().
      if (node.type === NodeType.ON_PAGE_LOAD) return true;
      if (node.type === NodeType.PAGE || node.type === NodeType.SECTION) {
        if (check(node.body)) return true;
      }
      if (node.type === NodeType.IF_THEN) {
        if (Array.isArray(node.thenBranch) && check(node.thenBranch)) return true;
        if (Array.isArray(node.otherwiseBranch) && check(node.otherwiseBranch)) return true;
      }
    }
    return false;
  }
  return check(body);
}

/**
 * Compile a reactive web app: state object, recompute function, event listeners.
 *
 * Structure of generated JS:
 *   1. State initialization (input variables with defaults)
 *   2. _recompute() function (derived calculations + display updates)
 *   3. Event listeners (inputs update state, buttons run actions)
 *   4. Initial _recompute() call
 */
function compileToReactiveJS(body, errors, sourceMap = false, streamingAgentNames = new Set()) {
  const lines = [];

  // Collect all nodes from page/section bodies (flatten wrappers)
  const flatNodes = [];
  const pageTitles = [];
  function flatten(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.PAGE) {
        pageTitles.push(node.title);
        flatten(node.body);
      } else if (node.type === NodeType.SECTION) {
        flatten(node.body);
      } else {
        flatNodes.push(node);
      }
    }
  }
  flatten(body);

  // --- Chat input absorption pre-scan ---
  // When `display X as chat` is immediately followed by a text input + Send button
  // at the same level, absorb those controls into the chat component's built-in UI
  // so the compiled output doesn't render duplicate input/button elements.
  for (let i = 0; i < flatNodes.length - 2; i++) {
    const disp = flatNodes[i];
    if (disp.type !== NodeType.DISPLAY || disp.format !== 'chat') continue;
    const inp = flatNodes[i + 1];
    if (inp.type !== NodeType.ASK_FOR) continue;
    const btn = flatNodes[i + 2];
    if (btn.type !== NodeType.BUTTON || !btn.body || btn.body.length === 0) continue;
    // Button body must contain a POST API_CALL (the send action)
    const postNode = btn.body.find(n => n.type === NodeType.API_CALL && n.method === 'POST');
    if (!postNode) continue;
    // Found the triple — mark for absorption
    inp._chatAbsorbed = true;
    btn._chatAbsorbed = true;
    // Record absorption info on the display node for Send button wiring
    disp._chatAbsorbedInput = { variable: inp.variable, placeholder: inp.label || '' };
    const getNode = btn.body.find(n => n.type === NodeType.API_CALL && n.method === 'GET');
    const clearNode = btn.body.find(n =>
      n.type === NodeType.ASSIGN && n.expression &&
      (n.expression.type === NodeType.LITERAL_STRING && n.expression.value === '')
    );
    disp._chatAbsorbedButton = {
      buttonNode: btn,
      postUrl: postNode.url,
      postField: postNode.fields?.[0] || inp.variable,
      refreshUrl: getNode ? getNode.url : null,
      refreshVar: getNode ? (getNode.targetVar || null) : null,
      clearVar: clearNode ? clearNode.name : null,
    };
  }

  // Categorize nodes
  const inputNodes = [];     // ask_for nodes
  const displayNodes = [];   // display nodes
  const buttonNodes = [];    // button nodes
  const computeNodes = [];   // assignments, functions, etc.
  const setupNodes = [];     // comments, targets, modules

  for (const node of flatNodes) {
    switch (node.type) {
      case NodeType.ASK_FOR: if (!node._chatAbsorbed) inputNodes.push(node); break;
      case NodeType.DISPLAY: displayNodes.push(node); break;
      case NodeType.CHART: break; // Chart nodes handled separately below
      case NodeType.BUTTON: if (!node._chatAbsorbed) buttonNodes.push(node); break;
      case NodeType.COMMENT:
      case NodeType.TARGET:
      case NodeType.THEME:
      case NodeType.USE:
        setupNodes.push(node); break;
      case NodeType.SCRIPT:
        setupNodes.push(node); break;
      case NodeType.STYLE_DEF:
      case NodeType.CONTENT:
      case NodeType.DATA_SHAPE:
      case NodeType.TEST_DEF:
        break;
      default:
        computeNodes.push(node); break;
    }
  }

  // 1. Setup (comments, imports)
  const declared = new Set();
  const setupCtx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'web', sourceMap };
  for (const node of setupNodes) {
    // Skip all comments in compiled client output -- they're source-level noise
    if (node.type === NodeType.COMMENT) continue;
    const result = compileNode(node, setupCtx);
    if (result !== null) lines.push(result);
  }

  // 2. Page title
  if (pageTitles.length > 0) {
    lines.push(`document.title = ${JSON.stringify(pageTitles[0])};`);
  }

  // 3. State initialization
  lines.push('');
  lines.push('// --- State ---');
  lines.push('// Reactive model: _state holds all data. _recompute() syncs state to DOM.');
  lines.push('// Input listeners update _state, buttons run actions, both call _recompute().');
  const stateDefaults = {};
  for (const inp of inputNodes) {
    const name = sanitizeName(inp.variable);
    stateDefaults[name] = inp.inputType === 'number' ? '0' : inp.inputType === 'percent' ? '0' : '""';
  }
  // Scan for API calls -- register their target variables as state
  function findApiTargets(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.API_CALL && n.method === 'GET') {
        const target = n.targetVar ? sanitizeName(n.targetVar) : 'response';
        if (!stateDefaults[target]) stateDefaults[target] = 'null';
      }
      if (n.body) findApiTargets(n.body);
    }
  }
  findApiTargets(flatNodes);
  // Also add simple literal assignments to state:
  // step = 1, name is 'hello', active is true, items is an empty list
  // These are "initial state" — not derived from other variables.
  const literalTypes = new Set([
    NodeType.LITERAL_NUMBER, NodeType.LITERAL_STRING,
    NodeType.LITERAL_BOOLEAN, NodeType.LITERAL_LIST, NodeType.LITERAL_NOTHING,
  ]);
  const literalAssigns = computeNodes.filter(n =>
    n.type === NodeType.ASSIGN && n.expression && literalTypes.has(n.expression.type)
  );
  for (const ln of literalAssigns) {
    const name = sanitizeName(ln.name);
    if (stateDefaults[name] !== undefined) continue; // input already claimed this name
    const expr = ln.expression;
    if (expr.type === NodeType.LITERAL_NUMBER) stateDefaults[name] = String(expr.value);
    else if (expr.type === NodeType.LITERAL_STRING) stateDefaults[name] = JSON.stringify(expr.value);
    else if (expr.type === NodeType.LITERAL_BOOLEAN) stateDefaults[name] = expr.value ? 'true' : 'false';
    else if (expr.type === NodeType.LITERAL_LIST) stateDefaults[name] = '[]';
    else stateDefaults[name] = 'null';
  }
  // Remove literal assignments from compute nodes (they're now in state)
  const filteredCompute = computeNodes.filter(n =>
    !(n.type === NodeType.ASSIGN && n.expression && literalTypes.has(n.expression.type))
  );

  // Detect DELETE, PUT, and GET endpoints for auto-generating per-row action buttons
  const deleteEndpoints = {};
  const updateEndpoints = {};
  const getRefreshUrls = {};
  // Endpoints whose response is an SSE stream. Any `ask claude`/`ask ai` or
  // `stream ask claude` inside a POST endpoint emits text/event-stream, so the
  // frontend should use a streaming reader (not a plain JSON fetch) when
  // calling that URL. Streaming is the default — explicit `without streaming`
  // is what downgrades to one-shot JSON.
  const streamingEndpoints = new Set();
  function hasStreamBody(body) {
    if (!body) return false;
    for (const n of body) {
      if (n.type === NodeType.STREAM_AI && !n.noStream) return true;
      // ASSIGN with RHS of ask/stream ask → streams
      if (n.type === NodeType.ASSIGN && n.expression) {
        if (n.expression.type === NodeType.STREAM_AI && !n.expression.noStream) return true;
      }
      if (n.body && hasStreamBody(n.body)) return true;
    }
    return false;
  }
  function scanForEndpoints(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.ENDPOINT && n.path) {
        const match = n.path.match(/\/api\/(\w+)\/:id/);
        if (match) {
          const resource = match[1].toLowerCase();
          if (n.method === 'DELETE') deleteEndpoints[resource] = n.path.replace('/:id', '/');
          if (n.method === 'PUT' || n.method === 'PATCH') updateEndpoints[resource] = { url: n.path.replace('/:id', '/'), method: n.method };
        }
        if (hasStreamBody(n.body)) streamingEndpoints.add(n.path);
      }
      if (n.type === NodeType.API_CALL && n.method === 'GET' && n.targetVar) {
        getRefreshUrls[sanitizeName(n.targetVar).toLowerCase()] = { url: n.url, varName: sanitizeName(n.targetVar) };
      }
      if (n.body) scanForEndpoints(n.body);
    }
  }
  scanForEndpoints(body);
  scanForEndpoints(flatNodes);

  // Add _editing_id to state only when a display table explicitly requests edit actions
  const hasEditAction = displayNodes.some(d => d.actions && d.actions.includes('edit'));
  if (hasEditAction) {
    stateDefaults['_editing_id'] = 'null';
  }

  const stateEntries = Object.entries(stateDefaults).map(([k, v]) => `  ${k}: ${v}`).join(',\n');
  lines.push(`let _state = {`);
  if (stateEntries) lines.push(stateEntries);
  lines.push(`};`);

  // 3b. Hoist component and function definitions before _recompute
  const hoistTypes = new Set([NodeType.COMPONENT_DEF, NodeType.FUNCTION_DEF]);
  const hoistNodes = filteredCompute.filter(n => hoistTypes.has(n.type));
  if (hoistNodes.length > 0) {
    lines.push('');
    const hoistCtx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'web', sourceMap };
    for (const node of hoistNodes) {
      const result = compileNode(node, hoistCtx);
      if (result !== null) lines.push(result);
    }
  }

  // 4. Recompute function
  lines.push('');
  lines.push('// --- Recompute derived values and update displays ---');
  lines.push('function _recompute() {');

  // Compute nodes inside recompute (assignments that derive from inputs)
  // stateVars = only input/list variables that live in _state
  // declared = tracks all variables for let/reassign decisions
  const stateVarNames = new Set(Object.keys(stateDefaults));
  const recomputeDeclared = new Set(stateVarNames);
  let componentCounter = 0;
  const reactiveCtx = { lang: 'js', indent: 1, declared: recomputeDeclared, stateVars: stateVarNames, mode: 'web', insidePage: true, sourceMap };
  for (const node of filteredCompute) {
    // FOR_EACH in reactive mode: render list items to DOM
    if (node.type === NodeType.FOR_EACH) {
      const listVar = sanitizeName(node.iterable.name || '');
      const itemVar = sanitizeName(node.variable);
      const containerId = `list_${itemVar}`;
      lines.push(`  // Render list: ${itemVar} in ${listVar}`);
      lines.push(`  {`);
      lines.push(`    const _container = document.getElementById('${containerId}');`);
      lines.push(`    if (_container) {`);
      lines.push(`      const _listSource = ${node.iterable.name ? '_state.' + sanitizeName(node.iterable.name) : '[]'} || [];`);
      lines.push(`      const _emptyEl = document.getElementById('empty_${itemVar}');`);
      lines.push(`      if (_emptyEl) _emptyEl.style.display = _listSource.length === 0 ? 'flex' : 'none';`);
      lines.push(`      _container.innerHTML = _listSource.map(${itemVar} => {`);
      // Compile body to HTML string
      const bodyParts = [];
      for (const child of node.body) {
        if (child.type === NodeType.CONTENT) {
          const tag = child.contentType === 'heading' ? 'h3' : child.contentType === 'text' ? 'p' : 'span';
          if (child.textExpr) {
            bodyParts.push(`'<${tag}>' + ${sanitizeName(child.textExpr.name || child.text)} + '</${tag}>'`);
          } else {
            bodyParts.push(`'<${tag}>${(child.text || '').replace(/'/g, "\\'")}</${tag}>'`);
          }
        } else if (child.type === NodeType.SHOW) {
          const expr = child.expression;
          const compiled = exprToCode(expr, { ...reactiveCtx, stateVars: null });
          // Component calls return HTML — don't wrap in <p>
          if (expr.type === NodeType.CALL) {
            bodyParts.push(compiled);
          } else if (expr.type === NodeType.MEMBER_ACCESS) {
            // Property access (issue's title etc) — first property = primary text, rest = badges
            const propName = expr.property || '';
            if (bodyParts.length === 0) {
              bodyParts.push(`'<span class="text-sm font-medium text-base-content">' + (${compiled} || '') + '</span>'`);
            } else {
              bodyParts.push(`'<span class="badge badge-ghost badge-sm font-mono">' + (${compiled} || '') + '</span>'`);
            }
          } else {
            // Plain variable — could be object from API, so format it
            bodyParts.push(`'<p>' + (typeof ${compiled} === 'object' ? JSON.stringify(${compiled}) : ${compiled}) + '</p>'`);
          }
        }
      }
      const bodyExpr = bodyParts.length > 0 ? bodyParts.join(' + ') : `'<div>' + ${itemVar} + '</div>'`;
      lines.push(`        const _isMenu = _container.tagName === 'UL' && _container.classList.contains('menu');`);
      lines.push(`        return _isMenu ? '<li><a>' + ${bodyExpr} + '</a></li>' : '<div class="clear-list-item">' + ${bodyExpr} + '</div>';`);
      lines.push(`      }).join('');`);
      lines.push(`    }`);
      lines.push(`  }`);
      continue;
    }
    // SHOW with function call in reactive mode: render component to DOM
    // Only uppercase names are components — lowercase are regular function calls
    if (node.type === NodeType.SHOW && node.expression && node.expression.type === NodeType.CALL && /^[A-Z]/.test(node.expression.name)) {
      const callExpr = node.expression;
      const containerId = `comp_${componentCounter++}`;
      const args = callExpr.args.map(a => exprToCode(a, reactiveCtx)).join(', ');
      lines.push(`  // Render component: ${callExpr.name}`);
      lines.push(`  { const _el = document.getElementById('${containerId}');`);
      lines.push(`    if (_el) _el.innerHTML = ${sanitizeName(callExpr.name)}(${args}); }`);
      continue;
    }
    // Block-form component use: show Panel: ... -> render to DOM
    if (node.type === NodeType.COMPONENT_USE) {
      const containerId = `comp_${componentCounter++}`;
      const compName = sanitizeName(node.name);
      // Compile children to HTML string (same logic as compileNode COMPONENT_USE)
      const childParts = [];
      for (const child of (node.children || [])) {
        if (child.type === NodeType.CONTENT) {
          const tag = { heading: 'h1', subheading: 'h2', text: 'p', bold: 'strong', italic: 'em', small: 'small', divider: 'hr' }[child.contentType] || 'p';
          if (child.contentType === 'divider') childParts.push("'<hr>'");
          else childParts.push(`'<${tag}>${(child.text || '').replace(/'/g, "\\'")}</${tag}>'`);
        } else if (child.type === NodeType.SHOW) {
          childParts.push(`'<p>' + ${exprToCode(child.expression, reactiveCtx)} + '</p>'`);
        }
      }
      const childrenExpr = childParts.length > 0 ? childParts.join(' + ') : "''";
      lines.push(`  // Render component: ${node.name}`);
      lines.push(`  { const _el = document.getElementById('${containerId}');`);
      lines.push(`    if (_el) _el.innerHTML = ${compName}(${childrenExpr}); }`);
      continue;
    }
    const result = compileNode(node, reactiveCtx);
    if (result !== null) lines.push(result);
  }

  // Conditional DOM: toggle visibility of conditional blocks
  // Scan computeNodes for IF_THEN blocks with content bodies
  let condIdx = 0;
  // We need to match the same cond IDs as buildHTML generates
  // buildHTML assigns IDs based on parts array length — we track them here by counting
  // Actually, we scan the full body to find IF_THEN blocks in order
  const condBlocks = [];
  function findConditionals(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.IF_THEN && node.isBlock && Array.isArray(node.thenBranch)) {
        condBlocks.push({ condition: node.condition, invert: false });
        // Recurse into thenBranch to find nested conditionals (matches buildHTML walk order)
        findConditionals(node.thenBranch);
        if (node.otherwiseBranch && Array.isArray(node.otherwiseBranch)) {
          condBlocks.push({ condition: node.condition, invert: true });
          // Recurse into otherwiseBranch — handles else-if chains (nested IF_THEN)
          findConditionals(node.otherwiseBranch);
        }
      }
      if (node.type === NodeType.PAGE || node.type === NodeType.SECTION) {
        findConditionals(node.body);
      }
    }
  }
  findConditionals(body);

  // Generate toggling code — IDs must match what buildHTML generates
  // buildHTML uses cond_N where N is the parts array index, but we can't know that here.
  // Instead, use a sequential counter that both buildHTML and reactive compiler share.
  // For now, use sequential cond_0, cond_1, etc. and update buildHTML to match.
  for (let ci = 0; ci < condBlocks.length; ci++) {
    const cb = condBlocks[ci];
    const condExpr = exprToCode(cb.condition, { ...reactiveCtx, stateVars: stateVarNames });
    const condId = `cond_${ci}`;
    if (cb.invert) {
      lines.push(`  { const _el = document.getElementById('${condId}'); if (_el) _el.style.display = !(${condExpr}) ? '' : 'none'; }`);
    } else {
      lines.push(`  { const _el = document.getElementById('${condId}'); if (_el) _el.style.display = (${condExpr}) ? '' : 'none'; }`);
    }
  }

  // Display updates
  // Dedup IDs to match buildHTML's dedup (buildHTML runs after this, so _resolvedId isn't set yet)
  const _dispUsedIds = new Set();
  const _chatDisplays = []; // Track chat displays for event listener wiring
  const displayCtx = { lang: 'js', indent: 0, declared: recomputeDeclared, stateVars: stateVarNames, mode: 'web', sourceMap };
  for (const disp of displayNodes) {
    let outputId = disp.ui._resolvedId || disp.ui.id;
    if (_dispUsedIds.has(outputId)) {
      let counter = 2;
      while (_dispUsedIds.has(outputId + '_' + counter)) counter++;
      outputId = outputId + '_' + counter;
    }
    _dispUsedIds.add(outputId);
    const val = exprToCode(disp.expression, displayCtx);
    if (disp.format === 'table') {
      // Check if user explicitly requested action buttons via "with delete" / "with edit"
      const varName = disp.expression.name ? sanitizeName(disp.expression.name) : '';
      const resourceKey = varName.toLowerCase();
      const actions = disp.actions || [];
      const hasDelete = actions.includes('delete');
      const hasUpdate = actions.includes('edit');
      const hasActions = hasDelete || hasUpdate;

      // Reactive table: delegate to _clear_render_table which handles virtual
      // scrolling for large datasets (100+ rows). Head renderer produces the
      // <th> row, row renderer produces one <tr> per item.
      // Column keys: either explicit list or Object.keys of first row.
      // The row renderer needs to derive keys from its OWN row (since data
      // may be empty in the helper's no-op path). Two separate expressions.
      const headKeysExpr = disp.columns ? JSON.stringify(disp.columns) : 'Object.keys(d[0])';
      const rowKeysExpr = disp.columns ? JSON.stringify(disp.columns) : 'Object.keys(row)';
      const thClass = 'text-xs uppercase tracking-widest font-semibold text-base-content/50';
      const tdClass = 'text-sm text-base-content';
      const trClass = 'border-base-300/20 hover:bg-base-200/60 transition-colors even:bg-base-300/5';
      const headCols = `_keys.map(k => '<th class="${thClass}">' + _esc(k) + '</th>').join('')`;
      const dataCols = `_keys.map(k => '<td class="${tdClass}">' + _esc(row[k] != null ? row[k] : '') + '</td>').join('')`;
      let rowHtmlExpr;
      if (hasActions) {
        let actionBtns = '';
        if (hasUpdate) {
          actionBtns += `'<button class="btn btn-ghost btn-xs" data-edit-id="' + _esc(row.id) + '" data-edit-row="' + _esc(JSON.stringify(row)) + '">Edit</button>'`;
        }
        if (hasDelete) {
          if (actionBtns) actionBtns += ` + ' ' + `;
          actionBtns += `'<button class="btn btn-ghost btn-xs text-error" data-delete-id="' + _esc(row.id) + '">Delete</button>'`;
        }
        rowHtmlExpr = `'<tr class="${trClass}">' + ${dataCols} + '<td class="text-right">' + ${actionBtns} + '</td>' + '</tr>'`;
      } else {
        rowHtmlExpr = `'<tr class="${trClass}">' + ${dataCols} + '</tr>'`;
      }
      const extraHead = hasActions ? ` + '<th class="${thClass}"></th>'` : '';
      lines.push(`  _clear_render_table(`);
      lines.push(`    document.getElementById('${outputId}_table'),`);
      lines.push(`    ${val},`);
      lines.push(`    function(d) { var _keys = ${headKeysExpr}; return ${headCols}${extraHead}; },`);
      lines.push(`    function(row) { var _keys = ${rowKeysExpr}; return ${rowHtmlExpr}; }`);
      lines.push(`  );`);
    } else if (disp.format === 'cards') {
      // Reactive card grid: render array of objects as styled cards
      lines.push(`  {`);
      lines.push(`    const _cardsEl = document.getElementById('${outputId}_cards');`);
      lines.push(`    const _data = ${val};`);
      const cardColsCode = disp.columns
        ? JSON.stringify(disp.columns)
        : 'Object.keys(_data[0]).filter(k => k !== "id" && !k.endsWith("_at") && !k.endsWith("_at_date"))';
      lines.push(`    if (_cardsEl && Array.isArray(_data) && _data.length > 0) {`);
      lines.push(`      const _keys = ${cardColsCode};`);
      // Smart card rendering: detect field roles by name/content
      lines.push(`      _cardsEl.innerHTML = _data.map(row => {`);
      lines.push(`        let _img = '', _badge = '', _title = '', _body = '', _meta = '';`);
      lines.push(`        for (const k of _keys) {`);
      lines.push(`          const v = row[k] != null ? String(row[k]) : '';`);
      lines.push(`          if (!v) continue;`);
      lines.push(`          if ((k.includes('image') || k.includes('avatar') || k.includes('photo') || k.includes('url') || k.includes('img') || k.includes('thumbnail')) && (v.startsWith('http') || v.startsWith('/'))) {`);
      lines.push(`            if (k.includes('avatar')) { _meta += '<img src="' + _esc(v) + '" alt="" class="w-10 h-10 rounded-full object-cover" />'; }`);
      lines.push(`            else { _img = '<img src="' + _esc(v) + '" alt="" class="w-full h-48 object-cover" loading="lazy" />'; }`);
      lines.push(`          } else if (k.includes('category') || k.includes('tag') || k.includes('type') || k.includes('badge') || k.includes('status')) {`);
      lines.push(`            _badge = '<span class="badge badge-info badge-sm">' + _esc(v) + '</span>';`);
      lines.push(`          } else if (k.includes('author') || k.includes('date') || k.includes('created')) {`);
      lines.push(`            _meta += '<span class="text-xs text-base-content/50 uppercase">' + _esc(v) + '</span>';`);
      lines.push(`          } else if (k.includes('title') || k.includes('name') || k.includes('heading')) {`);
      lines.push(`            _title = '<h3 class="text-lg font-semibold text-base-content mt-2">' + _esc(v) + '</h3>';`);
      lines.push(`          } else if (k.includes('excerpt') || k.includes('description') || k.includes('summary') || k.includes('body')) {`);
      lines.push(`            const _short = v.length > 120 ? v.substring(0, 120) + '...' : v;`);
      lines.push(`            _body = '<p class="text-sm text-base-content/60 mt-2">' + _esc(_short) + '</p>';`);
      lines.push(`          } else if (!_title) {`);
      lines.push(`            _title = '<h3 class="text-lg font-semibold text-base-content mt-2">' + _esc(v) + '</h3>';`);
      lines.push(`          } else if (!_body) {`);
      lines.push(`            const _short = v.length > 120 ? v.substring(0, 120) + '...' : v;`);
      lines.push(`            _body = '<p class="text-sm text-base-content/60 mt-2">' + _esc(_short) + '</p>';`);
      lines.push(`          }`);
      lines.push(`        }`);
      lines.push(`        const _metaRow = _meta ? '<div class="flex items-center gap-3 mt-4">' + _meta + '</div>' : '';`);
      lines.push(`        return '<div class="bg-base-100 rounded-2xl overflow-hidden border border-base-300/40 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col">' + _img + '<div class="p-6 flex flex-col flex-1">' + _badge + _title + _body + _metaRow + '</div></div>';`);
      lines.push(`      }).join('');`);
      lines.push(`    } else if (_cardsEl) {`);
      lines.push(`      _cardsEl.innerHTML = '';`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else if (disp.format === 'list') {
      // List rendering: iterate over array and create <li> elements
      lines.push(`  {`);
      lines.push(`    const _listEl = document.getElementById('${outputId}_list');`);
      lines.push(`    const _data = ${val};`);
      lines.push(`    if (_listEl && Array.isArray(_data)) {`);
      lines.push(`      _listEl.innerHTML = _data.map(item => {`);
      lines.push(`        if (typeof item === 'object' && item !== null) {`);
      lines.push(`          const keys = Object.keys(item).filter(k => k !== 'id' && !k.endsWith('_at'));`);
      lines.push(`          const label = item[keys[0]] != null ? String(item[keys[0]]) : JSON.stringify(item);`);
      lines.push(`          return '<li class="text-sm text-base-content">' + _esc(label) + '</li>';`);
      lines.push(`        }`);
      lines.push(`        return '<li class="text-sm text-base-content">' + _esc(String(item)) + '</li>';`);
      lines.push(`      }).join('');`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else if (disp.format === 'chat') {
      // Chat rendering: delegate to _chatRender utility function
      const chatCols = disp.columns || ['role', 'content'];
      const roleField = JSON.stringify(chatCols[0] || 'role');
      const contentField = JSON.stringify(chatCols[1] || 'content');
      lines.push(`  _chatRender(document.getElementById('${outputId}_msgs'), ${val}, ${roleField}, ${contentField});`);
      // Track for event listener wiring after _recompute
      const varName = disp.expression.name ? sanitizeName(disp.expression.name) : '';
      _chatDisplays.push({ outputId, varName, dispNode: disp });
    } else if (disp.format === 'gallery') {
      // Gallery rendering: iterate over array and create image grid
      lines.push(`  {`);
      lines.push(`    const _galEl = document.getElementById('${outputId}_gallery');`);
      lines.push(`    const _data = ${val};`);
      lines.push(`    if (_galEl && Array.isArray(_data) && _data.length > 0) {`);
      lines.push(`      _galEl.innerHTML = _data.map(item => {`);
      lines.push(`        if (typeof item === 'string') return '<div class="aspect-square overflow-hidden rounded-lg"><img src="' + _esc(item) + '" alt="" class="w-full h-full object-cover" loading="lazy" /></div>';`);
      lines.push(`        if (typeof item === 'object' && item !== null) {`);
      lines.push(`          const _url = item.url || item.src || item.image || item.photo || item.thumbnail || '';`);
      lines.push(`          const _alt = item.alt || item.title || item.caption || item.name || '';`);
      lines.push(`          const _cap = item.caption || item.title || item.name || '';`);
      lines.push(`          return '<div class="overflow-hidden rounded-lg"><img src="' + _esc(_url) + '" alt="' + _esc(_alt) + '" class="w-full aspect-square object-cover" loading="lazy" />' + (_cap ? '<p class="text-xs text-base-content/60 mt-1 truncate">' + _esc(_cap) + '</p>' : '') + '</div>';`);
      lines.push(`        }`);
      lines.push(`        return '';`);
      lines.push(`      }).join('');`);
      lines.push(`    } else if (_galEl) {`);
      lines.push(`      _galEl.innerHTML = '';`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else if (disp.format === 'map') {
      // Map rendering: Leaflet.js map with markers
      lines.push(`  {`);
      lines.push(`    const _mapEl = document.getElementById('${outputId}_map');`);
      lines.push(`    const _data = ${val};`);
      lines.push(`    if (_mapEl && typeof L !== 'undefined') {`);
      lines.push(`      if (!_mapEl._leaflet_id) {`);
      lines.push(`        _mapEl._map = L.map(_mapEl).setView([0, 0], 2);`);
      lines.push(`        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(_mapEl._map);`);
      lines.push(`        _mapEl._markers = L.layerGroup().addTo(_mapEl._map);`);
      lines.push(`      }`);
      lines.push(`      _mapEl._markers.clearLayers();`);
      lines.push(`      if (Array.isArray(_data) && _data.length > 0) {`);
      lines.push(`        const _bounds = [];`);
      lines.push(`        _data.forEach(item => {`);
      lines.push(`          const _lat = item.lat || item.latitude;`);
      lines.push(`          const _lng = item.lng || item.lon || item.longitude;`);
      lines.push(`          if (_lat != null && _lng != null) {`);
      lines.push(`            const _ll = [Number(_lat), Number(_lng)];`);
      lines.push(`            L.marker(_ll).addTo(_mapEl._markers).bindPopup(_esc(item.name || item.title || item.label || ''));`);
      lines.push(`            _bounds.push(_ll);`);
      lines.push(`          }`);
      lines.push(`        });`);
      lines.push(`        if (_bounds.length > 0) _mapEl._map.fitBounds(_bounds, { padding: [30, 30] });`);
      lines.push(`      }`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else if (disp.format === 'calendar') {
      // Calendar rendering: simple month grid with events
      lines.push(`  {`);
      lines.push(`    const _calEl = document.getElementById('${outputId}_calendar');`);
      lines.push(`    const _data = ${val};`);
      lines.push(`    if (_calEl) {`);
      lines.push(`      const _now = new Date();`);
      lines.push(`      const _year = _now.getFullYear(), _month = _now.getMonth();`);
      lines.push(`      const _firstDay = new Date(_year, _month, 1).getDay();`);
      lines.push(`      const _daysInMonth = new Date(_year, _month + 1, 0).getDate();`);
      lines.push(`      const _monthName = _now.toLocaleString('default', { month: 'long', year: 'numeric' });`);
      lines.push(`      const _events = {};`);
      lines.push(`      if (Array.isArray(_data)) {`);
      lines.push(`        _data.forEach(ev => {`);
      lines.push(`          const d = ev.date ? new Date(ev.date) : null;`);
      lines.push(`          if (d && d.getMonth() === _month && d.getFullYear() === _year) {`);
      lines.push(`            const day = d.getDate();`);
      lines.push(`            if (!_events[day]) _events[day] = [];`);
      lines.push(`            _events[day].push(ev.title || ev.name || ev.event || 'Event');`);
      lines.push(`          }`);
      lines.push(`        });`);
      lines.push(`      }`);
      lines.push(`      let _html = '<h4 class="text-base font-semibold text-base-content mb-3">' + _esc(_monthName) + '</h4>';`);
      lines.push(`      _html += '<table class="table table-sm w-full"><thead><tr>';`);
      lines.push(`      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => _html += '<th class="text-xs text-center text-base-content/50">' + d + '</th>');`);
      lines.push(`      _html += '</tr></thead><tbody><tr>';`);
      lines.push(`      for (let i = 0; i < _firstDay; i++) _html += '<td></td>';`);
      lines.push(`      for (let d = 1; d <= _daysInMonth; d++) {`);
      lines.push(`        const _dayEvents = _events[d] || [];`);
      lines.push(`        const _evHtml = _dayEvents.map(e => '<div class="text-xs bg-primary/20 text-primary rounded px-1 mt-0.5 truncate">' + _esc(e) + '</div>').join('');`);
      lines.push(`        _html += '<td class="align-top p-1 h-16 border border-base-300/20"><span class="text-xs font-medium">' + d + '</span>' + _evHtml + '</td>';`);
      lines.push(`        if ((_firstDay + d) % 7 === 0 && d < _daysInMonth) _html += '</tr><tr>';`);
      lines.push(`      }`);
      lines.push(`      const _remaining = (7 - (_firstDay + _daysInMonth) % 7) % 7;`);
      lines.push(`      for (let i = 0; i < _remaining; i++) _html += '<td></td>';`);
      lines.push(`      _html += '</tr></tbody></table>';`);
      lines.push(`      _calEl.innerHTML = _html;`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else if (disp.format === 'qr' || disp.format === 'qrcode') {
      // QR code rendering
      lines.push(`  {`);
      lines.push(`    const _qrCanvas = document.getElementById('${outputId}_qr');`);
      lines.push(`    const _qrVal = ${val};`);
      lines.push(`    if (_qrCanvas && typeof QRCode !== 'undefined' && _qrVal) {`);
      lines.push(`      QRCode.toCanvas(_qrCanvas, String(_qrVal), { width: 200, margin: 2 }, function() {});`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else {
      const formatExpr = disp.format === 'dollars' || disp.format === 'currency' ? `Number(${val}).toLocaleString('en-US', { style: 'currency', currency: 'USD' })`
        : disp.format === 'percent' || disp.format === 'percentage' ? `(Number(${val}) * 100).toFixed(1) + '%'`
        : disp.format === 'date' ? `new Date(${val}).toLocaleDateString()`
        : disp.format === 'json' ? `JSON.stringify(${val}, null, 2)`
        : disp.format === 'count' ? `String(Array.isArray(${val}) ? ${val}.length : ${val})`
        : `String(${val})`;
      const dispProp = disp.format === 'json' ? 'innerText' : 'textContent';
      lines.push(`  document.getElementById('${outputId}_value').${dispProp} = ${formatExpr};`);
    }
  }

  // Chart updates (ECharts)
  const chartNodes = flatNodes.filter(n => n.type === NodeType.CHART);
  for (const chart of chartNodes) {
    const chartId = chart.ui.id;
    const dataExpr = `_state.${sanitizeName(chart.dataVar)}`;
    const chartType = chart.chartType;
    const groupBy = chart.groupBy;
    const stacked = chart.stacked;

    lines.push(`  {`);
    lines.push(`    const _chartEl = document.getElementById('${chartId}_canvas');`);
    lines.push(`    const _data = ${dataExpr};`);
    lines.push(`    if (_chartEl && Array.isArray(_data) && _data.length > 0 && typeof echarts !== 'undefined') {`);
    lines.push(`      const _chart = echarts.getInstanceByDom(_chartEl) || echarts.init(_chartEl);`);

    // TailAdmin-quality color palette
    lines.push(`      const _colors = ['#465fff','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f43f5e','#84cc16'];`);

    if (chartType === 'pie') {
      if (groupBy) {
        // Group by field and count
        lines.push(`      const _counts = {};`);
        lines.push(`      _data.forEach(r => { const k = r.${sanitizeName(groupBy)} || 'Other'; _counts[k] = (_counts[k] || 0) + 1; });`);
        lines.push(`      const _pieData = Object.entries(_counts).map(([name, value]) => ({ name, value }));`);
      } else {
        // Assume data has name/value-like fields — use first two non-id keys
        lines.push(`      const _sKeys = Object.keys(_data[0]).filter(k => k !== 'id');`);
        lines.push(`      const _pieData = _data.map(r => ({ name: String(r[_sKeys[0]] || ''), value: Number(r[_sKeys[1] || _sKeys[0]] || 0) }));`);
      }
      lines.push(`      _chart.setOption({ color: _colors, tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e5e7eb', textStyle: { color: '#1f2937' } }, series: [{ type: 'pie', radius: ['40%', '70%'], itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { color: '#6b7280' }, data: _pieData, emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.15)' } } }] }, true);`);
    } else {
      // line, bar, area
      const seriesType = chartType === 'area' ? 'line' : chartType;
      const areaStyle = chartType === 'area' ? ', areaStyle: { opacity: 0.15 }' : '';
      const barStyle = chartType === 'bar' ? ', itemStyle: { borderRadius: [4, 4, 0, 0] }, barMaxWidth: 32' : '';
      const stackProp = stacked ? ", stack: 'total'" : '';

      if (groupBy) {
        // Group by field and count — produces category bar/line/area chart
        lines.push(`      const _counts = {};`);
        lines.push(`      _data.forEach(r => { const k = r.${sanitizeName(groupBy)} || 'Other'; _counts[k] = (_counts[k] || 0) + 1; });`);
        lines.push(`      const _xData = Object.keys(_counts);`);
        lines.push(`      const _yData = Object.values(_counts);`);
        lines.push(`      const _series = [{ name: '${sanitizeName(groupBy)}', type: '${seriesType}', data: _yData${areaStyle}${barStyle}${stackProp}, smooth: true }];`);
      } else {
        // Auto-detect x (first string field) and y (first number field)
        lines.push(`      const _keys = Object.keys(_data[0]).filter(k => k !== 'id');`);
        lines.push(`      const _xKey = _keys.find(k => typeof _data[0][k] === 'string') || _keys[0];`);
        lines.push(`      const _yKeys = _keys.filter(k => typeof _data[0][k] === 'number');`);
        lines.push(`      if (_yKeys.length === 0) _yKeys.push(_keys.find(k => k !== _xKey) || _keys[0]);`);
        lines.push(`      const _xData = _data.map(r => r[_xKey]);`);
        lines.push(`      const _series = _yKeys.map(k => ({ name: k, type: '${seriesType}', data: _data.map(r => Number(r[k]) || 0)${areaStyle}${barStyle}${stackProp}, smooth: true }));`);
      }

      const legendExpr = groupBy
        ? 'undefined'
        : "_yKeys.length > 1 ? { data: _yKeys, textStyle: { color: '#6b7280' } } : undefined";
      lines.push(`      _chart.setOption({ color: _colors, tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e5e7eb', textStyle: { color: '#1f2937' } }, legend: ${legendExpr}, xAxis: { type: 'category', data: _xData, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280', fontSize: 12 } }, yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280', fontSize: 12 } }, series: _series, grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true } }, true);`);
    }

    lines.push(`    }`);
    lines.push(`  }`);
  }

  // Sync input DOM values with state (so clearing state also clears the input)
  // Skip file inputs — .value is read-only on file inputs
  for (const inp of inputNodes) {
    if (inp.inputType === 'file') continue;
    const inputId = `input_${sanitizeName(inp.variable)}`;
    const name = sanitizeName(inp.variable);
    lines.push(`  document.getElementById('${inputId}').value = _state.${name};`);
  }

  lines.push('}');

  // 4b. Chat component event listeners
  for (const chatDisp of _chatDisplays) {
    const { outputId, varName } = chatDisp;
    // Determine DELETE endpoint for New button (convention: DELETE /api/{resource})
    const resourceKey = varName.toLowerCase();
    const deleteUrl = deleteEndpoints[resourceKey] || null;
    const deleteUrlStr = deleteUrl ? `'${deleteUrl}'` : 'null';

    lines.push('');
    lines.push(`// --- Chat component: ${outputId} ---`);

    // New button — clears messages
    lines.push(`document.getElementById('${outputId}_new').addEventListener('click', function() {`);
    lines.push(`  _chatClear(${deleteUrlStr}, '${outputId}_msgs');`);
    if (varName) {
      lines.push(`  _state.${varName} = [];`);
      lines.push(`  _recompute();`);
    }
    lines.push(`});`);

    // Enter to send on textarea
    lines.push(`document.getElementById('${outputId}_input').addEventListener('keydown', function(e) {`);
    lines.push(`  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('${outputId}_send').click(); }`);
    lines.push(`});`);

    // Scroll-to-bottom visibility toggle
    lines.push(`(function() {`);
    lines.push(`  var _msgsEl = document.getElementById('${outputId}_msgs');`);
    lines.push(`  var _scrollBtn = document.getElementById('${outputId}_scroll');`);
    lines.push(`  if (_msgsEl && _scrollBtn) {`);
    lines.push(`    _msgsEl.addEventListener('scroll', function() {`);
    lines.push(`      var atBottom = _msgsEl.scrollTop + _msgsEl.clientHeight >= _msgsEl.scrollHeight - 100;`);
    lines.push(`      _scrollBtn.style.display = atBottom ? 'none' : 'flex';`);
    lines.push(`    });`);
    lines.push(`    _scrollBtn.addEventListener('click', function() {`);
    lines.push(`      _msgsEl.scrollTo({ top: _msgsEl.scrollHeight, behavior: 'smooth' });`);
    lines.push(`    });`);
    lines.push(`  }`);
    lines.push(`})();`);

    // Send button — wire to absorbed button's actions (if chat absorbed an input+button)
    const dispNode = chatDisp.dispNode;
    if (dispNode && dispNode._chatAbsorbedButton) {
      const { postUrl, postField, refreshUrl, refreshVar } = dispNode._chatAbsorbedButton;
      const refreshCode = refreshUrl && refreshVar
        ? `_state.${refreshVar} = await fetch('${refreshUrl}', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } }).then(function(r) { return r.json(); }); _recompute();`
        : '_recompute();';

      // Detect if the target endpoint calls a streaming agent
      let isStreamingEndpoint = false;
      if (streamingAgentNames.size > 0) {
        // Find the POST endpoint in the AST matching this URL
        const matchingEndpoint = body.find(n =>
          n.type === NodeType.ENDPOINT &&
          n.method.toUpperCase() === 'POST' &&
          n.path === postUrl
        );
        if (matchingEndpoint) {
          // Walk the endpoint body for RUN_AGENT nodes calling a streaming agent
          (function findStreamingCall(nodes) {
            if (!Array.isArray(nodes)) return;
            for (const n of nodes) {
              if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT && streamingAgentNames.has(n.expression.agentName)) {
                isStreamingEndpoint = true;
              }
              if (Array.isArray(n.body)) findStreamingCall(n.body);
              if (Array.isArray(n.thenBranch)) findStreamingCall(n.thenBranch);
              if (Array.isArray(n.otherwiseBranch)) findStreamingCall(n.otherwiseBranch);
            }
          })(matchingEndpoint.body || []);
        }
      }

      const sendFn = isStreamingEndpoint ? '_chatSendStream' : '_chatSend';
      lines.push(`document.getElementById('${outputId}_send').addEventListener('click', async function() {`);
      lines.push(`  ${sendFn}('${outputId}_input', '${outputId}_msgs', '${outputId}_typing', '${postUrl}', '${postField}', async function() {`);
      lines.push(`    ${refreshCode}`);
      lines.push(`  });`);
      lines.push(`});`);
    }
  }

  // 5. Input event listeners
  lines.push('');
  lines.push('// --- Input listeners ---');
  for (const inp of inputNodes) {
    const inputId = `input_${sanitizeName(inp.variable)}`;
    const name = sanitizeName(inp.variable);
    const isNum = inp.inputType === 'number' || inp.inputType === 'percent';
    const isFile = inp.inputType === 'file';
    const eventType = isFile ? 'change' : 'input';
    const valueExpr = isFile ? 'e.target.files[0] || null' : isNum ? 'Number(e.target.value) || 0' : 'e.target.value';
    lines.push(`document.getElementById('${inputId}').addEventListener('${eventType}', function(e) {`);
    lines.push(`  _state.${name} = ${valueExpr};`);
    lines.push(`  _recompute();`);
    lines.push(`});`);
  }

  // 6. Button event listeners
  if (buttonNodes.length > 0) {
    lines.push('');
    lines.push('// --- Button handlers ---');
    for (const btn of buttonNodes) {
      const btnId = `btn_${sanitizeName(btn.label.replace(/\s+/g, '_'))}`;
      const btnDeclared = new Set(recomputeDeclared);
      const btnCtx = { lang: 'js', indent: 1, declared: btnDeclared, stateVars: stateVarNames, mode: 'web', updateEndpoints: hasEditAction ? updateEndpoints : undefined, streamingEndpoints };
      const bodyCode = btn.body.map(n => compileNode(n, btnCtx)).filter(Boolean).join('\n');
      const hasApiCall = btn.body.some(n => n.type === NodeType.API_CALL || (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.API_CALL));
      const asyncKw = hasApiCall ? 'async ' : '';

      // Find POST/PUT API calls to determine which fields need validation
      const postCalls = [
        ...btn.body.filter(n => n.type === NodeType.API_CALL && (n.method === 'POST' || n.method === 'PUT')),
        ...btn.body.filter(n => n.type === NodeType.ASSIGN && n.expression?.type === NodeType.API_CALL && (n.expression.method === 'POST' || n.expression.method === 'PUT')).map(n => n.expression),
      ];
      const fieldsToValidate = new Set();
      for (const call of postCalls) {
        if (call.fields) call.fields.forEach(f => fieldsToValidate.add(sanitizeName(f)));
      }

      lines.push(`document.getElementById('${btnId}').addEventListener('click', ${asyncKw}function() {`);

      // Client-side validation: check required fields aren't empty
      if (fieldsToValidate.size > 0) {
        const checks = [...fieldsToValidate].map(f =>
          `    if (_state.${f} === '' || _state.${f} == null) { _toast('${f.replace(/_/g, ' ')} is required', 'error'); return; }`
        );
        lines.push(checks.join('\n'));
      }

      // Loading state: disable button + show spinner during async work
      if (hasApiCall) {
        lines.push(`  const _btn = document.getElementById('${btnId}');`);
        lines.push(`  const _btnHTML = _btn.innerHTML;`);
        lines.push(`  _btn.disabled = true;`);
        lines.push(`  _btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span>';`);
        lines.push(`  try {`);
        lines.push(bodyCode.split('\n').map(l => '  ' + l).join('\n'));
        lines.push(`  } catch(_err) { _toast(_err.message || 'Something went wrong', 'error'); }`);
        lines.push(`  _btn.disabled = false;`);
        lines.push(`  _btn.innerHTML = _btnHTML;`);
      } else {
        lines.push(bodyCode);
      }

      lines.push(`  _recompute();`);
      lines.push(`});`);
    }
  }

  // 6b. Table action button handlers (delete/edit via event delegation)
  for (const disp of displayNodes) {
    if (disp.format !== 'table') continue;
    const actions = disp.actions || [];
    if (actions.length === 0) continue;
    const varName = disp.expression.name ? sanitizeName(disp.expression.name) : '';
    const resourceKey = varName.toLowerCase();
    const deleteUrl = actions.includes('delete') ? deleteEndpoints[resourceKey] : null;
    const updateInfo = actions.includes('edit') ? updateEndpoints[resourceKey] : null;
    const refreshInfo = getRefreshUrls[resourceKey];
    const outputId = disp.ui._resolvedId || disp.ui.id;
    if (!deleteUrl && !updateInfo) continue;

    lines.push('');
    lines.push(`// --- Table action handlers for ${varName} ---`);
    lines.push(`document.getElementById('${outputId}_table').addEventListener('click', async function(e) {`);

    if (deleteUrl) {
      lines.push(`  const deleteBtn = e.target.closest('[data-delete-id]');`);
      lines.push(`  if (deleteBtn) {`);
      lines.push(`    const id = deleteBtn.dataset.deleteId;`);
      lines.push(`    await fetch(${JSON.stringify(deleteUrl)} + id, { method: 'DELETE' }).catch(e => console.error(e));`);
      if (refreshInfo) {
        lines.push(`    _state.${refreshInfo.varName} = await fetch(${JSON.stringify(refreshInfo.url)}).then(r => r.json()).catch(e => { console.error(e); return _state.${refreshInfo.varName}; });`);
      }
      lines.push(`    _recompute();`);
      lines.push(`    return;`);
      lines.push(`  }`);
    }

    if (updateInfo) {
      lines.push(`  const editBtn = e.target.closest('[data-edit-id]');`);
      lines.push(`  if (editBtn) {`);
      lines.push(`    const id = editBtn.dataset.editId;`);
      lines.push(`    const row = JSON.parse(editBtn.dataset.editRow);`);
      // Populate the form inputs with the row data for editing
      const colsForEdit = disp.columns || [];
      for (const col of colsForEdit) {
        const sName = sanitizeName(col);
        if (stateVarNames.has(sName)) {
          lines.push(`    _state.${sName} = row.${sName} != null ? row.${sName} : '';`);
        }
      }
      lines.push(`    _state._editing_id = id;`);
      lines.push(`    _recompute();`);
      lines.push(`    return;`);
      lines.push(`  }`);
    }

    lines.push(`});`);
  }

  // 7. On page load handlers (if any, these call _recompute at the end)
  const loadNodes = flatNodes.filter(n => n.type === NodeType.ON_PAGE_LOAD);
  if (loadNodes.length > 0) {
    lines.push('');
    lines.push('// --- On Page Load ---');
    lines.push('_recompute(); // initial render with default state');
    lines.push('(async () => {');
    lines.push('  try {');
    for (const loadNode of loadNodes) {
      const loadCtx = { lang: 'js', indent: 2, declared: new Set(recomputeDeclared), stateVars: stateVarNames, mode: 'web', streamingEndpoints };
      for (const child of loadNode.body) {
        const compiled = compileNode(child, loadCtx);
        if (compiled) lines.push(compiled);
      }
    }
    lines.push('  _recompute();');
    lines.push('  } catch(e) { console.error("Page load error:", e); }');
    lines.push('})();');
  } else {
    // No on-page-load: do initial render immediately
    lines.push('');
    lines.push('_recompute();');
  }

  // 8. On-change handlers (reactive input watchers with optional debounce)
  const changeNodes = flatNodes.filter(n => n.type === NodeType.ON_CHANGE);
  for (const cn of changeNodes) {
    const inputId = `input_${sanitizeName(cn.variable)}`;
    const changeCtx = { lang: 'js', indent: 1, declared: new Set(recomputeDeclared), stateVars: stateVarNames, mode: 'web' };
    const bodyCode = cn.body.map(n => compileNode(n, changeCtx)).filter(Boolean).join('\n');
    const hasApiCall = cn.body.some(n => n.type === NodeType.API_CALL);
    const asyncKw = hasApiCall ? 'async ' : '';

    lines.push('');
    lines.push(`// --- When ${cn.variable} changes ---`);
    if (cn.debounceMs > 0) {
      const timerId = `_debounce_${sanitizeName(cn.variable)}`;
      lines.push(`let ${timerId} = null;`);
      lines.push(`document.getElementById('${inputId}').addEventListener('input', function() {`);
      lines.push(`  clearTimeout(${timerId});`);
      lines.push(`  ${timerId} = setTimeout(${asyncKw}function() {`);
      lines.push(bodyCode);
      lines.push(`    _recompute();`);
      lines.push(`  }, ${cn.debounceMs});`);
      lines.push(`});`);
    } else {
      lines.push(`document.getElementById('${inputId}').addEventListener('input', ${asyncKw}function() {`);
      lines.push(bodyCode);
      lines.push(`  _recompute();`);
      lines.push(`});`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// PYTHON COMPILER
// =============================================================================

function compileToPython(body, errors, sourceMap = false) {
  const lines = [];
  lines.push(`# Generated by Clear v${CLEAR_VERSION}`);
  const pyDiagram = generateDiagram(body, '#');
  if (pyDiagram) lines.push(pyDiagram);
  // Add standard library imports based on what the program uses
  const hasFileOps = body.some(n =>
    n.type === NodeType.FILE_OP ||
    (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.FILE_OP)
  );
  const hasJsonOps = body.some(n =>
    (n.type === NodeType.ASSIGN && (n.expression?.type === NodeType.JSON_PARSE || n.expression?.type === NodeType.JSON_STRINGIFY))
  );
  const hasRegexOps = body.some(n =>
    n.type === NodeType.ASSIGN && (n.expression?.type === NodeType.REGEX_FIND || n.expression?.type === NodeType.REGEX_MATCH || n.expression?.type === NodeType.REGEX_REPLACE)
  );
  const hasDateOps = body.some(n =>
    n.type === NodeType.ASSIGN && (n.expression?.type === NodeType.CURRENT_TIME || n.expression?.type === NodeType.FORMAT_DATE || n.expression?.type === NodeType.DAYS_BETWEEN)
  );
  if (hasFileOps) lines.push('import os');
  if (hasJsonOps) lines.push('import json');
  if (hasRegexOps) lines.push('import re');
  if (hasDateOps) lines.push('import datetime');
  lines.push('');

  const ctx = { lang: 'python', indent: 0, declared: new Set(), stateVars: null, mode: 'web', sourceMap };
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      lines.push(result);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// HTML SCAFFOLD (Phase 6B)
// =============================================================================

/**
 * Walk the AST and build HTML directly from node.ui metadata.
 * Returns { pageTitle, htmlBody, pages } for the HTML scaffold.
 */
// Inline layout modifier map (shared between parser and compiler)
const INLINE_LAYOUT_MODIFIERS = {
  // Grid shorthands — Tailwind-first
  'two column layout':   { tailwind: 'grid grid-cols-2 gap-5' },
  'three column layout': { tailwind: 'grid grid-cols-3 gap-5' },
  'four column layout':  { tailwind: 'grid grid-cols-4 gap-4' },
  // Short forms: "as 2 columns", "as row", "as column"
  '2 columns': { tailwind: 'grid grid-cols-2 gap-5' },
  '3 columns': { tailwind: 'grid grid-cols-3 gap-5' },
  '4 columns': { tailwind: 'grid grid-cols-4 gap-4' },
  '5 columns': { tailwind: 'grid grid-cols-5 gap-4' },
  '6 columns': { tailwind: 'grid grid-cols-6 gap-3' },
  'row':    { tailwind: 'flex flex-row items-center gap-4' },
  'column': { tailwind: 'flex flex-col gap-4' },
  // Structural
  'full height':         { prop: 'height', val: '100vh' },
  'scrollable':          { prop: 'overflow-y', val: 'auto' },
  'fills remaining space': { prop: 'flex', val: '1' },
  'sticky at top':       { prop: 'position', val: 'sticky', extra: { top: '0', 'z-index': '10' } },
  'dark background':     { prop: 'background', val: '#0f172a', extra: { color: '#f8fafc' } },
  'with shadow':         { prop: 'box-shadow', val: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' },
  'stacked':             { prop: 'display', val: 'flex', extra: { 'flex-direction': 'column' } },
  'side by side':        { prop: 'display', val: 'flex', extra: { 'flex-direction': 'row' } },
  'centered':            { prop: 'max-width', val: '800px', extra: { 'margin-left': 'auto', 'margin-right': 'auto' } },
  'text centered':       { prop: 'text-align', val: 'center' },
  'padded':              { prop: 'padding', val: '1.5rem' },
  'light background':    { prop: 'background', val: '#f8fafc' },
  'rounded':             { prop: 'border-radius', val: '12px' },
};

function buildHTML(body) {
  const parts = [];
  const inlineStyleBlocks = []; // CSS generated from inline section modifiers
  const usedIds = new Set(); // Track element IDs to prevent duplicates
  // Source map: emit data-clear-line="N" on every HTML element for click-to-highlight
  const clAttr = (node) => node.line ? ` data-clear-line="${node.line}"` : '';
  let pageTitle = 'Clear App';
  let hasChart = false; // Track if any chart nodes exist (for ECharts CDN)
  let hasMap = false;   // Track if any map display nodes exist (for Leaflet CDN)
  let hasQR = false;    // Track if any QR display nodes exist (for QRCode CDN)
  let hasRichText = false; // Track if any rich text editors exist (for Quill CDN)
  let hasChat = false;  // Track if any chat display nodes exist (for chat CSS)
  const pages = [];
  const sectionStack = []; // Track parent section presets for context-aware rendering

  function walk(nodes) {
    for (const node of nodes) {
      switch (node.type) {
        case NodeType.PAGE:
          pageTitle = node.title;
          if (node.route) {
            pages.push({ title: node.title, route: node.route, startIdx: parts.length });
          }
          walk(node.body);
          if (node.route) {
            pages[pages.length - 1].endIdx = parts.length;
          }
          break;

        case NodeType.SECTION: {
          const hasUserStyle = node.styleName;
          const hasInline = node.inlineModifiers && node.inlineModifiers.length > 0;
          // Determine if this is a layout section (bare div) or content (card)
          const layoutKeywords = ['column layout', 'full height', 'scrollable', 'fills remaining', 'sticky', 'stacked'];
          const isLayout = hasInline && node.inlineModifiers.some(m =>
            typeof m === 'string' && layoutKeywords.some(k => m.includes(k))
          );
          const isLayoutByName = hasUserStyle && ['layout', 'stacked', 'scrollable', 'fills', 'sticky', 'grid', 'area', 'bar', 'sidebar'].some(k => node.styleName.includes(k));

          // Generate inline modifier CSS class if needed
          let inlineClass = '';
          let tailwindClasses = '';
          if (hasInline) {
            const slug = sanitizeName(node.title.replace(/\s+/g, '_').toLowerCase());
            inlineClass = `section-${slug}`;
            const cssProps = [];
            const twClasses = [];
            for (const mod of node.inlineModifiers) {
              if (typeof mod === 'string' && INLINE_LAYOUT_MODIFIERS[mod]) {
                const m = INLINE_LAYOUT_MODIFIERS[mod];
                if (m.tailwind) {
                  twClasses.push(m.tailwind);
                } else {
                  cssProps.push(`${m.prop}: ${m.val}`);
                  if (m.extra) Object.entries(m.extra).forEach(([k, v]) => cssProps.push(`${k}: ${v}`));
                }
              } else if (mod && mod.tailwind) {
                twClasses.push(mod.tailwind); // direct Tailwind classes (e.g. from Npx wide mapping)
              } else if (mod && mod.custom && mod.props) {
                Object.entries(mod.props).forEach(([k, v]) => cssProps.push(`${k}: ${v}`));
              }
            }
            if (cssProps.length > 0) {
              inlineStyleBlocks.push(`.${inlineClass} { ${cssProps.join('; ')}; }`);
            } else {
              inlineClass = ''; // No custom CSS needed
            }
            if (twClasses.length > 0) {
              tailwindClasses = twClasses.join(' ');
            }
          }

          const mods = node.inlineModifiers || [];
          const isTabs = mods.includes('__tabs');
          const isModal = mods.includes('__modal');
          const isSlideIn = mods.some(m => typeof m === 'string' && m.startsWith('__slidein_'));
          const isCollapsible = mods.includes('__collapsible');
          const startsClosed = mods.includes('__starts_closed');
          const slug = sanitizeName(node.title.replace(/\s+/g, '_').toLowerCase());
          const panelId = `panel-${slug}`;

          if (isTabs) {
            // Tabs: generate tab bar + content panels
            const tabs = node.body.filter(n => n.type === NodeType.TAB);
            const otherContent = node.body.filter(n => n.type !== NodeType.TAB);
            parts.push(`    <div class="${[inlineClass, tailwindClasses, 'clear-section'].filter(Boolean).join(' ')}" id="${panelId}">`);
            // Tab buttons
            parts.push(`    <div class="tabs tabs-bordered" role="tablist">`);
            tabs.forEach((tab, i) => {
              const tabSlug = sanitizeName(tab.title.replace(/\s+/g, '_').toLowerCase());
              parts.push(`      <button class="tab${i === 0 ? ' tab-active' : ''}" data-tab="${tabSlug}" onclick="document.querySelectorAll('#${panelId} .tab').forEach(t=>t.classList.remove('tab-active'));this.classList.add('tab-active');document.querySelectorAll('#${panelId} .tab-panel').forEach(p=>p.style.display='none');document.getElementById('tabpanel-${tabSlug}').style.display=''">${tab.title}</button>`);
            });
            parts.push(`    </div>`);
            // Tab panels
            tabs.forEach((tab, i) => {
              const tabSlug = sanitizeName(tab.title.replace(/\s+/g, '_').toLowerCase());
              parts.push(`    <div class="tab-panel p-4" id="tabpanel-${tabSlug}" style="${i === 0 ? '' : 'display:none'}">`);
              walk(tab.body);
              parts.push(`    </div>`);
            });
            walk(otherContent);
            parts.push(`    </div>`);
            break;
          }

          if (isModal) {
            // Modal: DaisyUI modal pattern
            parts.push(`    <dialog class="modal" id="${panelId}">`);
            parts.push(`    <div class="modal-box">`);
            walk(node.body);
            parts.push(`    </div>`);
            parts.push(`    <form method="dialog" class="modal-backdrop"><button>close</button></form>`);
            parts.push(`    </dialog>`);
            // CSS for modal backdrop
            inlineStyleBlocks.push(`#${panelId}::backdrop { background: rgba(0,0,0,0.4); }`);
            break;
          }

          if (isSlideIn) {
            const dir = mods.find(m => typeof m === 'string' && m.startsWith('__slidein_'))?.replace('__slidein_', '') || 'right';
            const translateStart = dir === 'left' ? '-100%' : '100%';
            parts.push(`    <div class="${['clear-section', inlineClass, tailwindClasses].filter(Boolean).join(' ')}" id="${panelId}" style="display:none">`);
            walk(node.body);
            parts.push(`    </div>`);
            // Slide-in CSS
            inlineStyleBlocks.push(`.${inlineClass || 'section-' + slug} { position: fixed; top: 0; ${dir}: 0; height: 100vh; width: 360px; z-index: 50; background: var(--color-surface, #fff); box-shadow: -4px 0 20px rgba(0,0,0,0.1); transform: translateX(0); transition: transform 0.3s ease; overflow-y: auto; padding: 1.5rem; }`);
            break;
          }

          if (isCollapsible) {
            const display = startsClosed ? 'none' : 'block';
            parts.push(`    <div class="${['clear-section', inlineClass, tailwindClasses].filter(Boolean).join(' ')}" id="${panelId}">`);
            parts.push(`      <h2 class="cursor-pointer select-none" onclick="const c=this.nextElementSibling;c.style.display=c.style.display==='none'?'block':'none'">${node.title} <span class="text-sm opacity-50">&#9662;</span></h2>`);
            parts.push(`      <div class="collapsible-content" style="display:${display}">`);
            walk(node.body);
            parts.push(`      </div>`);
            parts.push(`    </div>`);
            break;
          }

          // Check if the style name maps to a built-in preset (DaisyUI classes).
          // User-defined styles (via `style X:` blocks) override presets.
          const hasUserOverride = hasUserStyle && body.some(n => n.type === NodeType.STYLE_DEF && n.name === node.styleName);
          const presetClasses = hasUserStyle && !hasUserOverride && BUILTIN_PRESET_CLASSES[node.styleName];

          if (presetClasses) {
            // Special case: page_navbar renders its own semantic HTML structure
            if (node.styleName === 'page_navbar') {
              const nbBrand = [], nbLinks = [], nbCtas = [];
              for (const child of node.body) {
                if (child.type === NodeType.CONTENT && child.ui?.contentType === 'heading') nbBrand.push(child);
                else if (child.type === NodeType.CONTENT && child.ui?.contentType === 'link') nbLinks.push(child);
                else if (child.type === NodeType.BUTTON) nbCtas.push(child);
                else nbLinks.push(child);
              }
              const brandText = nbBrand[0] ? formatInlineText(nbBrand[0].ui.text) : '';
              // Last link becomes primary CTA if no button nodes exist
              const ctaLink = nbCtas.length === 0 && nbLinks.length > 0 ? nbLinks.pop() : null;
              parts.push(`    <nav class="sticky top-0 z-50 bg-base-100/90 backdrop-blur-md border-b border-base-300/40 shrink-0">`);
              parts.push(`      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">`);
              parts.push(`        <div class="flex items-center gap-8">`);
              if (brandText) parts.push(`          <span class="font-display text-lg font-bold text-base-content tracking-tight">${brandText}</span>`);
              if (nbLinks.length > 0) {
                parts.push(`          <div class="hidden md:flex items-center gap-6">`);
                for (const lk of nbLinks) {
                  const fmt = formatInlineText(lk.ui.text);
                  const href = lk.ui?.href || '#';
                  parts.push(`            <a class="text-sm font-medium text-base-content/60 hover:text-base-content transition-colors" href="${href}">${fmt}</a>`);
                }
                parts.push(`          </div>`);
              }
              parts.push(`        </div>`);
              parts.push(`        <div class="flex items-center gap-3">`);
              // Mobile hamburger menu
              if (nbLinks.length > 0) {
                parts.push(`          <label for="nav-drawer" class="btn btn-ghost btn-sm btn-square md:hidden"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-5 h-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></label>`);
              }
              // CTA buttons: ghost variant for secondary, primary for last
              if (nbCtas.length >= 2) {
                nbCtas.forEach((btn, idx) => {
                  const btnCls = idx < nbCtas.length - 1 ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm';
                  parts.push(`          <button class="${btnCls}" id="${btn.ui.id}">${btn.ui.label}</button>`);
                });
              } else {
                for (const btn of nbCtas) {
                  parts.push(`          <button class="btn btn-primary btn-sm" id="${btn.ui.id}">${btn.ui.label}</button>`);
                }
              }
              if (ctaLink) {
                const fmt = formatInlineText(ctaLink.ui.text);
                const href = ctaLink.ui?.href || '#';
                parts.push(`          <a class="btn btn-primary btn-sm" href="${href}">${fmt}</a>`);
              }
              parts.push(`        </div>`);
              parts.push(`      </div>`);
              parts.push(`    </nav>`);
              // Mobile drawer for nav links
              if (nbLinks.length > 0) {
                parts.push(`    <input id="nav-drawer" type="checkbox" class="hidden peer">`);
                parts.push(`    <div class="fixed inset-0 z-40 bg-base-100 flex flex-col p-6 pt-20 gap-4 peer-checked:flex hidden md:hidden">`);
                parts.push(`      <label for="nav-drawer" class="absolute top-4 right-4 btn btn-ghost btn-sm btn-square"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-5 h-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></label>`);
                for (const lk of nbLinks) {
                  const fmt = formatInlineText(lk.ui.text);
                  const href = lk.ui?.href || '#';
                  parts.push(`      <a class="text-lg font-medium text-base-content/70 hover:text-base-content transition-colors" href="${href}">${fmt}</a>`);
                }
                parts.push(`    </div>`);
              }
              break;
            }

            // Built-in preset: use Tailwind/DaisyUI classes directly, no custom CSS
            // Context-aware: cards inside dark sections get dark card styling
            let resolvedPreset = presetClasses;
            const parentPresetName = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
            const inDarkSection = ['page_section_dark', 'section_dark'].includes(parentPresetName);
            if (inDarkSection && ['card', 'page_card'].includes(node.styleName)) {
              resolvedPreset = 'bg-neutral-focus/50 rounded-2xl p-8 flex flex-col gap-3 border border-neutral-content/10';
            }
            const cls = [resolvedPreset, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            // hero_left and page_hero get radial gradients (CSS custom properties work at runtime unlike Tailwind from-primary)
            const heroInlineStyle = node.styleName === 'hero_left'
              ? ` style="background:radial-gradient(ellipse 80% 60% at 70% 50%, oklch(from var(--color-primary, oklch(0.55 0.2 260)) l c h / 0.08) 0%, transparent 70%), var(--color-base-100, white)"`
              : node.styleName === 'page_hero'
              ? ` style="background:radial-gradient(ellipse 70% 50% at 50% 0%, oklch(from var(--color-primary, oklch(0.55 0.2 260)) l c h / 0.1) 0%, transparent 65%), var(--color-base-100, white)"`
              : '';
            // Only full-width landing page sections get the max-w-5xl inner wrapper.
            // App presets (flex layout) and card-type presets (already constrained) skip it.
            const isAppPreset = node.styleName && (node.styleName.startsWith('app_') || node.styleName.startsWith('split'));
            const isCardPreset = [
              'metric_card', 'card', 'card_bordered', 'form', 'code_box',
              'feature_card', 'feature_card_dark', 'feature_card_large',
              'feature_card_teal', 'feature_card_purple', 'feature_card_indigo',
              'feature_card_emerald', 'feature_card_rose', 'feature_card_amber',
              'pricing_card', 'pricing_card_featured',
              'testimonial_card', 'stat_item', 'logo_item', 'app_table',
              'app_modal', 'empty_state', 'app_list',
            ].includes(node.styleName);
            const isHeroPreset = ['page_hero', 'hero', 'hero_left', 'page_cta'].includes(node.styleName);
            const isNavbarPreset = node.styleName === 'page_navbar';
            const GRID_SECTION_PRESETS = [
              'logo_bar', 'logo_bar_dark',
              'feature_split', 'feature_split_dark',
              'feature_spotlight', 'feature_spotlight_dark',
              'feature_grid', 'feature_grid_dark',
              'stats_row',
              'pricing_grid', 'pricing_grid_dark',
              'testimonial_grid', 'testimonial_grid_dark',
              'faq_section', 'page_footer',
            ];
            const isGridSection = GRID_SECTION_PRESETS.includes(node.styleName);
            const needsWrapper = !isAppPreset && !isCardPreset && !isHeroPreset && !isNavbarPreset && !isGridSection;
            parts.push(`    <div class="${cls}"${heroInlineStyle}${clAttr(node)}>`);
            if (needsWrapper) parts.push(`      <div class="max-w-4xl mx-auto">`);
            sectionStack.push(node.styleName);
            if (node.styleName === 'app_sidebar') {
              // Sidebar: split children into brand (heading), nav items, and other.
              // Sub-sections whose children are all text/link nodes are treated as nav groups —
              // their text children are flattened into navNodes (with optional group label).
              const brandNodes = [];
              const navNodes = [];  // { label?: string, items: Node[] }[] or flat Node[]
              const otherNodes = [];

              const isNavContent = c =>
                c.type === NodeType.CONTENT &&
                ['text', 'bold', 'link'].includes(c.contentType || c.ui?.contentType);

              for (const child of node.body) {
                if (child.type === NodeType.CONTENT && (child.contentType === 'heading' || child.ui?.contentType === 'heading')) {
                  brandNodes.push(child);
                } else if (child.type === NodeType.CONTENT && (child.contentType === 'divider' || child.ui?.contentType === 'divider')) {
                  // Skip dividers — brand border-b replaces them
                } else if (isNavContent(child)) {
                  navNodes.push({ group: null, items: [child] });
                } else if (child.type === NodeType.FOR_EACH) {
                  navNodes.push({ group: null, items: [child] });
                } else if (child.type === NodeType.SECTION && child.body && child.body.every(isNavContent)) {
                  // Nested section whose children are all nav-compatible → nav group
                  navNodes.push({ group: child.title, items: child.body });
                } else {
                  otherNodes.push(child);
                }
              }

              // Emit brand heading(s)
              walk(brandNodes);
              // Emit nav items wrapped in menu
              if (navNodes.length > 0) {
                parts.push(`    <nav class="flex-1 overflow-y-auto py-4 px-4">`);
                parts.push(`      <ul class="menu menu-md gap-0.5 p-0">`);
                for (const entry of navNodes) {
                  if (entry.group) {
                    parts.push(`        <li class="menu-title text-xs font-semibold uppercase tracking-widest text-base-content/40 mt-5 mb-1 px-3">${entry.group}</li>`);
                  }
                  walk(entry.items);
                }
                parts.push(`      </ul>`);
                parts.push(`    </nav>`);
              }
              // Emit remaining children
              if (otherNodes.length > 0) walk(otherNodes);
            } else if (isGridSection) {
              // Grid sections: split direct CONTENT children (heading/label) from SECTION children (cards).
              // CONTENT children → centered header block. SECTION children → layout-specific container.
              const sn = node.styleName;
              const headerNodes = node.body.filter(c => c.type === NodeType.CONTENT);
              const cardNodes = node.body.filter(c => c.type === NodeType.SECTION);
              const isDark = sn.endsWith('_dark');
              const headingColor = isDark ? 'text-neutral-content' : 'text-base-content';
              if (headerNodes.length > 0 && sn !== 'page_footer') {
                parts.push(`      <div class="max-w-5xl mx-auto text-center mb-10">`);
                walk(headerNodes);
                parts.push(`      </div>`);
              }
              if (sn === 'logo_bar' || sn === 'logo_bar_dark') {
                parts.push(`      <div class="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-12 gap-y-6">`);
                walk(cardNodes);
                parts.push(`      </div>`);
              } else if (sn === 'feature_split' || sn === 'feature_split_dark') {
                parts.push(`      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">`);
                if (cardNodes.length > 0) {
                  const [large, ...smalls] = cardNodes;
                  parts.push(`        <div class="lg:col-span-2">`);
                  walk([large]);
                  parts.push(`        </div>`);
                  if (smalls.length > 0) {
                    parts.push(`        <div class="flex flex-col gap-6">`);
                    walk(smalls);
                    parts.push(`        </div>`);
                  }
                }
                parts.push(`      </div>`);
              } else if (sn === 'feature_spotlight' || sn === 'feature_spotlight_dark') {
                parts.push(`      <div class="max-w-6xl mx-auto flex flex-col gap-16 mt-6">`);
                cardNodes.forEach((card, i) => {
                  const isEven = i % 2 === 0;
                  parts.push(`        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">`);
                  if (isEven) {
                    walk([card]);
                    parts.push(`          <div class="bg-base-200 rounded-2xl border border-base-300/40 aspect-video flex items-center justify-center"><span class="text-base-content/20 text-sm font-mono">product ui</span></div>`);
                  } else {
                    parts.push(`          <div class="bg-base-200 rounded-2xl border border-base-300/40 aspect-video flex items-center justify-center order-first"><span class="text-base-content/20 text-sm font-mono">product ui</span></div>`);
                    walk([card]);
                  }
                  parts.push(`        </div>`);
                });
                parts.push(`      </div>`);
              } else if (sn === 'stats_row') {
                parts.push(`      <div class="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">`);
                walk(cardNodes);
                parts.push(`      </div>`);
              } else if (sn === 'pricing_grid' || sn === 'pricing_grid_dark') {
                parts.push(`      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start mt-6">`);
                walk(cardNodes);
                parts.push(`      </div>`);
              } else if (sn === 'faq_section') {
                // FAQ: child sections become DaisyUI collapse accordion items
                parts.push(`      <div class="max-w-3xl mx-auto flex flex-col gap-3">`);
                cardNodes.forEach((card, faqIdx) => {
                  // Extract heading child as the question text; text/subheading children are the answer
                  let qTitle = '';
                  const answerParts = [];
                  if (card.body) {
                    for (const child of card.body) {
                      if (child.type === NodeType.CONTENT && child.ui) {
                        const ct = child.ui.contentType || child.contentType;
                        if (!qTitle && (ct === 'heading' || ct === 'subheading')) {
                          qTitle = formatInlineText(child.ui.text);
                        } else {
                          answerParts.push(formatInlineText(child.ui.text));
                        }
                      }
                    }
                  }
                  if (!qTitle) qTitle = card.ui?.title || card.title || 'Question';
                  const answer = answerParts.join(' ') || 'Answer';
                  const checkedAttr = faqIdx === 0 ? ' checked' : '';
                  parts.push(`        <div class="collapse collapse-arrow bg-base-200/50 border border-base-300/40">`);
                  parts.push(`          <input type="radio" name="faq"${checkedAttr} />`);
                  parts.push(`          <div class="collapse-title font-semibold text-base">${qTitle}</div>`);
                  parts.push(`          <div class="collapse-content text-sm text-base-content/70"><p>${answer}</p></div>`);
                  parts.push(`        </div>`);
                });
                parts.push(`      </div>`);
              } else if (sn === 'page_footer') {
                // Footer: first heading = brand, child sections = link columns, last text = copyright
                const brandNodes = [];
                const linkGroups = [];
                const copyrightNodes = [];
                for (const child of node.body) {
                  if (child.type === NodeType.CONTENT && (child.contentType === 'heading' || child.ui?.contentType === 'heading')) {
                    brandNodes.push(child);
                  } else if (child.type === NodeType.SECTION) {
                    linkGroups.push(child);
                  } else if (child.type === NodeType.CONTENT && (child.contentType === 'small' || child.ui?.contentType === 'small')) {
                    copyrightNodes.push(child);
                  } else if (child.type === NodeType.CONTENT) {
                    copyrightNodes.push(child);
                  }
                }
                parts.push(`      <div class="max-w-6xl mx-auto">`);
                // Brand + link columns row
                parts.push(`        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">`);
                if (brandNodes.length > 0) {
                  parts.push(`          <div class="col-span-2 md:col-span-1">`);
                  for (const bn of brandNodes) {
                    const fmt = formatInlineText(bn.ui.text);
                    parts.push(`            <p class="text-lg font-bold text-base-content tracking-tight">${fmt}</p>`);
                  }
                  parts.push(`          </div>`);
                }
                for (const group of linkGroups) {
                  const groupTitle = group.ui?.title || group.title || '';
                  parts.push(`          <div class="flex flex-col gap-2">`);
                  if (groupTitle) {
                    parts.push(`            <p class="text-sm font-semibold text-base-content/50 uppercase tracking-wider mb-3">${groupTitle}</p>`);
                  }
                  if (group.body) {
                    for (const item of group.body) {
                      if (item.type === NodeType.CONTENT && item.ui) {
                        const fmt = formatInlineText(item.ui.text);
                        if (item.ui.contentType === 'link') {
                          parts.push(`            <a class="text-sm text-base-content/60 hover:text-base-content transition-colors" href="${item.ui.href || '#'}">${fmt}</a>`);
                        } else {
                          parts.push(`            <span class="text-sm text-base-content/60 hover:text-base-content transition-colors cursor-pointer">${fmt}</span>`);
                        }
                      }
                    }
                  }
                  parts.push(`          </div>`);
                }
                parts.push(`        </div>`);
                // Copyright row
                if (copyrightNodes.length > 0) {
                  parts.push(`        <div class="border-t border-base-300/40 mt-8 pt-6 text-center">`);
                  for (const cn of copyrightNodes) {
                    const fmt = formatInlineText(cn.ui.text);
                    parts.push(`          <p class="text-sm text-base-content/40">${fmt}</p>`);
                  }
                  parts.push(`        </div>`);
                }
                parts.push(`      </div>`);
              } else {
                // feature_grid, testimonial_grid, etc.
                parts.push(`      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">`);
                walk(cardNodes);
                parts.push(`      </div>`);
              }
            } else if (isHeroPreset) {
              // Hero: group consecutive link nodes into a flex row for side-by-side CTA buttons.
              // hero_left gets a two-column layout: text left + product mock right.
              // Centered heroes (page_hero, page_cta) get justify-center.
              const isLeftHero = node.styleName === 'hero_left';
              const justifyClass = isLeftHero ? 'justify-start' : 'justify-center';

              if (isLeftHero) {
                // Two-column: text content on left, product screenshot mock on right
                parts.push(`    <div class="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">`);
                parts.push(`      <div class="flex flex-col gap-6">`);
              }

              const children = node.body;
              let ci = 0;
              while (ci < children.length) {
                const child = children[ci];
                const isLinkNode = child.type === NodeType.CONTENT && child.ui && child.ui.contentType === 'link';
                const nextIsLink = ci + 1 < children.length &&
                  children[ci + 1].type === NodeType.CONTENT &&
                  children[ci + 1].ui && children[ci + 1].ui.contentType === 'link';
                if (isLinkNode && nextIsLink) {
                  const linkGroup = [];
                  while (ci < children.length && children[ci].type === NodeType.CONTENT && children[ci].ui && children[ci].ui.contentType === 'link') {
                    linkGroup.push(children[ci++]);
                  }
                  parts.push(`    <div class="flex gap-4 flex-wrap ${justifyClass} mt-2">`);
                  const isCtaSection = node.styleName === 'page_cta';
                  linkGroup.forEach((linkNode, idx) => {
                    const fmt = formatInlineText(linkNode.ui.text);
                    const href = linkNode.ui?.href || '#';
                    const btnCls = isCtaSection
                      ? (idx === 0 ? 'btn btn-neutral btn-lg' : 'btn btn-ghost btn-lg text-primary-content')
                      : (idx === 0 ? 'btn btn-primary btn-lg' : 'btn btn-outline btn-lg');
                    parts.push(`      <a class="${btnCls}" href="${href}">${fmt}</a>`);
                  });
                  parts.push(`    </div>`);
                } else {
                  walk([child]);
                  ci++;
                }
              }

              if (isLeftHero) {
                parts.push(`      </div>`);
                // Right column: simulated product UI (Clay/Notion style)
                parts.push(`      <div class="hidden lg:flex items-start justify-center pt-4">`);
                parts.push(`        <div class="w-full max-w-lg rounded-2xl border border-base-300/60 shadow-2xl overflow-hidden" style="background:oklch(0.97 0.005 240)">`);
                // Fake app chrome: title bar
                parts.push(`          <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300/40" style="background:oklch(0.95 0.008 240)">`);
                parts.push(`            <div class="w-3 h-3 rounded-full bg-red-300/70"></div>`);
                parts.push(`            <div class="w-3 h-3 rounded-full bg-yellow-300/70"></div>`);
                parts.push(`            <div class="w-3 h-3 rounded-full bg-green-300/70"></div>`);
                parts.push(`            <div class="flex-1 mx-4 h-5 rounded-md bg-base-300/40 text-xs flex items-center justify-center text-base-content/30 font-mono">vibe.so/recording/abc123</div>`);
                parts.push(`          </div>`);
                // Video recording area
                parts.push(`          <div class="p-4 flex flex-col gap-3">`);
                parts.push(`            <div class="rounded-xl overflow-hidden aspect-video bg-base-content/8 flex items-center justify-center relative">`);
                parts.push(`              <div class="absolute inset-0" style="background:linear-gradient(135deg, oklch(0.45 0.18 270 / 0.15), oklch(0.55 0.2 230 / 0.1))"></div>`);
                parts.push(`              <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center z-10">`);
                parts.push(`                <div class="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[14px] border-t-transparent border-b-transparent border-l-primary/60 ml-1"></div>`);
                parts.push(`              </div>`);
                parts.push(`              <div class="absolute bottom-3 left-3 right-3 flex items-center gap-2">`);
                parts.push(`                <div class="h-1 flex-1 rounded-full bg-base-content/20"><div class="h-1 w-2/5 rounded-full bg-primary/70"></div></div>`);
                parts.push(`                <span class="text-xs font-mono text-base-content/40">1:42</span>`);
                parts.push(`              </div>`);
                parts.push(`            </div>`);
                // AI summary cards below
                parts.push(`            <div class="grid grid-cols-2 gap-2">`);
                parts.push(`              <div class="rounded-lg p-3 border border-base-300/50 bg-base-100/80">`);
                parts.push(`                <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5">AI Summary</div>`);
                parts.push(`                <div class="h-1.5 w-full rounded bg-base-300/60 mb-1"></div>`);
                parts.push(`                <div class="h-1.5 w-4/5 rounded bg-base-300/40"></div>`);
                parts.push(`              </div>`);
                parts.push(`              <div class="rounded-lg p-3 border border-primary/20 bg-primary/5">`);
                parts.push(`                <div class="text-xs font-semibold text-primary/70 uppercase tracking-wide mb-1.5">Action Items</div>`);
                parts.push(`                <div class="flex items-center gap-1.5 mb-1"><div class="w-3 h-3 rounded border border-primary/40"></div><div class="h-1.5 flex-1 rounded bg-primary/20"></div></div>`);
                parts.push(`                <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded border border-primary/40"></div><div class="h-1.5 w-3/4 rounded bg-primary/15"></div></div>`);
                parts.push(`              </div>`);
                parts.push(`            </div>`);
                parts.push(`          </div>`);
                parts.push(`        </div>`);
                parts.push(`      </div>`);
                parts.push(`    </div>`);
              }
            } else if (node.styleName === 'app_list') {
              // app_list: header content above, each child wrapped as a list item row
              const listHeader = node.body.filter(c => c.type === NodeType.CONTENT && (c.contentType === 'heading' || c.ui?.contentType === 'heading'));
              const listItems = node.body.filter(c => !(c.type === NodeType.CONTENT && (c.contentType === 'heading' || c.ui?.contentType === 'heading')));
              for (const hdr of listHeader) {
                const fmt = formatInlineText(hdr.ui.text);
                parts.push(`      <div class="text-sm font-semibold text-base-content/60 px-5 pt-4 pb-2">${fmt}</div>`);
              }
              for (const item of listItems) {
                parts.push(`      <div class="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-base-content/5 transition-colors">`);
                // If child is an unstyled section, walk its body directly to avoid nested column div
                if (item.type === NodeType.SECTION && !item.styleName && item.body) {
                  walk(item.body);
                } else {
                  walk([item]);
                }
                parts.push(`      </div>`);
              }
            } else {
              // Inject icon for empty state
              if (node.styleName === 'empty_state') {
                parts.push(`      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-base-content/20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>`);
              }
              // Inject star rating row and quote mark for testimonial cards
              if (node.styleName === 'testimonial_card') {
                parts.push(`      <div class="text-4xl leading-none text-base-content/20 font-serif mb-1">\u201C</div>`);
                parts.push(`      <div class="flex gap-0.5 text-amber-400 text-sm mb-2">★★★★★</div>`);
              }
              walk(node.body);
            }
            sectionStack.pop();
            if (needsWrapper) parts.push(`      </div>`);
            parts.push(`    </div>`);
          } else if (hasUserStyle || hasInline) {
            // User-defined style: resolve semantic tokens to Tailwind, rest to CSS class
            const styleDef = node.styleName
              ? body.find(n => n.type === NodeType.STYLE_DEF && n.name === node.styleName)
              : null;
            const { tailwindClasses: tokenClasses, rawProperties } =
              styleDef ? resolveStyleTokens(styleDef.properties) : { tailwindClasses: '', rawProperties: [] };
            // Only add CSS class if there are raw (non-token) properties to generate CSS for
            const cssClass = (hasUserStyle && rawProperties.length > 0) ? node.ui.cssClass : '';
            const allClasses = [tokenClasses, cssClass, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            parts.push(`    <div class="${allClasses}"${clAttr(node)}>`);
            // Wrapper for raw-CSS-only styles (treats like old behavior); skip for pure-token styles
            if (hasUserStyle && !hasInline && rawProperties.length > 0) {
              parts.push(`      <div class="max-w-5xl mx-auto px-4">`);
            }
            // Push to sectionStack so child sections know their parent context
            if (node.styleName) sectionStack.push(node.styleName);
            walk(node.body);
            if (node.styleName) sectionStack.pop();
            if (hasUserStyle && !hasInline && rawProperties.length > 0) {
              parts.push(`      </div>`);
            }
            parts.push(`    </div>`);
          } else {
            // No style: if inside a styled parent (layout/app), render as bare div to avoid double-boxing.
            // If at top level, use default card treatment.
            const inStyledParent = sectionStack.length > 0;
            if (inStyledParent) {
              const allClasses = ['clear-section', inlineClass, tailwindClasses].filter(Boolean).join(' ');
              parts.push(`    <div class="${allClasses}"${clAttr(node)}>`);
              walk(node.body);
              parts.push(`    </div>`);
            } else {
              // Default card section using DaisyUI utilities
              const allClasses = ['clear-section bg-base-200 rounded-box p-6 mb-6', inlineClass, tailwindClasses].filter(Boolean).join(' ');
              parts.push(`    <div class="${allClasses}"${clAttr(node)}>
      <h2 class="text-xl font-semibold text-base-content tracking-tight mb-4">${node.ui.title}</h2>`);
              walk(node.body);
              parts.push(`    </div>`);
            }
          }
          break;
        }

        case NodeType.ASK_FOR: {
          // Skip nodes absorbed into a chat component's built-in UI
          if (node._chatAbsorbed) break;
          const ui = node.ui;
          // Inside flex containers (card, form), gap handles spacing — no margin needed
          const inputParent = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
          const inputInFlex = ['card', 'card_bordered', 'form', 'metric_card'].includes(inputParent);
          const fieldsetCls = inputInFlex ? 'fieldset' : 'fieldset mb-4';
          if (ui.htmlType === 'checkbox') {
            parts.push(`    <div class="flex items-center gap-3${inputInFlex ? '' : ' mb-3'}"${clAttr(node)}>
      <input id="${ui.id}" type="checkbox" class="checkbox checkbox-primary">
      <label for="${ui.id}" class="text-sm text-base-content/70">${ui.label}</label>
    </div>`);
          } else if (ui.htmlType === 'textarea') {
            parts.push(`    <fieldset class="${fieldsetCls}"${clAttr(node)}>
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <textarea id="${ui.id}" class="textarea textarea-bordered w-full" placeholder="${ui.label}" rows="6"></textarea>
    </fieldset>`);
          } else if (ui.htmlType === 'rich-text') {
            // Rich text editor: Quill via CDN. `_clear_rich_init` runs once at
            // page load for every ${ui.id} instance and keeps _state in sync.
            hasRichText = true;
            parts.push(`    <fieldset class="${fieldsetCls}"${clAttr(node)}>
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <div class="rich-text-wrap border border-base-300/60 rounded-field bg-base-100">
        <div id="${ui.id}" class="rich-text-editor" data-clear-rich-text="${ui.id}" data-placeholder="${ui.label}"></div>
      </div>
    </fieldset>`);
          } else if (ui.htmlType === 'select' && ui.choices) {
            const options = ui.choices.map(c => `        <option value="${c}">${c}</option>`).join('\n');
            parts.push(`    <fieldset class="${fieldsetCls}"${clAttr(node)}>
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <select id="${ui.id}" class="select select-bordered w-full">
${options}
      </select>
    </fieldset>`);
          } else if (ui.htmlType === 'file') {
            parts.push(`    <fieldset class="${fieldsetCls}"${clAttr(node)}>
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <input id="${ui.id}" class="file-input file-input-bordered w-full" type="file">
    </fieldset>`);
          } else {
            parts.push(`    <fieldset class="${fieldsetCls}"${clAttr(node)}>
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <input id="${ui.id}" class="input input-bordered w-full" type="${ui.htmlType}"${ui.htmlType === 'number' ? ' step="any"' : ''} placeholder="${ui.label}">
    </fieldset>`);
          }
          break;
        }

        case NodeType.DISPLAY: {
          const ui = node.ui;
          // Deduplicate IDs when the same display appears multiple times
          let displayId = ui.id;
          if (usedIds.has(displayId)) {
            let counter = 2;
            while (usedIds.has(displayId + '_' + counter)) counter++;
            displayId = displayId + '_' + counter;
          }
          usedIds.add(displayId);
          // Store the deduplicated ID back on the node for the reactive compiler
          node.ui._resolvedId = displayId;
          const inUserSection = sectionStack.length > 0;
          const _cl = clAttr(node);
          if (ui.tag === 'table') {
            parts.push(`    <div class="bg-base-100 rounded-box border border-base-300/40 shadow-sm overflow-hidden" id="${displayId}"${_cl}>
      <div class="px-6 py-4 border-b border-base-300/40">
        <h3 class="text-sm font-semibold text-base-content">${ui.label}</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-sm w-full" id="${displayId}_table">
          <thead class="bg-base-200"><tr><th class="text-xs uppercase tracking-widest font-semibold text-base-content/50"></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`);
          } else if (ui.tag === 'cards') {
            parts.push(`    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto" id="${displayId}_cards"></div>`);
          } else if (ui.tag === 'list') {
            parts.push(`    <ul class="list-disc pl-6 space-y-1" id="${displayId}_list"></ul>`);
          } else if (ui.tag === 'chat') {
            hasChat = true;
            parts.push(`    <div class="clear-chat-wrap" id="${displayId}">
      <div class="clear-chat-head">
        <span class="clear-chat-title">${ui.label || 'Chat'}</span>
        <button class="clear-chat-new" id="${displayId}_new">New</button>
      </div>
      <div class="clear-chat-msgs" id="${displayId}_msgs"></div>
      <div class="clear-chat-typing" id="${displayId}_typing" style="display:none">
        <div class="clear-typing-dot"></div>
        <div class="clear-typing-dot"></div>
        <div class="clear-typing-dot"></div>
      </div>
      <button class="clear-chat-scroll" id="${displayId}_scroll">&#8595;</button>
      <div class="clear-chat-input">
        <textarea id="${displayId}_input" placeholder="Type a message..." rows="1"></textarea>
        <button id="${displayId}_send" class="clear-chat-send-btn">Send</button>
      </div>
    </div>`);
          } else if (ui.tag === 'gallery') {
            parts.push(`    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="${displayId}_gallery"></div>`);
          } else if (ui.tag === 'map') {
            parts.push(`    <div class="bg-base-100 rounded-xl border border-base-300/40 shadow-sm overflow-hidden" id="${displayId}"${_cl}>
      <div class="px-6 py-4 border-b border-base-300/40">
        <h3 class="text-sm font-semibold text-base-content">${ui.label}</h3>
      </div>
      <div id="${displayId}_map" style="width:100%;height:400px;"></div>
    </div>`);
            hasMap = true;
          } else if (ui.tag === 'calendar') {
            parts.push(`    <div class="bg-base-100 rounded-xl border border-base-300/40 shadow-sm overflow-hidden" id="${displayId}"${_cl}>
      <div class="px-6 py-4 border-b border-base-300/40">
        <h3 class="text-sm font-semibold text-base-content">${ui.label}</h3>
      </div>
      <div class="p-4" id="${displayId}_calendar"></div>
    </div>`);
          } else if (ui.tag === 'qr') {
            parts.push(`    <div class="bg-base-100 rounded-xl border border-base-300/40 shadow-sm p-6 flex flex-col items-center gap-4" id="${displayId}"${_cl}>
      <p class="text-sm font-medium text-base-content/50">${ui.label}</p>
      <canvas id="${displayId}_qr" width="200" height="200"></canvas>
    </div>`);
            hasQR = true;
          } else if (inUserSection) {
            // Inside a styled card (stat_card etc.) — render just the number inline, no extra wrapper
            parts.push(`    <p class="font-display text-2xl font-bold text-base-content tracking-tight" id="${displayId}_value"></p>`);
            // Only show label if it's meaningful (not the generic "Output" default)
            if (ui.label && ui.label !== 'Output') parts.push(`    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/40 mt-1">${ui.label}</p>`);
          } else {
            parts.push(`    <div class="bg-base-200 rounded-xl border border-base-300/40 p-6 flex flex-col gap-2" id="${displayId}"${_cl}>
      <p class="text-sm font-medium text-base-content/50">${ui.label}</p>
      <p class="font-display text-3xl font-bold text-base-content tracking-tight" id="${displayId}_value"></p>
    </div>`);
          }
          break;
        }

        case NodeType.CHART: {
          const chartId = node.ui.id;
          const subtitleHtml = node.subtitle
            ? `\n      <p class="text-sm text-base-content/50 -mt-2 mb-3">${node.subtitle}</p>`
            : '';
          parts.push(`    <div class="bg-base-100 rounded-xl border border-base-300/40 shadow-sm px-6 pt-5 pb-4" id="${chartId}">
      <h3 class="text-base font-semibold text-base-content mb-4">${node.title}</h3>${subtitleHtml}
      <div id="${chartId}_canvas" style="width:100%;height:350px;"></div>
    </div>`);
          hasChart = true;
          break;
        }

        case NodeType.BUTTON: {
          // Skip nodes absorbed into a chat component's built-in UI
          if (node._chatAbsorbed) break;
          const btnPreset = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
          const btnInHeader = btnPreset === 'app_header';
          const btnInCta = btnPreset === 'page_cta';
          const btnInForm = ['card_bordered', 'card', 'form'].includes(btnPreset);
          const btnInEmptyState = btnPreset === 'empty_state';
          const btnLabel = (node.ui.label || '').toLowerCase();
          const btnIsDestructive = /^(delete|remove|archive|deactivate)/.test(btnLabel);
          const btnIsDismiss = /^(cancel|close|dismiss|reset|clear|discard)/.test(btnLabel);
          let btnCls;
          if (btnInCta) {
            // CTA buttons: inverted colors for contrast on primary bg
            btnCls = 'btn btn-lg bg-base-100 text-primary hover:bg-base-200';
          } else if (btnInHeader) {
            // Header buttons are small; destructive/dismiss get ghost, CTAs stay primary
            if (btnIsDestructive) {
              btnCls = 'btn btn-ghost btn-sm text-error';
            } else if (btnIsDismiss) {
              btnCls = 'btn btn-ghost btn-sm';
            } else {
              btnCls = 'btn btn-primary btn-sm'; // New/Create/Add buttons in header keep primary treatment
            }
          } else if (btnInEmptyState) {
            btnCls = 'btn btn-sm btn-ghost';
          } else if (btnIsDestructive) {
            btnCls = 'btn btn-ghost text-error';
          } else if (btnIsDismiss) {
            btnCls = btnInForm ? 'btn btn-ghost w-full' : 'btn btn-ghost';
          } else {
            // Default: primary CTA
            btnCls = btnInForm ? 'btn btn-primary w-full' : 'btn btn-primary';
          }
          parts.push(`    <button class="${btnCls}" id="${node.ui.id}"${clAttr(node)}>${node.ui.label}</button>`);
          break;
        }

        case NodeType.FOR_EACH: {
          const inSidebar = sectionStack.includes('app_sidebar');
          if (inSidebar) {
            // Sidebar already wraps in <nav><ul class="menu">, just emit the list container
            parts.push(`    <ul class="menu menu-md gap-0.5 p-0 clear-list" id="list_${sanitizeName(node.variable)}"></ul>`);
          } else {
            const listId = `list_${sanitizeName(node.variable)}`;
            const emptyId = `empty_${sanitizeName(node.variable)}`;
            parts.push(`    <div class="clear-list" id="${listId}"></div>`);
            parts.push(`    <div id="${emptyId}" class="flex flex-col items-center justify-center py-16 text-base-content/30">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      <p class="text-sm font-medium">No items yet</p>
    </div>`);
          }
          break;
        }

        case NodeType.CONTENT: {
          const ui = node.ui;
          const formatted = formatInlineText(ui.text);
          // Context-aware rendering: check parent section preset
          const parentPreset = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
          const inSidebar = sectionStack.includes('app_sidebar');
          const inHeader = parentPreset === 'app_header';
          const inMetricCard = parentPreset === 'metric_card';
          const inCard = ['card', 'card_bordered', 'app_card'].includes(parentPreset);
          const inForm = parentPreset === 'form';
          const inModal = parentPreset === 'app_modal';
          const inEmptyState = parentPreset === 'empty_state';
          const inList = parentPreset === 'app_list';
          const inHero = ['page_hero', 'hero', 'hero_left', 'page_cta'].includes(parentPreset);
          const inHeroLeft = parentPreset === 'hero_left';
          const inCta = parentPreset === 'page_cta';
          const inDarkSection = ['page_section_dark', 'section_dark', 'feature_grid_dark',
            'feature_split_dark', 'feature_spotlight_dark', 'pricing_grid_dark',
            'testimonial_grid_dark', 'logo_bar_dark'].includes(parentPreset);
          const inPageSection = ['page_section', 'page_section_dark', 'section_light', 'section_dark',
            'feature_grid', 'feature_grid_dark', 'feature_split', 'feature_split_dark',
            'feature_spotlight', 'feature_spotlight_dark',
            'pricing_grid', 'pricing_grid_dark', 'stats_row',
            'testimonial_grid', 'testimonial_grid_dark', 'logo_bar', 'logo_bar_dark',
            'faq_section', 'page_footer'].includes(parentPreset);
          const inLandingCard = [
            'feature_card', 'feature_card_dark', 'feature_card_large', 'testimonial_card',
            'feature_card_teal', 'feature_card_purple', 'feature_card_indigo',
            'feature_card_emerald', 'feature_card_rose', 'feature_card_amber',
          ].includes(parentPreset);
          const inLargeCard = parentPreset === 'feature_card_large';
          const inTestimonialCard = parentPreset === 'testimonial_card';
          const inPricingCard = parentPreset === 'pricing_card';
          const inFeaturedPricing = parentPreset === 'pricing_card_featured';
          const inStatItem = parentPreset === 'stat_item';
          const inLogoItem = parentPreset === 'logo_item';
          const inLogoBar = parentPreset === 'logo_bar' || parentPreset === 'logo_bar_dark';
          const COLORED_CARD_PRESETS = [
            'feature_card_dark', 'feature_card_teal', 'feature_card_purple',
            'feature_card_indigo', 'feature_card_emerald', 'feature_card_rose', 'feature_card_amber',
          ];
          const inDarkCard = COLORED_CARD_PRESETS.includes(parentPreset);
          const _clContent = clAttr(node);
          // Inject data-clear-line into the first tag of whatever content is pushed
          const _pushContent = (html) => { parts.push(_clContent ? html.replace(/>/, _clContent + '>') : html); };
          const _pc = _pushContent; // short alias
          switch (ui.contentType) {
            case 'heading':
              if (inLogoBar) {
                // Logo bar label — small muted, not a big section heading
                _pc(`    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/40 text-center mb-6">${formatted}</p>`);
              } else if (inCta) {
                // CTA headline — smaller than hero, white text on primary bg
                _pc(`    <h2 class="font-display text-3xl lg:text-4xl font-bold tracking-tight text-primary-content max-w-3xl text-center mx-auto">${formatted}</h2>`);
              } else if (inHero) {
                // Hero headline — left or centered; hero_left gets larger font to fill viewport
                const heroAlign = inHeroLeft ? 'text-left' : 'text-center mx-auto';
                const heroSize = inHeroLeft ? 'text-5xl lg:text-6xl' : 'text-5xl md:text-6xl';
                _pc(`    <h1 class="font-display ${heroSize} font-bold tracking-tight leading-[1.05] text-base-content max-w-3xl ${heroAlign}">${formatted}</h1>`);
              } else if (inHeader) {
                _pc(`    <h1 class="font-display text-base font-semibold text-base-content">${formatted}</h1>`);
              } else if (inMetricCard) {
                _pc(`    <p class="font-display text-3xl font-bold text-base-content tracking-tight">${formatted}</p>`);
              } else if (inSidebar) {
                _pc(`    <div class="h-16 px-6 border-b border-base-300/50 shrink-0 flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-content font-bold text-sm">${formatted.charAt(0)}</div><span class="text-base font-bold text-base-content tracking-tight">${formatted}</span></div>`);
              } else if (inStatItem) {
                _pc(`    <p class="font-display text-4xl lg:text-5xl font-bold text-primary tracking-tight leading-none">${formatted}</p>`);
              } else if (inFeaturedPricing) {
                _pc(`    <h3 class="text-xl font-bold text-primary-content">${formatted}</h3>`);
              } else if (inPricingCard) {
                _pc(`    <h3 class="text-xl font-bold text-base-content">${formatted}</h3>`);
              } else if (inTestimonialCard) {
                _pc(`    <h3 class="text-sm font-semibold text-base-content leading-snug">${formatted}</h3>`);
              } else if (inLandingCard) {
                const tc = inDarkCard ? 'text-white' : inLargeCard ? 'text-primary-content' : 'text-base-content';
                _pc(`    <h3 class="text-lg font-bold ${tc} leading-snug">${formatted}</h3>`);
              } else if (inForm) {
                _pc(`    <h2 class="text-xl font-bold text-base-content mb-2">${formatted}</h2>`);
              } else if (inModal) {
                _pc(`    <h2 class="text-lg font-bold text-base-content">${formatted}</h2>`);
              } else if (inEmptyState) {
                _pc(`    <h3 class="text-lg font-semibold text-base-content/70">${formatted}</h3>`);
              } else if (inCard) {
                _pc(`    <h2 class="text-lg font-semibold text-base-content">${formatted}</h2>`);
              } else if (inPageSection) {
                const textColor = inDarkSection ? 'text-neutral-content' : 'text-base-content';
                _pc(`    <h2 class="font-display text-3xl lg:text-4xl font-bold ${textColor} tracking-tight mb-4">${formatted}</h2>`);
              } else {
                _pc(`    <h1 class="text-3xl font-bold text-base-content tracking-tight leading-snug mb-4">${formatted}</h1>`);
              }
              break;
            case 'subheading':
              if (inCta) {
                _pc(`    <p class="text-lg text-primary-content/90 max-w-2xl text-center mx-auto leading-relaxed">${formatted}</p>`);
              } else if (inHero) {
                const heroSubAlign = inHeroLeft ? 'text-left' : 'text-center mx-auto';
                const heroSubMaxW = inHeroLeft ? 'max-w-xl' : 'max-w-2xl';
                _pc(`    <p class="text-lg lg:text-xl text-base-content/70 leading-relaxed ${heroSubMaxW} ${heroSubAlign}">${formatted}</p>`);
              } else if (inPricingCard) {
                _pc(`    <p class="font-display text-4xl font-bold tracking-tight text-primary">${formatted}</p>`);
              } else if (inFeaturedPricing) {
                _pc(`    <p class="font-display text-4xl font-bold tracking-tight text-primary-content">${formatted}</p>`);
              } else if (inTestimonialCard) {
                _pc(`    <p class="text-sm text-base-content/60 leading-relaxed">${formatted}</p>`);
              } else if (inLandingCard) {
                const tc = inDarkCard ? 'text-white/70' : inLargeCard ? 'text-primary-content/70' : 'text-base-content/60';
                _pc(`    <p class="text-sm ${tc} leading-relaxed">${formatted}</p>`);
              } else if (inDarkSection) {
                _pc(`    <p class="text-lg text-neutral-content/60 leading-relaxed max-w-2xl mx-auto mb-3">${formatted}</p>`);
              } else {
                _pc(`    <p class="text-lg text-base-content/60 leading-relaxed max-w-2xl mx-auto mb-3">${formatted}</p>`);
              }
              break;
            case 'label':
              _pc(`    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/40 block mb-1">${formatted}</span>`);
              break;
            case 'badge': {
              const variant = ui.badgeVariant || 'neutral';
              const badgeColorMap = {
                success: 'badge-success', error: 'badge-error', warning: 'badge-warning',
                info: 'badge-info', neutral: 'badge-neutral', primary: 'badge-primary',
                secondary: 'badge-secondary', accent: 'badge-accent', ghost: 'badge-ghost',
              };
              const badgeCls = badgeColorMap[variant] || 'badge-neutral';
              _pc(`    <span class="badge ${badgeCls} badge-sm font-medium">${formatted}</span>`);
              break;
            }
            case 'text':
              if (inSidebar) {
                _pc(`    <li><a class="clear-nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-base-content/60 hover:bg-base-content/8 hover:text-base-content transition-colors cursor-pointer" data-nav-item="true">${formatted}</a></li>`);
              } else if (inMetricCard) {
                // Detect trend text: starts with +/- followed by number (e.g. "+3 this week", "-2% vs last month")
                const trendMatch = formatted.match(/^([+\-−][\d.,]+%?\s*)/);
                if (trendMatch) {
                  const isPositive = formatted.startsWith('+');
                  const trendColor = isPositive ? 'text-success' : 'text-error';
                  const arrowSvg = isPositive
                    ? '<svg class="inline w-3.5 h-3.5" fill="none" viewBox="0 0 14 14"><path d="M7 1.167v11.666M7 1.167L11.667 5.833M7 1.167L2.333 5.833" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    : '<svg class="inline w-3.5 h-3.5" fill="none" viewBox="0 0 14 14"><path d="M7 12.833V1.167M7 12.833L2.333 8.167M7 12.833l4.667-4.666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                  const trendPart = trendMatch[1].trim();
                  const restPart = formatted.slice(trendMatch[1].length);
                  _pc(`    <p class="text-sm font-medium text-base-content/50 flex items-center gap-1"><span class="${trendColor} font-semibold inline-flex items-center gap-0.5">${arrowSvg}${trendPart}</span>${restPart}</p>`);
                } else {
                  _pc(`    <p class="text-sm font-medium text-base-content/50">${formatted}</p>`);
                }
              } else if (inCta) {
                _pc(`    <p class="text-lg text-primary-content/90 max-w-2xl text-center mx-auto leading-relaxed">${formatted}</p>`);
              } else if (inHero) {
                _pc(`    <p class="text-lg lg:text-xl text-base-content/70 leading-relaxed max-w-2xl ${inHeroLeft ? 'text-left' : 'text-center mx-auto'}">${formatted}</p>`);
              } else if (inStatItem) {
                _pc(`    <p class="text-sm font-medium text-base-content/50 uppercase tracking-wider">${formatted}</p>`);
              } else if (inLogoItem) {
                _pc(`    <span class="text-sm font-semibold text-base-content/30 tracking-widest uppercase">${formatted}</span>`);
              } else if (inFeaturedPricing) {
                _pc(`    <p class="flex items-start gap-2 text-sm text-primary-content/80"><span class="text-primary-content font-bold shrink-0">✓</span>${formatted}</p>`);
              } else if (inPricingCard) {
                // MUST be before inLandingCard — pricing_card is not in inLandingCard but guard anyway
                _pc(`    <p class="flex items-start gap-2 text-sm text-base-content/70"><span class="text-primary font-bold shrink-0">✓</span>${formatted}</p>`);
              } else if (inLandingCard) {
                const tc = inDarkCard ? 'text-white/80' : inLargeCard ? 'text-primary-content/80' : 'text-base-content/60';
                _pc(`    <p class="text-sm ${tc} leading-relaxed">${formatted}</p>`);
              } else if (inDarkSection) {
                _pc(`    <p class="text-lg text-neutral-content/60 leading-relaxed max-w-2xl mx-auto mb-3">${formatted}</p>`);
              } else if (inPageSection) {
                _pc(`    <p class="text-lg text-base-content/60 leading-relaxed max-w-2xl mx-auto mb-3">${formatted}</p>`);
              } else if (inForm || inModal) {
                _pc(`    <p class="text-sm text-base-content/60 mb-4">${formatted}</p>`);
              } else if (inEmptyState) {
                _pc(`    <p class="text-sm text-base-content/40 max-w-sm">${formatted}</p>`);
              } else if (inCard) {
                _pc(`    <p class="text-sm text-base-content/80 leading-relaxed">${formatted}</p>`);
              } else {
                _pc(`    <p class="text-sm font-medium text-base-content/90 leading-snug">${formatted}</p>`);
              }
              break;
            case 'bold':
              _pc(`    <p class="text-sm text-base-content/70 leading-relaxed mb-3"><strong class="text-base-content font-semibold">${formatted}</strong></p>`);
              break;
            case 'italic':
              _pc(`    <p class="text-sm text-base-content/70 leading-relaxed mb-3"><em>${formatted}</em></p>`);
              break;
            case 'small':
              if (inMetricCard) {
                _pc(`    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50">${formatted}</span>`);
              } else if (inHeader) {
                _pc(`    <span class="badge badge-ghost badge-sm font-mono">${formatted}</span>`);
              } else if (inHero) {
                _pc(`    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase border border-primary/30 text-primary" style="background:oklch(from var(--color-primary) l c h / 0.08)">${formatted}</span>`);
              } else if (inTestimonialCard) {
                // testimonial_card: role + company attribution — muted meta text
                _pc(`    <span class="text-sm text-base-content/60 leading-snug">${formatted}</span>`);
              } else if (inLandingCard) {
                _pc(`    <span class="text-xs text-base-content/40 leading-snug">${formatted}</span>`);
              } else if (inLogoItem) {
                _pc(`    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/20">${formatted}</span>`);
              } else {
                _pc(`    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50 block mb-2">${formatted}</span>`);
              }
              break;
            case 'link':
              if (inCta) {
                // CTA link — inverted colors for contrast against primary bg
                _pc(`    <a class="btn btn-lg bg-base-100 text-primary hover:bg-base-200" href="${ui.href || '#'}">${formatted}</a>`);
              } else if (inHero) {
                // Lone hero link (not in a group) — primary by default
                _pc(`    <a class="btn btn-primary btn-lg" href="${ui.href || '#'}">${formatted}</a>`);
              } else if (inFeaturedPricing) {
                _pc(`    <a class="btn btn-sm bg-white text-primary font-semibold mt-auto" href="${ui.href || '#'}">${formatted}</a>`);
              } else if (inPricingCard) {
                _pc(`    <a class="btn btn-outline btn-primary btn-sm mt-auto" href="${ui.href || '#'}">${formatted}</a>`);
              } else if (inLandingCard) {
                _pc(`    <a class="link link-primary text-sm font-medium" href="${ui.href || '#'}">${formatted}</a>`);
              } else {
                const linkHref = ui.href ? (ui.href.startsWith('/') ? '#' + ui.href : ui.href) : '#';
                _pc(`    <a class="link link-primary text-sm" href="${linkHref}">${formatted}</a>`);
              }
              break;
            case 'code': {
              // In dark sections, use a terminal-style dark code block; in light sections, a light one
              if (inDarkSection) {
                _pc(`    <div class="rounded-xl border border-neutral-content/10 overflow-hidden mb-4" style="background:oklch(12% 0.015 240)"><div class="flex items-center gap-1.5 px-4 py-3 border-b border-neutral-content/10"><span class="w-3 h-3 rounded-full bg-red-500/70"></span><span class="w-3 h-3 rounded-full bg-amber-400/70"></span><span class="w-3 h-3 rounded-full bg-emerald-500/70"></span></div><pre class="font-mono text-sm text-neutral-content/80 p-5 leading-relaxed overflow-x-auto"><code>${ui.text.replace(/\\n/g, '\n')}</code></pre></div>`);
              } else {
                _pc(`    <div class="rounded-xl border border-base-300/60 overflow-hidden mb-4" style="background:oklch(97% 0.005 240)"><div class="flex items-center gap-1.5 px-4 py-3 border-b border-base-300/60 bg-base-200"><span class="w-3 h-3 rounded-full bg-red-400/60"></span><span class="w-3 h-3 rounded-full bg-amber-400/60"></span><span class="w-3 h-3 rounded-full bg-emerald-400/60"></span></div><pre class="font-mono text-sm text-base-content/80 p-5 leading-relaxed overflow-x-auto"><code>${ui.text.replace(/\\n/g, '\n')}</code></pre></div>`);
              }
              break;
            }
            case 'divider':
              _pc(`    <div class="divider my-4"></div>`);
              break;
            case 'image': {
              const src = node.text || '';
              const roundedClass = node.rounded ? ' rounded-full object-cover' : ' rounded-lg';
              const widthStyle = node.width ? ` width="${node.width}"` : '';
              const heightStyle = node.height ? ` height="${node.height}"` : '';
              const sizeClass = (node.width || node.height) ? '' : ' w-full';
              _pc(`    <img src="${src}" alt=""${widthStyle}${heightStyle} class="${sizeClass}${roundedClass}" loading="lazy" />`);
              break;
            }
            case 'video': {
              const src = node.text || '';
              _pc(`    <video src="${src}" controls class="w-full rounded-lg"></video>`);
              break;
            }
            case 'audio': {
              const src = node.text || '';
              _pc(`    <audio src="${src}" controls class="w-full"></audio>`);
              break;
            }
          }
          break;
        }

        case NodeType.SHOW: {
          // Component call: show Card(name) -> container div for reactive rendering
          // Only uppercase function names are components (lowercase are regular functions)
          if (node.expression && node.expression.type === NodeType.CALL && node.expression.name && /^[A-Z]/.test(node.expression.name)) {
            const containerId = `comp_${compRenderCounter++}`;
            parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
          } else if (node.expression) {
            // Dynamic expression: show total, text 'Price: ' + price → placeholder <p> for JS to fill
            const showId = `show_${showCounter++}`;
            node._showId = showId;
            parts.push(`    <p id="${showId}" class="text-sm font-medium text-base-content/90 leading-snug"></p>`);
          }
          break;
        }

        case NodeType.COMPONENT_USE: {
          // Block-form component: show Panel: ... -> container div for reactive rendering
          const containerId = `comp_${compRenderCounter++}`;
          parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
          break;
        }

        case NodeType.IF_THEN: {
          // Conditional DOM: wrap content in a div that JS will show/hide
          if (node.isBlock && Array.isArray(node.thenBranch)) {
            const condId = `cond_${condCounter++}`;
            parts.push(`    <div id="${condId}" class="clear-conditional" style="display:none">`);
            walk(node.thenBranch);
            parts.push(`    </div>`);
            if (node.otherwiseBranch && Array.isArray(node.otherwiseBranch)) {
              const elseId = `cond_${condCounter++}`;
              parts.push(`    <div id="${elseId}" class="clear-conditional" style="display:none">`);
              walk(node.otherwiseBranch);
              parts.push(`    </div>`);
            }
          }
          break;
        }

        default:
          break;
      }
    }
  }

  let condCounter = 0;
  let compRenderCounter = 0;
  let showCounter = 0;
  walk(body);

  // Wrap multi-page content in routable divs (process in reverse to keep indices valid)
  if (pages.length > 1) {
    for (let i = pages.length - 1; i >= 0; i--) {
      const p = pages[i];
      const pageId = sanitizeName(p.title);
      const hidden = i > 0 ? ' style="display:none"' : '';
      parts.splice(p.endIdx, 0, `</div>`);
      parts.splice(p.startIdx, 0, `<div id="page_${pageId}"${hidden}>`);
    }
  }

  return { pageTitle, htmlBody: parts.join('\n'), pages, inlineStyleBlocks, hasChart, hasMap, hasQR, hasRichText };
}

/**
 * Convert inline formatting markers to HTML:
 * *bold* -> <strong>bold</strong>
 * _italic_ -> <em>italic</em>
 */
function formatInlineText(text) {
  if (!text) return '';
  return text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

/**
 * Compile a Clear AST + compiled JS into a complete, runnable index.html.
 */
function compileToHTML(body, compiledJS) {
  const { pageTitle, htmlBody, pages, inlineStyleBlocks, hasChart, hasMap, hasQR, hasRichText } = buildHTML(body);
  // Live App Editing: whenever the app has login, emit the Meph edit widget
  // script. The widget self-gates on role === 'owner' in the JWT, so
  // including it for every auth-enabled app is safe — non-owners never see
  // anything mount.
  const hasAuthForWidget = body.some(n => n.type === NodeType.AUTH_SCAFFOLD);
  const styles = extractStyles(body);
  // Collect top-level variables for style resolution (e.g. primary_color is '#2563eb')
  const styleVars = {};
  function collectVars(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.ASSIGN && n.expression) {
        if (n.expression.type === NodeType.LITERAL_STRING) styleVars[n.name] = n.expression.value;
        else if (n.expression.type === NodeType.LITERAL_NUMBER) styleVars[n.name] = n.expression.value;
      }
      if (n.type === NodeType.PAGE) collectVars(n.body);
    }
  }
  collectVars(body);
  let userCSS = styles.length > 0 ? '\n\n/* --- User Styles --- */\n' + stylesToCSS(styles, styleVars) : '';
  // Add inline modifier CSS (generated from section declarations)
  if (inlineStyleBlocks.length > 0) {
    userCSS += '\n\n/* --- Inline Layout --- */\n' + inlineStyleBlocks.join('\n');
  }

  // Multi-page routing: wrap each page's elements in a route div
  const hasRouting = pages.length > 1;
  let routerJS = '';
  if (hasRouting) {
    const routeMap = pages.map(p => `  '${p.route}': '${sanitizeName(p.title)}'`).join(',\n');
    routerJS = `
// --- Router ---
// Reads both location.pathname (server-side navigation, direct URLs, route
// selector) and location.hash (in-iframe clicks). Pathname wins when set,
// hash is the fallback so hash-style links keep working. Also intercepts
// <a href> clicks to same-origin routes so we don't hit the server on each
// click (SPA feel while still supporting refresh/direct-URL).
const _routes = {
${routeMap}
};
function _currentRoute() {
  const p = (location.pathname || '/').replace(/\\/$/, '') || '/';
  if (_routes.hasOwnProperty(p)) return p;
  const h = (location.hash || '').slice(1);
  if (h && _routes.hasOwnProperty(h)) return h;
  return Object.keys(_routes)[0]; // first declared route (usually '/')
}
function _router() {
  const current = _currentRoute();
  for (const [route, pageId] of Object.entries(_routes)) {
    const el = document.getElementById('page_' + pageId);
    if (el) el.style.display = (route === current) ? 'block' : 'none';
  }
  document.title = (_routes[current] || '').replace(/_/g, ' ') || document.title;
}
window.addEventListener('popstate', _router);
window.addEventListener('hashchange', _router);
document.addEventListener('click', function(e) {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) return;
  if (_routes.hasOwnProperty(href)) {
    e.preventDefault();
    history.pushState({}, '', href);
    _router();
  }
});
_router();`;
  }

  // Extract theme directive (default: ivory)
  const themeNode = body.find(n => n.type === NodeType.THEME);
  const themeName = themeNode ? themeNode.name : 'ivory';

  // Detect layout mode: page_* presets = landing page, app_* presets = app
  const usesAppPresets = body.some(n => {
    if (n.type === NodeType.SECTION && n.styleName && n.styleName.startsWith('app_')) return true;
    if (n.type === NodeType.PAGE && n.body) return n.body.some(c => c.type === NodeType.SECTION && c.styleName && c.styleName.startsWith('app_'));
    return false;
  });
  const usesPagePresets = htmlBody.includes('style-page_');
  const hasStyledSections = usesAppPresets || usesPagePresets || (userCSS.length > 0 && htmlBody.includes('clear-section style-'));

  // Tree-shake CSS based on what's actually in the HTML
  const css = _buildCSS(htmlBody, userCSS, { fullWidth: hasStyledSections, theme: themeName });

  // Detect if page uses full-width layout (app presets, grids, flex row, or side-by-side)
  const hasFullLayout = usesAppPresets || htmlBody.includes('style-app_layout') ||
    css.includes('full_height') || css.includes('column_layout') || css.includes('grid') ||
    css.includes('flex-direction: row') || css.includes('side_by_side');
  const usesLandingPresets = htmlBody.includes('py-24') || htmlBody.includes('py-20');
  const appClass = usesAppPresets ? '' : usesLandingPresets ? '' : hasFullLayout ? 'h-screen' : hasStyledSections ? '' : 'max-w-2xl mx-auto p-8 flex flex-col gap-6';

  // Use module script if compiled code uses dynamic import (await import)
  const scriptType = compiledJS.includes('await import(') ? ' type="module"' : '';

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${themeName}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5/daisyui.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
${hasChart ? '  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>' : ''}
${hasMap ? '  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css" />\n  <script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"><\/script>' : ''}
${hasQR ? '  <script src="https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js"><\/script>' : ''}
${hasRichText ? '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" />\n  <script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.min.js"><\/script>\n  <style>.rich-text-editor{min-height:180px;border:none!important}.ql-toolbar{border:none!important;border-bottom:1px solid var(--color-base-300)!important;border-radius:0.375rem 0.375rem 0 0}.ql-container{border:none!important;font-family:inherit;font-size:15px}.rich-text-wrap .ql-editor{min-height:150px}</style>' : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Geist+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body class="min-h-screen bg-base-100">
  <main id="app" class="${appClass}">
${htmlBody}
  </main>

  <!-- ${generateDiagram(body, '').trim() || 'Clear App'} -->
  <script${scriptType}>
${(() => { const utils = _getUsedUtilities(compiledJS + routerJS); return utils.length > 0 ? '// --- Runtime ---\n' + utils.join('\n') + '\n' : ''; })()}${compiledJS}
${routerJS}
${hasRichText ? `
// --- Rich text editors (Quill) ---
// Auto-wire every [data-clear-rich-text] element: mount a Quill instance and
// keep _state[variable] in sync with the editor's HTML. Read-only display is
// handled by existing _recompute setTextContent paths (which set innerHTML
// for rich-text-bound fields).
(function _initRichTextEditors() {
  if (typeof Quill === 'undefined') return;
  document.querySelectorAll('[data-clear-rich-text]').forEach(function(el) {
    if (el.__quill) return;
    var varName = (el.id || '').replace(/^input_/, '');
    var q = new Quill(el, {
      theme: 'snow',
      placeholder: el.dataset.placeholder || '',
      modules: { toolbar: [
        [{header: [1, 2, 3, false]}],
        ['bold', 'italic', 'underline', 'strike'],
        [{list: 'ordered'}, {list: 'bullet'}],
        ['link', 'blockquote', 'code-block'],
        ['clean']
      ]}
    });
    el.__quill = q;
    q.on('text-change', function() {
      if (typeof _state !== 'undefined') {
        _state[varName] = q.root.innerHTML === '<p><br></p>' ? '' : q.root.innerHTML;
      }
    });
    // Initial sync from _state if already has value
    if (typeof _state !== 'undefined' && _state[varName]) {
      q.root.innerHTML = _state[varName];
    }
  });
})();
` : ''}
  <\/script>
${htmlBody.includes('data-nav-item') ? `  <script>
  document.querySelectorAll('[data-nav-item]').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('[data-nav-item]').forEach(function(e) { e.classList.remove('active'); });
      el.classList.add('active');
    });
  });
  <\/script>` : ''}
${hasAuthForWidget ? `  <!-- Live App Editing: Meph edit widget. Self-gates on role === 'owner'. -->
  <script src="/__meph__/widget.js" defer><\/script>` : ''}
  <!-- ============================================================== -->
  <!-- CLEAR STUDIO BRIDGE — postMessage co-presence with Meph        -->
  <!-- Active only when loaded inside Studio iframe with ?clear-bridge=1 -->
  <!-- ============================================================== -->
  <script>
  (function() {
    if (window === window.parent) return;
    // Activate when EITHER ?clear-bridge=1 is in URL OR <meta name="clear-bridge" content="1"> is present.
    // The query param works for src= iframes (full-stack apps); the meta tag works for srcdoc iframes (web-only apps).
    var __hasQuery = location.search.indexOf('clear-bridge=1') !== -1;
    var __hasMeta = !!document.querySelector('meta[name="clear-bridge"]');
    if (!__hasQuery && !__hasMeta) return;
    var __clearOrigin = '*'; // Studio loads from localhost:3456, app from localhost:4xxx
    function __selectorFor(el) {
      if (!el || el === document) return null;
      if (el.id) return '#' + el.id;
      var tag = el.tagName.toLowerCase();
      var cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      var txt = (el.textContent || '').trim().slice(0, 30);
      if (tag === 'button' && txt) return tag + ':has-text("' + txt + '")';
      return tag + cls;
    }
    function __post(msg) {
      try { window.parent.postMessage(Object.assign({ source: 'clear-bridge' }, msg), __clearOrigin); } catch(e) {}
    }
    // Capture user actions and forward to Studio
    document.addEventListener('click', function(e) {
      __post({ type: 'user-action', action: 'click', selector: __selectorFor(e.target), text: (e.target.textContent || '').trim().slice(0, 60), ts: Date.now() });
    }, true);
    document.addEventListener('input', function(e) {
      var t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {
        __post({ type: 'user-action', action: 'input', selector: __selectorFor(t), value: String(t.value || '').slice(0, 200), ts: Date.now() });
      }
    }, true);
    document.addEventListener('submit', function(e) {
      __post({ type: 'user-action', action: 'submit', selector: __selectorFor(e.target), ts: Date.now() });
    }, true);
    // Listen for commands from Meph
    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (!msg || msg.target !== 'clear-bridge') return;
      var reply = { source: 'clear-bridge', replyTo: msg.id };
      try {
        if (msg.cmd === 'click') {
          var el = document.querySelector(msg.selector);
          if (!el) { reply.error = 'Element not found: ' + msg.selector; }
          else { el.click(); reply.ok = true; reply.html = document.body.innerHTML.slice(0, 4000); }
        } else if (msg.cmd === 'fill') {
          var input = document.querySelector(msg.selector);
          if (!input) { reply.error = 'Element not found: ' + msg.selector; }
          else {
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
            if (nativeSetter) nativeSetter.set.call(input, msg.value);
            else input.value = msg.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            reply.ok = true; reply.value = input.value;
          }
        } else if (msg.cmd === 'inspect') {
          var target = document.querySelector(msg.selector);
          if (!target) { reply.error = 'Element not found: ' + msg.selector; }
          else {
            var cs = window.getComputedStyle(target);
            var rect = target.getBoundingClientRect();
            reply.ok = true;
            reply.tag = target.tagName.toLowerCase();
            reply.text = (target.textContent || '').slice(0, 200);
            reply.styles = { color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight, padding: cs.padding, border: cs.border };
            reply.box = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
          }
        } else if (msg.cmd === 'read-dom') {
          reply.ok = true;
          reply.html = document.body.innerHTML.slice(0, 8000);
          reply.state = window._state ? JSON.parse(JSON.stringify(window._state)) : null;
          reply.url = location.href;
        } else if (msg.cmd === 'read-storage') {
          var ls = {}, ss = {};
          for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
          for (var j = 0; j < sessionStorage.length; j++) { var k2 = sessionStorage.key(j); ss[k2] = sessionStorage.getItem(k2); }
          reply.ok = true; reply.localStorage = ls; reply.sessionStorage = ss;
        }
      } catch (err) {
        reply.error = err.message;
      }
      __post(reply);
    });
    __post({ type: 'bridge-ready', url: location.href });
  })();
  <\/script>
</body>
</html>`;
  return { html, css };
}

// =============================================================================
// BACKEND SCAFFOLD (Phase 6C)
// =============================================================================

/**
 * Generate an ASCII architecture diagram from the AST.
 * Embedded in compiled output so AI agents understand the app structure at a glance.
 */
function generateDiagram(body, commentPrefix = '//', streamingAgentNames = new Set()) {
  const tables = [];
  const endpoints = [];
  const pages = [];
  const agents = [];

  // Build set of streaming agent function names for endpoint tagging
  const streamingFnNames = new Set();
  for (const agentName of streamingAgentNames) {
    streamingFnNames.add(agentName);
  }

  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) {
      const fields = (node.fields || []).map(f => {
        let desc = f.name;
        if (f.required) desc += '*';
        if (f.unique) desc += '!';
        return desc;
      });
      tables.push({ name: node.name, fields, line: node.line, file: node._sourceFile });
    }
    if (node.type === NodeType.ENDPOINT) {
      const auth = node.body && node.body.some(b => b.type === NodeType.REQUIRES_AUTH);
      // Detect if endpoint calls a streaming agent
      let streaming = false;
      if (streamingAgentNames.size > 0) {
        (function findStreamingCall(nodes) {
          if (!Array.isArray(nodes)) return;
          for (const n of nodes) {
            if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT && streamingAgentNames.has(n.expression.agentName)) {
              streaming = true;
            }
            if (Array.isArray(n.body)) findStreamingCall(n.body);
            if (Array.isArray(n.thenBranch)) findStreamingCall(n.thenBranch);
            if (Array.isArray(n.otherwiseBranch)) findStreamingCall(n.otherwiseBranch);
          }
        })(node.body || []);
      }
      endpoints.push({ method: node.method.toUpperCase(), path: node.path, auth, streaming, line: node.line, file: node._sourceFile });
    }
    if (node.type === NodeType.PAGE) {
      pages.push({ title: node.title, route: node.route || '/', line: node.line, file: node._sourceFile });
    }
    if (node.type === NodeType.AGENT) {
      agents.push({
        name: node.name, line: node.line,
        tools: node.tools, skills: node.skills, restrictions: node.restrictions,
        trackDecisions: node.trackDecisions, rememberConversation: node.rememberConversation,
        rememberPreferences: node.rememberPreferences, knowsAbout: node.knowsAbout,
        streamResponse: node.streamResponse, schedule: node.schedule,
      });
    }
  }

  if (tables.length === 0 && endpoints.length === 0 && pages.length === 0) return '';

  const p = commentPrefix;
  const lines = [];
  lines.push(`${p} ┌─────────────────────────────────────────────┐`);
  lines.push(`${p} │         CLEAR APP — Architecture            │`);
  lines.push(`${p} └─────────────────────────────────────────────┘`);

  if (tables.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} TABLES:`);
    for (const t of tables) {
      const src = t.file ? ` (${t.file}:${t.line})` : t.line ? ` (line ${t.line})` : '';
      lines.push(`${p}   ${t.name}: ${t.fields.join(', ')}${src}`);
    }
  }

  if (endpoints.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} ENDPOINTS:`);
    for (const e of endpoints) {
      const lock = e.auth ? ' [auth]' : '';
      const stream = e.streaming ? ' [streaming]' : '';
      const src = e.file ? ` (${e.file}:${e.line})` : e.line ? ` (line ${e.line})` : '';
      const displayPath = commentPrefix === '#' ? e.path.replace(/:(\w+)/g, '{$1}') : e.path;
      lines.push(`${p}   ${e.method} ${displayPath}${lock}${stream}${src}`);
    }
  }

  if (pages.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} PAGES:`);
    for (const pg of pages) {
      const src = pg.file ? ` (${pg.file}:${pg.line})` : pg.line ? ` (line ${pg.line})` : '';
      lines.push(`${p}   '${pg.title}' at ${pg.route}${src}`);
    }
  }

  if (agents.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} AGENTS:`);
    for (const a of agents) {
      const directives = [];
      if (a.tools?.length > 0) directives.push(`tools: ${a.tools.map(t => t.name || t.description).join(', ')}`);
      if (a.skills?.length > 0) directives.push(`skills: ${a.skills.join(', ')}`);
      if (a.restrictions?.length > 0) directives.push(`guardrails: ${a.restrictions.length}`);
      if (a.trackDecisions) directives.push('tracking');
      if (a.rememberConversation) directives.push('conversation');
      if (a.rememberPreferences) directives.push('memory');
      if (a.knowsAbout?.length > 0) directives.push(`RAG: ${a.knowsAbout.join(', ')}`);
      if (a.streamResponse === true || (a.streamResponse === null && !a.schedule)) directives.push('streaming');
      const dStr = directives.length > 0 ? ` [${directives.join(', ')}]` : '';
      lines.push(`${p}   '${a.name}'${dStr} (line ${a.line})`);
    }
  }

  // Agent flow diagram — visual ASCII art showing the actual flow
  const pipelines = body.filter(n => n.type === NodeType.PIPELINE);
  const epFlows = []; // { endpoint, parallel: [...], pipeline: string, directCalls: [...] }
  for (const ep of body.filter(n => n.type === NodeType.ENDPOINT)) {
    const flow = { endpoint: `${ep.method.toUpperCase()} ${ep.path}`, parallel: [], pipeline: null, directCalls: [] };
    const parBlocks = (ep.body || []).filter(b => b.type === NodeType.PARALLEL_AGENTS);
    for (const par of parBlocks) {
      flow.parallel = par.assignments.map(a => a.expression?.agentName || '?');
    }
    (function findCalls(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_PIPELINE) flow.pipeline = n.expression.pipelineName;
        if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_AGENT) flow.directCalls.push(n.expression.agentName);
        if (Array.isArray(n.body)) findCalls(n.body);
        if (Array.isArray(n.thenBranch)) findCalls(n.thenBranch);
        if (Array.isArray(n.otherwiseBranch)) findCalls(n.otherwiseBranch);
      }
    })(ep.body || []);
    if (flow.parallel.length > 0 || flow.pipeline || flow.directCalls.length > 0) epFlows.push(flow);
  }

  if (epFlows.length > 0 || pipelines.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} AGENT FLOW:`);
    lines.push(`${p}`);

    for (const flow of epFlows) {
      lines.push(`${p}   ${flow.endpoint}`);
      lines.push(`${p}     │`);

      // Parallel fork — draw side by side with join
      if (flow.parallel.length > 0) {
        const parLabels = flow.parallel.map(n => {
          const a = agents.find(ag => ag.name === n);
          const tags = [];
          if (a?.knowsAbout?.length) tags.push('RAG');
          if (a?.trackDecisions) tags.push('track');
          if (a?.skills?.length) tags.push('skills');
          return tags.length ? `${n} [${tags.join(',')}]` : n;
        });
        // Calculate column widths
        const colWidth = Math.max(...parLabels.map(l => l.length)) + 4;
        const totalWidth = colWidth * parLabels.length;
        // Fork line
        lines.push(`${p}     ├${'─'.repeat(totalWidth / 2)}┬${'─'.repeat(totalWidth / 2)}┐`);
        // Agent names
        let nameRow = `${p}     `;
        for (let i = 0; i < parLabels.length; i++) {
          const label = parLabels[i];
          const pad2 = ' '.repeat(Math.max(0, colWidth - label.length));
          nameRow += (i === 0 ? 'v  ' : 'v  ') + label + pad2;
        }
        lines.push(nameRow.trimEnd());
        // Join line
        lines.push(`${p}     └${'─'.repeat(totalWidth / 2)}┴${'─'.repeat(totalWidth / 2)}┘`);
        lines.push(`${p}     │`);
      }

      // Pipeline
      if (flow.pipeline) {
        const pip = pipelines.find(pl => pl.name === flow.pipeline);
        if (pip) {
          const stepNames = pip.steps.map(s => s.agentName);
          const chain = stepNames.join(' ──> ');
          lines.push(`${p}     v`);
          lines.push(`${p}   ┌─ Pipeline '${flow.pipeline}' ${'─'.repeat(Math.max(1, 40 - flow.pipeline.length))}┐`);
          lines.push(`${p}   │  ${chain}${' '.repeat(Math.max(1, 42 - chain.length))}│`);
          lines.push(`${p}   └${'─'.repeat(46)}┘`);
          lines.push(`${p}     │`);
        }
      }

      // Direct agent calls
      if (flow.directCalls.length > 0 && !flow.pipeline) {
        for (const call of flow.directCalls) {
          lines.push(`${p}     v`);
          lines.push(`${p}   ${call}`);
          lines.push(`${p}     │`);
        }
      }

      lines.push(`${p}     v`);
      lines.push(`${p}   Response`);
      lines.push(`${p}`);
    }
  }

  // Data flow
  if (endpoints.length > 0 && pages.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} DATAFLOW: Frontend ──> API ──> Database`);
  } else if (endpoints.length > 0) {
    lines.push(`${p}`);
    lines.push(`${p} DATAFLOW: Client ──> API ──> Database`);
  }

  lines.push(`${p}`);
  return lines.join('\n') + '\n';
}

/**
 * Pre-scan AST to identify user-defined functions that will compile as async.
 * A function is async if its body (recursively) contains CRUD operations,
 * ASK_AI calls, external fetches, agent/pipeline calls, or HTTP requests.
 * Also handles transitive async: if function A calls async function B, A is async too.
 */
// Collect all user-defined function names so CALL resolution can prefer them
// over built-in aliases (e.g. user defines `sum(a,b)` → `sum` should NOT map to `_clear_sum`)
function _findUserFunctions(body) {
  const names = new Set();
  for (const n of (body || [])) {
    if (n.type === NodeType.FUNCTION_DEF && n.name) names.add(n.name);
  }
  return names;
}

function _findAsyncFunctions(body) {
  const ASYNC_NODE_TYPES = new Set([
    NodeType.CRUD, NodeType.ASK_AI, NodeType.EXTERNAL_FETCH,
    NodeType.HTTP_REQUEST, NodeType.RUN_AGENT, NodeType.RUN_PIPELINE,
    NodeType.TRANSACTION
  ]);

  // Recursively check if a list of nodes contains any async-producing patterns
  function hasAsyncNodes(nodes) {
    for (const n of nodes) {
      if (ASYNC_NODE_TYPES.has(n.type)) return true;
      // ASSIGN whose expression is async
      if (n.type === NodeType.ASSIGN && n.expression) {
        if (ASYNC_NODE_TYPES.has(n.expression.type)) return true;
      }
      // Recurse into block-containing nodes
      if (n.body && hasAsyncNodes(n.body)) return true;
      if (n.thenBranch && hasAsyncNodes(n.thenBranch)) return true;
      if (n.otherwiseBranch && hasAsyncNodes(n.otherwiseBranch)) return true;
      if (n.cases) {
        for (const c of n.cases) {
          if (c.body && hasAsyncNodes(c.body)) return true;
        }
      }
      if (n.defaultBody && hasAsyncNodes(n.defaultBody)) return true;
    }
    return false;
  }

  // First pass: find functions with directly async bodies
  const asyncFns = new Set();
  const fnBodies = new Map(); // name → body nodes (for transitive analysis)
  for (const n of body) {
    if (n.type === NodeType.FUNCTION_DEF && n.name && n.body) {
      fnBodies.set(n.name, n.body);
      if (hasAsyncNodes(n.body)) {
        asyncFns.add(n.name);
      }
    }
  }

  // Second pass: transitive — if function A calls an async function, A is async too
  // Iterate until stable (handles chains like A→B→C where C is async)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, fnBody] of fnBodies) {
      if (asyncFns.has(name)) continue;
      if (_bodyCallsAny(fnBody, asyncFns)) {
        asyncFns.add(name);
        changed = true;
      }
    }
  }

  return asyncFns;
}

/** Check if any node in `nodes` contains a CALL to a function in `fnSet` */
function _bodyCallsAny(nodes, fnSet) {
  for (const n of nodes) {
    if (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.CALL && fnSet.has(n.expression.name)) return true;
    if (n.type === NodeType.CALL && fnSet.has(n.name)) return true;
    if (n.body && _bodyCallsAny(n.body, fnSet)) return true;
    if (n.thenBranch && _bodyCallsAny(n.thenBranch, fnSet)) return true;
    if (n.otherwiseBranch && _bodyCallsAny(n.otherwiseBranch, fnSet)) return true;
    if (n.cases) {
      for (const c of n.cases) {
        if (c.body && _bodyCallsAny(c.body, fnSet)) return true;
      }
    }
    if (n.defaultBody && _bodyCallsAny(n.defaultBody, fnSet)) return true;
  }
  return false;
}

/**
 * Compile to a complete, runnable Express.js server.
 */
function compileToJSBackend(body, errors, sourceMap = false, streamingAgentNames = new Set()) {
  // Detect feature usage for auto-imports
  const hasAuthScaffold = body.some(n => n.type === NodeType.AUTH_SCAFFOLD);
  const usesAuth = hasAuthScaffold || body.some(n =>
    n.type === NodeType.ENDPOINT && n.body &&
    n.body.some(b => b.type === NodeType.REQUIRES_AUTH || b.type === NodeType.REQUIRES_ROLE)
  );
  const usesRateLimit = body.some(n =>
    n.type === NodeType.ENDPOINT && n.body &&
    n.body.some(b => b.type === NodeType.RATE_LIMIT)
  );
  const dbBackend = body.find(n => n.type === NodeType.DATABASE_DECL)?.backend || 'local memory';
  const isSupabase = dbBackend.includes('supabase');

  const lines = [];
  lines.push(`// Generated by Clear v${CLEAR_VERSION}`);
  const diagram = generateDiagram(body, '//', streamingAgentNames);
  if (diagram) lines.push(diagram);
  lines.push("const express = require('express');");
  if (isSupabase) {
    lines.push("const { createClient } = require('@supabase/supabase-js');");
    lines.push("const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);");
  } else {
    lines.push("const db = require('./clear-runtime/db');");
  }
  if (hasAuthScaffold) {
    lines.push("const bcrypt = require('bcryptjs');");
    lines.push("const jwt = require('jsonwebtoken');");
  } else if (usesAuth) {
    lines.push("const auth = require('./clear-runtime/auth');");
  }
  if (usesRateLimit) {
    lines.push("const rateLimit = require('./clear-runtime/rateLimit');");
  }
  // npm package imports — emit require() calls at the top alongside built-in requires
  for (const n of body) {
    if (n.type === NodeType.USE && n.isNpm && n.npmPackage) {
      lines.push(`const ${n.npmAlias} = require('${n.npmPackage}');`);
    }
  }
  // child_process — emit if any RUN_COMMAND nodes exist (including inside ASSIGN expressions)
  function hasRunCommand(nodes) {
    return nodes.some(n =>
      n.type === NodeType.RUN_COMMAND ||
      (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_COMMAND) ||
      (n.type === NodeType.ENDPOINT && n.body && hasRunCommand(n.body)) ||
      (n.type === NodeType.CRON && n.body && hasRunCommand(n.body))
    );
  }
  if (hasRunCommand(body)) {
    lines.push("const { execSync } = require('child_process');");
  }
  // multer — emit if any endpoint has an ACCEPT_FILE node
  function hasFileUpload(nodes) {
    return nodes.some(n =>
      n.type === NodeType.ACCEPT_FILE ||
      (n.type === NodeType.ENDPOINT && n.body && hasFileUpload(n.body))
    );
  }
  if (hasFileUpload(body)) {
    lines.push("const multer = require('multer');");
  }
  lines.push('const app = express();');
  lines.push('app.use(express.json());');
  // Catch malformed JSON bodies -- return clean 400 instead of Express HTML stack trace
  lines.push('app.use((err, req, res, next) => {');
  lines.push('  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON in request body" });');
  lines.push('  next(err);');
  lines.push('});');
  // Middleware ordering matters: CORS and logging must come before auth
  // so preflight OPTIONS requests and request logs work without tokens
  const hasCORS = body.some(n => n.type === NodeType.ALLOW_CORS);
  const hasLogging = body.some(n => n.type === NodeType.LOG_REQUESTS);
  if (hasLogging) {
    lines.push('// Log every request');
    lines.push('app.use((req, res, next) => {');
    lines.push('  const start = Date.now();');
    lines.push('  res.on(\'finish\', () => {');
    lines.push('    const ms = Date.now() - start;');
    lines.push('    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);');
    lines.push('  });');
    lines.push('  next();');
    lines.push('});');
  }
  if (hasCORS) {
    lines.push('// Allow cross-origin requests');
    lines.push('app.use((req, res, next) => {');
    lines.push("  res.setHeader('Access-Control-Allow-Origin', '*');");
    lines.push("  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');");
    lines.push("  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');");
    lines.push("  if (req.method === 'OPTIONS') return res.sendStatus(204);");
    lines.push('  next();');
    lines.push('});');
  }
  if (hasAuthScaffold) {
    // 1:1-mapping provenance — the single Clear line `allow signup and login`
    // expands to ~70 lines below. Comment names source line + every endpoint /
    // middleware emitted, so a reader of the compiled JS can map back to the
    // one Clear line that asked for all this. See docs/one-to-one-mapping-audit.md.
    const authNode = body.find(n => n.type === NodeType.AUTH_SCAFFOLD);
    const authLine = authNode && authNode.line ? ` (clear:${authNode.line})` : '';
    lines.push(`// Auth scaffolding from \`allow signup and login\`${authLine}`);
    lines.push('//   emits: POST /auth/signup, POST /auth/login, GET /auth/me');
    lines.push('//   plus:  requireLogin middleware, requireRole middleware, JWT secret, bcrypt + jwt requires');
    lines.push("const _JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');");
    // The app may declare an owner email — the one user who gets role:'owner'
    // at signup and unlocks the Live App Editing widget. Everyone else
    // signs up as role:'user'.
    const ownerDecl = body.find(n => n.type === NodeType.OWNER_DECL);
    if (ownerDecl) {
      lines.push(`const _OWNER_EMAIL = ${JSON.stringify(ownerDecl.email)};`);
    }
    lines.push('const _users = [];');
    lines.push('');
    lines.push('// JWT middleware — extracts user from token on every request');
    lines.push('app.use((req, res, next) => {');
    lines.push("  const authHeader = req.headers.authorization || '';");
    lines.push("  if (authHeader.startsWith('Bearer ')) {");
    lines.push('    try {');
    lines.push('      req.user = jwt.verify(authHeader.slice(7), _JWT_SECRET);');
    lines.push('    } catch(e) { req.user = null; }');
    lines.push('  }');
    lines.push('  next();');
    lines.push('});');
    lines.push('');
    lines.push('// POST /auth/signup — create new user');
    lines.push("app.post('/auth/signup', async (req, res) => {");
    lines.push('  try {');
    lines.push('    const { email, password } = req.body;');
    lines.push("    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });");
    lines.push("    if (_users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });");
    lines.push('    const password_hash = await bcrypt.hash(password, 10);');
    // If the app declared an owner, check it at signup time. Otherwise
    // everyone is a plain user and no one can reach the Live App Editing
    // widget (it self-gates on role === 'owner').
    if (body.find(n => n.type === NodeType.OWNER_DECL)) {
      lines.push("    const user = { id: _users.length + 1, email, password_hash, role: email === _OWNER_EMAIL ? 'owner' : 'user', created_at: new Date().toISOString() };");
    } else {
      lines.push("    const user = { id: _users.length + 1, email, password_hash, role: 'user', created_at: new Date().toISOString() };");
    }
    lines.push('    _users.push(user);');
    lines.push('    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, _JWT_SECRET, { expiresIn: "7d" });');
    lines.push('    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });');
    lines.push('  } catch(e) { res.status(500).json({ error: e.message }); }');
    lines.push('});');
    lines.push('');
    lines.push('// POST /auth/login — authenticate user');
    lines.push("app.post('/auth/login', async (req, res) => {");
    lines.push('  try {');
    lines.push('    const { email, password } = req.body;');
    lines.push("    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });");
    lines.push("    const user = _users.find(u => u.email === email);");
    lines.push("    if (!user) return res.status(401).json({ error: 'Invalid email or password' });");
    lines.push('    const valid = await bcrypt.compare(password, user.password_hash);');
    lines.push("    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });");
    lines.push('    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, _JWT_SECRET, { expiresIn: "7d" });');
    lines.push('    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });');
    lines.push('  } catch(e) { res.status(500).json({ error: e.message }); }');
    lines.push('});');
    lines.push('');
    lines.push('// GET /auth/me — return current user');
    lines.push("app.get('/auth/me', (req, res) => {");
    lines.push("  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });");
    lines.push("  const user = _users.find(u => u.id === req.user.id);");
    lines.push("  if (!user) return res.status(404).json({ error: 'User not found' });");
    lines.push('  res.json({ id: user.id, email: user.email, role: user.role, created_at: user.created_at });');
    lines.push('});');
    lines.push('');
    lines.push('// --- Live App Editing routes (Meph edit widget) ---');
    lines.push('// Widget is served from a static file in clear-runtime/. API calls');
    lines.push('// proxy to Studio (when STUDIO_PORT is set in the environment). In');
    lines.push('// a standalone deploy STUDIO_PORT is unset and the API path 503s.');
    lines.push("const _MEPH_WIDGET_PATH = require('path').join(__dirname, 'clear-runtime', 'meph-widget.js');");
    lines.push("app.get('/__meph__/widget.js', (req, res) => {");
    lines.push('  try {');
    lines.push("    res.type('application/javascript').send(require('fs').readFileSync(_MEPH_WIDGET_PATH, 'utf8'));");
    lines.push("  } catch(e) { res.status(404).send('// widget bundle not found'); }");
    lines.push('});');
    lines.push("app.all('/__meph__/api/:action', async (req, res) => {");
    lines.push('  const studioPort = process.env.STUDIO_PORT;');
    lines.push('  if (!studioPort) {');
    lines.push("    return res.status(503).json({ error: 'Live editing is not available in this environment (STUDIO_PORT not set)' });");
    lines.push('  }');
    lines.push('  try {');
    lines.push("    const upstream = 'http://localhost:' + studioPort + '/__meph__/api/' + req.params.action;");
    lines.push('    const r = await fetch(upstream, {');
    lines.push('      method: req.method,');
    lines.push("      headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization || '' },");
    lines.push("      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body || {}),");
    lines.push('    });');
    lines.push('    const body = await r.text();');
    lines.push("    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);");
    lines.push('  } catch(e) {');
    lines.push("    res.status(502).json({ error: 'Proxy to Studio failed: ' + e.message });");
    lines.push('  }');
    lines.push('});');
  } else if (usesAuth) {
    lines.push('app.use(auth.middleware());');
  }
  lines.push('');

  // Compile body first, then tree-shake utilities
  // Collect schema names so CRUD can reference the correct Schema variable
  const schemaNames = new Set();
  const schemaMap = {};
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) {
      schemaNames.add(node.name);
      schemaMap[node.name.toLowerCase()] = {
        fields: node.fields,
        fkFields: node.fields.filter(f => f.fk)
      };
    }
  }

  // Pre-scan: identify user-defined functions that will compile as async.
  // This lets CALL sites add `await` when calling async functions.
  // A function is async if its body contains CRUD, ASK_AI, EXTERNAL_FETCH,
  // RUN_AGENT, RUN_PIPELINE, HTTP_REQUEST, or calls to other async functions.
  const _asyncFunctions = _findAsyncFunctions(body);
  const _userFunctions = _findUserFunctions(body);

  const bodyLines = [];
  const declared = new Set();
  // streamingAgentNames is a live Set that compileAgent can mutate. When an
  // agent is pre-classified as streaming but its per-agent compile demotes
  // `shouldStream` to false (e.g. all ask-claude vars get reassigned so none
  // qualify as streamVars), compileAgent deletes the name here. That way
  // downstream call-site codegen doesn't wrap the call in `for await (const
  // _c of agent_X(...))` — which would throw at runtime because agent_X
  // compiled as `async function` not `async function*`. Classic shape
  // mismatch bug surfaced on multi-agent-research's Polished Report.
  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'backend', sourceMap, schemaNames, schemaMap, dbBackend, streamingAgentNames, _astBody: body, _allNodes: body, _asyncFunctions, _userFunctions };

  // Implicit tables for agent-memory features. Agents declared with
  // `remember conversation context` call db.findAll/insert/update on a
  // 'Conversations' table; `remember user's preferences` uses 'Memories'.
  // Neither table is declared in user source, so without these implicit
  // CREATE TABLE calls the app 500s with "no such table" on first access.
  // Surfaced by the eval-auth fix when helpdesk-agent went from 401 to 500.
  const hasRememberConv = body.some(n => n.type === NodeType.AGENT && n.rememberConversation);
  const hasRememberPrefs = body.some(n => n.type === NodeType.AGENT && n.rememberPreferences);
  const isLocalMemoryDb = !(dbBackend && dbBackend.includes('supabase'));
  if (isLocalMemoryDb && (hasRememberConv || hasRememberPrefs)) {
    const lines = ['// Implicit tables for agent memory (remember conversation / preferences)'];
    if (hasRememberConv) {
      lines.push(`db.createTable('Conversations', { user_id: { type: 'text' }, messages: { type: 'text' } });`);
    }
    if (hasRememberPrefs) {
      lines.push(`db.createTable('Memories', { user_id: { type: 'text' }, fact: { type: 'text' } });`);
    }
    bodyLines.push(lines.join('\n'));
  }

  for (const node of body) {
    // Skip test blocks in server output when running as a server (not test mode)
    // Tests are compiled into the server output for `compileProgram()` consumers
    // but excluded from `clear serve` via the CLI's test runner
    // For now: keep them in serverJS so tests can verify compilation, but guard with runtime check
    if (node.type === NodeType.TEST_DEF) {
      // Wrap test blocks in a runtime guard so they don't crash when `test` is undefined
      const testCode = compileNode(node, ctx);
      if (testCode) bodyLines.push(`if (typeof test === 'function') {\n${testCode}\n}`);
      continue;
    }
    const result = compileNode(node, ctx);
    if (result !== null) {
      bodyLines.push(result);
    }
  }

  // Post-process: transform endpoints that call streaming agents into SSE endpoints.
  // A streaming agent compiles to an async generator (async function*), so the endpoint
  // can't just `await` it — it needs to iterate the generator and write SSE events.
  if (streamingAgentNames.size > 0) {
    // Build a map of streaming agent names → compiled function names
    const streamingFnNames = new Set();
    for (const agentName of streamingAgentNames) {
      const fnName = 'agent_' + sanitizeName(agentName.toLowerCase().replace(/\s+/g, '_'));
      streamingFnNames.add(fnName);
    }

    for (let i = 0; i < bodyLines.length; i++) {
      const code = bodyLines[i];
      // Only process POST endpoints (app.post(...))
      if (!code.includes('app.post(')) continue;

      // Check if the endpoint body calls any streaming agent
      let matchedFnName = null;
      for (const fnName of streamingFnNames) {
        if (code.includes(`await ${fnName}(`)) {
          matchedFnName = fnName;
          break;
        }
      }
      if (!matchedFnName) continue;

      // Found a POST endpoint calling a streaming agent.
      // Extract the variable assignment: `let VARNAME = await agent_xxx(ARGS)`
      const assignRegex = new RegExp(`let (\\w+) = await ${matchedFnName}\\(([^)]*?)\\)`);
      const assignMatch = code.match(assignRegex);
      if (!assignMatch) continue;

      const varName = assignMatch[1];
      const callArgs = assignMatch[2];

      let transformed = code;

      // 1. Replace the agent call with SSE iteration
      const oldAssign = `let ${varName} = await ${matchedFnName}(${callArgs})`;
      const newIteration = `let _fullResponse = '';\n    for await (const _chunk of ${matchedFnName}(${callArgs})) {\n      _fullResponse += _chunk;\n      res.write('data: ' + JSON.stringify({ text: _chunk }) + '\\n\\n');\n    }`;
      transformed = transformed.replace(oldAssign, newIteration);

      // 2. Replace subsequent references to the variable with _fullResponse
      // Use word-boundary matching to avoid replacing partial names
      transformed = transformed.replace(new RegExp(`\\b${varName}\\b`, 'g'), (match, offset) => {
        // Don't replace the variable inside the old assignment (already gone) or in the iteration
        // The old assignment is already replaced, so all remaining refs should be _fullResponse
        return '_fullResponse';
      });

      // 3. Replace res.json(...) responses with a braced SSE DONE + res.end().
      //    The braces are load-bearing: when the original `return res.json(...)`
      //    was preceded by `if (cond)` (auth/validation early-return), splitting
      //    into 3 unbraced statements would drop the last two outside the `if`,
      //    firing res.end() + return unconditionally. Real bug on lead-scorer
      //    in Session 32. Emit as one compound statement so it slots into any
      //    single-statement position (post-if, post-else, post-try) safely.
      transformed = transformed.replace(
        /return res\.json\([^)]*\);/g,
        "{ res.write('data: [DONE]\\n\\n'); res.end(); return; }"
      );
      // Also handle res.status(N).json(...) — success responses
      transformed = transformed.replace(
        /return res\.status\(\d+\)\.json\([^)]*\);/g,
        "{ res.write('data: [DONE]\\n\\n'); res.end(); return; }"
      );
      // Also handle bare res.json(...) (without return) at end of try block
      transformed = transformed.replace(
        /res\.json\([^)]*\);\n(\s*\} catch)/g,
        "res.write('data: [DONE]\\n\\n');\n    res.end();\n$1"
      );

      // 4. Inject SSE headers after the handler opening
      // Find `async (req, res) => {\n  try {` and inject headers between handler open and try
      transformed = transformed.replace(
        /(async \(req, res\) => \{\n)/,
        "$1  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });\n"
      );

      // 5. Replace the catch block's error response with SSE error format
      transformed = transformed.replace(
        /const _info = _clearError\(err, _ctx\);\n\s*res\.status\(_info\.status\)\.json\(_info\.response\);/,
        "res.write('data: ' + JSON.stringify({ error: err.message }) + '\\n\\n');\n    res.end();"
      );

      bodyLines[i] = transformed;
    }
  }

  // Post-process: when a NON-streaming agent (or scheduled agent, or tool-using agent)
  // calls a streaming agent via `call 'X'`, the `await agent_streamer(arg)` would return
  // the async generator itself, not the string. This transform detects those calls inside
  // non-streaming agent bodies and wraps them with an inline collector that drains the
  // generator into a concatenated string. Agent-to-agent orchestration (coordinator →
  // specialist) depends on this: the coordinator wants the final answer, not a generator.
  if (streamingAgentNames.size > 0) {
    const streamingFnNames = new Set();
    for (const agentName of streamingAgentNames) {
      const fnName = 'agent_' + sanitizeName(agentName.toLowerCase().replace(/\s+/g, '_'));
      streamingFnNames.add(fnName);
    }
    for (let i = 0; i < bodyLines.length; i++) {
      const code = bodyLines[i];
      // Only transform NON-streaming agent functions. Generators (`async function*`)
      // chain generators via yield* naturally; ordinary functions (`async function`)
      // can't await a generator to get a value.
      if (!/async function agent_\w+/.test(code)) continue;
      if (/async function\* agent_\w+/.test(code)) continue;
      let transformed = code;
      for (const fnName of streamingFnNames) {
        // Match any `await agent_streaming(args)` occurrence (in assignments, inside
        // loops, as expression). Replace with an IIFE that drains the generator.
        const callRegex = new RegExp(`await ${fnName}\\(([^)]*?)\\)`, 'g');
        transformed = transformed.replace(callRegex,
          (m, args) => `await (async () => { let _t = ""; for await (const _c of ${fnName}(${args})) _t += _c; return _t; })()`
        );
      }
      bodyLines[i] = transformed;
    }
  }

  // Tree-shake: only emit utility functions that are actually used in compiled code
  const bodyText = bodyLines.join('\n');
  const usedUtils = _getUsedUtilities(bodyText);
  if (usedUtils.length > 0) {
    lines.push('// Built-in utilities');
    for (const util of usedUtils) lines.push(util);
    lines.push('');
  }

  // _clearMap: conditional source map for runtime error translator
  // Only emitted when CLEAR_DEBUG is set — zero overhead in production
  const dataShapes = body.filter(n => n.type === NodeType.DATA_SHAPE);
  const endpoints = body.filter(n => n.type === NodeType.ENDPOINT);
  if (dataShapes.length > 0 || endpoints.length > 0) {
    lines.push('// Source map for error translator (only active with CLEAR_DEBUG)');
    lines.push('const _clearMap = process.env.CLEAR_DEBUG ? {');
    // Tables with schemas
    if (dataShapes.length > 0) {
      lines.push('  tables: {');
      for (const ds of dataShapes) {
        const fields = ds.fields.map(f => {
          const props = [];
          if (f.required) props.push('required: true');
          if (f.unique) props.push('unique: true');
          if (f.fieldType) props.push(`type: "${f.fieldType}"`);
          return `${sanitizeName(f.name)}: { ${props.join(', ')} }`;
        }).join(', ');
        lines.push(`    ${pluralizeName(ds.name)}: { line: ${ds.line}, file: "${ds._sourceFile || 'main.clear'}", fields: { ${fields} } },`);
      }
      lines.push('  },');
    }
    // Endpoints
    if (endpoints.length > 0) {
      lines.push('  endpoints: {');
      for (const ep of endpoints) {
        const key = `${ep.method.toUpperCase()} ${ep.path}`;
        const hasAuth = ep.body && ep.body.some(b => b.type === NodeType.REQUIRES_AUTH || b.type === NodeType.REQUIRES_ROLE);
        lines.push(`    "${key}": { line: ${ep.line}, file: "${ep._sourceFile || 'main.clear'}", auth: ${hasAuth} },`);
      }
      lines.push('  }');
    }
    lines.push('} : null;');
    lines.push('');
  }

  lines.push(...bodyLines);

  // Generate nested endpoints for 'has many' relationships
  // e.g. Users has many Posts → GET /api/users/:id/posts
  for (const ds of dataShapes) {
    for (const field of ds.fields) {
      if (!field.hasMany) continue;
      const parentTable = pluralizeName(ds.name).toLowerCase();
      const childTable = pluralizeName(field.hasMany);
      const childTableLower = childTable.toLowerCase();
      // Find the FK field in the child table that belongs to this parent
      const childSchema = schemaMap[field.hasMany.toLowerCase()] || schemaMap[childTableLower];
      let fkFieldName = null;
      if (childSchema) {
        const fkField = childSchema.fields.find(f => f.fk && f.fk.toLowerCase() === ds.name.toLowerCase());
        if (fkField) fkFieldName = sanitizeName(fkField.name);
      }
      // Fallback: try common FK patterns
      if (!fkFieldName) {
        const parentSingular = ds.name.toLowerCase();
        fkFieldName = parentSingular + '_id';
      }
      lines.push('');
      lines.push(`// Has many: ${ds.name} has many ${field.hasMany}`);
      lines.push(`app.get('/api/${parentTable}/:id/${childTableLower}', async (req, res) => {`);
      lines.push(`  try {`);
      lines.push(`    const all = await db.findAll('${childTable}', {});`);
      lines.push(`    const filtered = all.filter(r => String(r.${fkFieldName} || r.${ds.name.toLowerCase()}_id) === req.params.id);`);
      lines.push(`    res.json(filtered);`);
      lines.push(`  } catch(e) { res.status(500).json({ error: e.message }); }`);
      lines.push(`});`);
    }
  }

  // Serve static files for full-stack apps (HTML, CSS, assets)
  // Every declared page gets its own Express route that serves index.html so
  // the browser gets a 200 + HTML on refresh/direct-nav. The client-side
  // router in the compiled HTML then picks the right page based on
  // window.location.pathname.
  const pageNodes = body.filter(n => n.type === NodeType.PAGE);
  if (pageNodes.length > 0) {
    lines.push('');
    lines.push("const path = require('path');");
    lines.push("app.use(express.static(__dirname));");
    const pageRoutes = new Set();
    for (const p of pageNodes) {
      const route = p.route || '/';
      // Skip routes that collide with API prefixes — the API routes above
      // already handle those.
      if (route.startsWith('/api/') || route.startsWith('/auth/')) continue;
      pageRoutes.add(route);
    }
    // Always ensure root is served
    pageRoutes.add('/');
    // Use `{ root: __dirname }` option: Express 5's send module mishandles
    // absolute paths on non-root request URLs (confuses path vs URL). With
    // the root option, send resolves safely.
    for (const route of pageRoutes) {
      lines.push(`app.get(${JSON.stringify(route)}, (req, res) => res.sendFile('index.html', { root: __dirname }));`);
    }
  }

  lines.push('');
  lines.push('const PORT = process.env.PORT || 3000;');
  lines.push('const server = app.listen(PORT, () => {');
  lines.push('  console.log(`Server running on port ${PORT}`);');
  lines.push('});');
  lines.push('');
  lines.push('// Graceful shutdown');
  lines.push("process.on('SIGTERM', () => {");
  lines.push("  console.log('Shutting down...');");
  lines.push('  server.close(() => process.exit(0));');
  lines.push('});');

  // Build JS-line → Clear-line source map from // clear:N markers.
  // This lets _clearError translate runtime stack traces back to Clear line numbers.
  const rawOutput = lines.join('\n');
  const rawLines = rawOutput.split('\n');
  const lineMap = {};
  rawLines.forEach((ln, idx) => {
    const m = ln.match(/\/\/ clear:(\d+)/);
    if (m) {
      // idx is 0-based; +1 for line numbers, +1 more for the injected _clearLineMap line
      lineMap[idx + 2] = parseInt(m[1]);
    }
  });
  const mapJson = JSON.stringify(lineMap);
  // Inject _clearLineMap as line 2 (after the "Generated by Clear" version comment).
  // Only populated when CLEAR_DEBUG is set — zero cost in production.
  const mapLine = `const _clearLineMap = process.env.CLEAR_DEBUG ? ${mapJson} : null;`;
  const firstNl = rawOutput.indexOf('\n');
  return rawOutput.slice(0, firstNl + 1) + mapLine + '\n' + rawOutput.slice(firstNl + 1);
}

/**
 * Compile backend to a browser-compatible server (runs in-page via fetch interception).
 * Used by the playground to make full-stack apps work without a real Node.js server.
 * Includes: in-memory DB, route handlers, validation, fetch interceptor.
 */
function compileToBrowserServer(body, errors) {
  const lines = [];
  lines.push('// --- Clear Browser Server (in-memory, fetch-intercepted) ---');
  lines.push('(function() {');
  // Shim process.env for browser (auth, env() calls reference it)
  lines.push('if (typeof process === "undefined") { window.process = { env: { CLEAR_AUTH_SECRET: "browser-dev-secret" } }; }');

  // Inline DB runtime (browser-compatible, no fs/path)
  lines.push('const _tables = {};');
  lines.push('const db = {');
  lines.push('  createTable(name, schema) { const t = name.toLowerCase(); if (!_tables[t]) _tables[t] = { schema: schema || {}, records: [], nextId: 1 }; },');
  lines.push('  findAll(table, filter) { const t = table.toLowerCase(); if (!_tables[t]) return []; const recs = _tables[t].records; if (!filter) return [...recs]; return recs.filter(r => { for (const k in filter) { if (typeof r[k] === "number" && typeof filter[k] === "string") { if (r[k] !== Number(filter[k])) return false; } else if (r[k] !== filter[k]) return false; } return true; }); },');
  lines.push('  findOne(table, filter) { return db.findAll(table, filter)[0] || null; },');
  lines.push('  insert(table, record) { const t = table.toLowerCase(); if (!_tables[t]) _tables[t] = { schema: {}, records: [], nextId: 1 }; const store = _tables[t]; const schema = store.schema; for (const [f, c] of Object.entries(schema)) { if (c.required && (record[f] == null || record[f] === "")) throw new Error(f + " is required"); } for (const [f, c] of Object.entries(schema)) { if (record[f] === undefined && c.default !== undefined) record[f] = c.default; if (record[f] === undefined && c.auto && c.type === "timestamp") record[f] = new Date().toISOString(); } const rec = { ...record, id: store.nextId++ }; store.records.push(rec); return rec; },');
  lines.push('  update(table, filterOrRec, data) { const t = table.toLowerCase(); if (!_tables[t]) return 0; const recs = _tables[t].records; let filter, upd; if (data === undefined) { filter = { id: filterOrRec.id }; upd = filterOrRec; } else { filter = filterOrRec; upd = data; } let c = 0; for (const r of recs) { let match = true; for (const k in filter) { if (r[k] != filter[k]) { match = false; break; } } if (match) { const pid = r.id; Object.assign(r, upd); r.id = pid; c++; } } return c; },');
  lines.push('  remove(table, filter) { const t = table.toLowerCase(); if (!_tables[t]) return 0; const before = _tables[t].records.length; if (!filter) { _tables[t].records = []; } else { _tables[t].records = _tables[t].records.filter(r => { for (const k in filter) { if (typeof r[k] === "number" && typeof filter[k] === "string") { if (r[k] === Number(filter[k])) return false; } else if (r[k] === filter[k]) return false; } return true; }); } return before - _tables[t].records.length; },');
  lines.push('  run() {}, execute() {}');
  lines.push('};');
  lines.push('');

  // Compile utilities used by routes
  const schemaNames = new Set();
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) schemaNames.add(node.name);
  }
  const _asyncFunctions = _findAsyncFunctions(body);
  const _userFunctions = _findUserFunctions(body);
  const bodyLines = [];
  const declared = new Set();
  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'backend', schemaNames, _astBody: body, _allNodes: body, _asyncFunctions, _userFunctions };

  // Collect schemas and route handlers
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE || node.type === NodeType.ENDPOINT ||
        node.type === NodeType.AGENT || node.type === NodeType.ASSIGN ||
        node.type === NodeType.FUNCTION_DEF || node.type === NodeType.PIPELINE) {
      const result = compileNode(node, ctx);
      if (result !== null) bodyLines.push(result);
    }
  }

  // Tree-shake utilities
  const bodyText = bodyLines.join('\n');
  const usedUtils = _getUsedUtilities(bodyText);
  for (const util of usedUtils) lines.push(util);

  // Convert app.METHOD('/path', handler) to route table entries
  // We re-emit the body but replace Express patterns with route registrations
  lines.push('const _routes = [];');

  // Re-compile endpoints as route registrations instead of app.get/post
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) {
      const result = compileNode(node, ctx);
      if (result !== null) lines.push(result);
    }
  }

  for (const node of body) {
    if (node.type === NodeType.ENDPOINT) {
      const method = node.method.toUpperCase();
      const path = node.path;
      // Compile handler body
      const handlerDeclared = new Set();
      const hasIdParam = path.includes(':id');
      const handlerCtx = { ...ctx, indent: 1, declared: handlerDeclared, insideEndpoint: true, endpointMethod: method, endpointHasId: hasIdParam };
      const handlerLines = [];
      for (const child of node.body) {
        const compiled = compileNode(child, handlerCtx);
        if (compiled) handlerLines.push(compiled);
      }
      const handlerBody = handlerLines.join('\n');

      lines.push(`_routes.push({ method: '${method}', path: '${path}', handler: async function(req, res) {`);
      lines.push('  try {');
      // Bind receiving variable and incoming (same as Express compiler)
      const bodyUsesIncoming = endpointBodyUsesIncoming(node.body);
      if (node.receivingVar) {
        lines.push(`  const ${sanitizeName(node.receivingVar)} = req.body;`);
        if (bodyUsesIncoming) {
          lines.push('  const incoming = req.params;');
        }
      } else if (bodyUsesIncoming) {
        lines.push('  const incoming = { ...req.body, ...req.params };');
      }
      lines.push(handlerBody);
      lines.push('  } catch(err) {');
      lines.push('    const ctx = err._clearCtx || {};');
      lines.push('    let hint = null;');
      lines.push('    if (err.message.includes("SQLITE_CONSTRAINT")) hint = "A unique constraint was violated — a record with this value may already exist.";');
      lines.push('    else if (err.message.includes("no such table")) hint = "This table does not exist yet. Check your table definition.";');
      lines.push('    console.error("[Runtime Error]", ctx.op || "unknown", ctx.table ? "on " + ctx.table : "", err.message);');
      lines.push('    res.status(500).json({ error: err.message, hint: hint || ctx.hint || null, context: ctx.op || null, table: ctx.table || null });');
      lines.push('  }');
      lines.push('}});');
    }
  }

  // Compile agent functions (needed by endpoints that call agents)
  for (const node of body) {
    if (node.type === NodeType.AGENT || node.type === NodeType.FUNCTION_DEF || node.type === NodeType.PIPELINE) {
      const result = compileNode(node, ctx);
      if (result !== null) lines.push(result);
    }
  }

  // Fetch interceptor: matches routes and calls handlers
  lines.push('');
  lines.push('const _origFetch = window.fetch;');
  lines.push('window.fetch = async function(url, opts) {');
  lines.push('  opts = opts || {};');
  lines.push('  const method = (opts.method || "GET").toUpperCase();');
  lines.push('  const path = typeof url === "string" ? url : url.toString();');
  lines.push('  if (!path.startsWith("/api/")) return _origFetch.apply(this, arguments);');
  lines.push('  for (const route of _routes) {');
  lines.push('    if (route.method !== method) continue;');
  lines.push('    // Match path with :param placeholders');
  lines.push('    const routeParts = route.path.split("/");');
  lines.push('    const pathParts = path.split("?")[0].split("/");');
  lines.push('    if (routeParts.length !== pathParts.length) continue;');
  lines.push('    let match = true;');
  lines.push('    const params = {};');
  lines.push('    for (let i = 0; i < routeParts.length; i++) {');
  lines.push('      if (routeParts[i].startsWith(":")) { params[routeParts[i].slice(1)] = pathParts[i]; }');
  lines.push('      else if (routeParts[i] !== pathParts[i]) { match = false; break; }');
  lines.push('    }');
  lines.push('    if (!match) continue;');
  lines.push('    // Build req/res shims');
  lines.push('    let body = null;');
  lines.push('    if (opts.body) try { body = JSON.parse(opts.body); } catch(e) {}');
  lines.push('    const req = { method, path, params, body, headers: opts.headers || {}, user: { id: 1, role: "admin" } };');
  lines.push('    let _resStatus = 200; let _resBody = null;');
  lines.push('    const res = {');
  lines.push('      status(s) { _resStatus = s; return res; },');
  lines.push('      json(data) { _resBody = data; return res; },');
  lines.push('      sendStatus(s) { _resStatus = s; _resBody = {}; return res; }');
  lines.push('    };');
  lines.push('    await route.handler(req, res);');
  lines.push('    return new Response(JSON.stringify(_resBody), { status: _resStatus, headers: { "Content-Type": "application/json" }});');
  lines.push('  }');
  lines.push('  return new Response(JSON.stringify({ error: "Not found: " + method + " " + path }), { status: 404, headers: { "Content-Type": "application/json" }});');
  lines.push('};');

  // Override _askAI for browser: route through proxy endpoint instead of direct Anthropic call
  lines.push('');
  lines.push('// Browser AI proxy — calls /api/ai-proxy instead of Anthropic directly');
  lines.push('async function _askAI(prompt, context, schema) {');
  lines.push('  const proxyUrl = window._clearAIProxy || "/api/ai-proxy";');
  lines.push('  const schemaObj = schema ? Object.fromEntries(schema.map(f => [f.name, f.type || "text"])) : null;');
  lines.push('  const r = await _origFetch(proxyUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, context, schema: schemaObj }) });');
  lines.push('  const data = await r.json();');
  lines.push('  if (!r.ok) throw new Error(data.error || "AI request failed");');
  lines.push('  if (data.remaining != null && window._onAICallUsed) window._onAICallUsed(data.remaining);');
  lines.push('  return data.result;');
  lines.push('}');

  // Browser _askAIWithTools — agentic loop via proxy
  // Check if any agent uses tools before emitting
  const hasToolAgents = body.some(n => n.type === NodeType.AGENT && n.tools && n.tools.length > 0);
  if (hasToolAgents) {
    lines.push('');
    lines.push('async function _askAIWithTools(prompt, context, tools, toolFns, model) {');
    lines.push('  const proxyUrl = window._clearAIProxy || "/api/ai-proxy";');
    lines.push('  const userContent = context ? prompt + "\\n\\nContext: " + (typeof context === "string" ? context : JSON.stringify(context)) : prompt;');
    lines.push('  const messages = [{ role: "user", content: userContent }];');
    lines.push('  for (let i = 0; i < 10; i++) {');
    lines.push('    const r = await _origFetch(proxyUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: null, messages, tools, model }) });');
    lines.push('    const data = await r.json();');
    lines.push('    if (!r.ok) throw new Error(data.error || "AI request failed");');
    lines.push('    if (data.remaining != null && window._onAICallUsed) window._onAICallUsed(data.remaining);');
    lines.push('    if (data.result && typeof data.result === "string") return data.result;');
    lines.push('    const msg = data.content || [];');
    lines.push('    messages.push({ role: "assistant", content: msg });');
    lines.push('    const toolUses = msg.filter(b => b.type === "tool_use");');
    lines.push('    if (toolUses.length === 0) return (msg.find(b => b.type === "text") || {}).text || "";');
    lines.push('    const results = [];');
    lines.push('    for (const tu of toolUses) {');
    lines.push('      const fn = toolFns[tu.name];');
    lines.push('      if (!fn) { results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: "Unknown tool: " + tu.name }), is_error: true }); continue; }');
    lines.push('      try { const res = await fn(...Object.values(tu.input)); results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(res) }); }');
    lines.push('      catch (e) { results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: e.message }), is_error: true }); }');
    lines.push('    }');
    lines.push('    messages.push({ role: "user", content: results });');
    lines.push('  }');
    lines.push('  throw new Error("Agent exceeded maximum tool use turns (10)");');
    lines.push('}');
  }

  lines.push('})();');
  return lines.join('\n');
}

/**
 * Compile to a complete, runnable FastAPI server.
 */
function compileToPythonBackend(body, errors, sourceMap = false) {
  const lines = [];
  lines.push(`# Generated by Clear v${CLEAR_VERSION}`);
  const pyBeDiagram = generateDiagram(body, '#');
  if (pyBeDiagram) lines.push(pyBeDiagram);
  lines.push('import os');
  lines.push('import json');
  lines.push('import re');
  lines.push('import datetime');
  // subprocess — emit if any RUN_COMMAND nodes exist (including inside ASSIGN expressions)
  function pyHasRunCommand(nodes) {
    return nodes.some(n =>
      n.type === NodeType.RUN_COMMAND ||
      (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.RUN_COMMAND) ||
      (n.type === NodeType.ENDPOINT && n.body && pyHasRunCommand(n.body)) ||
      (n.type === NodeType.CRON && n.body && pyHasRunCommand(n.body))
    );
  }
  const pyUsesRunCommand = pyHasRunCommand(body);
  if (pyUsesRunCommand) lines.push('import subprocess');
  // httpx — emit if any EXTERNAL_FETCH nodes exist (including inside ASSIGN expressions or endpoint bodies)
  function pyHasExternalFetch(nodes) {
    return nodes.some(n =>
      n.type === NodeType.EXTERNAL_FETCH ||
      (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.EXTERNAL_FETCH) ||
      (n.type === NodeType.ENDPOINT && n.body && pyHasExternalFetch(n.body)) ||
      (n.type === NodeType.CRON && n.body && pyHasExternalFetch(n.body)) ||
      (n.type === NodeType.AGENT && n.body && pyHasExternalFetch(n.body)) ||
      (n.type === NodeType.BACKGROUND && n.body && pyHasExternalFetch(n.body))
    );
  }
  if (pyHasExternalFetch(body)) lines.push('import httpx');
  // Detect cron/background nodes for asyncio + lifespan
  const pyHasCronOrBg = body.some(n => n.type === NodeType.CRON || n.type === NodeType.BACKGROUND);
  if (pyHasCronOrBg) {
    lines.push('import asyncio');
    lines.push('from contextlib import asynccontextmanager');
  }
  lines.push('from fastapi import FastAPI, Request, HTTPException');
  lines.push('from fastapi.responses import JSONResponse');
  lines.push('');
  lines.push('app = FastAPI()');
  lines.push('');
  // JWT secret for auth — emit when any endpoint uses requires auth
  const pyHasAuth = body.some(n => n.type === NodeType.ENDPOINT && n.body && n.body.some(b => b.type === NodeType.REQUIRES_AUTH || b.type === NodeType.REQUIRES_ROLE));
  if (pyHasAuth) {
    lines.push('_JWT_SECRET = os.environ.get("JWT_SECRET", "clear-dev-secret-change-in-production")');
    lines.push('');
  }
  // In-memory db stub for Python
  lines.push('# In-memory database');
  lines.push('class _DB:');
  lines.push('    def __init__(self):');
  lines.push('        self._tables = {}');
  lines.push('    def create_table(self, name, schema=None):');
  lines.push('        if name not in self._tables:');
  lines.push('            self._tables[name] = {"schema": schema or {}, "records": [], "next_id": 1}');
  lines.push('    def query(self, table, filter=None):');
  lines.push('        self.create_table(table)');
  lines.push('        records = self._tables[table]["records"]');
  lines.push('        if not filter: return list(records)');
  lines.push('        return [r for r in records if all(r.get(k) == v for k, v in filter.items())]');
  lines.push('    def query_one(self, table, filter=None):');
  lines.push('        results = self.query(table, filter)');
  lines.push('        return results[0] if results else None');
  lines.push('    def save(self, table, record):');
  lines.push('        self.create_table(table)');
  lines.push('        store = self._tables[table]');
  lines.push('        new_record = {**record, "id": store["next_id"]}');
  lines.push('        store["next_id"] += 1');
  lines.push('        store["records"].append(new_record)');
  lines.push('        return new_record');
  lines.push('    def update(self, table, record):');
  lines.push('        self.create_table(table)');
  lines.push('        for r in self._tables[table]["records"]:');
  lines.push('            if r.get("id") == record.get("id"):');
  lines.push('                r.update(record)');
  lines.push('                return 1');
  lines.push('        return 0');
  lines.push('    def remove(self, table, filter=None):');
  lines.push('        self.create_table(table)');
  lines.push('        store = self._tables[table]');
  lines.push('        before = len(store["records"])');
  lines.push('        if not filter: store["records"] = []');
  lines.push('        else: store["records"] = [r for r in store["records"] if not all(r.get(k) == v for k, v in filter.items())]');
  lines.push('        return before - len(store["records"])');
  lines.push('    def execute(self, sql): pass');
  lines.push('    def run(self, sql): pass');
  lines.push('');
  lines.push('db = _DB()');
  lines.push('');

  // Python _ask_ai utility (Anthropic API call)
  // Detect if _ask_ai is needed: AGENT, WORKFLOW, or ASK_AI nodes (including inside endpoints)
  function pyNeedsAskAI(nodes) {
    return nodes.some(n =>
      n.type === NodeType.AGENT || n.type === NodeType.WORKFLOW ||
      n.type === NodeType.ASK_AI ||
      (n.type === NodeType.ASSIGN && n.expression?.type === NodeType.ASK_AI) ||
      (n.type === NodeType.ENDPOINT && n.body && pyNeedsAskAI(n.body)) ||
      (n.type === NodeType.CRON && n.body && pyNeedsAskAI(n.body))
    );
  }
  const hasAgents = pyNeedsAskAI(body);
  if (hasAgents) {
    lines.push('# AI utility — calls Anthropic API');
    lines.push('import httpx');
    lines.push('');
    lines.push('async def _ask_ai(prompt, context=None, schema=None, model=None):');
    lines.push('    key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLEAR_AI_KEY")');
    lines.push('    if not key: raise Exception("Set ANTHROPIC_API_KEY environment variable")');
    lines.push('    endpoint = os.environ.get("CLEAR_AI_ENDPOINT", "https://api.anthropic.com/v1/messages")');
    lines.push('    content = prompt');
    lines.push('    if context: content += "\\n\\nContext: " + (context if isinstance(context, str) else json.dumps(context))');
    lines.push('    if schema:');
    lines.push('        fields = ", ".join(f\'"{f["name"]}": <{f.get("type","string")}>\' for f in schema)');
    lines.push('        content += f"\\n\\nRespond with ONLY a JSON object: {{{fields}}}"');
    lines.push('    payload = {"model": model or "claude-sonnet-4-20250514", "max_tokens": 1024, "messages": [{"role": "user", "content": content}]}');
    lines.push('    headers = {"Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}');
    lines.push('    async with httpx.AsyncClient(timeout=30) as client:');
    lines.push('        r = await client.post(endpoint, json=payload, headers=headers)');
    lines.push('        r.raise_for_status()');
    lines.push('        text = r.json()["content"][0]["text"]');
    lines.push('    if not schema: return text');
    lines.push('    import re as _re');
    lines.push('    m = _re.search(r"\\{[\\s\\S]*\\}", text)');
    lines.push('    if not m: raise Exception("AI did not return valid JSON")');
    lines.push('    return json.loads(m.group())');
    lines.push('');
    const hasStreamingAgent = body.some(n => n.type === NodeType.AGENT && n.streamResponse === true);
    if (hasStreamingAgent) {
    lines.push('async def _ask_ai_stream(prompt, context=None, model=None):');
    lines.push('    """Async generator — yields text chunks from Anthropic streaming API."""');
    lines.push('    key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLEAR_AI_KEY")');
    lines.push('    if not key: raise Exception("Set ANTHROPIC_API_KEY environment variable")');
    lines.push('    endpoint = os.environ.get("CLEAR_AI_ENDPOINT", "https://api.anthropic.com/v1/messages")');
    lines.push('    content = prompt');
    lines.push('    if context: content += "\\n\\nContext: " + (context if isinstance(context, str) else json.dumps(context))');
    lines.push('    payload = {"model": model or "claude-sonnet-4-20250514", "max_tokens": 4096, "stream": True, "messages": [{"role": "user", "content": content}]}');
    lines.push('    headers = {"Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}');
    lines.push('    async with httpx.AsyncClient(timeout=60) as client:');
    lines.push('        async with client.stream("POST", endpoint, json=payload, headers=headers) as r:');
    lines.push('            r.raise_for_status()');
    lines.push('            buffer = ""');
    lines.push('            async for chunk in r.aiter_text():');
    lines.push('                buffer += chunk');
    lines.push('                while "\\n" in buffer:');
    lines.push('                    line, buffer = buffer.split("\\n", 1)');
    lines.push('                    if not line.startswith("data: "): continue');
    lines.push('                    data = line[6:]');
    lines.push('                    if data == "[DONE]": return');
    lines.push('                    try:');
    lines.push('                        evt = json.loads(data)');
    lines.push('                        if evt.get("type") == "content_block_delta" and evt.get("delta", {}).get("text"):');
    lines.push('                            yield evt["delta"]["text"]');
    lines.push('                    except json.JSONDecodeError: pass');
    lines.push('');
    } // end hasStreamingAgent
  }

  // Add asyncio import if parallel agents or workflows are used
  const hasParallel = body.some(n =>
    n.type === NodeType.PARALLEL_AGENTS ||
    (n.type === NodeType.WORKFLOW && n.steps?.some(s => s.kind === 'parallel'))
  );
  if (hasParallel) {
    // Insert asyncio import after datetime
    const dtIdx = lines.findIndex(l => l === 'import datetime');
    if (dtIdx >= 0) lines.splice(dtIdx + 1, 0, 'import asyncio');
  }
  const pyDbBackend = body.find(n => n.type === NodeType.DATABASE_DECL)?.backend || 'local memory';
  const pyIsSupabase = pyDbBackend.includes('supabase');
  if (pyIsSupabase) {
    // Replace in-memory db with Supabase client
    // Clear the db stub lines and replace with supabase init
    const dbStubStart = lines.findIndex(l => l.includes('# In-memory database'));
    if (dbStubStart >= 0) {
      // Remove from '# In-memory database' through 'db = _DB()'
      const dbStubEnd = lines.findIndex((l, i) => i > dbStubStart && l.includes('db = _DB()'));
      if (dbStubEnd >= 0) lines.splice(dbStubStart, dbStubEnd - dbStubStart + 2);
    }
    lines.push('from supabase import create_client');
    lines.push('supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])');
    lines.push('');
  }

  const pySchemaNames = new Set();
  for (const node of body) { if (node.type === NodeType.DATA_SHAPE) pySchemaNames.add(node.name); }
  const ctx = { lang: 'python', indent: 0, declared: new Set(), stateVars: null, mode: 'backend', sourceMap, schemaNames: pySchemaNames, dbBackend: pyDbBackend, _allNodes: body };
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      lines.push(result);
    }
  }

  // Post-process: replace deprecated @app.on_event("startup") with lifespan context manager
  // Scan for # _startup_task_: markers left by CRON and BACKGROUND compilation
  if (pyHasCronOrBg) {
    const startupFns = [];
    for (const line of lines) {
      // Each line element can be multi-line, so scan with regex globally
      const matches = line.matchAll(/# _startup_task_: (\S+)/g);
      for (const m of matches) startupFns.push(m[1]);
    }
    if (startupFns.length > 0) {
      // Build lifespan context manager
      const lifespanLines = [];
      lifespanLines.push('@asynccontextmanager');
      lifespanLines.push('async def _lifespan(app):');
      for (const fn of startupFns) {
        lifespanLines.push(`    asyncio.create_task(${fn}())`);
      }
      lifespanLines.push('    yield');
      lifespanLines.push('');
      // Replace app = FastAPI() with app = FastAPI(lifespan=_lifespan)
      const appIdx = lines.findIndex(l => l === 'app = FastAPI()');
      if (appIdx >= 0) {
        lines.splice(appIdx, 1, ...lifespanLines, 'app = FastAPI(lifespan=_lifespan)');
      }
      // Remove the # _startup_task_ marker comments from the multi-line body strings
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('# _startup_task_:')) {
          lines[i] = lines[i].split('\n').filter(l => !l.includes('# _startup_task_:')).join('\n');
        }
      }
    }
  }

  // Serve static files for full-stack apps (HTML, CSS, assets)
  const pyHasPages = body.some(n => n.type === NodeType.PAGE);
  if (pyHasPages) {
    lines.push('');
    lines.push('from fastapi.staticfiles import StaticFiles');
    lines.push('from fastapi.responses import FileResponse');
    lines.push('');
    lines.push('@app.get("/")');
    lines.push('async def serve_index():');
    lines.push('    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))');
    lines.push('');
    lines.push('# Mount static files LAST (catch-all)');
    lines.push('app.mount("/", StaticFiles(directory=os.path.dirname(__file__)), name="static")');
  }

  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    import uvicorn');
  lines.push('    uvicorn.run(app, host="0.0.0.0", port=3000)');

  return lines.join('\n');
}

// =============================================================================
// STYLE BLOCK CSS COMPILATION (Phase 7)
// =============================================================================

const FRIENDLY_CSS = {
  background: { css: 'background' },
  color: { css: 'color' },
  text_color: { css: 'color' },
  padding: { css: 'padding' },
  margin: { css: 'margin' },
  rounded: { css: 'border-radius' },
  gap: { css: 'gap' },
  width: { css: 'width' },
  height: { css: 'height' },
  text_size: { css: 'font-size' },
  border: { css: 'border' },
  bold: { css: 'font-weight', map: { true: '700', false: '400' } },
  hidden: { css: 'display', map: { true: 'none' } },
  centered: { css: null, expand: 'margin-left: auto; margin-right: auto; max-width: 800px' },
  text_centered: { css: null, expand: 'text-align: center' },
  shadow: { css: 'box-shadow', map: {
    small: '0 1px 3px rgba(0,0,0,0.12)',
    medium: '0 4px 6px rgba(0,0,0,0.1)',
    large: '0 10px 25px rgba(0,0,0,0.1)',
  }},
  stack: { css: null, expand_map: {
    vertical: 'display: flex; flex-direction: column',
    horizontal: 'display: flex; flex-direction: row',
  }},

  // Layout patterns — compile to correct multi-property CSS
  // These solve the "hard CSS problems" by handling gotchas automatically.
  sticky: { css: null, expand_map: {
    // sticky at top — position: sticky with z-index and top offset
    top: 'position: sticky; top: 0; z-index: 10; background: inherit',
    bottom: 'position: sticky; bottom: 0; z-index: 10; background: inherit',
  }},
  fixed: { css: null, expand_map: {
    top: 'position: fixed; top: 0; left: 0; right: 0; z-index: 100',
    bottom: 'position: fixed; bottom: 0; left: 0; right: 0; z-index: 100',
    left: 'position: fixed; top: 0; left: 0; bottom: 0; z-index: 100',
    right: 'position: fixed; top: 0; right: 0; bottom: 0; z-index: 100',
  }},
  scrollable: { css: null, expand: 'overflow-y: auto; min-height: 0' },
  fills_remaining_space: { css: null, expand: 'flex: 1; min-height: 0; min-width: 0' },
  no_shrink: { css: null, expand: 'flex-shrink: 0' },
  stacked: { css: null, expand: 'display: flex; flex-direction: column' },
  wraps: { css: null, expand: 'flex-wrap: wrap' },
  // Column layouts: "two column layout", "3 column layout", etc.
  two_column_layout: { css: null, expand: 'display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem' },
  three_column_layout: { css: null, expand: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem' },
  four_column_layout: { css: null, expand: 'display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.5rem' },
  // Row layouts: "two row layout", "3 row layout", etc.
  two_row_layout: { css: null, expand: 'display: grid; grid-template-rows: 1fr 1fr; gap: 16px' },
  three_row_layout: { css: null, expand: 'display: grid; grid-template-rows: 1fr 1fr 1fr; gap: 16px' },
  four_row_layout: { css: null, expand: 'display: grid; grid-template-rows: 1fr 1fr 1fr 1fr; gap: 16px' },
  full_width: { css: null, expand: 'width: 100%' },
  full_height: { css: null, expand: 'height: 100vh' },
  clipped: { css: null, expand: 'overflow: hidden' },
};

const SCREEN_SIZES = {
  small: '@media (max-width: 640px)',
  medium: '@media (min-width: 641px) and (max-width: 1023px)',
  large: '@media (min-width: 1024px)',
};

// Rule: numbers always get px, strings are raw. No exceptions.
function friendlyPropToCSS(name, value) {
  const entry = FRIENDLY_CSS[name];
  const cssVal = typeof value === 'number' ? value + 'px' : value;

  if (!entry) {
    const cssProp = name.replace(/_/g, '-');
    return `${cssProp}: ${cssVal}`;
  }
  if (entry.expand) return entry.expand;
  if (entry.expand_map) {
    return entry.expand_map[String(value)] || '';
  }
  if (entry.map) {
    const mapped = entry.map[String(value)];
    if (mapped !== undefined) return `${entry.css}: ${mapped}`;
    return `${entry.css}: ${cssVal}`;
  }
  return `${entry.css}: ${cssVal}`;
}

// =============================================================================
// SEMANTIC STYLE TOKENS
// =============================================================================
// Token key format: "propertyName:value"  (e.g. "background:surface", "has_shadow:true")
// Token properties compile INLINE on the element — no custom .style-X CSS generated.
// Raw CSS properties (not in this map) fall through to the existing CSS path.
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
  'text:faint':     'text-base-content/30',
  'text:subtle':    'text-base-content/40',
  'text:light':     'text-neutral-content',
  'text:primary':   'text-primary',
  'text:secondary': 'text-secondary',
  'text:accent':    'text-accent',
  'text:success':   'text-success',
  'text:error':     'text-error',
  'text:warning':   'text-warning',
  'text:info':      'text-info',
  'text:small':     'text-sm',
  'text:large':     'text-lg',

  // Padding (uniform p-*)
  'padding:none':        'p-0',
  'padding:tight':       'p-3',
  'padding:normal':      'p-4',
  'padding:comfortable': 'p-6',
  'padding:spacious':    'p-8',
  'padding:loose':       'p-12',

  // Gap (flex/grid children spacing)
  'gap:none':        'gap-0',
  'gap:tight':       'gap-2',
  'gap:normal':      'gap-4',
  'gap:comfortable': 'gap-5',
  'gap:large':       'gap-8',

  // Border radius
  'corners:sharp':        'rounded-none',
  'corners:subtle':       'rounded-md',
  'corners:rounded':      'rounded-xl',
  'corners:very rounded': 'rounded-2xl',
  'corners:pill':         'rounded-full',

  // Shadow
  'has_shadow:true':       'shadow-sm',
  'has_large_shadow:true': 'shadow-md',
  'no_shadow:true':        '',            // explicit removal — empty = no class added

  // Border (all sides)
  'has_border:true':        'border border-base-300/60',
  'has_strong_border:true': 'border border-base-300',
  'no_border:true':         'border-0',

  // Border (single sides) — e.g. sidebar right border, section bottom divider
  'has_right_border:true':  'border-r border-base-300/40',
  'has_left_border:true':   'border-l border-base-300/40',
  'has_top_border:true':    'border-t border-base-300/40',
  'has_bottom_border:true': 'border-b border-base-300/40',

  // Overflow / flex behavior
  'scrollable:true':        'overflow-y-auto',
  'no_shrink:true':         'shrink-0',
  'clips_content:true':     'overflow-hidden',

  // Layout (flex/grid)
  'layout:column':    'flex flex-col',
  'layout:row':       'flex flex-row items-center',
  'layout:centered':  'flex flex-col items-center text-center',
  'layout:split':     'flex items-center justify-between',
  'layout:2 columns': 'grid grid-cols-2 gap-5',
  'layout:3 columns': 'grid grid-cols-3 gap-5',
  'layout:4 columns': 'grid grid-cols-4 gap-4',

  // Width
  'width:full':      'w-full',
  'width:narrow':    'max-w-sm mx-auto',
  'width:contained': 'max-w-5xl mx-auto',
  'width:wide':      'max-w-6xl mx-auto',

  // Hover interaction (cursor-pointer implied; use with layout tokens)
  'hover:elevated':    'hover:shadow-md hover:-translate-y-px transition-all cursor-pointer',
  'hover:highlighted': 'hover:bg-base-200 transition-colors cursor-pointer',
  'hover:tinted':      'hover:bg-primary/5 hover:border-primary/20 transition-colors cursor-pointer',
  'hover:glowing':     'hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer',
  'hover:faded':       'hover:opacity-70 transition-opacity cursor-pointer',

  // Typography
  'font:mono':      'font-mono',
  'font:bold':      'font-semibold',
  'font:display':   'font-display tracking-tight',
};

// Resolve semantic style tokens to Tailwind classes.
// Returns { tailwindClasses: string, rawProperties: array }
// rawProperties are props not in STYLE_TOKENS — fall back to CSS.
// Special: `tailwind is 'ring-2 ring-offset-2'` passes classes through directly.
function resolveStyleTokens(properties) {
  const classes = [];
  const rawProperties = [];
  for (const prop of properties) {
    // Tailwind passthrough: `tailwind is '...'` → inject classes directly
    if (prop.name === 'tailwind' && typeof prop.value === 'string') {
      classes.push(prop.value);
      continue;
    }
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

// Built-in style presets: name -> Tailwind/DaisyUI classes.
// The section renderer uses these classes directly on the div.
// No custom CSS is generated for built-in presets.
// User-defined styles (via `style X:` blocks) still compile to custom CSS.
const BUILTIN_PRESET_CLASSES = {
  // --- Landing page presets ---
  page_navbar:       '__navbar__', // special rendering handled in section renderer
  page_hero:         'bg-base-100 py-24 px-6 text-center flex flex-col items-center gap-6 relative overflow-hidden',
  page_section:      'bg-base-100 py-16 px-6',
  page_section_dark: 'bg-neutral text-neutral-content py-16 px-6 border-y border-base-content/8',
  page_card:         'bg-base-200 rounded-2xl p-8 hover:border-primary/30 transition-colors flex flex-col gap-3 border border-base-300/40 shadow-sm',
  page_cta:          'bg-primary text-primary-content py-20 lg:py-28 px-6 text-center flex flex-col items-center gap-6',
  page_stats:        'bg-base-200 py-16 px-6',

  // --- v2 landing sections ---
  hero_left:              'bg-base-100 py-28 px-6 flex flex-col items-start gap-6 overflow-hidden',
  logo_bar:               'bg-base-200/60 border-y border-base-300/40 py-8 lg:py-10 px-6',
  logo_bar_dark:          'bg-neutral text-neutral-content border-y border-neutral-content/10 py-6 px-6',
  feature_split:          'bg-base-100 py-20 px-6',
  feature_split_dark:     'bg-neutral text-neutral-content py-20 px-6 border-y border-base-content/8',
  feature_spotlight:      'bg-base-200/40 py-20 px-6',
  feature_spotlight_dark: 'bg-neutral text-neutral-content py-20 px-6 border-y border-base-content/8',
  feature_grid:           'bg-base-100 py-16 lg:py-24 px-6',
  feature_grid_dark:      'bg-neutral text-neutral-content py-16 lg:py-24 px-6 border-y border-base-content/8',
  stats_row:              'bg-base-200 py-14 lg:py-20 px-6',
  pricing_grid:           'bg-base-200 py-20 px-6',
  pricing_grid_dark:      'bg-neutral text-neutral-content py-20 px-6 border-y border-base-content/8',
  testimonial_grid:       'bg-base-200/50 py-16 lg:py-24 px-6',
  testimonial_grid_dark:  'bg-neutral text-neutral-content py-16 lg:py-24 px-6 border-y border-base-content/8',

  // --- v2 card presets ---
  feature_card:           'bg-base-100 rounded-2xl p-7 flex flex-col gap-3 border border-base-300 shadow-sm hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all group',
  feature_card_dark:      'bg-white/5 rounded-2xl p-7 flex flex-col gap-3 border border-white/10 hover:border-primary/40 transition-colors',
  // feature_card_large: bold primary bg — the "hero card" in the asymmetric split (Clay-style)
  feature_card_large:     'bg-primary text-primary-content rounded-2xl p-10 flex flex-col gap-5 shadow-xl min-h-[280px]',
  // Colored accent cards for bento grids — muted tones that work on both light and dark
  feature_card_teal:      'bg-teal-700/80 text-teal-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-teal-400/20',
  feature_card_purple:    'bg-violet-800/80 text-violet-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-violet-400/20',
  feature_card_indigo:    'bg-indigo-700/80 text-indigo-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-indigo-400/20',
  feature_card_emerald:   'bg-emerald-700/80 text-emerald-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-emerald-400/20',
  feature_card_rose:      'bg-rose-700/80 text-rose-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-rose-400/20',
  feature_card_amber:     'bg-amber-700/80 text-amber-50 rounded-2xl p-7 flex flex-col gap-3 shadow-lg border border-amber-400/20',
  pricing_card:           'bg-base-100 rounded-2xl p-8 flex flex-col gap-4 border border-base-300/50 flex-1 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200',
  pricing_card_featured:  'bg-primary text-primary-content rounded-2xl p-8 flex flex-col gap-4 shadow-2xl flex-1 ring-2 ring-primary/20 ring-offset-2 ring-offset-base-200 scale-[1.02]',
  testimonial_card:       'bg-base-100 rounded-2xl p-7 flex flex-col gap-4 border border-base-300/50 shadow-md hover:shadow-lg transition-shadow relative',
  stat_item:              'flex flex-col items-center text-center gap-2',
  logo_item:              'flex items-center justify-center opacity-40 hover:opacity-70 transition-opacity grayscale',

  // --- Marketing conversion presets ---
  faq_section:            'bg-base-100 py-16 lg:py-24 px-6',
  page_footer:            'bg-base-200 border-t border-base-300/40 py-12 lg:py-16 px-6',

  // --- App/dashboard presets ---
  app_layout:        'flex h-screen overflow-hidden',
  app_sidebar:       'w-64 shrink-0 flex flex-col bg-base-100 border-r border-base-300/50 overflow-hidden',
  app_main:          'flex-1 flex flex-col overflow-hidden min-w-0',
  app_content:       'flex-1 overflow-y-auto bg-base-200/50 p-6 space-y-6',
  app_header:        'sticky top-0 z-20 flex items-center justify-between h-16 px-6 bg-base-100 border-b border-base-300/50 shrink-0',
  app_card:          'bg-base-100 rounded-xl border border-base-300/40 shadow-sm p-5',
  app_table:         'bg-base-100 rounded-xl border border-base-300/40 shadow-sm overflow-hidden',

  // --- Layout presets ---
  split:             'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  split_2:           'grid grid-cols-1 sm:grid-cols-2 gap-4',
  split_3:           'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',

  // --- Generic section styles ---
  hero:              'bg-base-100 py-24 px-6 flex flex-col items-center text-center gap-5',
  section_light:     'bg-base-100 py-16 px-6',
  section_dark:      'bg-neutral text-neutral-content py-16 px-6 border-y border-base-content/8',
  card:              'bg-base-100 rounded-box p-6 flex flex-col gap-3',
  card_bordered:     'bg-base-100 border border-base-300/40 shadow-sm rounded-box p-6 flex flex-col gap-4',
  metric_card:       'bg-base-100 rounded-xl p-6 flex flex-col gap-1.5 border border-base-300/40 shadow-sm hover:shadow-md hover:border-base-300/60 transition-all duration-200 cursor-default',
  code_box:          'bg-base-200 rounded-box border border-base-300 p-4 font-mono text-sm',
  form:              'bg-base-100 rounded-xl border border-base-300/40 shadow-sm p-8 max-w-lg mx-auto flex flex-col gap-5',

  // --- Interaction presets ---
  app_modal:         'bg-base-100 rounded-xl border border-base-300/40 shadow-2xl p-8 max-w-md mx-auto flex flex-col gap-5 ring-1 ring-base-300/20',
  empty_state:       'bg-base-100 rounded-xl border-2 border-dashed border-base-300/30 p-12 flex flex-col items-center justify-center text-center gap-3 min-h-[180px]',
  app_list:          'bg-base-100 rounded-xl border border-base-300/40 shadow-sm overflow-hidden divide-y divide-base-300/20',

  // --- Blog presets ---
  blog_grid:         'bg-base-100 py-16 lg:py-24 px-6',
  blog_card:         'bg-base-100 rounded-2xl overflow-hidden border border-base-300/40 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col group',
  blog_article:      'bg-base-100 py-16 px-6 max-w-3xl mx-auto',
};

// Legacy BUILTIN_STYLES array -- only used as fallback when user doesn't override.
// New code should use BUILTIN_PRESET_CLASSES above.
const BUILTIN_STYLES = [];

function extractStyles(body) {
  const userStyles = [];
  for (const node of body) {
    if (node.type === NodeType.STYLE_DEF) userStyles.push(node);
  }

  // Collect all style names referenced by sections in the AST
  const referencedStyles = new Set();
  function collectRefs(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.SECTION && n.styleName) referencedStyles.add(n.styleName);
      if (n.body) collectRefs(n.body);
    }
  }
  collectRefs(body);

  // Merge: include built-ins that are referenced but not user-defined
  const userNames = new Set(userStyles.map(s => s.name));
  const merged = [];
  for (const builtin of BUILTIN_STYLES) {
    if (referencedStyles.has(builtin.name) && !userNames.has(builtin.name)) {
      merged.push(builtin);
    }
  }
  merged.push(...userStyles);
  return merged;
}

function stylesToCSS(styles, vars = {}) {
  const parts = [];
  for (const style of styles) {
    const className = `style-${sanitizeName(style.name)}`;
    // Split properties into base, hover, focus, and transition
    const baseProps = [];
    const hoverProps = [];
    const focusProps = [];
    let hasTransition = false;
    for (const p of style.properties) {
      // Skip semantic token properties — they compile to inline Tailwind, not CSS
      if (p.name === 'tailwind') continue; // passthrough: handled by resolveStyleTokens
      const tokenKey = `${p.name}:${p.value}`;
      if (Object.prototype.hasOwnProperty.call(STYLE_TOKENS, tokenKey)) continue;

      let val = p.value;
      if (typeof val === 'string' && vars[val] !== undefined) val = vars[val];
      if (p.name.startsWith('hover_')) {
        const cssProp = p.name.slice(6); // strip 'hover_'
        hoverProps.push(`  ${friendlyPropToCSS(cssProp, val)};`);
      } else if (p.name.startsWith('focus_')) {
        const cssProp = p.name.slice(6); // strip 'focus_'
        focusProps.push(`  ${friendlyPropToCSS(cssProp, val)};`);
      } else if (p.name === 'transition') {
        hasTransition = true;
        baseProps.push(`  transition: ${val};`);
      } else if (p.name === 'animate' || p.name === 'animation') {
        baseProps.push(`  animation: ${val};`);
      } else {
        baseProps.push(`  ${friendlyPropToCSS(p.name, val)};`);
      }
    }
    // Auto-add transition if hover/focus props exist but no explicit transition
    if ((hoverProps.length > 0 || focusProps.length > 0) && !hasTransition) {
      baseProps.push('  transition: all 0.2s ease;');
    }
    // Skip entirely if all properties were tokens (no raw CSS to emit)
    if (baseProps.length === 0 && hoverProps.length === 0 && focusProps.length === 0) continue;

    const lineComment = style.line ? `/* clear:${style.line} */\n` : '';
    let rule = `${lineComment}.${className} {\n${baseProps.join('\n')}\n}`;
    if (hoverProps.length > 0) {
      rule += `\n.${className}:hover {\n${hoverProps.join('\n')}\n}`;
    }
    if (focusProps.length > 0) {
      rule += `\n.${className}:focus-within {\n${focusProps.join('\n')}\n}`;
    }
    // If the style sets color, make children inherit it
    const setsColor = style.properties.some(p => p.name === 'color');
    if (setsColor) {
      rule += `\n.${className} h1, .${className} h2, .${className} p, .${className} strong,\n.${className} .clear-text, .${className} .clear-heading, .${className} .clear-subheading,\n.${className} .clear-small { color: inherit; }`;
    }
    if (style.mediaQuery) {
      const mq = SCREEN_SIZES[style.mediaQuery];
      if (mq) {
        parts.push(`${mq} {\n  ${rule.replace(/\n/g, '\n  ')}\n}`);
      } else {
        parts.push(rule);
      }
    } else {
      parts.push(rule);
    }
  }
  return parts.join('\n\n');
}

// =============================================================================
// RUNTIME & DEFAULT CSS (embedded in HTML scaffold)
// =============================================================================

// =============================================================================
// DESIGN SYSTEM — CSS custom properties + component styles
// Inspired by Linear/Vercel/Raycast aesthetic: clean, muted, professional
// =============================================================================

const CSS_RESET = `/* Clear design system v2 */
*, *::before, *::after { box-sizing: border-box; }
body { font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; margin: 0; }
.font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
.font-mono, code, pre { font-family: 'Geist Mono', monospace; }
#app { margin: 0 auto; }
::selection { background: oklch(var(--color-primary) / 0.15); }`;

const THEME_CSS = {
  midnight: `[data-theme="midnight"] {
  color-scheme: dark;
  --color-base-100: oklch(18% 0.03 255);
  --color-base-200: oklch(23% 0.03 255);
  --color-base-300: oklch(29% 0.025 255);
  --color-base-content: oklch(90% 0.02 240);
  --color-primary: oklch(64% 0.18 252);
  --color-primary-content: oklch(98% 0.005 252);
  --color-secondary: oklch(60% 0.14 190);
  --color-secondary-content: oklch(10% 0.02 190);
  --color-accent: oklch(76% 0.15 85);
  --color-accent-content: oklch(12% 0.02 85);
  --color-neutral: oklch(26% 0.025 255);
  --color-neutral-content: oklch(82% 0.02 240);
  --color-info: oklch(66% 0.14 240);
  --color-info-content: oklch(10% 0.02 240);
  --color-success: oklch(62% 0.15 155);
  --color-success-content: oklch(10% 0.02 155);
  --color-warning: oklch(76% 0.15 82);
  --color-warning-content: oklch(15% 0.02 82);
  --color-error: oklch(62% 0.22 22);
  --color-error-content: oklch(10% 0.02 22);
  --radius-box: 0.75rem; --radius-field: 0.5rem; --radius-selector: 0.375rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  ivory: `[data-theme="ivory"] {
  color-scheme: light;
  --color-base-100: oklch(100% 0 0);
  --color-base-200: oklch(94% 0.008 240);
  --color-base-300: oklch(88% 0.01 240);
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
  --radius-box: 0.625rem; --radius-field: 0.375rem; --radius-selector: 0.25rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  nova: `[data-theme="nova"] {
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
  --radius-box: 1rem; --radius-field: 0.75rem; --radius-selector: 0.5rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  arctic: `[data-theme="arctic"] {
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
  --radius-box: 0.75rem; --radius-field: 0.5rem; --radius-selector: 0.375rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  moss: `[data-theme="moss"] {
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
  --radius-box: 0.625rem; --radius-field: 0.375rem; --radius-selector: 0.25rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  ember: `[data-theme="ember"] {
  color-scheme: dark;
  --color-base-100: oklch(16% 0.025 35);
  --color-base-200: oklch(21% 0.03 35);
  --color-base-300: oklch(27% 0.025 35);
  --color-base-content: oklch(90% 0.02 60);
  --color-primary: oklch(65% 0.22 32);
  --color-primary-content: oklch(98% 0.005 32);
  --color-secondary: oklch(60% 0.18 50);
  --color-secondary-content: oklch(10% 0.02 50);
  --color-accent: oklch(72% 0.16 85);
  --color-accent-content: oklch(12% 0.02 85);
  --color-neutral: oklch(24% 0.022 35);
  --color-neutral-content: oklch(84% 0.02 55);
  --color-info: oklch(62% 0.14 240);
  --color-info-content: oklch(10% 0.02 240);
  --color-success: oklch(58% 0.14 155);
  --color-success-content: oklch(10% 0.02 155);
  --color-warning: oklch(74% 0.16 78);
  --color-warning-content: oklch(15% 0.02 78);
  --color-error: oklch(64% 0.22 22);
  --color-error-content: oklch(10% 0.02 22);
  --radius-box: 0.75rem; --radius-field: 0.5rem; --radius-selector: 0.375rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  slate: `[data-theme="slate"] {
  color-scheme: dark;
  --color-base-100: oklch(20% 0.01 240);
  --color-base-200: oklch(25% 0.01 240);
  --color-base-300: oklch(32% 0.01 240);
  --color-base-content: oklch(88% 0.012 240);
  --color-primary: oklch(56% 0.16 240);
  --color-primary-content: oklch(98% 0.005 240);
  --color-secondary: oklch(54% 0.12 180);
  --color-secondary-content: oklch(98% 0.005 180);
  --color-accent: oklch(68% 0.14 155);
  --color-accent-content: oklch(10% 0.02 155);
  --color-neutral: oklch(28% 0.01 240);
  --color-neutral-content: oklch(80% 0.01 240);
  --color-info: oklch(60% 0.14 240);
  --color-info-content: oklch(10% 0.02 240);
  --color-success: oklch(56% 0.14 155);
  --color-success-content: oklch(10% 0.02 155);
  --color-warning: oklch(72% 0.14 80);
  --color-warning-content: oklch(15% 0.02 80);
  --color-error: oklch(60% 0.2 22);
  --color-error-content: oklch(10% 0.02 22);
  --radius-box: 0.5rem; --radius-field: 0.375rem; --radius-selector: 0.25rem;
  --border: 1px; --depth: 0; --noise: 0;
}`
};

const CSS_COMPONENTS = [
  { class: 'clear-section', css: `.clear-section { padding: 1.5rem; }
.clear-section-card {
  margin-bottom: 2rem;
  background: oklch(var(--b2)); border: 1px solid oklch(var(--b3) / 0.5);
  border-radius: 0.75rem; padding: 1.5rem;
}` },
  { class: 'clear-conditional', css: '.clear-conditional { }' },
  { class: 'clear-component', css: '.clear-component { }' },
  { class: 'clear-nav-item', css: `.clear-nav-item.active { background: oklch(var(--color-base-content) / 0.1); color: oklch(var(--color-base-content)); font-weight: 500; }` },
  { class: 'clear-chat-wrap', css: `.clear-chat-wrap { display: flex; flex-direction: column; height: 100%; min-height: 400px; position: relative; border: 1px solid oklch(var(--color-base-content) / 0.15); border-radius: 1rem; overflow: hidden; background: oklch(var(--color-base-100)); }
.clear-chat-head { padding: 12px 16px; border-bottom: 1px solid oklch(var(--color-base-content) / 0.1); display: flex; align-items: center; justify-content: space-between; }
.clear-chat-title { font-size: 13px; font-weight: 600; color: oklch(var(--color-base-content) / 0.6); }
.clear-chat-new { font-size: 11px; padding: 2px 10px; border-radius: 6px; border: 1px solid oklch(var(--color-base-content) / 0.15); background: transparent; color: oklch(var(--color-base-content) / 0.5); cursor: pointer; }
.clear-chat-new:hover { background: oklch(var(--color-base-content) / 0.05); }
.clear-chat-msgs { flex: 1; overflow-y: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 14px; max-width: 768px; width: 100%; margin: 0 auto; }
.clear-chat-msg { padding: 10px 14px; border-radius: 12px; font-size: 14.5px; line-height: 1.6; max-width: 50ch; white-space: pre-wrap; word-wrap: break-word; animation: _clearMsgIn 0.2s ease; }
@keyframes _clearMsgIn { from { opacity: 0; transform: translateY(6px); } }
.clear-chat-msg.user { background: oklch(var(--color-primary)); color: oklch(var(--color-primary-content)); align-self: flex-end; border-bottom-right-radius: 4px; }
.clear-chat-msg.assistant { background: transparent; color: oklch(var(--color-base-content)); align-self: flex-start; }
.clear-chat-msg-label { font-size: 11px; opacity: 0.5; margin-bottom: 2px; }
.clear-chat-msg pre { background: oklch(var(--color-base-100)); padding: 10px 12px; border-radius: 6px; margin: 8px 0; font-size: 12px; line-height: 1.5; overflow-x: auto; border: 1px solid oklch(var(--color-base-content) / 0.1); white-space: pre-wrap; }
.clear-chat-msg code { background: oklch(var(--color-base-100)); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.clear-chat-msg pre code { background: none; padding: 0; border: none; }
.clear-chat-msg table { border-collapse: collapse; margin: 8px 0; font-size: 12px; width: 100%; }
.clear-chat-msg th, .clear-chat-msg td { border: 1px solid oklch(var(--color-base-content) / 0.15); padding: 5px 10px; text-align: left; }
.clear-chat-msg th { background: oklch(var(--color-base-200)); font-weight: 600; }
.clear-chat-typing { display: none; gap: 4px; padding: 0 20px 8px; align-self: flex-start; }
.clear-typing-dot { width: 8px; height: 8px; border-radius: 50%; background: oklch(var(--color-base-content) / 0.3); animation: _clearDot 1.4s infinite ease-in-out; }
.clear-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.clear-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes _clearDot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
.clear-chat-scroll { position: absolute; bottom: 70px; right: 20px; width: 36px; height: 36px; border-radius: 50%; border: 1px solid oklch(var(--color-base-content) / 0.15); background: oklch(var(--color-base-100)); color: oklch(var(--color-base-content) / 0.6); cursor: pointer; font-size: 16px; display: none; align-items: center; justify-content: center; box-shadow: 0 2px 8px oklch(0 0 0 / 0.1); z-index: 10; }
.clear-chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid oklch(var(--color-base-content) / 0.1); background: oklch(var(--color-base-200)); }
.clear-chat-input textarea { flex: 1; resize: none; border: 1px solid oklch(var(--color-base-content) / 0.15); border-radius: 8px; padding: 8px 12px; font-size: 14px; font-family: inherit; background: oklch(var(--color-base-100)); color: oklch(var(--color-base-content)); outline: none; }
.clear-chat-input textarea:focus { border-color: oklch(var(--color-primary) / 0.5); }
.clear-chat-send-btn { padding: 8px 16px; border-radius: 8px; border: none; background: oklch(var(--color-primary)); color: oklch(var(--color-primary-content)); font-weight: 600; font-size: 14px; cursor: pointer; }
.clear-chat-send-btn:hover { opacity: 0.9; }` },
];

// Tree-shake CSS: scan HTML for used classes, return base + used component CSS
function _buildCSS(htmlBody, customCSS, opts = {}) {
  const parts = [CSS_RESET];
  // Only include the active theme, not all 5
  const themeName = opts.theme || 'ivory';
  if (THEME_CSS[themeName]) {
    parts.push(THEME_CSS[themeName]);
  }
  for (const comp of CSS_COMPONENTS) {
    if (htmlBody.includes(comp.class) || (opts.fullWidth && comp.class === 'clear-page-landing')) {
      parts.push(comp.css);
    }
  }
  if (customCSS) parts.push(customCSS);
  return parts.join('\n\n');
}

const RUNTIME_JS = `function _clear_sum(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce(function(a, b) { return a + b; }, 0);
}
function _clear_avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return _clear_sum(arr) / arr.length;
}
function _clear_sum_field(arr, f) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce(function(a, item) { return a + Number(item[f] || 0); }, 0);
}
function _clear_avg_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return _clear_sum_field(arr, f) / arr.length;
}
function _clear_max_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return Math.max.apply(null, arr.map(function(item) { return Number(item[f] || 0); }));
}
function _clear_min_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return Math.min.apply(null, arr.map(function(item) { return Number(item[f] || 0); }));
}
function _clear_len(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'string' || Array.isArray(val)) return val.length;
  if (typeof val === 'object') return Object.keys(val).length;
  return 0;
}
function _clear_uppercase(s) { return String(s).toUpperCase(); }
function _clear_lowercase(s) { return String(s).toLowerCase(); }
function _clear_trim(s) { return String(s).trim(); }
function _clear_contains(s, q) { return String(s).includes(String(q)); }
function _clear_starts_with(s, p) { return String(s).startsWith(String(p)); }
function _clear_ends_with(s, p) { return String(s).endsWith(String(p)); }
function _clear_replace(s, f, r) { return String(s).split(String(f)).join(String(r)); }
function _clear_split(s, d) { return String(s).split(String(d)); }
function _clear_join(a, d) { return Array.isArray(a) ? a.join(d === undefined ? ', ' : String(d)) : String(a); }
function _clear_char_at(s, i) { return String(s).charAt(i); }
function _clear_substring(s, start, end) { return String(s).slice(start, end); }
function _clear_index_of(s, search) { return String(s).indexOf(String(search)); }
function _clear_is_letter(c) { return /^[a-zA-Z]$/.test(c); }
function _clear_is_digit(c) { return /^[0-9]$/.test(c); }
function _clear_char_code(c) { return String(c).charCodeAt(0); }
function _clear_format(v, f) {
  if (v === null || v === undefined) return '';
  if (f === 'dollars') return '$' + Number(v).toFixed(2);
  if (f === 'percent') return (Number(v) * 100).toFixed(1) + '%';
  return String(v);
}
async function _clear_fetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load data from ' + url + ' (status ' + r.status + ')');
  return await r.json();
}
function _clear_env(name) {
  if (typeof process !== 'undefined' && process.env) return process.env[name] || '';
  return '';
}`;

// =============================================================================
// NAME & OPERATOR MAPPING
// =============================================================================

// Convert time string like '9:00 AM' to cron expression
function _timeToCron(timeStr, intervalValue, intervalUnit) {
  const match = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?$/);
  if (!match) return '0 9 * * *'; // fallback: 9 AM daily
  let hour = parseInt(match[1]);
  const minute = match[2] ? parseInt(match[2]) : 0;
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  // For daily schedules, use * * * for day/month/dow
  return `${minute} ${hour} * * *`;
}

function sanitizeName(name) {
  if (name == null) return '_unnamed';
  // Preserve dots for property access (person.name → person.name)
  if (name.includes('.')) {
    return name.split('.').map(part => part.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1')).join('.');
  }
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

// Python needs bracket access for dotted assignment targets
function sanitizeNamePython(name) {
  if (name.includes('.')) {
    const parts = name.split('.');
    const base = parts[0].replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    const rest = parts.slice(1).map(p => `["${p}"]`).join('');
    return base + rest;
  }
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

function mapOperatorPython(op) {
  const MAP = {
    '&&': 'and',
    '||': 'or',
    '==': '==',
    '!=': '!=',
    '**': '**',
  };
  return MAP[op] || op;
}

function mapFunctionNameJS(name) {
  const MAP = {
    // Math
    sum: '_clear_sum',
    total: '_clear_sum',
    average: '_clear_avg',
    avg: '_clear_avg',
    mean: '_clear_avg',
    minimum: 'Math.min',
    min: 'Math.min',
    maximum: 'Math.max',
    max: 'Math.max',
    round: 'Math.round',
    floor: 'Math.floor',
    ceil: 'Math.ceil',
    absolute: 'Math.abs',
    abs: 'Math.abs',
    square_root: 'Math.sqrt',
    sqrt: 'Math.sqrt',
    length: '_clear_len',
    size: '_clear_len',
    count: '_clear_len',
    // Field aggregates
    _sum_field: '_clear_sum_field',
    _avg_field: '_clear_avg_field',
    _max_field: '_clear_max_field',
    _min_field: '_clear_min_field',
    // Strings
    uppercase: '_clear_uppercase',
    lowercase: '_clear_lowercase',
    trim: '_clear_trim',
    contains: '_clear_contains',
    starts_with: '_clear_starts_with',
    ends_with: '_clear_ends_with',
    replace: '_clear_replace',
    split: '_clear_split',
    join: '_clear_join',
    character: '_clear_char_at',
    // String operations
    substring: '_clear_substring',
    index_of: '_clear_index_of',
    is_letter: '_clear_is_letter',
    is_digit: '_clear_is_digit',
    char_code: '_clear_char_code',
    // Data + env
    fetch_data: '_clear_fetch',
    env: '_clear_env',
  };
  return MAP[name.toLowerCase()] || name;
}

function mapFunctionNamePython(name) {
  const MAP = {
    // Math
    sum: 'sum',
    total: 'sum',
    average: '_clear_avg',
    avg: '_clear_avg',
    mean: '_clear_avg',
    minimum: 'min',
    min: 'min',
    maximum: 'max',
    max: 'max',
    round: 'round',
    floor: 'math.floor',
    ceil: 'math.ceil',
    absolute: 'abs',
    abs: 'abs',
    square_root: 'math.sqrt',
    sqrt: 'math.sqrt',
    length: 'len',
    size: 'len',
    count: 'len',
    // Field aggregates
    _sum_field: '_clear_sum_field',
    _avg_field: '_clear_avg_field',
    _max_field: '_clear_max_field',
    _min_field: '_clear_min_field',
    // Strings
    uppercase: '_clear_uppercase',
    lowercase: '_clear_lowercase',
    trim: '_clear_trim',
    contains: '_clear_contains',
    starts_with: '_clear_starts_with',
    ends_with: '_clear_ends_with',
    replace: '_clear_replace',
    split: '_clear_split',
    join: '_clear_join',
    character: '_clear_char_at',
    // Data + env
    fetch_data: '_clear_fetch',
    env: 'os.environ.get',
  };
  return MAP[name.toLowerCase()] || name;
}
