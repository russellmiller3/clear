// playground/supervisor/open-capabilities.js
//
// Lean's "goal display" for Clear, ported to Meph.
//
// Lean's prover always shows the writer "what's left to prove." Clear today
// makes Meph re-derive that himself from raw test output every cycle. This
// module collects the three sources of "still open" work into one structured
// report that gets injected into Meph's per-turn context BEFORE he writes code:
//
//   1. TBD placeholders (from Lesson 1's `result.placeholders`)
//   2. Failing tests (from the most-recent test snapshot)
//   3. Unresolved compile errors (text-matched against INTENT_HINTS keywords)
//
// One structured list beats three separate things Meph has to reconcile, and
// keeps the per-turn prompt under 1KB even when everything is open.
//
// Pure function. No side effects. Safe to call on every /api/chat turn.

/**
 * Common Meph-trap keywords. Mirrored from the curated INTENT_HINTS table in
 * validator.js (the one Russell's data-driven friction work seeded). The keys
 * here are the ones most likely to appear inside compile-error messages —
 * Meph's most-common reaches for English words that are NOT Clear keywords.
 *
 * If validator.js's INTENT_HINTS gains a new entry, mirror the most-impactful
 * ones here. The hint surface here is a snapshot, not a live import — keeps
 * this module standalone for unit tests and for the future MCP server path.
 *
 * Each value is a one-sentence canonical-fix tip. Plain English; matches the
 * voice of Clear's other error messages.
 */
const INTENT_HINTS_SNAPSHOT = {
  find: "use `look up X with this id` for one record, or `get all X` for a list",
  fetch: "use `get all X` or `look up X with this id`",
  query: "use `get all X where ...` for filtering, or `look up X with this id`",
  lookup: "use `look up X with this id` (two words: `look up`, not `lookup`)",
  select: "use `get all X` or `get all X where ...`",
  retrieve: "use `get all X` or `look up X with this id`",
  filter: "use `get all X where condition` — `filter` isn't a Clear verb",
  list: "use `get all X` (returns a list)",
  create: "use `save X as new Y` — `create` is reserved for `create a Y table:`",
  insert: "use `save X as new Y`",
  add: "use `save X as new Y` for creating records",
  remove: "use `delete Y with this id` — `remove` isn't a Clear verb",
  destroy: "use `delete Y with this id`",
  body: "POST endpoints receive data by NAMING it in the `sends` phrase. Use `when user sends X to /api/...:` and reference X.",
  request: "POST/PUT data doesn't live at `request` — name it in the `sends` phrase.",
  incoming: "the POST body is NAMED in the `sends` phrase, not called `incoming`.",
  generate: "for AI generation, use `ask claude 'your prompt' with input_var`.",
  summarize: "use `ask claude 'summarize this: ...' with input_text`.",
  classify: "use `ask claude 'classify this into X/Y/Z' with input_text`.",
  number: "`number` is a TYPE keyword. Use the comma form: `amount, number, required`.",
  text: "`text` is a TYPE keyword. Use the comma form: `title, text, required`.",
  boolean: "`boolean` is a TYPE keyword. Use `true` or `false` for values.",
  timestamp: "`timestamp` is a TYPE keyword. Use the comma form: `created_at, timestamp`.",
};

const MAX_FAILING_TESTS = 10;       // matches buildSystemWithContext slice
const MAX_UNRESOLVED_ERRORS = 10;   // friction budget — same cap
const MAX_PLACEHOLDERS = 20;        // generous; placeholders rarely sprawl
const CONTEXT_LINE_CAP = 140;       // chars; keeps the per-turn prompt small

/**
 * Extract a bare keyword from a compile-error message and return the
 * canonical-fix hint if INTENT_HINTS_SNAPSHOT covers it. Heuristic match —
 * looks for a quoted token (single quotes or backticks) and tries it lower-case.
 *
 * @param {string} message - the original validator error string
 * @returns {string|null} the snapshot hint, or null when no keyword matches
 */
function findIntentHint(message) {
  if (!message || typeof message !== 'string') return null;
  // Try every quoted token in the message (single quotes, backticks, or
  // double quotes). Validator commonly emits `Undefined variable 'fetch'`.
  const tokens = [];
  for (const re of [/'([^']+)'/g, /`([^`]+)`/g, /"([^"]+)"/g]) {
    let m;
    while ((m = re.exec(message)) !== null) {
      tokens.push(m[1]);
    }
  }
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (INTENT_HINTS_SNAPSHOT[lower]) return INTENT_HINTS_SNAPSHOT[lower];
  }
  return null;
}

/**
 * Build the open-capabilities report for the current program.
 *
 * @param {string} source - current Clear source (used to grab line context for placeholders)
 * @param {object|null} lastTestResult - { passed, failed, failures: [{name, error, sourceLine?}] }
 * @param {object|null} lastCompileResult - { errors: [{line, message}], placeholders: [{line}] }
 * @returns {{
 *   placeholders: Array<{line:number, context:string}>,
 *   failingTests: Array<{name:string, reason:string, sourceLine?:number}>,
 *   unresolvedErrors: Array<{line:number, hint:string, severity:string}>,
 *   summary: string
 * }}
 */
export function getOpenCapabilities(source, lastTestResult, lastCompileResult) {
  const lines = typeof source === 'string' ? source.split('\n') : [];
  const compile = lastCompileResult || {};
  const test = lastTestResult || {};

  // 1. Placeholders — TBD lines from Lesson 1's result.placeholders.
  const rawPh = Array.isArray(compile.placeholders) ? compile.placeholders : [];
  const placeholders = rawPh.slice(0, MAX_PLACEHOLDERS).map((p) => {
    const lineNum = Number(p.line) || 0;
    let context = lines[lineNum - 1] || '';
    if (context.length > CONTEXT_LINE_CAP) {
      context = context.slice(0, CONTEXT_LINE_CAP) + '...';
    }
    return { line: lineNum, context: context.trim() };
  });

  // 2. Failing tests — from the most recent test snapshot.
  const rawFailures = Array.isArray(test.failures) ? test.failures : [];
  const failingTests = rawFailures.slice(0, MAX_FAILING_TESTS).map((f) => {
    const out = {
      name: String(f.name || 'unnamed test'),
      reason: String(f.error || 'failed'),
    };
    if (f.sourceLine != null) out.sourceLine = Number(f.sourceLine);
    return out;
  });

  // 3. Unresolved compile errors — surface the canonical fix when we can.
  const rawErrors = Array.isArray(compile.errors) ? compile.errors : [];
  const unresolvedErrors = rawErrors.slice(0, MAX_UNRESOLVED_ERRORS).map((e) => {
    const intentHint = findIntentHint(e.message);
    return {
      line: Number(e.line) || 0,
      hint: intentHint || String(e.message || 'compile error'),
      severity: 'error',
    };
  });

  // Summary heuristic — pick ONE most-impactful focus.
  // Errors block compilation entirely → highest priority.
  // Failing tests come next — structure compiles, behavior is wrong.
  // Placeholders are last — explicit "fill me in" markers.
  const summary = buildSummary(unresolvedErrors, failingTests, placeholders);

  return { placeholders, failingTests, unresolvedErrors, summary };
}

/**
 * Build the one-line summary that headlines the report. Format:
 *   "{n} stubs to fill, {m} test(s) red, {k} compile error(s) — focus on {focal item}"
 *
 * Picks the focal item by priority: error > failing test > placeholder. When
 * everything is empty, says so cleanly.
 */
function buildSummary(errors, failingTests, placeholders) {
  const e = errors.length;
  const t = failingTests.length;
  const p = placeholders.length;

  if (e === 0 && t === 0 && p === 0) {
    return '0 stubs, 0 failing tests, 0 compile errors — nothing open.';
  }

  const head = `${p} stub${p === 1 ? '' : 's'} to fill, ${t} test${t === 1 ? '' : 's'} red, ${e} compile error${e === 1 ? '' : 's'}`;

  let focus = '';
  if (e > 0) {
    focus = ` — focus on the compile error on line ${errors[0].line}`;
  } else if (t > 0) {
    const f = failingTests[0];
    const at = f.sourceLine ? ` (line ${f.sourceLine})` : '';
    focus = ` — focus on the failing test "${truncate(f.name, 60)}"${at}`;
  } else if (p > 0) {
    focus = ` — focus on the stub on line ${placeholders[0].line}`;
  }

  return head + focus + '.';
}

function truncate(s, max) {
  if (typeof s !== 'string') return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Format an open-capabilities report for injection into Meph's system context.
 * Compact markdown — placeholders + failing tests + unresolved errors as
 * indented bullets. Returns the empty string when nothing is open AND there's
 * been no compile yet (so we don't pollute first-message context).
 *
 * @param {object} report - the result of getOpenCapabilities()
 * @returns {string} markdown block (empty when nothing is open)
 */
export function formatReportForMeph(report) {
  if (!report) return '';
  const { placeholders, failingTests, unresolvedErrors, summary } = report;
  const total = placeholders.length + failingTests.length + unresolvedErrors.length;

  // Headline summary always present (even with 0 open) — keeps the prompt
  // shape stable so prompt-cache stays hot.
  const lines = [];
  lines.push('## Open capabilities for the current program');
  lines.push('');
  lines.push(summary);

  if (total === 0) {
    return lines.join('\n') + '\n';
  }

  if (unresolvedErrors.length > 0) {
    lines.push('');
    lines.push('### Compile errors (block everything)');
    for (const e of unresolvedErrors) {
      lines.push(`- line ${e.line}: ${truncate(e.hint, 200)}`);
    }
  }

  if (failingTests.length > 0) {
    lines.push('');
    lines.push('### Failing tests');
    for (const f of failingTests) {
      const at = f.sourceLine ? ` (line ${f.sourceLine})` : '';
      lines.push(`- ${truncate(f.name, 80)}${at}: ${truncate(f.reason, 140)}`);
    }
  }

  if (placeholders.length > 0) {
    lines.push('');
    lines.push('### Stubs to fill (TBD placeholders)');
    for (const p of placeholders) {
      const ctx = p.context ? `: \`${truncate(p.context, 80)}\`` : '';
      lines.push(`- line ${p.line}${ctx}`);
    }
  }

  lines.push('');
  lines.push('Tackle compile errors first — nothing else runs until they clear. Then close failing tests, then fill the stubs.');

  return lines.join('\n') + '\n';
}
