#!/usr/bin/env node
// scripts/audit-bundle.mjs
//
// Gathers everything an external auditor needs to verify the proof claims
// of a Clear app — math verdicts AND measured runtime witness rejections —
// and emits one JSON bundle on stdout. The PDF writer (`audit-pdf.py`)
// consumes that JSON and lays out the auditor-facing document.
//
// What the bundle contains, per named rule:
//   - The prover's math verdict (proved / disproved / unverifiable)
//   - The reason text the prover attached (often "structurally enforced
//     because the runtime guard rejects any input that fails the
//     condition before control reaches the next line")
//   - For PROVED rules whose guard shape we can auto-violate: 20 sample
//     inputs that VIOLATE the rule, the actual HTTP rejection responses
//     measured against a freshly-compiled spawned server, and a witness
//     summary ("we sent N violating inputs; M came back as 403 with the
//     rule name in the response — the math claim is corroborated")
//   - For PROVED rules whose shape we can't auto-violate: a note that
//     witness automation is pending for that shape (the math claim still
//     stands; only the measured corroboration is unavailable)
//
// Usage:
//   node scripts/audit-bundle.mjs apps/deal-desk/main.clear > /tmp/bundle.json
//   node scripts/audit-bundle.mjs apps/deal-desk/main.clear --pretty
//
// The bundle's shape is documented in the Python writer; both ends agree
// via this single source of truth.

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { spawn } from 'child_process';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

import { compileProgram } from '../index.js';
import { prove } from '../lib/prover/index.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = resolve(dirname(__filename), '..');

// ---- Bootstrap clear-runtime so the spawned app can require helpers ----
// Same logic as lib/prover/runtime-witness.test.js — clear-runtime/ at repo
// root is gitignored, so we may need to restore the two files we depend on.
function ensureClearRuntime() {
  const dir = join(REPO_ROOT, 'clear-runtime');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) writeFileSync(pkgPath, '{\n  "type": "commonjs"\n}\n');
  const dbPath = join(dir, 'db.js');
  if (!existsSync(dbPath)) copyFileSync(join(REPO_ROOT, 'runtime', 'db.js'), dbPath);
}

// ---- Auto-generate violating inputs from a rule's guard expression ----
//
// Returns null when the rule's shape is one we can't auto-violate yet
// (e.g. cross-record constraints, regex, set membership). Returns an
// array of 20 input objects when we can.
//
// Shapes we recognize:
//   1. <entity>'s <field> is less than N           → field >= N
//   2. <entity>'s <field> is greater than N        → field <= N
//   3. <entity>'s <field> is at least N            → field < N
//   4. <entity>'s <field> is at most N             → field > N
//   5. <entity>'s <field> is equal to V            → field != V
//   6. <entity>'s <field> is not equal to V        → field == V
//   7. <entity>'s <field> is not ''                → field == ''
//   8. <entity>'s <field> is not nothing           → field == null
//   9. <entity>'s <fieldA> is less than            → fieldA >= fieldB
//      <entity>'s <fieldB>
function autoViolatingInputs(ruleNode) {
  const body = Array.isArray(ruleNode.body) ? ruleNode.body : [];
  const guard = body.find(s => s && s.type === 'guard');
  if (!guard) return null;
  const expr = guard.expression;
  if (!expr || expr.type !== 'binary_op') return null;

  const op = expr.operator;
  const left = expr.left;
  const right = expr.right;

  // Need at least one side to be a member_access on an entity.
  // Two-field comparison case (single-entity, two fields).
  if (
    left && left.type === 'member_access' && right && right.type === 'member_access' &&
    left.object && right.object && left.object.name === right.object.name
  ) {
    const entity = left.object.name;
    const fieldA = left.member;
    const fieldB = right.member;
    return Array.from({ length: 20 }, (_, i) => ({
      [fieldA]: 100 + i,
      [fieldB]: 50,
    }));
  }

  // Single-field comparison case.
  if (left && left.type === 'member_access' && right && right.type === 'literal_number') {
    const field = left.member;
    const N = right.value;
    if (op === '<')  return Array.from({ length: 20 }, (_, i) => ({ [field]: N + i }));
    if (op === '<=') return Array.from({ length: 20 }, (_, i) => ({ [field]: N + 1 + i }));
    if (op === '>')  return Array.from({ length: 20 }, (_, i) => ({ [field]: N - i }));
    if (op === '>=') return Array.from({ length: 20 }, (_, i) => ({ [field]: N - 1 - i }));
    if (op === '==' || op === 'is') return Array.from({ length: 20 }, (_, i) => ({ [field]: N + 1 + i }));
    if (op === '!=' || op === 'is not') return Array.from({ length: 20 }, (_, i) => ({ [field]: N }));
  }

  if (left && left.type === 'member_access' && right && right.type === 'literal_string') {
    const field = left.member;
    const V = right.value;
    if (op === '!=' || op === 'is not') return Array.from({ length: 20 }, (_, i) => ({ [field]: V }));
    if (op === '==' || op === 'is')     return Array.from({ length: 20 }, (_, i) => ({ [field]: V + '_other_' + i }));
  }

  if (left && left.type === 'member_access' && right && right.type === 'literal_nothing') {
    const field = left.member;
    if (op === '!=' || op === 'is not') return Array.from({ length: 20 }, () => ({ [field]: null }));
  }

  return null;
}

// ---- Find a free TCP port the OS isn't using ----
function findFreePort() {
  return new Promise((resolveP, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolveP(port));
    });
  });
}

// ---- Spawn the compiled server, wait for "Server running on port N" ----
async function startCompiledServer(serverJS, port) {
  const tempPath = join(REPO_ROOT, `_audit-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.cjs`);
  writeFileSync(tempPath, serverJS, 'utf8');
  const proc = spawn(process.execPath, [tempPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'audit' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdoutBuf = '';
  let stderrBuf = '';
  proc.stdout.on('data', d => { stdoutBuf += d.toString(); });
  proc.stderr.on('data', d => { stderrBuf += d.toString(); });
  const ready = await new Promise((res) => {
    const timer = setTimeout(() => res({ ok: false, reason: 'timeout' }), 5000);
    const check = () => {
      if (stdoutBuf.includes(`Server running on port ${port}`)) {
        clearTimeout(timer);
        res({ ok: true });
      }
    };
    proc.stdout.on('data', check);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      res({ ok: false, reason: `process exited with code ${code}`, stdout: stdoutBuf, stderr: stderrBuf });
    });
    check();
  });
  const cleanup = () => {
    try { proc.kill('SIGTERM'); } catch {}
    try { unlinkSync(tempPath); } catch {}
  };
  if (!ready.ok) {
    cleanup();
    throw new Error(`spawned server failed to boot: ${ready.reason}\nstdout: ${ready.stdout || stdoutBuf}\nstderr: ${ready.stderr || stderrBuf}`);
  }
  return { cleanup, port };
}

// ---- Find the first POST endpoint that mentions the rule (best guess for route) ----
function findRouteForRule(ast, ruleName) {
  for (const node of ast.body) {
    if (node && node.type === 'endpoint' && node.method === 'POST' && Array.isArray(node.body)) {
      const inside = JSON.stringify(node.body).includes(ruleName);
      if (inside) return node.path;
    }
  }
  return null;
}

// ---- Collect "safe defaults" — values for every field mentioned in any
// rule's guard, chosen so the rule passes. When testing rule X, we send
// safe defaults for OTHER rules' fields so only X trips. Without this,
// the first rule in source order eats every malformed input and rules
// further down never get exercised. ----
function collectSafeDefaults(ast) {
  const defaults = {};
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      if (n.type === 'rule_def' && Array.isArray(n.body)) {
        for (const stmt of n.body) {
          if (stmt && stmt.type === 'guard' && stmt.expression) {
            collectFromExpr(stmt.expression, defaults);
          }
        }
      }
      if (Array.isArray(n.body)) walk(n.body);
    }
  }
  function collectFromExpr(expr, out) {
    if (!expr || expr.type !== 'binary_op') return;
    const op = expr.operator;
    const left = expr.left;
    const right = expr.right;
    if (left && left.type === 'member_access' && right && right.type === 'literal_number') {
      const field = left.member;
      const N = right.value;
      // Pick a value that PASSES the guard (so this rule doesn't fire).
      if (op === '<')  out[field] = N - 1;
      if (op === '<=') out[field] = N;
      if (op === '>')  out[field] = N + 1;
      if (op === '>=') out[field] = N;
      if (op === '==' || op === 'is') out[field] = N;
      if (op === '!=' || op === 'is not') out[field] = N + 1;
    }
    if (left && left.type === 'member_access' && right && right.type === 'literal_string') {
      const field = left.member;
      const V = right.value;
      if (op === '!=' || op === 'is not') out[field] = V + '_safe';
      if (op === '==' || op === 'is')     out[field] = V;
    }
    if (left && left.type === 'member_access' && right && right.type === 'literal_nothing') {
      const field = left.member;
      if (op === '!=' || op === 'is not') out[field] = 'safe-value';
    }
    // Two-field comparison case — pick safe values for both
    if (
      left && left.type === 'member_access' && right && right.type === 'member_access' &&
      left.object && right.object && left.object.name === right.object.name
    ) {
      const fA = left.member;
      const fB = right.member;
      if (op === '<')  { out[fA] = 10; out[fB] = 100; }
      if (op === '>')  { out[fA] = 100; out[fB] = 10; }
    }
  }
  walk(ast.body);
  return defaults;
}

// ---- Extract the compiled rejection code for a guard at a given source line.
//
// The compiler emits `// clear:N` source-map markers before each statement,
// so we can find the compiled JS line that came from any source line.
// The rejection itself looks like:
//
//     // rule: <name> (line <ruleDefLine>)
//     // clear:<guardLine>
//     if (!(<cond>)) { return res.status(403).json({ error: "<msg>", rule: "<name>" }); }
//
// Strategy: scan the compiled JS line by line; for every `if (!` statement
// that carries `rule: "<name>"` in its 403 body, walk backwards to the most
// recent `// clear:N` marker to learn which source line it came from.
// Match on (ruleName, sourceLine) and return the JS code + JS line number.
//
// Returns null when no match is found (rare — usually only for tautology
// rules whose guard simplifies away in compilation, in which case there
// is no runtime check to show).
function extractCompiledCheck(serverJS, ruleName, sourceLine) {
  if (!serverJS || !ruleName) return null;
  const lines = serverJS.split('\n');
  // Build a quick reverse index: for each line index, what `// clear:N`
  // marker came most recently before it. One linear pass.
  const traceFor = new Array(lines.length).fill(null);
  let lastTrace = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\/\/\s*clear:(\d+)/);
    if (m) lastTrace = parseInt(m[1], 10);
    traceFor[i] = lastTrace;
  }
  const ruleNeedle = `rule: "${ruleName}"`;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.includes(ruleNeedle)) continue;
    if (!/^\s*if\s*\(!/.test(ln)) continue;
    const trace = traceFor[i];
    // Match if the source-line tag matches OR if no source line was
    // requested (return first matching check for the rule).
    if (sourceLine == null || trace === sourceLine) {
      return {
        sourceLine: trace,
        codeLine: i + 1,
        code: ln.trim(),
      };
    }
  }
  return null;
}

// ---- Pull the original Clear source text for a given line (1-indexed). ----
function sourceLineText(source, lineNum) {
  if (!source || !lineNum || lineNum < 1) return null;
  const all = source.split('\n');
  const idx = lineNum - 1;
  if (idx >= all.length) return null;
  return all[idx];
}

// ---- Translate a witness-spawn error into auditor-safe plain English. ----
//
// The compiled-app spawn can fail in several ways — a missing npm module,
// a port collision, a syntax error in the emit, a slow boot. The raw
// `err.message` carries node stack traces and require-stack details that
// belong in a developer log, not in the auditor's PDF. This function
// pattern-matches the common failure shapes and returns a one-line
// human-readable explanation. The math claim still stands; only the
// runtime corroboration is missing, and the audit reader needs to know
// that without parsing a 30-line stack trace.
function sanitizeWitnessError(rawMessage) {
  const msg = String(rawMessage || '');
  if (!msg) return 'runtime witness was not gathered';
  if (/MODULE_NOT_FOUND|Cannot find module/i.test(msg)) {
    const m = msg.match(/Cannot find module '([^']+)'/);
    const dep = m ? m[1] : 'a runtime dependency';
    return `runtime witness skipped: the compiled application needs \`${dep}\` installed to boot. The math proof still stands; install dependencies and re-run the audit for runtime corroboration.`;
  }
  if (/EADDRINUSE|address already in use/i.test(msg)) {
    return 'runtime witness skipped: no free port was available to spawn the compiled application. Re-run in a moment.';
  }
  if (/SyntaxError|Unexpected token|Unexpected identifier/i.test(msg)) {
    return 'runtime witness skipped: the compiled JavaScript did not parse. The math proof still stands; this points at a compiler emit issue worth reporting.';
  }
  if (/timeout/i.test(msg)) {
    return 'runtime witness skipped: the compiled application did not finish booting in time. Re-run, possibly with a larger timeout.';
  }
  if (/process exited with code/i.test(msg)) {
    return 'runtime witness skipped: the compiled application exited before it was ready. The math proof still stands; check that all runtime dependencies are installed.';
  }
  // Generic fallback — keep the first line only, truncate hard.
  const firstLine = msg.split(/\n|\r/)[0].slice(0, 240);
  return `runtime witness skipped: ${firstLine}`;
}

// ---- Find the rule_def AST node by name (recursive walk) ----
function findRuleNode(nodes, name) {
  if (!Array.isArray(nodes)) return null;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    if (n.type === 'rule_def' && n.name === name) return n;
    if (Array.isArray(n.body))    { const r = findRuleNode(n.body, name); if (r) return r; }
    if (Array.isArray(n.actions)) { const r = findRuleNode(n.actions, name); if (r) return r; }
    if (Array.isArray(n.cards))   { const r = findRuleNode(n.cards, name); if (r) return r; }
    if (Array.isArray(n.then))    { const r = findRuleNode(n.then, name); if (r) return r; }
    if (Array.isArray(n.otherwise)) { const r = findRuleNode(n.otherwise, name); if (r) return r; }
  }
  return null;
}

// ---- Gather witness data for one rule ----
async function gatherWitnessFor(rule, ast, source) {
  // The proof bundle's rule entry doesn't carry the body — we have to find
  // the AST rule_def node by name to walk its guard expression.
  const ruleNode = findRuleNode(ast.body, rule.name);
  if (!ruleNode) {
    return {
      automated: false,
      reason: `couldn't locate rule_def AST node for '${rule.name}' — auto-witness needs the original guard shape`,
    };
  }
  const inputs = autoViolatingInputs(ruleNode);
  if (!inputs) {
    return {
      automated: false,
      reason: 'rule shape not yet supported by the auto-violator (cross-record, regex, set membership, computed expressions)',
    };
  }
  const route = findRouteForRule(ast, rule.name);
  if (!route) {
    return {
      automated: false,
      reason: 'rule does not appear to be inside a POST endpoint; auto-witness needs an HTTP entry point',
    };
  }
  const compiled = compileProgram(source);
  if (compiled.errors && compiled.errors.length) {
    return {
      automated: false,
      reason: 'source did not compile cleanly — auto-witness needs a building app',
    };
  }
  // Pick the backend output. For full-stack apps (page + endpoints), the
  // `javascript` field is the FRONTEND — running it directly fails because
  // it tries to touch `document`. The backend Express server lives in
  // `serverJS`. For backend-only apps the `javascript` field IS the server.
  const serverJS = compiled.serverJS || compiled.javascript;
  if (!serverJS) {
    return {
      automated: false,
      reason: 'no backend server output found — auto-witness needs a server to spawn',
    };
  }
  const port = await findFreePort();
  const server = await startCompiledServer(serverJS, port);
  // Build safe-defaults from ALL rules in the file, then strip out the
  // fields the violating input controls — that way OTHER rules pass and
  // only the target rule trips. Without this, rules ordered earlier in
  // source eat every malformed input and rules ordered later never trip.
  const safeDefaults = collectSafeDefaults(ast);
  const samples = [];
  let rejected = 0;
  let ruleNameInBody = 0;
  try {
    for (let i = 0; i < inputs.length; i++) {
      const violating = inputs[i];
      const merged = { ...safeDefaults, ...violating };
      const r = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      let body;
      try { body = await r.json(); } catch { body = null; }
      const isReject = r.status === 403 || r.status === 400;
      const hasRule = body && body.rule === rule.name;
      if (isReject) rejected++;
      if (hasRule) ruleNameInBody++;
      if (i < 5) {
        samples.push({ input: merged, status: r.status, body });
      }
    }
  } finally {
    server.cleanup();
  }
  return {
    automated: true,
    route,
    inputs_sent: inputs.length,
    rejected,
    rule_name_in_body: ruleNameInBody,
    samples,
  };
}

// ---- Main ----
async function main() {
  const args = process.argv.slice(2);
  const pretty = args.includes('--pretty');
  const filePath = args.find(a => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: node scripts/audit-bundle.mjs <file.clear> [--pretty]');
    process.exit(2);
  }
  ensureClearRuntime();
  const source = readFileSync(filePath, 'utf8');
  const proofBundle = await prove(source);
  const compiled = compileProgram(source);
  const ast = compiled.ast;
  const serverJS = compiled.serverJS || compiled.javascript || '';

  const rules = [];
  for (const rule of (proofBundle.rules || [])) {
    // Forward the structured enforcement tags from the prover and
    // enrich each one with (a) the original Clear source line text and
    // (b) the compiled JS rejection block that came from that line.
    // The PDF writer renders human-readable paragraphs based on
    // `kind`, then quotes both the source line and the compiled JS so
    // an auditor can see the runtime check with their own eyes.
    const enforcement = (rule.enforcement || []).map(tag => {
      const sourceLine = sourceLineText(source, tag.line);
      const compiledCheck = extractCompiledCheck(serverJS, rule.name, tag.line);
      return {
        ...tag,
        sourceLine: sourceLine,
        compiledCheck: compiledCheck,
      };
    });
    const entry = {
      name: rule.name,
      line: rule.line,
      verdict: rule.verdict,
      reason: rule.reason || null,
      entity: rule.entity || null,
      enforcement,
    };
    if (rule.verdict === 'proved') {
      try {
        entry.witness = await gatherWitnessFor(rule, ast, source);
      } catch (err) {
        // Translate the raw spawn error into a one-line auditor-safe
        // message. Without this, missing-dependency stack traces leak
        // straight into the PDF.
        entry.witness = {
          automated: false,
          reason: sanitizeWitnessError(err.message),
        };
      }
    } else {
      entry.witness = null;
    }
    rules.push(entry);
  }

  const out = {
    file: filePath,
    file_basename: basename(filePath),
    generated_at: new Date().toISOString(),
    proof_status: proofBundle.status,
    proof_summary: proofBundle.summary,
    rule_counts: proofBundle.ruleCounts || { proved: 0, disproved: 0, unverifiable: 0, total: 0 },
    rules,
    test_counts: proofBundle.counts || null,
  };

  process.stdout.write(JSON.stringify(out, null, pretty ? 2 : 0));
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error('audit-bundle failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
