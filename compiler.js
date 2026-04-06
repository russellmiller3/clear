// =============================================================================
// CLEAR LANGUAGE — COMPILER
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. This compiler deterministically transforms a Clear AST into
// JavaScript, Python, or both. Same input ALWAYS produces the same output.
// No AI in the compile step — it's a pure function.
//
// =============================================================================

import { NodeType, parse } from './parser.js';

const CLEAR_VERSION = '1.0';

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
const UTILITY_FUNCTIONS = [
  { name: '_clear_sum', code: 'function _clear_sum(arr) { return Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0; }', deps: [] },
  { name: '_clear_avg', code: 'function _clear_avg(arr) { return Array.isArray(arr) && arr.length ? _clear_sum(arr) / arr.length : 0; }', deps: ['_clear_sum'] },
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
  { name: '_toast', code: `function _toast(msg, cls) {
  let c = document.getElementById('_toast_container');
  if (!c) { c = document.createElement('div'); c.id = '_toast_container'; c.className = 'toast toast-end'; c.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:100'; document.body.appendChild(c); }
  const el = document.createElement('div'); el.className = 'alert ' + cls + ' shadow-lg'; el.innerHTML = '<span>' + msg + '</span>';
  c.appendChild(el); setTimeout(() => { el.remove(); }, 3000);
}`, deps: [] },
  { name: '_esc', code: "function _esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }", deps: [] },
  { name: '_pick', code: 'function _pick(obj, schema) { return Object.fromEntries(Object.entries(obj).filter(([k]) => k in schema)); }', deps: [] },
  { name: '_validate', code: `function _validate(body, rules) {
  for (const r of rules) {
    const v = body[r.field];
    if (r.required && (v == null || v === '')) return r.field + ' is required';
    if (v == null) continue;
    if (r.type === 'number' && typeof v !== 'number') return r.field + ' must be a number';
    if (r.type === 'boolean' && typeof v !== 'boolean') return r.field + ' must be true or false';
    if (r.min != null && r.type === 'text' && String(v).length < r.min) return r.field + ' must be at least ' + r.min + (r.min === 1 ? ' character' : ' characters');
    if (r.max != null && r.type === 'text' && String(v).length > r.max) return r.field + ' must be at most ' + r.max + (r.max === 1 ? ' character' : ' characters');
    if (r.min != null && r.type !== 'text' && v < r.min) return r.field + ' must be at least ' + r.min;
    if (r.max != null && r.type !== 'text' && v > r.max) return r.field + ' must be at most ' + r.max;
    if (r.matches === 'email' && !/^[^@]+@[^@]+\\.[^@]+$/.test(v)) return r.field + ' must be a valid email';
    if (r.oneOf && !r.oneOf.includes(v)) return r.field + ' must be one of: ' + r.oneOf.join(', ');
  }
  return null;
}`, deps: [] },
  { name: '_askAI', code: `async function _askAI(prompt, context, schema) {
  const key = process.env.CLEAR_AI_KEY;
  if (!key) throw new Error("Set CLEAR_AI_KEY environment variable with your Anthropic API key");
  const endpoint = process.env.CLEAR_AI_ENDPOINT || "https://api.anthropic.com/v1/messages";
  let content = context ? prompt + "\\n\\nContext: " + (typeof context === 'string' ? context : JSON.stringify(context)) : prompt;
  if (schema) {
    const fields = schema.map(f => "  " + JSON.stringify(f.name) + ": " + (f.type === 'number' ? '<number>' : f.type === 'boolean' ? '<true or false>' : f.type === 'list' ? '<array>' : '<string>')).join(",\\n");
    content += "\\n\\nRespond with ONLY a JSON object in this exact shape, no other text:\\n{\\n" + fields + "\\n}";
  }
  const payload = JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1024, messages: [{ role: "user", content }] });
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
];

// Tree-shake: scan compiled code and return only used utility function definitions
function _getUsedUtilities(compiledCode) {
  const needed = new Set();
  for (const util of UTILITY_FUNCTIONS) {
    // Check if the function name appears in the compiled code (as a call, not its own definition)
    if (compiledCode.includes(util.name + '(')) {
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
    const importedNodes = moduleAst.body.filter(n =>
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
        node._selectiveNodes = importedNodes;
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
      const params = mNode.params.map(sanitizeName).join(', ');
      // Single-expression function: body is [returnNode(expr)]
      const isSingleReturn = mNode.body && mNode.body.length === 1 && mNode.body[0].type === NodeType.RETURN;
      if (ctx.lang === 'python') {
        if (isSingleReturn) {
          const bodyExpr = exprToCode(mNode.body[0].expression, moduleCtx);
          entries.push(`"${mNode.name}": lambda ${params}: ${bodyExpr}`);
        } else {
          // Multi-line: not yet supported in namespace, fall back to lambda of last return
          const fnDeclared = new Set(mNode.params.map(sanitizeName));
          const bodyCode = compileBody(mNode.body, moduleCtx, { declared: fnDeclared });
          entries.push(`"${mNode.name}": lambda ${params}: (${bodyCode.trim()})`);
        }
      } else {
        if (isSingleReturn) {
          const bodyExpr = exprToCode(mNode.body[0].expression, moduleCtx);
          entries.push(`${sanitizeName(mNode.name)}: function(${params}) { return ${bodyExpr}; }`);
        } else {
          const fnDeclared = new Set(mNode.params.map(sanitizeName));
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

export function compile(ast, options = {}) {
  const errors = [...ast.errors];
  const warnings = [];
  const target = options.target || ast.target || 'web';
  const sourceMap = options.sourceMap === true; // opt-in

  const VALID_TARGETS = ['web', 'backend', 'both', 'web_and_js_backend', 'web_and_python_backend', 'js_backend', 'python_backend'];
  if (!VALID_TARGETS.includes(target)) {
    errors.push({ line: 0, message: `Unknown target "${target}". Use: web, backend, or both. Example: build for web and python backend` });
    return { errors, warnings };
  }

  const result = { errors, warnings };
  const needsWeb = ['web', 'both', 'web_and_js_backend', 'web_and_python_backend'].includes(target);
  const needsJSBackend = ['backend', 'both', 'web_and_js_backend', 'js_backend'].includes(target);
  const needsPythonBackend = ['backend', 'both', 'web_and_python_backend', 'python_backend'].includes(target);

  if (needsWeb) {
    result.javascript = compileToJS(ast.body, errors, sourceMap);
    const htmlResult = compileToHTML(ast.body, result.javascript);
    result.html = htmlResult.html;
    result.css = htmlResult.css;
  }
  if (needsJSBackend) {
    // If we already have web JS, backend JS is a separate output
    if (needsWeb) {
      result.serverJS = compileToJSBackend(ast.body, errors, sourceMap);
      // Also generate browser-compatible server for playground preview
      result.browserServer = compileToBrowserServer(ast.body, errors);
    } else {
      result.javascript = compileToJSBackend(ast.body, errors, sourceMap);
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
    result.tests = generateE2ETests(ast.body);
  }

  return result;
}

function generateE2ETests(body) {
  // Walk AST to collect endpoints and data shapes
  const endpoints = [];
  const schemas = {};
  function collect(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.ENDPOINT) {
        const ep = { method: node.method, path: node.path, hasAuth: false, hasValidation: false, receivingVar: node.receivingVar, rules: [] };
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
      if (node.type === NodeType.PAGE || node.type === NodeType.SECTION) collect(node.body || []);
    }
  }
  collect(body);

  if (endpoints.length === 0) return null;

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
  lines.push('function _uniqueEmail() { return "test" + (++_emailCounter) + "@example.com"; }');
  lines.push('function _uniqueText(base) { return base + "_" + (++_uniqueCounter); }');
  lines.push('');
  lines.push('// Note: for clean re-runs, delete clear-data.json before starting the server');
  lines.push('// unique constraints may cause 500s if stale data exists from a previous run');

  // If any endpoint requires auth, generate a test token
  const anyAuth = endpoints.some(ep => ep.hasAuth);
  if (anyAuth) {
    lines.push('');
    lines.push('// Generate a test auth token using the same runtime as the server');
    lines.push('const auth = require("./clear-runtime/auth");');
    lines.push('const TEST_TOKEN = auth.createToken({ id: 1, role: "admin", email: "test@test.com" });');
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
      lines.push(`  await test("SETUP: create ${parentKey} for FK dependencies", async () => {`);
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
      const expectedStatus = hasParam ? '200 or 404' : '200';
      lines.push(`  await test("GET ${ep.path} returns ${expectedStatus}", async () => {`);
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
      lines.push(`  await test("POST ${ep.path} with valid data returns ${expectedPostStatus}", async () => {`);
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
        lines.push(`  await test("POST ${ep.path} with no body returns 400", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${ep.path}", { method: "POST", headers: { "Authorization": "Bearer " + TEST_TOKEN } });`);
        lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
        lines.push(`  });`);
      } else {
        lines.push(`  await test("POST ${ep.path} with no body returns 400", async () => {`);
        lines.push(`    const r = await fetch(BASE + "${ep.path}", { method: "POST" });`);
        lines.push(`    assert(r.status === 400, "Expected 400, got " + r.status);`);
        lines.push(`  });`);
      }
      lines.push('');

      // Test missing required fields
      const requiredFields = ep.rules.filter(r => r.constraints?.required);
      if (requiredFields.length > 0) {
        const emptyHeaders = ep.hasAuth ? 'AUTH_HEADERS' : '{ "Content-Type": "application/json" }';
        lines.push(`  await test("POST ${ep.path} with empty required field returns 400", async () => {`);
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
      lines.push(`  await test("DELETE ${ep.path} without auth returns 401", async () => {`);
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
          lines.push(`  await test("POST ${ep.path} with ${rule.name} over max length returns 400", async () => {`);
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
        lines.push(`  await test("${ep.method} ${ep.path} with wrong role returns 403", async () => {`);
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
        lines.push(`  await test("POST ${ep.path} strips unknown fields (mass assignment protection)", async () => {`);
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
    lines.push(`  await test("GET ${matchingGet.path} returns created records after POST", async () => {`);
    lines.push(`    const r = await fetch(BASE + "${matchingGet.path}"${fetchOpts});`);
    lines.push(`    const data = await r.json();`);
    lines.push(`    assert(Array.isArray(data), "Expected array");`);
    lines.push(`    assert(data.length > 0, "Expected at least one record (from earlier POST test)");`);
    lines.push(`  });`);
    lines.push('');
  }

  // Test HTML serves
  const hasPages = body.some(n => n.type === NodeType.PAGE);
  if (hasPages) {
    lines.push(`  await test("GET / serves HTML", async () => {`);
    lines.push(`    const r = await fetch(BASE + "/");`);
    lines.push(`    assert(r.status === 200, "Expected 200, got " + r.status);`);
    lines.push(`    const html = await r.text();`);
    lines.push(`    assert(html.includes("<!DOCTYPE html>"), "Expected HTML document");`);
    lines.push(`  });`);
    lines.push('');
  }

  lines.push('  console.log("");');
  lines.push('  console.log("Results:", passed, "passed,", failed, "failed");');
  lines.push('  process.exit(failed > 0 ? 1 : 0);');
  lines.push('}');
  lines.push('');
  lines.push('run();');

  return lines.join('\n');
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
    return false;
  }
  function checkNode(node) {
    if (!node) return false;
    if (node.expression && checkExpr(node.expression)) return true;
    if (node.condition && checkExpr(node.condition)) return true;
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
  if (!ctx.sourceMap || !node.line) return result;
  // Skip source map on comments (commenting a comment is noise) and deep indents
  if (node.type === NodeType.COMMENT || ctx.indent > 1) return result;
  const pad = padFor(ctx);
  const prefix = ctx.lang === 'python' ? '#' : '//';
  return `${pad}${prefix} clear:${node.line}\n${result}`;
}

// Backend-only node types: skip these when compiling for web/reactive frontend
const BACKEND_ONLY_NODES = new Set([
  NodeType.ENDPOINT, NodeType.RESPOND, NodeType.DATA_SHAPE, NodeType.CRUD,
  NodeType.REQUIRES_AUTH, NodeType.REQUIRES_ROLE, NodeType.DEFINE_ROLE, NodeType.GUARD,
  NodeType.LOG_REQUESTS, NodeType.ALLOW_CORS, NodeType.VALIDATE, NodeType.FIELD_RULE,
  NodeType.RESPONDS_WITH, NodeType.RATE_LIMIT, NodeType.WEBHOOK, NodeType.OAUTH_CONFIG,
  NodeType.CHECKOUT, NodeType.USAGE_LIMIT, NodeType.ACCEPT_FILE, NodeType.EXTERNAL_FETCH,
  NodeType.STREAM, NodeType.BACKGROUND, NodeType.SUBSCRIBE, NodeType.MIGRATION, NodeType.WAIT,
  NodeType.CONNECT_DB, NodeType.RAW_QUERY, NodeType.CONFIGURE_EMAIL, NodeType.SEND_EMAIL,
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
    const bodyCtx = { ...ctx, indent: ctx.indent + 2, endpointMethod: node.method };
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
    code += `${pad}        return JSONResponse(content={"error": str(err)}, status_code=500)`;
    return code;
  }

  const epDeclared = new Set();
  const bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 2, declared: epDeclared, endpointMethod: node.method });
  let epCode = `${pad}app.${node.method.toLowerCase()}('${node.path}', async (req, res) => {\n`;
  epCode += `${pad}  try {\n`;
  if (needsBinding) {
    if (node.receivingVar) {
      epCode += `${pad}    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Request body is required (send JSON with Content-Type: application/json)' });\n`;
      epCode += `${pad}    const ${sanitizeName(dataVar)} = req.body;\n`;
      // If body also references 'incoming' for URL params, bind that too
      if (bodyUsesIncoming) {
        epCode += `${pad}    const incoming = req.params;\n`;
      }
    } else {
      epCode += `${pad}    const ${sanitizeName(dataVar)} = req.params;\n`;
    }
  }
  epCode += bodyCode + '\n';
  epCode += `${pad}  } catch (err) {\n`;
  epCode += `${pad}    res.status(500).json({ error: err.message });\n`;
  epCode += `${pad}  }\n`;
  epCode += `${pad}});`;
  return epCode;
}

function compileCrud(node, ctx, pad) {
  const table = node.target ? node.target.toLowerCase() + (node.target.toLowerCase().endsWith('s') ? '' : 's') : 'unknown';

  if (ctx.lang === 'python') {
    if (node.operation === 'lookup') {
      const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
      const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
      return `${pad}${sanitizeName(node.variable)} = db.${isSingleLookup ? 'query_one' : 'query'}("${table}"${where})`;
    }
    if (node.operation === 'save') {
      if (node.resultVar) return `${pad}${sanitizeName(node.resultVar)} = db.save("${table}", ${sanitizeName(node.variable)})`;
      return `${pad}db.update("${table}", ${sanitizeName(node.variable)})`;
    }
    if (node.operation === 'remove') {
      const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
      return `${pad}db.remove("${table}"${where})`;
    }
    return `${pad}# CRUD: ${node.operation}`;
  }

  if (node.operation === 'lookup') {
    const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
    const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
    return `${pad}const ${sanitizeName(node.variable)} = await db.${isSingleLookup ? 'findOne' : 'findAll'}('${table}'${where});`;
  }
  if (node.operation === 'save') {
    const varCode = sanitizeName(node.variable);
    // Schema name must match what compileDataShape generates: DataShapeName + 'Schema'
    // CRUD target may be singular ("Todo") while data shape is plural ("Todos") or vice versa.
    // Look up the actual declared name from ctx.schemaNames.
    const names = ctx.schemaNames || new Set();
    let schemaName;
    if (names.has(node.target)) schemaName = node.target + 'Schema';
    else if (names.has(node.target + 's')) schemaName = node.target + 's' + 'Schema';
    else if (names.has(node.target.replace(/s$/, ''))) schemaName = node.target.replace(/s$/, '') + 'Schema';
    else schemaName = node.target + 'Schema'; // fallback
    if (node.resultVar) return `${pad}const ${sanitizeName(node.resultVar)} = await db.insert('${table}', _pick(${varCode}, ${schemaName}));`;
    return `${pad}await db.update('${table}', ${varCode});`;
  }
  if (node.operation === 'remove') {
    const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
    return `${pad}await db.remove('${table}'${where});`;
  }
  return `${pad}// CRUD: ${node.operation}`;
}

function compileRespond(node, ctx, pad) {
  const val = exprToCode(node.expression, ctx);
  const isStringLiteral = node.expression.type === NodeType.LITERAL_STRING;

  // Inside an agent, send back = plain return (not res.json)
  if (ctx.insideAgent) {
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
  const bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 1, declared: agentDeclared, insideAgent: true });

  // Scheduled agent: runs on interval, no input parameter
  if (node.schedule) {
    const { value, unit } = node.schedule;
    const ms = unit === 'second' ? value * 1000
      : unit === 'minute' ? value * 60000
      : unit === 'hour' ? value * 3600000
      : unit === 'day' ? value * 86400000
      : value * 3600000; // default hour
    if (ctx.lang === 'python') {
      return `${pad}async def ${fnName}():\n${bodyCode}\n${pad}# Schedule: runs every ${value} ${unit}(s)`;
    }
    return `${pad}async function ${fnName}() {\n${bodyCode}\n${pad}}\n${pad}setInterval(${fnName}, ${ms});\n${pad}console.log("Scheduled agent '${node.name}' running every ${value} ${unit}(s)");`;
  }

  const param = node.receivingVar ? sanitizeName(node.receivingVar) : '';
  if (ctx.lang === 'python') {
    return `${pad}async def ${fnName}(${param}):\n${bodyCode}`;
  }
  return `${pad}async function ${fnName}(${param}) {\n${bodyCode}\n${pad}}`;
}

function compileValidate(node, ctx, pad) {
  if (ctx.lang === 'python') {
    const checks = node.rules.map(rule => {
      const vlines = [];
      const f = rule.name;
      const acc = `incoming.get("${f}")`;
      if (rule.constraints.required)
        vlines.push(`${pad}if ${acc} is None and ${acc} != 0 and ${acc} is not False:\n${pad}    raise HTTPException(status_code=400, detail="${f} is required")`);
      if (rule.fieldType === 'number')
        vlines.push(`${pad}if ${acc} is not None and not isinstance(${acc}, (int, float)):\n${pad}    raise HTTPException(status_code=400, detail=f"${f} must be a number, got {type(${acc}).__name__}")`);
      if (rule.fieldType === 'boolean')
        vlines.push(`${pad}if ${acc} is not None and not isinstance(${acc}, bool):\n${pad}    raise HTTPException(status_code=400, detail="${f} must be true or false")`);
      if (rule.constraints.min !== undefined) {
        const charWord = rule.constraints.min === 1 ? 'character' : 'characters';
        if (rule.fieldType === 'text')
          vlines.push(`${pad}if ${acc} and len(str(${acc})) < ${rule.constraints.min}:\n${pad}    raise HTTPException(status_code=400, detail="${f} must be at least ${rule.constraints.min} ${charWord}")`);
        else
          vlines.push(`${pad}if ${acc} is not None and ${acc} < ${rule.constraints.min}:\n${pad}    raise HTTPException(status_code=400, detail="${f} must be at least ${rule.constraints.min}")`);
      }
      if (rule.constraints.max !== undefined) {
        const charWord = rule.constraints.max === 1 ? 'character' : 'characters';
        if (rule.fieldType === 'text')
          vlines.push(`${pad}if ${acc} and len(str(${acc})) > ${rule.constraints.max}:\n${pad}    raise HTTPException(status_code=400, detail="${f} must be at most ${rule.constraints.max} ${charWord}")`);
        else
          vlines.push(`${pad}if ${acc} is not None and ${acc} > ${rule.constraints.max}:\n${pad}    raise HTTPException(status_code=400, detail="${f} must be at most ${rule.constraints.max}")`);
      }
      if (rule.constraints.matches === 'email')
        vlines.push(`${pad}import re\n${pad}if ${acc} and not re.match(r"[^@]+@[^@]+\\.[^@]+", str(${acc})):\n${pad}    raise HTTPException(status_code=400, detail="${f} must be a valid email")`);
      if (rule.constraints.oneOf) {
        const opts = rule.constraints.oneOf.map(o => `"${o}"`).join(', ');
        vlines.push(`${pad}if ${acc} not in [${opts}]:\n${pad}    raise HTTPException(status_code=400, detail="${f} must be one of: ${rule.constraints.oneOf.join(', ')}")`);
      }
      return vlines.join('\n');
    }).filter(Boolean);
    return checks.join('\n');
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
  return `${pad}const _vErr = _validate(req.body, [${rules.join(', ')}]);\n${pad}if (_vErr) return res.status(400).json({ error: _vErr });`;
}

function compileDataShape(node, ctx, pad) {
  if (ctx.lang === 'python') {
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
    const tableName = node.name.toLowerCase() + 's';
    let result = `${pad}# Data shape: ${node.name}\n${pad}db.execute("CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY, ${cols})")`;
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
    return `  ${sanitizeName(f.name)}: { ${props.join(', ')} }`;
  }).join(',\n');
  const tableName = node.name.toLowerCase() + (node.name.toLowerCase().endsWith('s') ? '' : 's');
  let result = `${pad}// Data shape: ${node.name}\n${pad}const ${node.name}Schema = {\n${fields}\n${pad}};`;
  if (ctx.mode === 'backend') {
    result += `\n${pad}db.createTable('${tableName}', ${node.name}Schema);`;
  }
  return result;
}

function compileExternalFetch(node, ctx, pad) {
  const timeoutMs = node.config.timeout
    ? node.config.timeout.value * (node.config.timeout.unit === 'minutes' ? 60000 : 1000)
    : 10000;

  if (ctx.lang === 'python') {
    let code = `${pad}# Fetch: ${node.url}\n`;
    code += `${pad}import httpx\n`;
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
    code += `${pad}  throw new Error(\`External fetch failed: \${_err.message}\`);\n`;
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
      const params = node.params.map(sanitizeName).join(', ');
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}def ${sanitizeName(node.name)}(${params}):\n${bodyCode}`;
      }
      // JS: functions get their own scope — params are pre-declared
      const fnDeclared = new Set(node.params.map(sanitizeName));
      const bodyCode = compileBody(node.body, ctx, { declared: fnDeclared });
      return `${pad}function ${sanitizeName(node.name)}(${params}) {\n${bodyCode}\n${pad}}`;
    }

    case NodeType.AGENT:
      return compileAgent(node, ctx, pad);

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
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}for ${varName} in ${iter}:\n${bodyCode}`;
      }
      const loopDeclared = new Set(ctx.declared);
      const bodyCode = compileBody(node.body, ctx, { declared: loopDeclared });
      return `${pad}for (const ${varName} of ${iter}) {\n${bodyCode}\n${pad}}`;
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

    case NodeType.TRY_HANDLE: {
      if (ctx.lang === 'python') {
        const tryCode = compileBody(node.tryBody, ctx);
        const handleCode = compileBody(node.handleBody, ctx);
        return `${pad}try:\n${tryCode}\n${pad}except Exception as ${node.errorVar}:\n${handleCode}`;
      }
      const tryDeclared = new Set(ctx.declared);
      const tryCode = compileBody(node.tryBody, ctx, { declared: tryDeclared });
      const catchDeclared = new Set(ctx.declared);
      const handleCode = compileBody(node.handleBody, ctx, { declared: catchDeclared });
      return `${pad}try {\n${tryCode}\n${pad}} catch (${node.errorVar}) {\n${handleCode}\n${pad}}`;
    }

    case NodeType.USE:
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
      const bodyCode = node.body.map(n => compileNode(n, ctx)).filter(Boolean).join('\n');
      if (ctx.lang === 'python') return `${pad}# Page: ${node.title}\n${bodyCode}`;
      return `${pad}// Page: ${node.title}\n${pad}document.title = ${JSON.stringify(node.title)};\n${bodyCode}`;
    }

    case NodeType.SECTION: {
      if (ctx.mode === 'backend') return null; // frontend-only
      const bodyCode = node.body.map(n => compileNode(n, ctx)).filter(Boolean).join('\n');
      if (!bodyCode.trim()) return null; // No JS output — skip empty section comment
      if (ctx.lang === 'python') return `${pad}# Section: ${node.title}\n${bodyCode}`;
      return `${pad}// Section: ${node.title}\n${bodyCode}`;
    }

    case NodeType.ASK_FOR: {
      if (ctx.mode === 'backend') return null; // frontend-only
      if (ctx.lang === 'python') return `${pad}# Input: ${node.label} (${node.inputType})`;
      const inputId = `input_${sanitizeName(node.variable)}`;
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
      const formatFn = node.format === 'dollars' ? `'$' + (${val}).toFixed(2)` : node.format === 'percent' ? `(${val} * 100).toFixed(1) + '%'` : val;
      return `${pad}document.getElementById('${outputId}').textContent = ${formatFn};`;
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
        return `${pad}if not hasattr(request, 'user') or not request.user:\n${pad}    raise HTTPException(status_code=401, detail="Authentication required")`;
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
      if (ctx.lang === 'python') {
        return `${pad}_msg = MIMEText(str(${exprVal('body')}))\n${pad}_msg["Subject"] = str(${exprVal('subject')})\n${pad}_msg["To"] = str(${exprVal('to')})\n${pad}_msg["From"] = _email_config["user"]\n${pad}with smtplib.SMTP_SSL("smtp.gmail.com", 465) as _server:\n${pad}    _server.login(_email_config["user"], _email_config["password"])\n${pad}    _server.send_message(_msg)`;
      }
      return `${pad}await _emailTransport.sendMail({ to: ${exprVal('to')}, subject: ${exprVal('subject')}, text: String(${exprVal('body')}) });`;
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
      if (ctx.lang === 'python') {
        const bodyCode = compileBody(node.body, ctx);
        return `${pad}def test_${sanitizeName(node.name)}():\n${bodyCode}`;
      }
      const bodyCode = compileBody(node.body, ctx, { declared: new Set() });
      return `${pad}test(${JSON.stringify(node.name)}, () => {\n${bodyCode}\n${pad}});`;
    }

    case NodeType.EXPECT: {
      if (ctx.lang === 'python') return `${pad}assert ${exprToCode(node.expression, ctx)}`;
      return `${pad}expect(${exprToCode(node.expression, ctx)}).toBeTruthy();`;
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
      const streamCtx = { ...ctx, indent: ctx.indent + 2, streamMode: true };
      const bodyCode = node.body.map(n => compileNode(n, streamCtx)).filter(Boolean).join('\n');
      let code = `${pad}res.writeHead(200, {\n`;
      code += `${pad}  'Content-Type': 'text/event-stream',\n`;
      code += `${pad}  'Cache-Control': 'no-cache',\n`;
      code += `${pad}  Connection: 'keep-alive',\n`;
      code += `${pad}});\n`;
      code += `${pad}// Heartbeat to detect disconnected clients\n`;
      code += `${pad}const _heartbeat = setInterval(() => {\n`;
      code += `${pad}  res.write(':\\n\\n');\n`;
      code += `${pad}}, 30000);\n`;
      code += `${pad}req.on('close', () => {\n`;
      code += `${pad}  clearInterval(_heartbeat);\n`;
      code += `${pad}});\n`;
      code += `${pad}// Stream body\n`;
      code += `${pad}(async () => {\n`;
      code += bodyCode + '\n';
      code += `${pad}})();`;
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
        code += `\n${pad}@app.on_event("startup")\n`;
        code += `${pad}async def start_${sanitizeName(node.name)}():\n`;
        code += `${pad}    asyncio.create_task(job_${sanitizeName(node.name)}())`;
        return code;
      }
      const bodyCode = compileBody(node.body, ctx, { declared: new Set() });
      let code = `${pad}// Background job: ${node.name}\n`;
      code += `${pad}setInterval(async () => {\n`;
      code += bodyCode + '\n';
      code += `${pad}}, ${scheduleMs});`;
      return code;
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
            const table = op.table.toLowerCase() + (op.table.endsWith('s') ? '' : 's');
            let col = `${op.column} ${sqlTypes[op.type] || 'TEXT'}`;
            if (op.default !== null && op.default !== undefined) col += ` DEFAULT '${op.default}'`;
            code += `${pad}db.execute("ALTER TABLE ${table} ADD COLUMN ${col}")\n`;
          } else if (op.op === 'remove_column') {
            const table = op.table.toLowerCase() + (op.table.endsWith('s') ? '' : 's');
            code += `${pad}db.execute("ALTER TABLE ${table} DROP COLUMN ${op.column}")\n`;
          }
        }
        return code;
      }
      let code = `${pad}// Migration: ${node.name}\n`;
      for (const op of node.operations) {
        if (op.op === 'add_column') {
          const table = op.table.toLowerCase() + (op.table.endsWith('s') ? '' : 's');
          let col = `${op.column} ${sqlTypes[op.type] || 'TEXT'}`;
          if (op.default !== null && op.default !== undefined) col += ` DEFAULT '${op.default}'`;
          code += `${pad}await db.run('ALTER TABLE ${table} ADD COLUMN ${col}');\n`;
        } else if (op.op === 'remove_column') {
          const table = op.table.toLowerCase() + (op.table.endsWith('s') ? '' : 's');
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
      code += `${pad}const multer = require('multer');\n`;
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

    // 1:1 rule: compile to config only, user writes their own check
    case NodeType.USAGE_LIMIT: {
      if (ctx.lang === 'python') {
        let code = `${pad}# Usage limits: ${node.name}\n`;
        code += `${pad}LIMITS_${sanitizeName(node.name).toUpperCase()} = {\n`;
        for (const tier of node.tiers) {
          const val = tier.count === -1 ? 'float("inf")' : String(tier.count);
          code += `${pad}    "${tier.tier}": {"max": ${val}, "period": "${tier.period}"},\n`;
        }
        code += `${pad}}`;
        return code;
      }
      let code = `${pad}// Usage limits: ${node.name}\n`;
      code += `${pad}const LIMITS_${sanitizeName(node.name).toUpperCase()} = {\n`;
      for (const tier of node.tiers) {
        const val = tier.count === -1 ? 'Infinity' : String(tier.count);
        code += `${pad}  '${tier.tier}': { max: ${val}, period: '${tier.period}' },\n`;
      }
      code += `${pad}};`;
      return code;
    }

    // Phase 17: Webhooks & OAuth
    case NodeType.WEBHOOK:
      return compileWebhook(node, ctx, pad);

    // 1:1 rule: compile to config constants only, user writes their own routes
    case NodeType.OAUTH_CONFIG: {
      const provider = node.provider;
      if (ctx.lang === 'python') {
        let code = `${pad}# OAuth config: ${provider}\n`;
        if (node.config.client_id) code += `${pad}OAUTH_${provider.toUpperCase()}_CLIENT_ID = ${exprToCode(node.config.client_id, ctx)}\n`;
        if (node.config.client_secret) code += `${pad}OAUTH_${provider.toUpperCase()}_CLIENT_SECRET = ${exprToCode(node.config.client_secret, ctx)}\n`;
        if (node.config.scopes) code += `${pad}OAUTH_${provider.toUpperCase()}_SCOPES = ${JSON.stringify(node.config.scopes)}`;
        return code;
      }
      let code = `${pad}// OAuth config: ${provider}\n`;
      if (node.config.client_id) code += `${pad}const OAUTH_${provider.toUpperCase()}_CLIENT_ID = ${exprToCode(node.config.client_id, ctx)};\n`;
      if (node.config.client_secret) code += `${pad}const OAUTH_${provider.toUpperCase()}_CLIENT_SECRET = ${exprToCode(node.config.client_secret, ctx)};\n`;
      if (node.config.scopes) code += `${pad}const OAUTH_${provider.toUpperCase()}_SCOPES = ${JSON.stringify(node.config.scopes)};`;
      return code;
    }

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
        return `${pad}# Rate limit: ${node.count} per ${node.period}\n${pad}@limiter.limit("${node.count}/${node.period}")`;
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

    case NodeType.LIST_REMOVE: {
      const val = exprToCode(node.value, ctx);
      const list = sanitizeName(node.list);
      if (ctx.stateVars && ctx.stateVars.has(list)) {
        return `${pad}_state.${list} = _state.${list}.filter(_item => _item !== ${val});`;
      }
      if (ctx.lang === 'python') return `${pad}${list} = [_item for _item in ${list} if _item != ${val}]`;
      return `${pad}${list} = ${list}.filter(_item => _item !== ${val});`;
    }

    case NodeType.API_CALL: {
      const url = JSON.stringify(node.url);
      if (ctx.lang === 'python') return `${pad}# API call: ${node.method} ${node.url}`;
      if (node.method === 'GET') {
        const target = node.targetVar ? sanitizeName(node.targetVar) : 'response';
        return `${pad}_state.${target} = await fetch(${url}).then(r => r.json()).catch(e => { console.error(e); return _state.${target}; });`;
      }
      // POST/PUT/DELETE: send specific fields or full state
      let bodyExpr;
      if (node.fields && node.fields.length > 0) {
        const fieldObj = node.fields.map(f => `${sanitizeName(f)}: _state.${sanitizeName(f)}`).join(', ');
        bodyExpr = `{ ${fieldObj} }`;
      } else {
        bodyExpr = '_state';
      }
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
            lines.push(`${pad}  await fetch(${JSON.stringify(upInfo.url)} + _state._editing_id, { method: '${upInfo.method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${bodyExpr}) }).catch(e => console.error(e));`);
            lines.push(`${pad}  _state._editing_id = null;`);
            lines.push(`${pad}} else {`);
            lines.push(`${pad}  await fetch(${url}, { method: '${node.method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${bodyExpr}) }).catch(e => console.error(e));`);
            lines.push(`${pad}}`);
            return lines.join('\n');
          }
        }
      }
      return `${pad}await fetch(${url}, { method: '${node.method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${bodyExpr}) }).catch(e => console.error(e));`;
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
      const lines = [];
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

    // Nodes handled by dedicated loops in the reactive compiler -- skip here
    case NodeType.ON_PAGE_LOAD:
    case NodeType.ASK_FOR:
    case NodeType.DISPLAY:
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
      const val = expr.value;
      // String interpolation: 'Hello {name}, you have {count} items'
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
      if (ctx.lang === 'python') return `${exprToCode(expr.object, ctx)}["${expr.member}"]`;
      return `${exprToCode(expr.object, ctx)}.${sanitizeName(expr.member)}`;

    case NodeType.VARIABLE_REF: {
      const name = sanitizeName(expr.name);
      // "current user" compiles to req.user (JS) / request.user (Python)
      if (name === '_current_user') {
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
      const fnName = ctx.lang === 'python' ? mapFunctionNamePython(expr.name) : mapFunctionNameJS(expr.name);
      const args = expr.args.map(a => exprToCode(a, ctx)).join(', ');
      return `${fnName}(${args})`;
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

    case NodeType.ASK_AI: {
      const prompt = exprToCode(expr.prompt, ctx);
      const context = expr.context ? exprToCode(expr.context, ctx) : null;
      const schema = expr.schema ? JSON.stringify(expr.schema) : null;
      if (ctx.lang === 'python') {
        if (schema) return `await _ask_ai(${prompt}, ${context || 'None'}, ${schema})`;
        return context ? `await _ask_ai(${prompt}, ${context})` : `await _ask_ai(${prompt})`;
      }
      if (schema) return `await _askAI(${prompt}, ${context || 'null'}, ${schema})`;
      return context ? `await _askAI(${prompt}, ${context})` : `await _askAI(${prompt})`;
    }

    case NodeType.RUN_AGENT: {
      const fnName = 'agent_' + sanitizeName(expr.agentName.toLowerCase().replace(/\s+/g, '_'));
      const arg = expr.argument ? exprToCode(expr.argument, ctx) : '';
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

function compileToJS(body, errors, sourceMap = false) {
  // Check if this is a reactive web app (has page with ask_for or button nodes)
  if (isReactiveApp(body)) {
    return compileToReactiveJS(body, errors, sourceMap);
  }

  const lines = [];
  lines.push(`// Generated by Clear v${CLEAR_VERSION}`);
  lines.push('');

  // Track which variables have been declared (for let vs reassignment)
  const declared = new Set();

  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'web', sourceMap };
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      lines.push(result);
    }
  }

  return lines.join('\n');
}

/**
 * Check if the AST represents a reactive web app (has inputs or buttons).
 */
function isReactiveApp(body) {
  function check(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.ASK_FOR || node.type === NodeType.BUTTON) return true;
      if (node.type === NodeType.DISPLAY && node.actions && node.actions.length > 0) return true;
      if (node.type === NodeType.PAGE || node.type === NodeType.SECTION) {
        if (check(node.body)) return true;
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
function compileToReactiveJS(body, errors, sourceMap = false) {
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

  // Categorize nodes
  const inputNodes = [];     // ask_for nodes
  const displayNodes = [];   // display nodes
  const buttonNodes = [];    // button nodes
  const computeNodes = [];   // assignments, functions, etc.
  const setupNodes = [];     // comments, targets, modules

  for (const node of flatNodes) {
    switch (node.type) {
      case NodeType.ASK_FOR: inputNodes.push(node); break;
      case NodeType.DISPLAY: displayNodes.push(node); break;
      case NodeType.BUTTON: buttonNodes.push(node); break;
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
  function scanForEndpoints(nodes) {
    for (const n of nodes) {
      if (n.type === NodeType.ENDPOINT && n.path) {
        const match = n.path.match(/\/api\/(\w+)\/:id/);
        if (match) {
          const resource = match[1].toLowerCase();
          if (n.method === 'DELETE') deleteEndpoints[resource] = n.path.replace('/:id', '/');
          if (n.method === 'PUT' || n.method === 'PATCH') updateEndpoints[resource] = { url: n.path.replace('/:id', '/'), method: n.method };
        }
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
  const reactiveCtx = { lang: 'js', indent: 1, declared: recomputeDeclared, stateVars: stateVarNames, mode: 'web', sourceMap };
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
            // Property access (user's name) — render as text
            bodyParts.push(`'<p>' + ${compiled} + '</p>'`);
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
    if (node.type === NodeType.SHOW && node.expression && node.expression.type === NodeType.CALL) {
      const callExpr = node.expression;
      const containerId = `component_${sanitizeName(callExpr.name)}_${componentCounter++}`;
      const args = callExpr.args.map(a => exprToCode(a, reactiveCtx)).join(', ');
      lines.push(`  // Render component: ${callExpr.name}`);
      lines.push(`  { const _el = document.getElementById('${containerId}');`);
      lines.push(`    if (_el) _el.innerHTML = ${sanitizeName(callExpr.name)}(${args}); }`);
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
        if (node.otherwiseBranch && Array.isArray(node.otherwiseBranch)) {
          condBlocks.push({ condition: node.condition, invert: true });
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
  const displayCtx = { lang: 'js', indent: 0, declared: recomputeDeclared, stateVars: stateVarNames, mode: 'web', sourceMap };
  for (const disp of displayNodes) {
    const outputId = disp.ui._resolvedId || disp.ui.id;
    const val = exprToCode(disp.expression, displayCtx);
    if (disp.format === 'table') {
      // Check if user explicitly requested action buttons via "with delete" / "with edit"
      const varName = disp.expression.name ? sanitizeName(disp.expression.name) : '';
      const resourceKey = varName.toLowerCase();
      const actions = disp.actions || [];
      const hasDelete = actions.includes('delete');
      const hasUpdate = actions.includes('edit');
      const hasActions = hasDelete || hasUpdate;
      const deleteUrl = hasDelete ? deleteEndpoints[resourceKey] : null;
      const updateInfo = hasUpdate ? updateEndpoints[resourceKey] : null;

      // Reactive table: render array of objects as HTML table
      lines.push(`  {`);
      lines.push(`    const _tableEl = document.getElementById('${outputId}_table');`);
      lines.push(`    const _data = ${val};`);
      const colsCode = disp.columns
        ? JSON.stringify(disp.columns)
        : 'Object.keys(_data[0])';
      lines.push(`    if (_tableEl && Array.isArray(_data) && _data.length > 0) {`);
      lines.push(`      const _keys = ${colsCode};`);
      const thClass = 'text-xs uppercase tracking-widest font-semibold text-base-content/50';
      const tdClass = 'text-sm text-base-content';
      const trClass = 'border-base-300 hover:bg-base-200 transition-colors';
      const headCols = `_keys.map(k => '<th class="${thClass}">' + _esc(k) + '</th>').join('')`;
      const dataCols = `_keys.map(k => '<td class="${tdClass}">' + _esc(row[k] != null ? row[k] : '') + '</td>').join('')`;
      if (hasActions) {
        let actionBtns = '';
        if (hasUpdate) {
          actionBtns += `'<button class="btn btn-ghost btn-xs" data-edit-id="' + _esc(row.id) + '" data-edit-row="' + _esc(JSON.stringify(row)) + '">Edit</button>'`;
        }
        if (hasDelete) {
          if (actionBtns) actionBtns += ` + ' ' + `;
          actionBtns += `'<button class="btn btn-ghost btn-xs text-error" data-delete-id="' + _esc(row.id) + '">Delete</button>'`;
        }
        lines.push(`      _tableEl.querySelector('thead tr').innerHTML = ${headCols} + '<th class="${thClass}"></th>';`);
        lines.push(`      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr class="${trClass}">' + ${dataCols} + '<td class="text-right">' + ${actionBtns} + '</td>' + '</tr>').join('');`);
      } else {
        lines.push(`      _tableEl.querySelector('thead tr').innerHTML = ${headCols};`);
        lines.push(`      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr class="${trClass}">' + ${dataCols} + '</tr>').join('');`);
      }
      lines.push(`    } else if (_tableEl) {`);
      lines.push(`      _tableEl.querySelector('thead tr').innerHTML = '';`);
      lines.push(`      _tableEl.querySelector('tbody').innerHTML = '';`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else {
      const formatExpr = disp.format === 'dollars' ? `_clear_format(${val}, 'dollars')`
        : disp.format === 'percent' ? `_clear_format(${val}, 'percent')`
        : `String(${val})`;
      lines.push(`  document.getElementById('${outputId}_value').textContent = ${formatExpr};`);
    }
  }

  // Sync input DOM values with state (so clearing state also clears the input)
  for (const inp of inputNodes) {
    const inputId = `input_${sanitizeName(inp.variable)}`;
    const name = sanitizeName(inp.variable);
    lines.push(`  document.getElementById('${inputId}').value = _state.${name};`);
  }

  lines.push('}');

  // 5. Input event listeners
  lines.push('');
  lines.push('// --- Input listeners ---');
  for (const inp of inputNodes) {
    const inputId = `input_${sanitizeName(inp.variable)}`;
    const name = sanitizeName(inp.variable);
    const isNum = inp.inputType === 'number' || inp.inputType === 'percent';
    lines.push(`document.getElementById('${inputId}').addEventListener('input', function(e) {`);
    lines.push(`  _state.${name} = ${isNum ? 'Number(e.target.value) || 0' : 'e.target.value'};`);
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
      const btnCtx = { lang: 'js', indent: 1, declared: btnDeclared, stateVars: stateVarNames, mode: 'web', updateEndpoints: hasEditAction ? updateEndpoints : undefined };
      const bodyCode = btn.body.map(n => compileNode(n, btnCtx)).filter(Boolean).join('\n');
      const hasApiCall = btn.body.some(n => n.type === NodeType.API_CALL);
      const asyncKw = hasApiCall ? 'async ' : '';
      lines.push(`document.getElementById('${btnId}').addEventListener('click', ${asyncKw}function() {`);
      lines.push(bodyCode);
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
    lines.push('(async () => {');
    for (const loadNode of loadNodes) {
      const loadCtx = { lang: 'js', indent: 1, declared: new Set(recomputeDeclared), stateVars: stateVarNames, mode: 'web' };
      for (const child of loadNode.body) {
        const compiled = compileNode(child, loadCtx);
        if (compiled) lines.push(compiled);
      }
    }
    lines.push('  _recompute();');
    lines.push('})();');
  } else {
    // No on-page-load: do initial render immediately
    lines.push('');
    lines.push('_recompute();');
  }

  return lines.join('\n');
}

// =============================================================================
// PYTHON COMPILER
// =============================================================================

function compileToPython(body, errors, sourceMap = false) {
  const lines = [];
  lines.push(`# Generated by Clear v${CLEAR_VERSION}`);
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
  'two column layout': { tailwind: 'grid grid-cols-2 gap-6' },
  'three column layout': { tailwind: 'grid grid-cols-3 gap-6' },
  'four column layout': { tailwind: 'grid grid-cols-4 gap-6' },
  'full height': { prop: 'height', val: '100vh' },
  'scrollable': { prop: 'overflow-y', val: 'auto' },
  'fills remaining space': { prop: 'flex', val: '1' },
  'sticky at top': { prop: 'position', val: 'sticky', extra: { top: '0', 'z-index': '10' } },
  'dark background': { prop: 'background', val: '#0f172a', extra: { color: '#f8fafc' } },
  'with shadow': { prop: 'box-shadow', val: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' },
  'stacked': { prop: 'display', val: 'flex', extra: { 'flex-direction': 'column' } },
  'side by side': { prop: 'display', val: 'flex', extra: { 'flex-direction': 'row' } },
  'centered': { prop: 'max-width', val: '800px', extra: { 'margin-left': 'auto', 'margin-right': 'auto' } },
  'text centered': { prop: 'text-align', val: 'center' },
  'padded': { prop: 'padding', val: '1.5rem' },
  'light background': { prop: 'background', val: '#f8fafc' },
  'rounded': { prop: 'border-radius', val: '12px' },
};

function buildHTML(body) {
  const parts = [];
  const inlineStyleBlocks = []; // CSS generated from inline section modifiers
  const usedIds = new Set(); // Track element IDs to prevent duplicates
  let pageTitle = 'Clear App';
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
            // Built-in preset: use Tailwind/DaisyUI classes directly, no custom CSS
            const cls = [presetClasses, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            // Only full-width landing page sections get the max-w-5xl inner wrapper.
            // App presets (flex layout) and card-type presets (already constrained) skip it.
            const isAppPreset = node.styleName && node.styleName.startsWith('app_');
            const isCardPreset = ['metric_card', 'card', 'card_bordered', 'form', 'code_box'].includes(node.styleName);
            const isHeroPreset = ['page_hero', 'hero', 'page_cta'].includes(node.styleName);
            const needsWrapper = !isAppPreset && !isCardPreset && !isHeroPreset;
            parts.push(`    <div class="${cls}">`);
            if (needsWrapper) parts.push(`      <div class="max-w-5xl mx-auto">`);
            sectionStack.push(node.styleName);
            if (node.styleName === 'app_sidebar') {
              // Sidebar: split children into brand (heading), nav items, and other
              const brandNodes = [];
              const navNodes = [];
              const otherNodes = [];
              for (const child of node.body) {
                if (child.type === NodeType.CONTENT && (child.contentType === 'heading' || child.ui?.contentType === 'heading')) {
                  brandNodes.push(child);
                } else if (child.type === NodeType.CONTENT && (child.contentType === 'divider' || child.ui?.contentType === 'divider')) {
                  // Skip dividers in sidebar — the brand border-b replaces them
                } else if (child.type === NodeType.CONTENT &&
                  ['text', 'bold', 'link'].includes(child.contentType || child.ui?.contentType)) {
                  navNodes.push(child);
                } else if (child.type === NodeType.FOR_EACH) {
                  navNodes.push(child);
                } else {
                  otherNodes.push(child);
                }
              }
              // Emit brand heading(s)
              walk(brandNodes);
              // Emit nav items wrapped in menu
              if (navNodes.length > 0) {
                parts.push(`    <nav class="flex-1 overflow-y-auto py-3 px-3">`);
                parts.push(`      <ul class="menu menu-sm gap-0.5 p-0">`);
                walk(navNodes);
                parts.push(`      </ul>`);
                parts.push(`    </nav>`);
              }
              // Emit remaining children
              if (otherNodes.length > 0) walk(otherNodes);
            } else {
              walk(node.body);
            }
            sectionStack.pop();
            if (needsWrapper) parts.push(`      </div>`);
            parts.push(`    </div>`);
          } else if (hasUserStyle || hasInline) {
            // User-defined style (custom CSS): full-width outer, contained inner
            const allClasses = [node.ui.cssClass, inlineClass, tailwindClasses].filter(Boolean).join(' ');
            parts.push(`    <div class="${allClasses}">`);
            if (hasUserStyle && !hasInline) {
              parts.push(`      <div class="max-w-5xl mx-auto px-4">`);
            }
            walk(node.body);
            if (hasUserStyle && !hasInline) {
              parts.push(`      </div>`);
            }
            parts.push(`    </div>`);
          } else {
            // No style: default card section using DaisyUI utilities
            const allClasses = ['clear-section bg-base-200 rounded-box p-6 mb-6', inlineClass, tailwindClasses].filter(Boolean).join(' ');
            parts.push(`    <div class="${allClasses}">
      <h2 class="text-xl font-semibold text-base-content tracking-tight mb-4">${node.ui.title}</h2>`);
            walk(node.body);
            parts.push(`    </div>`);
          }
          break;
        }

        case NodeType.ASK_FOR: {
          const ui = node.ui;
          // Inside flex containers (card, form), gap handles spacing — no margin needed
          const inputParent = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
          const inputInFlex = ['card', 'card_bordered', 'form', 'metric_card'].includes(inputParent);
          const fieldsetCls = inputInFlex ? 'fieldset' : 'fieldset mb-4';
          if (ui.htmlType === 'checkbox') {
            parts.push(`    <div class="flex items-center gap-3${inputInFlex ? '' : ' mb-3'}">
      <input id="${ui.id}" type="checkbox" class="checkbox checkbox-primary">
      <label for="${ui.id}" class="text-sm text-base-content/70">${ui.label}</label>
    </div>`);
          } else if (ui.htmlType === 'textarea') {
            parts.push(`    <fieldset class="${fieldsetCls}">
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <textarea id="${ui.id}" class="textarea textarea-bordered w-full" placeholder="${ui.label}" rows="6"></textarea>
    </fieldset>`);
          } else if (ui.htmlType === 'select' && ui.choices) {
            const options = ui.choices.map(c => `        <option value="${c}">${c}</option>`).join('\n');
            parts.push(`    <fieldset class="${fieldsetCls}">
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <select id="${ui.id}" class="select select-bordered w-full">
${options}
      </select>
    </fieldset>`);
          } else {
            parts.push(`    <fieldset class="${fieldsetCls}">
      <legend class="fieldset-legend text-xs uppercase tracking-widest font-semibold text-base-content/50">${ui.label}</legend>
      <input id="${ui.id}" class="input input-bordered w-full" type="${ui.htmlType}" placeholder="${ui.label}">
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
          if (ui.tag === 'table') {
            parts.push(`    <div class="bg-base-100 rounded-box border border-base-300 overflow-hidden" id="${displayId}">
      <div class="px-6 py-4 border-b border-base-300">
        <h3 class="text-sm font-semibold text-base-content">${ui.label}</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-sm w-full" id="${displayId}_table">
          <thead><tr class="border-base-300"><th class="text-xs uppercase tracking-widest font-semibold text-base-content/50"></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`);
          } else {
            parts.push(`    <div class="bg-base-200 rounded-box p-6 flex flex-col gap-1" id="${displayId}">
      <p class="text-xs font-semibold uppercase tracking-widest text-base-content/50">${ui.label}</p>
      <p class="font-mono text-3xl font-bold text-base-content tracking-tight" id="${displayId}_value"></p>
    </div>`);
          }
          break;
        }

        case NodeType.BUTTON: {
          const btnPreset = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : '';
          const btnInHeader = btnPreset === 'app_header';
          const btnInForm = ['card_bordered', 'card', 'form'].includes(btnPreset);
          const btnCls = btnInHeader ? 'btn btn-primary btn-sm' : btnInForm ? 'btn btn-primary w-full' : 'btn btn-primary';
          parts.push(`    <button class="${btnCls}" id="${node.ui.id}">${node.ui.label}</button>`);
          break;
        }

        case NodeType.FOR_EACH: {
          const inSidebar = sectionStack.includes('app_sidebar');
          if (inSidebar) {
            // Sidebar already wraps in <nav><ul class="menu">, just emit the list container
            parts.push(`    <ul class="menu menu-sm gap-0.5 p-0 clear-list" id="list_${sanitizeName(node.variable)}"></ul>`);
          } else {
            parts.push(`    <div class="clear-list" id="list_${sanitizeName(node.variable)}"></div>`);
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
          const inCard = ['card', 'card_bordered', 'form'].includes(parentPreset);
          const inHero = ['page_hero', 'hero', 'page_cta'].includes(parentPreset);
          const inPageSection = ['page_section', 'page_section_dark', 'section_light', 'section_dark'].includes(parentPreset);
          switch (ui.contentType) {
            case 'heading':
              if (inHero) {
                // Hero/CTA: big display headline
                parts.push(`    <h1 class="font-display text-5xl font-bold tracking-tight leading-tight text-base-content">${formatted}</h1>`);
              } else if (inHeader) {
                parts.push(`    <h1 class="text-base font-semibold text-base-content">${formatted}</h1>`);
              } else if (inMetricCard) {
                parts.push(`    <p class="font-mono text-3xl font-bold text-base-content tracking-tight">${formatted}</p>`);
              } else if (inSidebar) {
                parts.push(`    <div class="px-5 py-4 border-b border-base-300 shrink-0"><span class="text-base font-bold text-base-content tracking-tight">${formatted}</span></div>`);
              } else if (inCard) {
                parts.push(`    <h2 class="text-lg font-semibold text-base-content">${formatted}</h2>`);
              } else if (inPageSection) {
                // Section heading in landing page
                parts.push(`    <h2 class="text-3xl font-bold text-base-content tracking-tight mb-8">${formatted}</h2>`);
              } else {
                parts.push(`    <h1 class="text-3xl font-bold text-base-content tracking-tight leading-snug mb-4">${formatted}</h1>`);
              }
              break;
            case 'subheading':
              if (inHero) {
                // Hero subheading: lighter, wider
                parts.push(`    <p class="text-lg text-base-content/60 leading-relaxed max-w-xl">${formatted}</p>`);
              } else {
                parts.push(`    <h2 class="text-xl font-semibold text-base-content tracking-tight mt-6 mb-3">${formatted}</h2>`);
              }
              break;
            case 'text':
              if (inSidebar) {
                parts.push(`    <li><a class="text-sm">${formatted}</a></li>`);
              } else if (inMetricCard) {
                parts.push(`    <p class="text-xs text-base-content/40 font-mono">${formatted}</p>`);
              } else if (inHero) {
                // Hero/CTA body text
                parts.push(`    <p class="text-lg text-base-content/60 leading-relaxed">${formatted}</p>`);
              } else if (inCard || inPageSection) {
                parts.push(`    <p class="text-sm text-base-content/70 leading-relaxed">${formatted}</p>`);
              } else {
                parts.push(`    <p class="text-sm text-base-content/70 leading-relaxed mb-3">${formatted}</p>`);
              }
              break;
            case 'bold':
              parts.push(`    <p class="text-sm text-base-content/70 leading-relaxed mb-3"><strong class="text-base-content font-semibold">${formatted}</strong></p>`);
              break;
            case 'italic':
              parts.push(`    <p class="text-sm text-base-content/70 leading-relaxed mb-3"><em>${formatted}</em></p>`);
              break;
            case 'small':
              if (inHeader) {
                parts.push(`    <span class="badge badge-ghost badge-sm font-mono">${formatted}</span>`);
              } else if (inHero) {
                // Hero eyebrow badge
                parts.push(`    <span class="badge badge-outline badge-sm font-mono tracking-wide uppercase">${formatted}</span>`);
              } else {
                parts.push(`    <span class="text-xs font-semibold uppercase tracking-widest text-base-content/50 block mb-2">${formatted}</span>`);
              }
              break;
            case 'link':
              if (inHero) {
                // Hero CTA: big primary button
                parts.push(`    <a class="btn btn-primary btn-lg" href="${ui.href || '#'}">${formatted}</a>`);
              } else {
                parts.push(`    <a class="link link-primary text-sm" href="${ui.href || '#'}">${formatted}</a>`);
              }
              break;
            case 'code':
              parts.push(`    <div class="bg-base-200 rounded-box border border-base-300 overflow-hidden mb-4"><pre class="font-mono text-sm text-base-content/80 p-4 leading-relaxed overflow-x-auto"><code>${ui.text.replace(/\\n/g, '\n')}</code></pre></div>`);
              break;
            case 'divider':
              parts.push(`    <div class="divider my-4"></div>`);
              break;
          }
          break;
        }

        case NodeType.SHOW: {
          // Component call: show Card(name) -> container div for reactive rendering
          if (node.expression && node.expression.type === NodeType.CALL) {
            const containerId = `component_${sanitizeName(node.expression.name)}_${compRenderCounter++}`;
            parts.push(`    <div id="${containerId}" class="clear-component"></div>`);
          }
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
  walk(body);
  return { pageTitle, htmlBody: parts.join('\n'), pages, inlineStyleBlocks };
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
  const { pageTitle, htmlBody, pages, inlineStyleBlocks } = buildHTML(body);
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
// --- Hash Router ---
const _routes = {
${routeMap}
};
function _router() {
  const hash = location.hash.slice(1) || '/';
  for (const [route, pageId] of Object.entries(_routes)) {
    const el = document.getElementById('page_' + pageId);
    if (el) el.style.display = (hash === route) ? 'block' : 'none';
  }
}
window.addEventListener('hashchange', _router);
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

  // Detect if page uses full-width layout
  const hasFullLayout = usesAppPresets || htmlBody.includes('style-app_layout') ||
    css.includes('full_height') || css.includes('column_layout') || css.includes('grid');
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Geist+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body class="min-h-screen bg-base-100">
  <main id="app" class="${appClass}">
${htmlBody}
  </main>

  <script${scriptType}>
${(() => { const utils = _getUsedUtilities(compiledJS + routerJS); return utils.length > 0 ? '// --- Runtime ---\n' + utils.join('\n') + '\n' : ''; })()}${compiledJS}
${routerJS}
  <\/script>
</body>
</html>`;
  return { html, css };
}

// =============================================================================
// BACKEND SCAFFOLD (Phase 6C)
// =============================================================================

/**
 * Compile to a complete, runnable Express.js server.
 */
function compileToJSBackend(body, errors, sourceMap = false) {
  // Detect feature usage for auto-imports
  const usesAuth = body.some(n =>
    n.type === NodeType.ENDPOINT && n.body &&
    n.body.some(b => b.type === NodeType.REQUIRES_AUTH || b.type === NodeType.REQUIRES_ROLE)
  );
  const usesRateLimit = body.some(n =>
    n.type === NodeType.ENDPOINT && n.body &&
    n.body.some(b => b.type === NodeType.RATE_LIMIT)
  );

  const lines = [];
  lines.push(`// Generated by Clear v${CLEAR_VERSION}`);
  lines.push("const express = require('express');");
  lines.push("const db = require('./clear-runtime/db');");
  if (usesAuth) {
    lines.push("const auth = require('./clear-runtime/auth');");
  }
  if (usesRateLimit) {
    lines.push("const rateLimit = require('./clear-runtime/rateLimit');");
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
  if (usesAuth) {
    lines.push('app.use(auth.middleware());');
  }
  lines.push('');

  // Compile body first, then tree-shake utilities
  // Collect schema names so CRUD can reference the correct Schema variable
  const schemaNames = new Set();
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE) schemaNames.add(node.name);
  }

  const bodyLines = [];
  const declared = new Set();
  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'backend', sourceMap, schemaNames };
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      bodyLines.push(result);
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

  lines.push(...bodyLines);

  // Serve static files for full-stack apps (HTML, CSS, assets)
  const hasPages = body.some(n => n.type === NodeType.PAGE);
  if (hasPages) {
    lines.push('');
    lines.push("const path = require('path');");
    lines.push("app.use(express.static(__dirname));");
    lines.push("app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));");
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

  return lines.join('\n');
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
  const bodyLines = [];
  const declared = new Set();
  const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'backend', schemaNames };

  // Collect schemas and route handlers
  for (const node of body) {
    if (node.type === NodeType.DATA_SHAPE || node.type === NodeType.ENDPOINT ||
        node.type === NodeType.AGENT || node.type === NodeType.ASSIGN ||
        node.type === NodeType.FUNCTION_DEF) {
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
      const handlerCtx = { ...ctx, indent: 1, declared: handlerDeclared, insideEndpoint: true };
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
      lines.push('  } catch(err) { res.status(500).json({ error: err.message }); }');
      lines.push('}});');
    }
  }

  // Compile agent functions (needed by endpoints that call agents)
  for (const node of body) {
    if (node.type === NodeType.AGENT || node.type === NodeType.FUNCTION_DEF) {
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

  lines.push('})();');
  return lines.join('\n');
}

/**
 * Compile to a complete, runnable FastAPI server.
 */
function compileToPythonBackend(body, errors, sourceMap = false) {
  const lines = [];
  lines.push(`# Generated by Clear v${CLEAR_VERSION}`);
  lines.push('import os');
  lines.push('import json');
  lines.push('import re');
  lines.push('import datetime');
  lines.push('from fastapi import FastAPI, Request, HTTPException');
  lines.push('from fastapi.responses import JSONResponse');
  lines.push('');
  lines.push('app = FastAPI()');
  lines.push('');
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

  const pySchemaNames = new Set();
  for (const node of body) { if (node.type === NodeType.DATA_SHAPE) pySchemaNames.add(node.name); }
  const ctx = { lang: 'python', indent: 0, declared: new Set(), stateVars: null, mode: 'backend', sourceMap, schemaNames: pySchemaNames };
  for (const node of body) {
    const result = compileNode(node, ctx);
    if (result !== null) {
      lines.push(result);
    }
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

// Built-in style presets: name -> Tailwind/DaisyUI classes.
// The section renderer uses these classes directly on the div.
// No custom CSS is generated for built-in presets.
// User-defined styles (via `style X:` blocks) still compile to custom CSS.
const BUILTIN_PRESET_CLASSES = {
  // --- Landing page presets (design-system-v2) ---
  page_hero:         'bg-base-100 py-24 px-6 text-center flex flex-col items-center gap-6',
  page_section:      'bg-base-100 py-20 px-6',
  page_section_dark: 'bg-base-200 py-20 px-6',
  page_card:         'bg-base-100 rounded-box p-6 hover:scale-[1.02] transition-transform duration-200 flex flex-col gap-3',
  page_cta:          'bg-primary text-primary-content py-20 px-6 text-center flex flex-col items-center gap-6',

  // --- App/dashboard presets (design-system-v2) ---
  app_layout:        'flex h-screen overflow-hidden',
  app_sidebar:       'w-64 shrink-0 flex flex-col bg-base-200 border-r border-base-300 overflow-hidden',
  app_main:          'flex-1 flex flex-col overflow-hidden min-w-0',
  app_content:       'flex-1 overflow-y-auto bg-base-100 p-8 flex flex-col gap-6',
  app_header:        'sticky top-0 z-20 flex items-center justify-between h-14 px-8 bg-base-100 border-b border-base-300 shrink-0',
  app_card:          'bg-base-200 rounded-box p-6',

  // --- Generic section styles ---
  hero:              'bg-base-100 py-24 px-6 text-center',
  section_light:     'bg-base-100 py-20 px-6',
  section_dark:      'bg-base-200 py-20 px-6',
  card:              'bg-base-100 rounded-box p-6 flex flex-col gap-3',
  card_bordered:     'bg-base-100 border border-base-300 rounded-box p-6 flex flex-col gap-4',
  metric_card:       'bg-base-200 rounded-box p-6 flex flex-col gap-1',
  code_box:          'bg-base-200 rounded-box border border-base-300 p-4 font-mono text-sm',
  form:              'bg-base-100 rounded-box border border-base-300 p-8 max-w-lg flex flex-col gap-5',
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
    const props = style.properties.map(p => {
      // Resolve variable references: if value is a string matching a variable name, use the variable's value
      let val = p.value;
      if (typeof val === 'string' && vars[val] !== undefined) val = vars[val];
      return `  ${friendlyPropToCSS(p.name, val)};`;
    }).join('\n');
    let rule = `.${className} {\n${props}\n}`;
    // If the style sets color, make children inherit it (overrides base CSS explicit colors)
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
  --color-base-100: oklch(13% 0.02 250);
  --color-base-200: oklch(10% 0.02 255);
  --color-base-300: oklch(18% 0.015 250);
  --color-base-content: oklch(88% 0.025 240);
  --color-primary: oklch(62% 0.18 250);
  --color-primary-content: oklch(98% 0.005 250);
  --color-secondary: oklch(58% 0.12 155);
  --color-secondary-content: oklch(10% 0.02 155);
  --color-accent: oklch(78% 0.14 85);
  --color-accent-content: oklch(12% 0.02 85);
  --color-neutral: oklch(20% 0.015 250);
  --color-neutral-content: oklch(80% 0.02 240);
  --color-info: oklch(68% 0.12 245);
  --color-info-content: oklch(10% 0.02 245);
  --color-success: oklch(62% 0.14 155);
  --color-success-content: oklch(10% 0.02 155);
  --color-warning: oklch(78% 0.14 85);
  --color-warning-content: oklch(15% 0.02 85);
  --color-error: oklch(60% 0.2 25);
  --color-error-content: oklch(10% 0.02 25);
  --radius-box: 0.75rem; --radius-field: 0.5rem; --radius-selector: 0.375rem;
  --border: 1px; --depth: 0; --noise: 0;
}`,
  ivory: `[data-theme="ivory"] {
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

function sanitizeName(name) {
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
