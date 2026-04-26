// =============================================================================
// CLEAR LANGUAGE — PARSER
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. This parser converts tokenized lines into an AST that the compiler
// transforms into JavaScript and/or Python.
//
// Core constraint: ONE OPERATION PER LINE. Every computation gets a named
// intermediate variable. No nested expressions.
//
// Errors are first-class: every error message tells the user what to DO,
// not what they did wrong. Every error includes an example.
//
// !! MAINTENANCE RULE: Update this diagram AND the TOC whenever you add,
// !! remove, or move a section. Use section names (not line numbers).
//
// ARCHITECTURE:
//
//   Tokenized Lines (from tokenizer.js)
//       │
//       ▼
//   ┌──────────────────────────────────────────────────────┐
//   │  parse(source)                                        │
//   │                                                       │
//   │  1. tokenize(source) → lines[]                        │
//   │  2. parseBlock(lines, 0, 0) → AST body[]              │
//   │     ┌──────────────────────────────────────────┐      │
//   │     │  parseBlock(lines, startLine, indent)    │      │
//   │     │                                          │      │
//   │     │  For each line at this indent level:     │      │
//   │     │    Match first token against patterns:   │      │
//   │     │                                          │      │
//   │     │    ┌─ build for → TARGET                 │      │
//   │     │    ├─ theme → THEME                      │      │
//   │     │    ├─ database is → DATABASE_DECL        │      │
//   │     │    ├─ create a X table → DATA_SHAPE      │      │
//   │     │    ├─ when user calls → ENDPOINT         │      │
//   │     │    ├─ page 'X' at → PAGE                 │      │
//   │     │    ├─ agent 'X' → AGENT                  │      │
//   │     │    ├─ define function → FUNCTION_DEF     │      │
//   │     │    ├─ if/while/repeat/for → CONTROL FLOW │      │
//   │     │    ├─ save/look up/delete → CRUD         │      │
//   │     │    ├─ send back → RESPOND                │      │
//   │     │    ├─ validate → VALIDATE                │      │
//   │     │    ├─ 'Label' is a → ASK_FOR (input)     │      │
//   │     │    ├─ display X as → DISPLAY             │      │
//   │     │    ├─ button 'X' → BUTTON                │      │
//   │     │    ├─ X = expr → ASSIGN                  │      │
//   │     │    └─ (many more — see TOC)              │      │
//   │     │                                          │      │
//   │     │  Indented lines → recursive parseBlock   │      │
//   │     └──────────────────────────────────────────┘      │
//   │                                                       │
//   │  Output: { body: [ASTNode], errors: [{line, msg}] }   │
//   └──────────────────────────────────────────────────────┘
//       │
//       ▼
//   AST → fed to validator.js then compiler.js
//
// KEY INVARIANTS:
//   - Every node has a .type (NodeType enum) and .line (source line number)
//   - Page/section/endpoint/function nodes have .body (child nodes)
//   - DATA_SHAPE nodes have .fields (array of field definitions)
//   - CRUD nodes have .operation, .target, .variable, .condition
//   - Parser sets .ui metadata on UI nodes (pre-computed HTML attributes)
//   - Parser NEVER generates code — that's the compiler's job
//
// DEPENDENCIES: tokenizer.js (tokenize function)
// DEPENDENTS:   validator.js (validates AST), compiler.js (compiles AST)
//
//
// !! MAINTENANCE RULE: Update this TOC whenever you add, remove, or move
// !! a section. Use section names (not line numbers) since lines drift.
//
// TABLE OF CONTENTS:
//   AST NODE TYPES ..................... NodeType enum + builder helpers
//   PARSER ............................ parse(), parseConfigBlock(), parseBlock()
//   BLOCK-LEVEL PARSERS ............... parseComponentDef, parseFunctionDef, parseAgent,
//                                      parseMatch, parseIfBlock, parseRepeatLoop,
//                                      parseForEachLoop, parseWhileLoop, parseWorkflow
//   USE / IMPORT MODULES .............. parseUse()
//   PAGE DECLARATION .................. parsePage()
//   SECTION ........................... parseSection()
//   STYLE DEF ......................... parseStyleDef()
//   ASK FOR (INPUT) ................... parseLabelIsInput, parseLabelFirstInput, parseNewInput
//   STATIC CONTENT ELEMENTS ........... parseContent(), parseImage(), parseMedia()
//   DATA SHAPE ........................ parseDataShape(), parseRLSPolicy()
//   CRUD OPERATIONS ................... parseSave, parseRemoveFrom, parseDefineAs,
//                                      parseLookUpAssignment, parseSaveAssignment
//   TEST BLOCKS ....................... parseTestDef(), parseExpect(), UNIT_ASSERT detection
//   ASK FOR (legacy) .................. parseAskFor()
//   DISPLAY ........................... parseDisplay() — includes "with delete/edit"
//   CHART ............................. parseChart(), parseChartTypeFirst(), parseChartTitleFirst(),
//                                      parseChartRemainder() — ECharts (line, bar, pie, area)
//   BUTTON ............................ parseButton()
//   ENDPOINT .......................... parseEndpoint()
//   ADVANCED FEATURES ................. parseStream, parseBackground, parseCron,
//                                      parseSubscribe, parseUpdateDatabase, parseMigration, parseWait
//   FILE UPLOADS & EXTERNAL APIS ...... parseAcceptFile, parseExternalFetch
//   BILLING & PAYMENTS ................ parseCheckout, parseUsageLimit
//   WEBHOOKS & OAUTH .................. parseWebhook, parseOAuthConfig
//   INPUT VALIDATION .................. parseValidateBlock, parseFieldRule,
//                                      parseRespondsWithBlock, parseRateLimit
//   RESPOND ........................... parseRespond()
//   MATH-STYLE FUNCTION DEFS .......... parseMathStyleFunction()
//   TRY / HANDLE ...................... parseTryHandle()
//   LIVE BLOCK ........................ parseLiveBlock() — explicit effect fence (Path B Phase 1)
//   INCREASE / DECREASE ............... parseIncDec()
//   OBJECT DEFINITION ................. tryParseObjectDef()
//   LINE-LEVEL PARSERS ................ parseTarget, parseAssignment, parseIfThen,
//                                      parseStatementInline
//   EXPRESSION PARSER ................. parseExpression, parseExprPrec, parsePrimary,
//                                      parseListLiteral, parseEachExpression,
//                                      parseFunctionCall
//   DISPATCH (unified) ................ CANONICAL_DISPATCH — one Map, keyed on token.canonical
//   OPERATOR HELPERS .................. getOperatorKey, normalizeOperator, findCanonical
//
// =============================================================================

import { tokenize, tokenizeLine, TokenType } from './tokenizer.js';

// =============================================================================
// AST NODE TYPES
// =============================================================================

export const NodeType = Object.freeze({
  PROGRAM: 'program',
  TARGET: 'target',
  COMMENT: 'comment',
  ASSIGN: 'assign',
  SHOW: 'show',
  IF_THEN: 'if_then',

  // Functions
  FUNCTION_DEF: 'function_def',
  RETURN: 'return',

  // Loops
  REPEAT: 'repeat',
  REPEAT_UNTIL: 'repeat_until',
  FOR_EACH: 'for_each',
  WHILE: 'while',
  BREAK: 'break',
  CONTINUE: 'continue',

  // Objects (Phase 2)
  LITERAL_RECORD: 'literal_record',
  MEMBER_ACCESS: 'member_access',

  // Error handling (Phase 3)
  TRY_HANDLE: 'try_handle',

  // Decidable Core — explicit effect fence (Path B Phase 1, 2026-04-25)
  // `live:` block marks code that talks to the world (ask claude, call API,
  // subscribe, timers). Body emits as-is for now; the fence makes the
  // boundary visible to the compiler and the reader. See PHILOSOPHY.md Rule 18.
  LIVE_BLOCK: 'live_block',

  // GP Phase 1: Map iteration
  MAP_KEYS: 'map_keys',
  MAP_VALUES: 'map_values',
  MAP_EXISTS: 'map_exists',

  // GP Phase 3: First-class functions
  MAP_APPLY: 'map_apply',
  FILTER_APPLY: 'filter_apply',

  // Modules (Phase 3)
  USE: 'use',

  // Shell command execution (Phase 100)
  RUN_COMMAND: 'run_command',

  // Database declaration
  DATABASE_DECL: 'database_decl',
  OWNER_DECL: 'owner_decl',

  // Toast notification
  TOAST: 'toast',

  // Agent primitives
  AGENT: 'agent',
  ASK_AI: 'ask_ai',
  RUN_AGENT: 'run_agent',
  PARALLEL_AGENTS: 'parallel_agents',
  PIPELINE: 'pipeline',
  RUN_PIPELINE: 'run_pipeline',
  HUMAN_CONFIRM: 'human_confirm',
  MOCK_AI: 'mock_ai',
  SKILL: 'skill',
  CLASSIFY: 'classify',

  // Workflow primitives (Phases 85-90)
  WORKFLOW: 'workflow',
  RUN_WORKFLOW: 'run_workflow',

  // App-level policies (Enact guard types)
  POLICY: 'policy',

  // Raw JavaScript escape hatch
  SCRIPT: 'script',

  // Browser storage
  STORE: 'store',
  RESTORE: 'restore',

  // Interactive layout patterns
  TAB_GROUP: 'tab_group',
  TAB: 'tab',
  PANEL_ACTION: 'panel_action',  // toggle/open/close a panel or modal
  HIDE_ELEMENT: 'hide_element',  // hide X — toggle element visibility
  CLIPBOARD_COPY: 'clipboard_copy',  // copy X to clipboard
  DOWNLOAD_FILE: 'download_file',  // download X as file
  LOADING_ACTION: 'loading_action',  // show loading / hide loading

  // Web app features (Phase 4)
  PAGE: 'page',
  ASK_FOR: 'ask_for',
  DISPLAY: 'display',
  CHART: 'chart',
  BUTTON: 'button',

  // Layout (Phase 7)
  SECTION: 'section',

  // Static content elements
  CONTENT: 'content',

  // Data shapes + CRUD (Phase 9)
  DATA_SHAPE: 'data_shape',
  CRUD: 'crud',

  // Testing (Phase 11)
  TEST_DEF: 'test_def',
  EVAL_DEF: 'eval_def',
  EXPECT: 'expect',
  HTTP_TEST_CALL: 'http_test_call',
  EXPECT_RESPONSE: 'expect_response',
  TEST_INTENT: 'test_intent',  // Intent-based test: "can user create a todo", "does it require login"
  UNIT_ASSERT: 'unit_assert', // Value-level assertion: expect x is 5, expect x is greater than 3
  STYLE_DEF: 'style_def',
  THEME: 'theme',

  // Backend features (Phase 5)
  ENDPOINT: 'endpoint',
  RESPOND: 'respond',
  DEPLOY: 'deploy',
  REQUIRES_AUTH: 'requires_auth',
  REQUIRES_ROLE: 'requires_role',
  DEFINE_ROLE: 'define_role',
  GUARD: 'guard',
  THROW: 'throw',

  // Auth scaffolding
  AUTH_SCAFFOLD: 'auth_scaffold',

  // WebSocket broadcast
  BROADCAST: 'broadcast',

  // Input validation (Phase 16)
  VALIDATE: 'validate',
  FIELD_RULE: 'field_rule',
  RESPONDS_WITH: 'responds_with',
  RATE_LIMIT: 'rate_limit',

  // Webhooks (Phase 17 — OAUTH_CONFIG removed 2026-04-21, zero app usage; use record literal instead)
  WEBHOOK: 'webhook',

  // Billing & Payments (Phase 18 — USAGE_LIMIT removed 2026-04-21, zero app usage; use record literal instead)
  CHECKOUT: 'checkout',

  // File Uploads & External APIs (Phase 19)
  ACCEPT_FILE: 'accept_file',
  EXTERNAL_FETCH: 'external_fetch',
  UPLOAD_TO: 'upload_to',
  LOGIN_ACTION: 'login_action',

  // External API Calls (Phase 45)
  HTTP_REQUEST: 'http_request',
  SERVICE_CALL: 'service_call',

  // Advanced features (Phase 20)
  STREAM: 'stream',
  BACKGROUND: 'background',
  SUBSCRIBE: 'subscribe',
  MIGRATION: 'migration',
  WAIT: 'wait',
  CRON: 'cron',
  STREAM_AI: 'stream_ai',

  // List operations (Phase 21)
  LIST_PUSH: 'list_push',
  LIST_REMOVE: 'list_remove',
  LIST_SORT: 'list_sort',

  ON_PAGE_LOAD: 'on_page_load',
  // T2 #33 — scroll handler with optional throttle. `on scroll:` fires
  // every scroll event; `on scroll every 100ms:` dispatches at most
  // once per N ms (leading-edge), so infinite-scroll / sticky-header
  // logic doesn't flood the main thread.
  ON_SCROLL: 'on_scroll',
  TRANSACTION: 'transaction',
  ON_CHANGE: 'on_change',
  RETRY: 'retry',
  TIMEOUT: 'timeout',
  RACE: 'race',
  MATCH: 'match',
  MATCH_WHEN: 'match_when',
  MAP_GET: 'map_get',
  MAP_SET: 'map_set',
  // Cookies (T2 #42)
  COOKIE_SET: 'cookie_set',
  COOKIE_GET: 'cookie_get',
  COOKIE_CLEAR: 'cookie_clear',
  // Field projection (T2 #44): `pick a, b, c from X`
  PICK: 'pick',

  // Frontend navigation + API calls (Phase 21)
  NAVIGATE: 'navigate',
  REFRESH: 'refresh',
  API_CALL: 'api_call',

  // Components (Phase 21)
  COMPONENT_DEF: 'component_def',
  COMPONENT_USE: 'component_use',

  // Production hardening (Phase 21)
  LOG_REQUESTS: 'log_requests',
  ALLOW_CORS: 'allow_cors',

  // File I/O (Phase 21)
  FILE_OP: 'file_op',

  // JSON (Phase 21)
  JSON_PARSE: 'json_parse',
  JSON_STRINGIFY: 'json_stringify',

  // Regex (Phase 21)
  REGEX_FIND: 'regex_find',
  REGEX_MATCH: 'regex_match',
  REGEX_REPLACE: 'regex_replace',

  // Date/Time (Phase 21)
  CURRENT_TIME: 'current_time',
  FORMAT_DATE: 'format_date',
  DAYS_BETWEEN: 'days_between',

  // Data operations (Phase 22)
  LOAD_CSV: 'load_csv',
  SAVE_CSV: 'save_csv',
  FILTER: 'filter',
  GROUP_BY: 'group_by',
  COUNT_BY: 'count_by',
  UNIQUE_VALUES: 'unique_values',

  // Database adapter (Phase 23)
  CONNECT_DB: 'connect_db',
  RAW_QUERY: 'raw_query',

  // Email adapter (Phase 24)
  CONFIGURE_EMAIL: 'configure_email',
  SEND_EMAIL: 'send_email',

  // Web scraper adapter (Phase 25)
  FETCH_PAGE: 'fetch_page',
  FIND_ELEMENTS: 'find_elements',

  // PDF adapter (Phase 26)
  CREATE_PDF: 'create_pdf',

  // ML adapter (Phase 27)
  TRAIN_MODEL: 'train_model',
  PREDICT: 'predict_with',

  // Full text search (Phase 46)
  SEARCH: 'search',
  SQL_AGGREGATE: 'sql_aggregate',

  // Advanced features (Phase 28)
  TEXT_BLOCK: 'text_block',
  DO_ALL: 'do_all',

  // Expression nodes
  LITERAL_NUMBER: 'literal_number',
  LITERAL_STRING: 'literal_string',
  LITERAL_BOOLEAN: 'literal_boolean',
  LITERAL_NOTHING: 'literal_nothing',
  LITERAL_LIST: 'literal_list',
  VARIABLE_REF: 'variable_ref',
  BINARY_OP: 'binary_op',
  UNARY_OP: 'unary_op',
  CALL: 'call',
});

// =============================================================================
// AST BUILDER HELPERS
// =============================================================================

function programNode(target, body, errors) {
  return { type: NodeType.PROGRAM, target, body, errors };
}

function targetNode(value, line) {
  return { type: NodeType.TARGET, value, line };
}

function commentNode(text, line) {
  return { type: NodeType.COMMENT, text, line };
}

function assignNode(name, expression, line) {
  return { type: NodeType.ASSIGN, name, expression, line };
}

function showNode(expression, line) {
  return { type: NodeType.SHOW, expression, line };
}

function ifThenNode(condition, thenBranch, otherwiseBranch, line) {
  return { type: NodeType.IF_THEN, condition, thenBranch, otherwiseBranch, line };
}

function functionDefNode(name, params, body, line, returnType, maxDepth) {
  // Normalize params: plain strings → {name, type: null}
  const normalizedParams = params.map(p =>
    typeof p === 'string' ? { name: p, type: null } : p
  );
  const node = { type: NodeType.FUNCTION_DEF, name, params: normalizedParams, body, line };
  if (returnType) node.returnType = returnType;
  if (maxDepth !== undefined) node.maxDepth = maxDepth;
  return node;
}

function returnNode(expression, line) {
  return { type: NodeType.RETURN, expression, line };
}

function repeatNode(count, body, line) {
  return { type: NodeType.REPEAT, count, body, line };
}

// `repeat until X, max N times:` — bounded refinement loop. Runs the body
// until the condition becomes true OR the iteration cap is hit. Canonical
// pattern for agent self-refinement (score-check-retry) loops.
function repeatUntilNode(condition, maxIterations, body, line) {
  return { type: NodeType.REPEAT_UNTIL, condition, maxIterations, body, line };
}

function forEachNode(variable, iterable, body, line, variable2) {
  const node = { type: NodeType.FOR_EACH, variable, iterable, body, line };
  if (variable2) node.variable2 = variable2;
  return node;
}

function whileNode(condition, body, line, maxIterations) {
  const node = { type: NodeType.WHILE, condition, body, line };
  if (maxIterations !== undefined) node.maxIterations = maxIterations;
  return node;
}

function breakNode(line) {
  return { type: NodeType.BREAK, line };
}

function continueNode(line) {
  return { type: NodeType.CONTINUE, line };
}

function literalNumber(value, line) {
  return { type: NodeType.LITERAL_NUMBER, value, line };
}

function literalString(value, line) {
  return { type: NodeType.LITERAL_STRING, value, line };
}

function literalBoolean(value, line) {
  return { type: NodeType.LITERAL_BOOLEAN, value, line };
}

function literalNothing(line) {
  return { type: NodeType.LITERAL_NOTHING, line };
}

function literalList(elements, line) {
  return { type: NodeType.LITERAL_LIST, elements, line };
}

function variableRef(name, line) {
  return { type: NodeType.VARIABLE_REF, name, line };
}

function binaryOp(operator, left, right, line) {
  return { type: NodeType.BINARY_OP, operator, left, right, line };
}

function unaryOp(operator, operand, line) {
  return { type: NodeType.UNARY_OP, operator, operand, line };
}

function callNode(name, args, line) {
  return { type: NodeType.CALL, name, args, line };
}

// Phase 3: Modules
function useNode(module, line) {
  return { type: NodeType.USE, module, line };
}

// Phase 4: Web app
function slugifyTitle(title) {
  return '/' + title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pageNode(title, body, line, route) {
  const node = { type: NodeType.PAGE, title, body, line };
  // Auto-slugify title if no explicit route given: 'HN Daily Digest' → '/hn-daily-digest'
  node.route = route || slugifyTitle(title);
  return node;
}

// Sanitize name for use in HTML IDs (same logic as compiler's sanitizeName)
function sanitizeForId(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

// Auto-generate a human-readable label from a variable name
function autoLabelFromName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function askForNode(variable, inputType, label, line) {
  const baseType = inputType;
  let htmlType = 'text';
  let tag = 'input';
  if (baseType === 'number' || baseType === 'percent') htmlType = 'number';
  else if (baseType === 'file') htmlType = 'file';
  else if (baseType === 'yes/no') { htmlType = 'checkbox'; tag = 'input'; }
  else if (baseType === 'long text') { htmlType = 'textarea'; tag = 'textarea'; }
  else if (baseType === 'rich text') { htmlType = 'rich-text'; tag = 'div'; }
  else if (baseType === 'choice') { htmlType = 'select'; tag = 'select'; }

  const ui = {
    tag,
    htmlType,
    id: `input_${sanitizeForId(variable)}`,
    label: label || autoLabelFromName(variable),
  };

  return { type: NodeType.ASK_FOR, variable, inputType, label, line, ui };
}

function displayNode(expression, format, label, line) {
  // Auto-label from expression if no explicit label
  const displayLabel = label || (expression && expression.type === NodeType.VARIABLE_REF
    ? autoLabelFromName(expression.name)
    : 'Output');
  const ui = {
    tag: format === 'table' ? 'table' : format === 'cards' ? 'cards' : format === 'list' ? 'list' : format === 'chat' ? 'chat' : format === 'gallery' ? 'gallery' : format === 'map' ? 'map' : format === 'calendar' ? 'calendar' : (format === 'qr' || format === 'qrcode') ? 'qr' : 'output',
    id: `output_${sanitizeForId(displayLabel.replace(/\s+/g, '_'))}`,
    label: displayLabel,
  };
  return { type: NodeType.DISPLAY, expression, format, label, line, ui };
}

function buttonNode(label, body, line) {
  const ui = {
    tag: 'button',
    id: `btn_${sanitizeForId(label.replace(/\s+/g, '_'))}`,
    label,
  };
  return { type: NodeType.BUTTON, label, body, line, ui };
}

// Phase 5: Backend
function endpointNode(method, path, body, line) {
  return { type: NodeType.ENDPOINT, method, path, body, line };
}

function respondNode(expression, status, line) {
  return { type: NodeType.RESPOND, expression, status, line };
}

function sectionNode(title, body, line, styleName) {
  const classes = ['clear-section'];
  if (styleName) classes.push(`style-${sanitizeForId(styleName)}`);
  const ui = { cssClass: classes.join(' '), title };
  const node = { type: NodeType.SECTION, title, body, line, ui };
  if (styleName) node.styleName = styleName;
  return node;
}

function styleDefNode(name, properties, mediaQuery, line) {
  return { type: NodeType.STYLE_DEF, name, properties, mediaQuery, line };
}

function contentNode(contentType, text, line, href) {
  const ui = { contentType, text };
  if (href) ui.href = href;
  const node = { type: NodeType.CONTENT, contentType, text, line, ui };
  if (href) node.href = href;
  return node;
}

function dataShapeNode(name, fields, line, policies) {
  return { type: NodeType.DATA_SHAPE, name, fields, line, policies: policies || [] };
}

function crudNode(operation, variable, target, condition, line) {
  return { type: NodeType.CRUD, operation, variable, target, condition, line };
}

function testDefNode(name, body, line) {
  return { type: NodeType.TEST_DEF, name, body, line };
}

function expectNode(expression, line) {
  return { type: NodeType.EXPECT, expression, line };
}

function recordNode(entries, line) {
  return { type: NodeType.LITERAL_RECORD, entries, line };
}

function memberAccessNode(object, member, line) {
  return { type: NodeType.MEMBER_ACCESS, object, member, line };
}

function tryHandleNode(tryBody, handlers, line, finallyBody) {
  const node = { type: NodeType.TRY_HANDLE, tryBody, handlers, line };
  if (finallyBody) node.finallyBody = finallyBody;
  return node;
}

// Decidable Core — explicit effect fence (Path B Phase 1, 2026-04-25)
// `live:` block whose body holds calls that talk to the world. Compiler emits
// the body inline with a comment marker; the fence is signal for the
// validator (Phase B-2) and the human reader (now).
function liveBlockNode(body, line) {
  return { type: NodeType.LIVE_BLOCK, body, line };
}

function deployNode(platform, line) {
  return { type: NodeType.DEPLOY, platform, line };
}

function requiresAuthNode(line) {
  return { type: NodeType.REQUIRES_AUTH, line };
}

function requiresRoleNode(role, line) {
  return { type: NodeType.REQUIRES_ROLE, role, line };
}

function defineRoleNode(role, permissions, body, line) {
  return { type: NodeType.DEFINE_ROLE, role, permissions, body, line };
}

function guardNode(expression, line, message) {
  const node = { type: NodeType.GUARD, expression, line };
  if (message) node.message = message;
  return node;
}

// Phase 16: Input Validation
function validateNode(rules, line) {
  return { type: NodeType.VALIDATE, rules, line };
}

function fieldRuleNode(name, fieldType, constraints, line) {
  return { type: NodeType.FIELD_RULE, name, fieldType, constraints, line };
}

function respondsWithNode(fields, line) {
  return { type: NodeType.RESPONDS_WITH, fields, line };
}

function rateLimitNode(count, period, line) {
  return { type: NodeType.RATE_LIMIT, count, period, line };
}

// Phase 17: Webhooks (oauthConfigNode removed 2026-04-21 — zero app usage)
function webhookNode(path, secret, body, line) {
  return { type: NodeType.WEBHOOK, path, secret, body, line };
}

// Phase 18: Billing & Payments (usageLimitNode removed 2026-04-21 — zero app usage)
function checkoutNode(name, config, line) {
  return { type: NodeType.CHECKOUT, name, config, line };
}

// Phase 19: File Uploads & External APIs
function acceptFileNode(config, line) {
  return { type: NodeType.ACCEPT_FILE, config, line };
}

function externalFetchNode(url, config, line) {
  return { type: NodeType.EXTERNAL_FETCH, url, config, line };
}

// Phase 20: Advanced Features
function streamNode(body, line) { return { type: NodeType.STREAM, body, line }; }
function backgroundNode(name, schedule, body, line) { return { type: NodeType.BACKGROUND, name, schedule, body, line }; }
function subscribeNode(channel, body, line) { return { type: NodeType.SUBSCRIBE, channel, body, line }; }
function migrationNode(name, operations, line) { return { type: NodeType.MIGRATION, name, operations, line }; }
function waitNode(duration, unit, line) { return { type: NodeType.WAIT, duration, unit, line }; }

// Phase 21: File I/O
function fileOpNode(operation, path, data, variable, line) {
  return { type: NodeType.FILE_OP, operation, path, data, variable, line };
}

// write file 'path' with expression
function parseWriteFile(tokens, line) {
  let pos = 1; // skip 'write file' (already consumed as multi-word synonym)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: "write file needs a file path in quotes. Example: write file 'output.json' with results" };
  }
  const path = tokens[pos].value;
  pos++;
  // Expect 'with' keyword
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    return { error: "write file needs 'with' and a value. Example: write file 'output.json' with results" };
  }
  pos++;
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };
  return { node: fileOpNode('write', path, expr.node, null, line) };
}

// save csv 'path' with expression
function parseSaveCsv(tokens, line) {
  let pos = 1; // skip 'save csv'
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: "save csv needs a file path in quotes. Example: save csv 'output.csv' with results" };
  }
  const path = tokens[pos].value;
  pos++;
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    return { error: "save csv needs 'with' and a data variable. Example: save csv 'output.csv' with results" };
  }
  pos++;
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };
  return { node: { type: NodeType.SAVE_CSV, path, data: expr.node, line } };
}

// append to file 'path' with expression
function parseAppendToFile(tokens, line) {
  let pos = 1; // skip 'append to file' (multi-word synonym)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: "append to file needs a file path in quotes. Example: append to file 'log.txt' with message" };
  }
  const path = tokens[pos].value;
  pos++;
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    return { error: "append to file needs 'with' and a value. Example: append to file 'log.txt' with message" };
  }
  pos++;
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };
  return { node: fileOpNode('append', path, expr.node, null, line) };
}

// =============================================================================
// PARSER
// =============================================================================

/**
 * Parse a Clear source program into an AST.
 *
 * @param {string} source - Full Clear program text
 * @returns {{ type: 'program', target: string|null, body: Array, errors: Array<{line, message}> }}
 */
export function parse(source) {
  const tokenizedLines = tokenize(source);
  const errors = [];
  let target = null;

  // Parse the body using the block parser, starting at index 0 with indent level -1
  // (so all top-level lines are collected)
  const { body, targetValue } = parseBlock(tokenizedLines, 0, -1, errors);
  target = targetValue;

  return programNode(target, body, errors);
}

/**
 * Parse a block of lines at a given indentation level.
 * Returns all statements at or above the given parentIndent level.
 *
 * @param {Array} lines - Tokenized lines array
 * @param {number} startIdx - Starting index in lines array
 * @param {number} parentIndent - Parent block's indentation level (-1 for top-level)
 * @param {Array} errors - Error collector
 * @param {number} [stopAtIndent] - Stop when indent drops to this level (optional)
 * @returns {{ body: Node[], endIdx: number, targetValue: string|null }}
 */
// Helper: parse an indented config block into a key-value object.
// Used for configure email, send email, connect to database, checkout, oauth, etc.
function parseConfigBlock(lines, startIdx, parentIndent) {
  const config = {};
  let j = startIdx;
  while (j < lines.length && lines[j].indent > parentIndent) {
    const cfgTokens = lines[j].tokens;
    // Recognize `with timeout N seconds|minutes` as a config sub-line.
    // Emits { value: N, unit: 'seconds'|'minutes' } so compilers can compute ms.
    // Mirrors the shape HTTP_REQUEST + scheduled-task parsers produce elsewhere.
    if (cfgTokens.length >= 4 &&
        cfgTokens[0].value === 'with' &&
        cfgTokens[1].value === 'timeout' &&
        cfgTokens[2].type === TokenType.NUMBER &&
        (cfgTokens[3].value === 'seconds' || cfgTokens[3].value === 'second' ||
         cfgTokens[3].value === 'minutes' || cfgTokens[3].value === 'minute')) {
      const unit = cfgTokens[3].value.startsWith('minute') ? 'minutes' : 'seconds';
      config.timeout = { value: cfgTokens[2].value, unit };
      j++;
      continue;
    }
    if (cfgTokens.length >= 3) {
      const key = cfgTokens[0].value;
      const valExpr = parseExpression(cfgTokens, 2, cfgTokens[0].line);
      config[key] = valExpr.error ? cfgTokens[2].value : valExpr.node;
    }
    j++;
  }
  return { config, endIdx: j };
}

// =============================================================================
// SYNONYM RESOLUTION — context-aware canonical lookup
// =============================================================================
// Phase 2 foundation: resolveCanonical() provides a single point for synonym
// resolution. Currently delegates to the tokenizer's REVERSE_LOOKUP (same
// behavior as before). Future: zone-based resolution where 'delete' means
// different things in CRUD vs UI contexts.

// Zone-specific synonym overrides.
// When a zone is active, these take precedence over the tokenizer's canonical.
// Currently unused — the tokenizer still resolves all synonyms.
// To activate: change tokenizer to emit raw words, then call resolveCanonical()
// with the appropriate zone in each parser function.
const ZONE_OVERRIDES = {
  ui: {
    delete: 'action_delete',  // In display context, 'delete' = action button, not CRUD remove
    remove: 'action_delete',  // 'remove' also means action button in UI context
  },
  crud: {
    delete: 'remove',         // In CRUD context, 'delete' = remove from database (tokenizer default)
  },
  comparison: {},  // 'is' context-sensitivity already handled by parser
  agent: {
    use: 'agent_use',         // In agent directives, 'use' = tool access, not module import
    log: 'agent_log',         // In agent directives, 'log' = logging config, not show
  },
};

function resolveCanonical(token, zone) {
  if (zone && token.rawValue) {
    const overrides = ZONE_OVERRIDES[zone];
    if (overrides && overrides[token.rawValue]) {
      return overrides[token.rawValue];
    }
  }
  return token.canonical || null;
}

// =============================================================================
// DISPATCH TABLES — Map-based keyword dispatch for parseBlock
// =============================================================================
// Handlers take { lines, i, indent, tokens, line, errors, body } and return
// the new value of i, or undefined to fall through to the if/else chain.
// Assignment is NEVER in these maps — it's always the last resort in parseBlock.

// Canonical-keyword handlers (keyed on firstToken.canonical)
const CANONICAL_DISPATCH = new Map([
  // --- Simple single-line nodes ---
  ['log_requests', (ctx) => { ctx.body.push({ type: NodeType.LOG_REQUESTS, line: ctx.line }); return ctx.i + 1; }],
  ['allow_cors', (ctx) => { ctx.body.push({ type: NodeType.ALLOW_CORS, line: ctx.line }); return ctx.i + 1; }],
  ['auth_scaffold', (ctx) => { ctx.body.push({ type: NodeType.AUTH_SCAFFOLD, line: ctx.line }); return ctx.i + 1; }],
  ['break', (ctx) => { ctx.body.push(breakNode(ctx.line)); return ctx.i + 1; }],
  ['continue', (ctx) => { ctx.body.push(continueNode(ctx.line)); return ctx.i + 1; }],
  ['requires_auth', (ctx) => { ctx.body.push(requiresAuthNode(ctx.line)); return ctx.i + 1; }],
  ['needs_login', (ctx) => { ctx.body.push({ type: NodeType.REQUIRES_AUTH, line: ctx.line }); return ctx.i + 1; }],
  ['target', (ctx) => {
    const parsed = parseTarget(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else { ctx._targetValue = parsed.node.value; ctx.body.push(parsed.node); }
    return ctx.i + 1;
  }],
  ['build', (ctx) => {
    const parsed = parseTarget(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else { ctx._targetValue = parsed.node.value; ctx.body.push(parsed.node); }
    return ctx.i + 1;
  }],
  ['connect_to_database', (ctx) => {
    const config = {};
    let j = ctx.i + 1;
    while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent) {
      const cfgTokens = ctx.lines[j].tokens;
      if (cfgTokens.length >= 3) {
        const key = cfgTokens[0].value;
        const val = cfgTokens.slice(2).map(t => t.value).join('');
        config[key] = val;
      }
      j++;
    }
    ctx.body.push({ type: NodeType.CONNECT_DB, config, line: ctx.line });
    return j;
  }],
  ['raw_run', (ctx) => {
    let qPos = 1;
    // run command 'shell-cmd' — shell execution
    if (qPos < ctx.tokens.length && ctx.tokens[qPos].value === 'command') {
      qPos++; // skip 'command'
      if (qPos < ctx.tokens.length && ctx.tokens[qPos].type === TokenType.STRING) {
        const cmd = ctx.tokens[qPos].value;
        ctx.body.push({ type: NodeType.RUN_COMMAND, command: cmd, line: ctx.line });
        return ctx.i + 1;
      }
      // Multiline: "run command:" with indented text block
      // Each indented line becomes one command joined with " && "
      // This lets you write complex shell commands with quotes/newlines.
      let j = ctx.i + 1;
      const cmdLines = [];
      while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent) {
        const raw = ctx.lines[j].raw;
        if (raw !== undefined && raw.trim() !== '') cmdLines.push(raw.trim());
        else {
          const toks = ctx.lines[j].tokens;
          if (toks.length > 0) cmdLines.push(toks.map(t => t.value).join(' '));
        }
        j++;
      }
      if (cmdLines.length > 0) {
        const cmd = cmdLines.join(' && ');
        ctx.body.push({ type: NodeType.RUN_COMMAND, command: cmd, line: ctx.line });
        return j;
      }
      return ctx.i + 1;
    }
    // run 'SQL query' — raw SQL
    if (qPos < ctx.tokens.length && ctx.tokens[qPos].type === TokenType.STRING) {
      const sql = ctx.tokens[qPos].value;
      qPos++;
      let params = null;
      if (qPos < ctx.tokens.length && (ctx.tokens[qPos].value === 'with' || ctx.tokens[qPos].canonical === 'with')) {
        qPos++;
        const expr = parseExpression(ctx.tokens, qPos, ctx.line);
        if (!expr.error) params = expr.node;
      }
      ctx.body.push({ type: NodeType.RAW_QUERY, sql, params, variable: null, operation: 'run', line: ctx.line });
    }
    return ctx.i + 1;
  }],
  ['charge_via_stripe', (ctx) => {
    const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
    ctx.body.push({ type: NodeType.SERVICE_CALL, service: 'stripe', config, line: ctx.line });
    return endIdx;
  }],
  ['send_sms_via_twilio', (ctx) => {
    const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
    ctx.body.push({ type: NodeType.SERVICE_CALL, service: 'twilio', config, line: ctx.line });
    return endIdx;
  }],
  ['configure_email', (ctx) => {
    const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
    ctx.body.push({ type: NodeType.CONFIGURE_EMAIL, config, line: ctx.line });
    return endIdx;
  }],
  ['save_csv', (ctx) => {
    const parsed = parseSaveCsv(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['append_to_file', (ctx) => {
    const parsed = parseAppendToFile(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['requires_role', (ctx) => {
    let role = 'user';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) {
      role = ctx.tokens[1].value;
    } else if (ctx.tokens.length > 1 && (ctx.tokens[1].type === TokenType.IDENTIFIER || ctx.tokens[1].type === TokenType.KEYWORD)) {
      role = ctx.tokens[1].value;
    }
    ctx.body.push(requiresRoleNode(role, ctx.line));
    return ctx.i + 1;
  }],
  ['when_user_calls', (ctx) => {
    const parsed = parseEndpoint(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['on_method', (ctx) => {
    const parsed = parseEndpoint(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['send_back', (ctx) => {
    // First try inline retrieval shorthand ("send back all Users" etc.)
    const inline = tryInlineSendBackRetrieval(ctx.tokens, ctx.line);
    if (inline) {
      for (const n of inline) ctx.body.push(n);
      return ctx.i + 1;
    }
    const parsed = parseRespond(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['go_to', (ctx) => {
    let url = '';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) {
      url = ctx.tokens[1].value;
    }
    ctx.body.push({ type: NodeType.NAVIGATE, url, line: ctx.line });
    return ctx.i + 1;
  }],
  ['theme', (ctx) => {
    if (ctx.tokens.length < 2) {
      ctx.errors.push({ line: ctx.line, message: "theme needs a name — try: theme 'ivory' (default, light), theme 'sakura' (soft, retail/wellness), theme 'dusk' (warm dark), theme 'vault' (enterprise navy+gold), theme 'arctic' (cool light), theme 'midnight', theme 'nova', theme 'moss', theme 'ember', theme 'slate', or theme 'forge'" });
      return ctx.i + 1;
    }
    const nameToken = ctx.tokens[1];
    const themeName = nameToken.value.replace(/^['"]|['"]$/g, '');
    const validThemes = ['midnight', 'ivory', 'nova', 'arctic', 'moss', 'ember', 'slate', 'dusk', 'vault', 'sakura', 'forge'];
    if (!validThemes.includes(themeName)) {
      ctx.errors.push({ line: ctx.line, message: `'${themeName}' isn't a theme Clear knows — try: ${validThemes.join(', ')}` });
    } else {
      ctx.body.push({ type: NodeType.THEME, name: themeName, line: ctx.line });
    }
    return ctx.i + 1;
  }],
  ['define_role', (ctx) => {
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) {
      ctx.errors.push({ line: ctx.line, message: "define role needs a name. Example: define role 'admin':" });
      return ctx.i + 1;
    }
    const roleName = ctx.tokens[1].value;
    const permissions = [];
    let j = ctx.i + 1;
    while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent) {
      const permTokens = ctx.lines[j].tokens;
      if (permTokens.length >= 2 && permTokens[0].canonical === 'can') {
        const action = permTokens.slice(1).map(t => t.value).join(' ');
        permissions.push(action);
      }
      j++;
    }
    ctx.body.push(defineRoleNode(roleName, permissions, [], ctx.line));
    return j;
  }],
  ['guard', (ctx) => {
    let endPos = ctx.tokens.length;
    let guardMessage = null;
    for (let k = ctx.tokens.length - 1; k > 1; k--) {
      if (ctx.tokens[k].type === TokenType.STRING && k > 0 && ctx.tokens[k-1].canonical === 'or') {
        guardMessage = ctx.tokens[k].value;
        endPos = k - 1;
        break;
      }
    }
    const result = parseExpression(ctx.tokens, 1, ctx.line, endPos);
    if (result.error) {
      ctx.errors.push({ line: ctx.line, message: result.error });
    } else {
      ctx.body.push(guardNode(result.node, ctx.line, guardMessage));
    }
    return ctx.i + 1;
  }],
  ['send_error', (ctx) => {
    // send error 'message' — throw a custom error from any context
    const pos = 1; // skip 'send error' (single multi-word token)
    if (pos < ctx.tokens.length) {
      const expr = parseExpression(ctx.tokens, pos, ctx.line);
      if (expr.error) {
        ctx.errors.push({ line: ctx.line, message: expr.error });
      } else {
        ctx.body.push({ type: NodeType.THROW, expression: expr.node, line: ctx.line });
      }
    } else {
      ctx.errors.push({ line: ctx.line, message: "send error needs a message — what should the error say? Example: send error 'Order not found'" });
    }
    return ctx.i + 1;
  }],
  // T2 #33 — on scroll [every Nms]: block. Frontend-only; compiler
  // emits a window scroll listener with optional leading-edge throttle.
  ['on_scroll', (ctx) => {
    // Optional throttle: `on scroll every 100ms:` or `on scroll every 100 ms:`
    let throttleMs = null;
    const rest = ctx.tokens.slice(1);
    // Find `every` + number; ignore trailing `ms` / `milliseconds` / `seconds`
    for (let k = 0; k < rest.length - 1; k++) {
      if (typeof rest[k].value === 'string' && rest[k].value.toLowerCase() === 'every' &&
          rest[k + 1].type === TokenType.NUMBER) {
        const n = rest[k + 1].value;
        // Unit: look at k+2; default ms
        let unit = 'ms';
        if (k + 2 < rest.length && typeof rest[k + 2].value === 'string') {
          const u = rest[k + 2].value.toLowerCase();
          if (u === 'ms' || u === 'milliseconds') unit = 'ms';
          else if (u === 'second' || u === 'seconds' || u === 's') unit = 's';
        }
        throttleMs = unit === 's' ? n * 1000 : n;
        break;
      }
    }
    const { body: scrollBody, endIdx: scrollEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({
      type: NodeType.ON_SCROLL,
      body: scrollBody,
      throttleMs,
      line: ctx.line,
    });
    return scrollEnd;
  }],
  ['on_page_load', (ctx) => {
    // Inline form: "on page load get todos from '/api/todos'"
    if (ctx.tokens.length > 1) {
      const restTokens = ctx.tokens.slice(1);
      const firstRest = restTokens[0];
      if (firstRest && (firstRest.canonical === 'get_from' || firstRest.canonical === 'get_key')) {
        const fromIdx = restTokens.findIndex(t => t.value === 'from');
        if (fromIdx > 0 && fromIdx + 1 < restTokens.length && restTokens[fromIdx + 1].type === TokenType.STRING) {
          const targetVar = fromIdx > 1 ? restTokens[1].value : 'response';
          const url = restTokens[fromIdx + 1].value;
          ctx.body.push({ type: NodeType.ON_PAGE_LOAD, body: [
            { type: NodeType.API_CALL, method: 'GET', url, targetVar, fields: [], line: ctx.line }
          ], line: ctx.line });
          return ctx.i + 1;
        }
      }
    }
    // Block form
    const { body: loadBody, endIdx: loadEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({ type: NodeType.ON_PAGE_LOAD, body: loadBody, line: ctx.line });
    return loadEnd;
  }],
  ['create_pdf', (ctx) => {
    let pathExpr;
    if (ctx.tokens.length >= 2 && ctx.tokens[1].type === TokenType.STRING) {
      pathExpr = { type: NodeType.LITERAL_STRING, value: ctx.tokens[1].value, line: ctx.line };
    } else if (ctx.tokens.length >= 2 && ctx.tokens[1].type === TokenType.IDENTIFIER) {
      pathExpr = { type: NodeType.VARIABLE_REF, name: ctx.tokens[1].value, line: ctx.line };
    } else {
      ctx.errors.push({ line: ctx.line, message: "create pdf needs a file path. Example: create pdf 'report.pdf':" });
      return ctx.i + 1;
    }
    const block = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({ type: NodeType.CREATE_PDF, path: pathExpr, content: block.body, line: ctx.line });
    return block.endIdx;
  }],
  ['post_to', (ctx) => {
    const methodMap = { post_to: 'POST', get_from: 'GET', put_to: 'PUT', delete_from: 'DELETE' };
    const method = methodMap[ctx.tokens[0].canonical];
    let url = '';
    let pos = 1;
    if (pos < ctx.tokens.length && ctx.tokens[pos].type === TokenType.STRING) { url = ctx.tokens[pos].value; pos++; }
    // Parse "with field1, field2" or "with form data" (sends all input fields)
    const fields = [];
    let sendFormData = false;
    if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'with' || ctx.tokens[pos].canonical === 'with')) {
      pos++;
      // "with form data" or "with form" → send all input state fields
      if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'form' || ctx.tokens[pos].value === 'data')) {
        sendFormData = true;
      } else {
        // "with field1, field2, ..." → send specific fields
        while (pos < ctx.tokens.length) {
          if (ctx.tokens[pos].type === TokenType.COMMA) { pos++; continue; }
          if (ctx.tokens[pos].canonical === 'and') { pos++; continue; }
          fields.push(ctx.tokens[pos].value);
          pos++;
        }
      }
    }
    ctx.body.push({ type: NodeType.API_CALL, method, url, fields, sendFormData, line: ctx.line });
    return ctx.i + 1;
  }],
  ['get_from', (ctx) => {
    const method = 'GET';
    let url = '';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) url = ctx.tokens[1].value;
    ctx.body.push({ type: NodeType.API_CALL, method, url, fields: [], line: ctx.line });
    return ctx.i + 1;
  }],
  ['put_to', (ctx) => {
    const method = 'PUT';
    let url = '';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) url = ctx.tokens[1].value;
    ctx.body.push({ type: NodeType.API_CALL, method, url, fields: [], line: ctx.line });
    return ctx.i + 1;
  }],
  ['delete_from', (ctx) => {
    const method = 'DELETE';
    let url = '';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) url = ctx.tokens[1].value;
    ctx.body.push({ type: NodeType.API_CALL, method, url, fields: [], line: ctx.line });
    return ctx.i + 1;
  }],
  ['sort_by', (ctx) => {
    if (ctx.tokens.length < 3) return undefined;
    let byPos = -1;
    for (let k = 1; k < ctx.tokens.length; k++) {
      if (ctx.tokens[k].canonical === 'by') { byPos = k; break; }
    }
    if (byPos > 0 && byPos + 1 < ctx.tokens.length) {
      const listName = ctx.tokens[1].value;
      const field = ctx.tokens[byPos + 1].value;
      const descending = ctx.tokens.some(t => t.value === 'descending' || t.value === 'desc');
      ctx.body.push({ type: NodeType.LIST_SORT, list: listName, field, descending, line: ctx.line });
      return ctx.i + 1;
    }
    return undefined;
  }],
  ['deploy_to', (ctx) => {
    let platform = 'vercel';
    if (ctx.tokens.length > 1 && ctx.tokens[1].type === TokenType.STRING) {
      platform = ctx.tokens[1].value;
    } else if (ctx.tokens.length > 1 && (ctx.tokens[1].type === TokenType.IDENTIFIER || ctx.tokens[1].type === TokenType.KEYWORD)) {
      platform = ctx.tokens[1].value;
    }
    ctx.body.push(deployNode(platform, ctx.line));
    return ctx.i + 1;
  }],

  // --- Single-line parse-function handlers ---
  ['return', (ctx) => {
    const expr = parseExpression(ctx.tokens, 1, ctx.line);
    if (expr.error) ctx.errors.push({ line: ctx.line, message: expr.error });
    else ctx.body.push(returnNode(expr.node, ctx.line));
    return ctx.i + 1;
  }],
  ['write_file', (ctx) => {
    const parsed = parseWriteFile(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['save_to', (ctx) => {
    const parsed = parseSave(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['remove_from', (ctx) => {
    const parsed = parseRemoveFrom(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['wait_kw', (ctx) => {
    const parsed = parseWait(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['expect', (ctx) => {
    // --- English-readable test assertion CFG ---
    // "expect it succeeds"         → status 200 or 201
    // "expect it fails"            → status >= 400
    // "expect it requires login"   → status 401
    // "expect it is rejected"      → status 400
    // "expect it is not found"     → status 404
    // "expect response has X"      → body has field X
    // "expect response contains X" → body includes string X
    // "expect X has Y"             → variable X contains item matching Y
    if (ctx.tokens.length >= 3 && ctx.tokens[1].value === 'it') {
      const verb = ctx.tokens[2].value;
      if (verb === 'succeeds' || verb === 'works') {
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'status', check: 'success', value: null, field: null, line: ctx.line });
        return ctx.i + 1;
      }
      if (verb === 'fails') {
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'status', check: 'failure', value: null, field: null, line: ctx.line });
        return ctx.i + 1;
      }
      // "expect it requires login"
      if (verb === 'requires' && ctx.tokens.length >= 4 && ctx.tokens[3].value === 'login') {
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'status', check: 'equals', value: 401, field: null, line: ctx.line });
        return ctx.i + 1;
      }
      // "expect it is rejected"
      if ((verb === 'is' || ctx.tokens[2].canonical === 'is') && ctx.tokens.length >= 4) {
        const w = ctx.tokens[3].value;
        if (w === 'rejected') {
          ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'status', check: 'equals', value: 400, field: null, line: ctx.line });
          return ctx.i + 1;
        }
        if (w === 'not' && ctx.tokens.length >= 5 && ctx.tokens[4].value === 'found') {
          ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'status', check: 'equals', value: 404, field: null, line: ctx.line });
          return ctx.i + 1;
        }
      }
    }

    // "expect response has X" / "expect response contains 'text'"
    if (ctx.tokens.length >= 3 && ctx.tokens[1].value === 'response') {
      const prop = ctx.tokens[2].value; // status, body, has, contains
      // "expect response has field_name"
      if (prop === 'has' && ctx.tokens.length >= 4) {
        const field = ctx.tokens[3].type === TokenType.STRING ? ctx.tokens[3].value : ctx.tokens[3].value;
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'body', check: 'has_field', value: null, field, line: ctx.line });
        return ctx.i + 1;
      }
      // "expect response contains 'text'"
      if (prop === 'contains' && ctx.tokens.length >= 4) {
        const text = ctx.tokens[3].type === TokenType.STRING ? ctx.tokens[3].value : ctx.tokens[3].value;
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'body', check: 'contains', value: text, field: null, line: ctx.line });
        return ctx.i + 1;
      }
      if (prop === 'status' || prop === 'body') {
        let check = 'exists', value = null, field = null;
        let pos = 3;
        if (prop === 'status' && pos < ctx.tokens.length && (ctx.tokens[pos].canonical === 'is' || ctx.tokens[pos].type === TokenType.ASSIGN)) {
          pos++;
          if (pos < ctx.tokens.length && ctx.tokens[pos].type === TokenType.NUMBER) {
            check = 'equals'; value = ctx.tokens[pos].value;
          }
        }
        if (prop === 'body') {
          if (pos < ctx.tokens.length && ctx.tokens[pos].value === 'has') {
            pos++;
            check = 'has_field';
            if (pos < ctx.tokens.length) field = ctx.tokens[pos].value;
          } else if (pos < ctx.tokens.length && ctx.tokens[pos].value === 'length') {
            pos++;
            check = 'length';
            if (pos < ctx.tokens.length && (ctx.tokens[pos].canonical === 'is' || ctx.tokens[pos].type === TokenType.ASSIGN)) pos++;
            if (pos < ctx.tokens.length && ctx.tokens[pos].value === 'greater') {
              pos++;
              if (pos < ctx.tokens.length && ctx.tokens[pos].value === 'than') pos++;
              if (pos < ctx.tokens.length && ctx.tokens[pos].type === TokenType.NUMBER) value = ctx.tokens[pos].value;
            } else if (pos < ctx.tokens.length && ctx.tokens[pos].type === TokenType.NUMBER) {
              value = ctx.tokens[pos].value;
            }
          }
        }
        ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: prop, check, value, field, line: ctx.line });
        return ctx.i + 1;
      }
    }

    // "expect todos has 'Buy groceries'" — variable contains matching item
    if (ctx.tokens.length >= 4 && ctx.tokens[2].value === 'has') {
      const varName = ctx.tokens[1].value;
      const searchVal = ctx.tokens[3].type === TokenType.STRING ? ctx.tokens[3].value : ctx.tokens[3].value;
      ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'variable', check: 'contains', value: searchVal, field: varName, line: ctx.line });
      return ctx.i + 1;
    }

    // --- Unit-level value assertion ---
    // "expect <expr> is [comparator] <value>"
    // The tokenizer collapses comparison phrases into single tokens:
    //   "is not"         → single token, canonical "is not"
    //   "is greater than"→ single token, canonical "is greater than"
    //   "is less than"   → single token, canonical "is less than"
    //   "is at least"    → single token, canonical "is at least"
    //   "is at most"     → single token, canonical "is at most"
    //   "is"             → single token, canonical "is" (plain equality or empty check)
    // So we scan for any of these comparison tokens at position > 1 to split left/right.
    {
      const compCanonicals = new Set(['is', 'is not', 'is greater than', 'is less than', 'is at least', 'is at most']);
      const compIdx = ctx.tokens.findIndex((t, i) => i > 1 && compCanonicals.has(t.canonical));
      if (compIdx !== -1) {
        const compToken = ctx.tokens[compIdx];
        const leftTokens = ctx.tokens.slice(1, compIdx);
        const rightTokens = ctx.tokens.slice(compIdx + 1);
        const rawLeft = leftTokens.map(t => t.type === TokenType.STRING ? "'" + t.value + "'" : t.value).join(' ');

        // Determine check type from the comparison token canonical
        let check = 'eq';
        let rightExprTokens = rightTokens;

        const comp = compToken.canonical;
        if (comp === 'is greater than') {
          check = 'gt';
        } else if (comp === 'is less than') {
          check = 'lt';
        } else if (comp === 'is at least') {
          check = 'gte';
        } else if (comp === 'is at most') {
          check = 'lte';
        } else if (comp === 'is not') {
          // "is not empty" → not_empty; "is not <value>" → ne
          if (rightTokens.length > 0 && (rightTokens[0].canonical === 'nothing' || rightTokens[0].value === 'empty')) {
            check = 'not_empty'; rightExprTokens = [];
          } else {
            check = 'ne';
          }
        } else if (comp === 'is') {
          // "is empty" → empty; "is <value>" → eq
          if (rightTokens.length > 0 && (rightTokens[0].canonical === 'nothing' || rightTokens[0].value === 'empty')) {
            check = 'empty'; rightExprTokens = [];
          } else {
            check = 'eq';
          }
        }

        const leftParsed = leftTokens.length > 0 ? parseExpression(leftTokens, 0, ctx.line) : { error: 'Missing expression before comparison. Example: expect total is 100' };
        if (leftParsed.error) {
          ctx.errors.push({ line: ctx.line, message: leftParsed.error });
          return ctx.i + 1;
        }

        let rightNode = null;
        if (rightExprTokens.length > 0) {
          const rightParsed = parseExpression(rightExprTokens, 0, ctx.line);
          if (rightParsed.error) {
            ctx.errors.push({ line: ctx.line, message: rightParsed.error });
            return ctx.i + 1;
          }
          rightNode = rightParsed.node;
        }

        ctx.body.push({ type: NodeType.UNIT_ASSERT, left: leftParsed.node, check, right: rightNode, line: ctx.line, rawLeft });
        return ctx.i + 1;
      }
    }

    const parsed = parseExpect(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['rate_limit', (ctx) => {
    const parsed = parseRateLimit(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['increase', (ctx) => {
    const parsed = parseIncDec(ctx.tokens, ctx.line, 'increase');
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['decrease', (ctx) => {
    const parsed = parseIncDec(ctx.tokens, ctx.line, 'decrease');
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],

  // --- Multi-line parse-function handlers ---
  ['repeat', (ctx) => {
    const parsed = parseRepeatLoop(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['for_each', (ctx) => {
    const parsed = parseForEachLoop(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['while', (ctx) => {
    const parsed = parseWhileLoop(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['try', (ctx) => {
    const parsed = parseTryHandle(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['live', (ctx) => {
    // Decidable Core Path B Phase 1 (2026-04-25) — explicit effect fence.
    // Body is parsed permissively; Phase B-2 adds validator rejection of
    // effect-shaped calls outside live: blocks. See PHILOSOPHY.md Rule 18.
    const parsed = parseLiveBlock(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['use', (ctx) => {
    const parsed = parseUse(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['page', (ctx) => {
    const parsed = parsePage(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['section', (ctx) => {
    const parsed = parseSection(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['style', (ctx) => {
    const parsed = parseStyleDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['ask_for', (ctx) => {
    const parsed = parseAskFor(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['button', (ctx) => {
    const parsed = parseButton(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['test', (ctx) => {
    const parsed = parseTestDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['eval_block', (ctx) => {
    const parsed = parseEvalBlock(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['match_kw', (ctx) => {
    const parsed = parseMatch(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['stream', (ctx) => {
    // Frontend consumer: `stream <var> from '/url'` or `stream <var> from '/url' with <input>`
    // Opens a POST fetch, reads the response body as a text stream, and appends
    // each chunk to _state[var] so `display <var>` updates live as the server
    // writes `data: ...` frames. Backend-side `stream ask claude` writes those
    // frames; this is the client that reads them.
    {
      const tks = ctx.tokens;
      let fromIdx = -1;
      for (let k = 1; k < tks.length; k++) {
        if (tks[k].canonical === 'get_from' || (tks[k].value === 'from' && k + 1 < tks.length && tks[k + 1].type === TokenType.STRING)) {
          fromIdx = k; break;
        }
      }
      if (fromIdx > 1) {
        // Variable name is token[1] (skip 'stream')
        const variable = tks[1].value;
        // URL is the string right after 'from' (or the get_from multi-word token)
        const urlTok = tks[fromIdx].canonical === 'get_from' ? tks[fromIdx + 1] : tks[fromIdx + 1];
        if (urlTok && urlTok.type === TokenType.STRING) {
          const url = urlTok.value;
          // Optional: with <field1>, <field2>, ...
          let withPos = -1;
          for (let k = fromIdx + 2; k < tks.length; k++) {
            if (tks[k].value === 'with' || tks[k].canonical === 'with') { withPos = k; break; }
          }
          const fields = [];
          if (withPos > 0) {
            for (let k = withPos + 1; k < tks.length; k++) {
              if (tks[k].type === TokenType.COMMA || tks[k].canonical === 'and') continue;
              if (tks[k].type === TokenType.IDENTIFIER || tks[k].type === TokenType.KEYWORD) fields.push(tks[k].value);
            }
          }
          ctx.body.push({ type: NodeType.API_CALL, method: 'STREAM', url, fields, targetVar: variable, line: ctx.line });
          return ctx.i + 1;
        }
      }
    }
    // P13: "stream ask claude 'prompt' with context" — native AI streaming in endpoints
    if (ctx.tokens.length > 1 && (ctx.tokens[1].value === 'ask' || ctx.tokens[1].canonical === 'ask_ai')) {
      let pos = 2; // skip 'stream ask'
      // skip 'ai' / 'claude' if present
      if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'ai' || ctx.tokens[pos].value === 'claude')) pos++;
      // Parse prompt
      let prompt = null;
      if (pos < ctx.tokens.length && ctx.tokens[pos].type === TokenType.STRING) {
        prompt = { type: NodeType.LITERAL_STRING, value: ctx.tokens[pos].value, line: ctx.line };
        pos++;
      } else if (pos < ctx.tokens.length) {
        const pExpr = parseExpression(ctx.tokens, pos, ctx.line);
        if (!pExpr.error) { prompt = pExpr.node; pos = pExpr.pos || pos + 1; }
      }
      if (!prompt) {
        ctx.errors.push({ line: ctx.line, message: "stream ask needs a prompt. Example: stream ask claude 'Help the user' with data" });
        return ctx.i + 1;
      }
      // Parse optional 'with context'
      let context = null;
      if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'with' || ctx.tokens[pos].canonical === 'with')) {
        pos++;
        const cExpr = parseExpression(ctx.tokens, pos, ctx.line);
        if (!cExpr.error) { context = cExpr.node; pos = cExpr.pos || pos + 1; }
      }
      ctx.body.push({ type: NodeType.STREAM_AI, prompt, context, line: ctx.line });
      return ctx.i + 1;
    }
    const parsed = parseStream(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['subscribe_to', (ctx) => {
    const parsed = parseSubscribe(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['broadcast_to_all', (ctx) => {
    // broadcast to all <message> — inside a subscribe/websocket handler
    const tokens = ctx.lines[ctx.i].tokens;
    let pos = 1; // skip 'broadcast_to_all'
    while (pos < tokens.length && (tokens[pos].type === TokenType.RESERVED || tokens[pos].value === 'to' || tokens[pos].value === 'all')) pos++;
    const msgExpr = pos < tokens.length ? parsePrimary(tokens, pos, tokens[0].line, tokens.length) : null;
    ctx.body.push({ type: NodeType.BROADCAST, value: msgExpr?.node || null, line: tokens[0].line });
    return ctx.i + 1;
  }],
  ['update_database', (ctx) => {
    const parsed = parseUpdateDatabase(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.nodes) { for (const n of parsed.nodes) ctx.body.push(n); }
    return parsed.endIdx;
  }],
  ['migration_kw', (ctx) => {
    const parsed = parseMigration(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['accept_file', (ctx) => {
    const parsed = parseAcceptFile(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['data_from', (ctx) => {
    const parsed = parseExternalFetch(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['checkout', (ctx) => {
    const parsed = parseCheckout(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['webhook', (ctx) => {
    const parsed = parseWebhook(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['validate', (ctx) => {
    const parsed = parseValidateBlock(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  ['responds_with', (ctx) => {
    const parsed = parseRespondsWithBlock(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (parsed.node) ctx.body.push(parsed.node);
    return parsed.endIdx;
  }],
  // --- ROUTER FUNCTIONS (check tokens[1+] for sub-routing) ---
  ['show', (ctx) => {
    // Show loading: show loading [message]
    if (ctx.tokens.length >= 2 && ctx.tokens[1].value === 'loading') {
      let message = '';
      if (ctx.tokens.length >= 3 && ctx.tokens[2].type === TokenType.STRING) {
        message = ctx.tokens[2].value;
      }
      ctx.body.push({ type: NodeType.LOADING_ACTION, action: 'show', message, line: ctx.line });
      return ctx.i + 1;
    }
    // Toast: show toast|alert|notification 'message' [as warning/error/success]
    if (ctx.tokens.length >= 3 && (ctx.tokens[1].value === 'toast' || ctx.tokens[1].value === 'alert' || ctx.tokens[1].value === 'notification')) {
      let tPos = 2;
      let message = '';
      if (tPos < ctx.tokens.length && ctx.tokens[tPos].type === TokenType.STRING) {
        message = ctx.tokens[tPos].value; tPos++;
      }
      let variant = 'success';
      if (tPos < ctx.tokens.length && (ctx.tokens[tPos].value === 'as' || ctx.tokens[tPos].canonical === 'as_format')) {
        tPos++;
        if (tPos < ctx.tokens.length) variant = ctx.tokens[tPos].value.toLowerCase();
      }
      ctx.body.push({ type: NodeType.TOAST, message, variant, line: ctx.line });
      return ctx.i + 1;
    }
    // Display with modifiers: display X as Y called Z
    if (hasDisplayModifiers(ctx.tokens)) {
      const parsed = parseDisplay(ctx.tokens, ctx.line);
      if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
      else ctx.body.push(parsed.node);
      return ctx.i + 1;
    }
    // Plain show
    if (ctx.tokens.length <= 1) {
      ctx.errors.push({ line: ctx.line, message: "Show needs a value to display. Example: show heading 'Welcome' or show total" });
      return ctx.i + 1;
    }
    // Content keyword after show: show heading 'Welcome'
    const contentCanonicals = ['heading', 'subheading', 'content_text', 'bold_text', 'italic_text', 'small_text', 'label_text', 'badge_text', 'link', 'divider', 'code_block', 'image', 'video', 'audio'];
    if (contentCanonicals.includes(ctx.tokens[1].canonical)) {
      const contentTokens = ctx.tokens.slice(1);
      let parsed;
      if (ctx.tokens[1].canonical === 'image') {
        parsed = parseImage(contentTokens, ctx.line);
      } else if (ctx.tokens[1].canonical === 'video' || ctx.tokens[1].canonical === 'audio') {
        parsed = parseMedia(contentTokens, ctx.line, ctx.tokens[1].canonical);
      } else {
        parsed = parseContent(contentTokens, ctx.line, ctx.tokens[1].canonical);
      }
      if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
      else ctx.body.push(parsed.node);
      return ctx.i + 1;
    }
    // Component with children: show Card: + indented block
    if (ctx.tokens.length === 2 &&
        (ctx.tokens[1].type === TokenType.IDENTIFIER || ctx.tokens[1].type === TokenType.KEYWORD) &&
        ctx.i + 1 < ctx.lines.length && ctx.lines[ctx.i + 1].indent > ctx.indent) {
      const compName = ctx.tokens[1].value;
      const { body: childBody, endIdx: childEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.COMPONENT_USE, name: compName, children: childBody, props: [], line: ctx.line });
      return childEnd;
    }
    // Default: show expression
    const expr = parseExpression(ctx.tokens, 1, ctx.line);
    if (expr.error) ctx.errors.push({ line: ctx.line, message: expr.error });
    else ctx.body.push(showNode(expr.node, ctx.line));
    return ctx.i + 1;
  }],
  ['if', (ctx) => {
    // "when X notifies" and "when X changes" — these tokenize as canonical 'if'
    // because 'when' is a synonym for 'if'. Check raw value first.
    if (ctx.tokens[0].rawValue === 'when' || ctx.tokens[0].value === 'when') {
      // "when X notifies '/path':" — webhook
      if (ctx.tokens.length >= 4 && ctx.tokens[2].value === 'notifies' &&
          ctx.tokens[3].type === TokenType.STRING) {
        const service = ctx.tokens[1].value;
        const path = ctx.tokens[3].value;
        const result = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
        ctx.body.push({ type: NodeType.WEBHOOK, path, service, body: result.body, line: ctx.line });
        return result.endIdx;
      }
      // "when X changes:" — reactive input handler
      if (ctx.tokens.length >= 3 && ctx.tokens[2].value === 'changes') {
        const varName = ctx.tokens[1].value;
        let debounceMs = 0;
        if (ctx.tokens.length >= 5 && ctx.tokens[3].value === 'after') {
          const delayVal = ctx.tokens[4].value;
          if (typeof delayVal === 'number') {
            debounceMs = delayVal;
          } else {
            const match = String(delayVal).match(/^(\d+)(ms)?$/);
            if (match) debounceMs = parseInt(match[1], 10);
          }
        }
        const { body: changeBody, endIdx: changeEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
        ctx.body.push({ type: NodeType.ON_CHANGE, variable: varName, debounceMs, body: changeBody, line: ctx.line });
        return changeEnd;
      }
      // Fall through to normal if/guard handling
    }
    // Guard: "check X, otherwise error 'msg'" (check tokenizes as 'if')
    let otherwiseIdx = -1;
    for (let k = 1; k < ctx.tokens.length; k++) {
      if (ctx.tokens[k].canonical === 'otherwise' && k + 1 < ctx.tokens.length && ctx.tokens[k + 1].value === 'error') {
        otherwiseIdx = k; break;
      }
    }
    if (otherwiseIdx !== -1) {
      const errorMsgIdx = otherwiseIdx + 2;
      const guardMessage = (errorMsgIdx < ctx.tokens.length && ctx.tokens[errorMsgIdx].type === TokenType.STRING)
        ? ctx.tokens[errorMsgIdx].value : 'Validation failed';
      let condEnd = otherwiseIdx;
      if (condEnd > 1 && ctx.tokens[condEnd - 1].type === TokenType.COMMA) condEnd--;
      const result = parseExpression(ctx.tokens, 1, ctx.line, condEnd);
      if (result.error) ctx.errors.push({ line: ctx.line, message: result.error });
      else ctx.body.push(guardNode(result.node, ctx.line, guardMessage));
      return ctx.i + 1;
    }
    // Block if: no "then" keyword → parseIfBlock
    const hasThen = ctx.tokens.some(t => t.canonical === 'then');
    if (!hasThen) {
      const result = parseIfBlock(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) { ctx.body.push(result.node); return result.endIdx; }
    }
    // Inline if-then
    const parsed = parseIfThen(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['respond', (ctx) => {
    // If this line is actually an assignment (`reply = X`, `send = X`, etc.), fall
    // through — the respond/send/reply words are synonyms but also common variable
    // names. parseAssignment accepts KEYWORD tokens as names; we just need to not
    // eat the line here first.
    if (ctx.tokens.length >= 2 && (ctx.tokens[1].type === TokenType.ASSIGN)) {
      return undefined;
    }
    // Order matters — most specific first
    // 1. sendgrid: send email via sendgrid: + config block
    if (ctx.tokens.length >= 4 && ctx.tokens[1].value === 'email' &&
        ctx.tokens[2].value === 'via' && ctx.tokens[3].value === 'sendgrid' &&
        ctx.i + 1 < ctx.lines.length && ctx.lines[ctx.i + 1].indent > ctx.indent) {
      const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
      ctx.body.push({ type: NodeType.SERVICE_CALL, service: 'sendgrid', config, line: ctx.line });
      return endIdx;
    }
    // 2. Email with inline recipient: send email to <expr>: + subject/body block
    if (ctx.tokens.length >= 4 && ctx.tokens[1].value === 'email' &&
        ctx.tokens[2].canonical === 'to_connector' &&
        ctx.i + 1 < ctx.lines.length && ctx.lines[ctx.i + 1].indent > ctx.indent) {
      // Parse the recipient expression (everything between "to" and end of line)
      const recipientTokens = ctx.tokens.slice(3);
      let recipientExpr;
      if (recipientTokens.length === 1 && recipientTokens[0].type === TokenType.STRING) {
        recipientExpr = literalString(recipientTokens[0].value, ctx.line);
      } else {
        const expr = parseExpression(recipientTokens, 0, ctx.line);
        recipientExpr = expr.error ? literalString(recipientTokens.map(t => t.value).join(''), ctx.line) : expr.node;
      }
      const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
      config._inlineRecipient = recipientExpr;
      ctx.body.push({ type: NodeType.SEND_EMAIL, config, line: ctx.line });
      return endIdx;
    }
    // 3. SMTP email: send email: + config block (no inline recipient)
    if (ctx.tokens.length >= 2 && ctx.tokens[1].value === 'email' &&
        ctx.i + 1 < ctx.lines.length && ctx.lines[ctx.i + 1].indent > ctx.indent) {
      const { config, endIdx } = parseConfigBlock(ctx.lines, ctx.i + 1, ctx.indent);
      ctx.body.push({ type: NodeType.SEND_EMAIL, config, line: ctx.line });
      return endIdx;
    }
    // 3. API call: send X to '/url'
    // Also handle `send X as a new post to '/url'` — here the tokenizer has
    // greedy-matched `post to` as a single `post_to` token (or `put to`,
    // `delete from`, `get from`), so we treat those as the URL connector too.
    // Without this, the resource word gets swallowed and the whole line is
    // misinterpreted as `send back X`.
    if (ctx.tokens.length >= 3) {
      let toPos = -1;
      let methodOverride = null; // 'POST'|'PUT'|'DELETE'|'GET' if greedy method-token found
      for (let k = 1; k < ctx.tokens.length; k++) {
        const t = ctx.tokens[k];
        // Plain "to" followed by URL string
        if (t.canonical === 'to_connector' && k + 1 < ctx.tokens.length && ctx.tokens[k + 1].type === TokenType.STRING) {
          toPos = k; break;
        }
        // Greedy method synonyms: `post to`, `put to`, `get from`, `delete from`
        // When seen in `send X as a new <resource> post to URL` style, the
        // preceding word (`post`/`put`/etc.) is actually the resource name,
        // not a method — treat the canonical token as the URL connector.
        const METHOD_MAP = { post_to: 'POST', put_to: 'PUT', get_from: 'GET', delete_from: 'DELETE' };
        if (METHOD_MAP[t.canonical] && k + 1 < ctx.tokens.length && ctx.tokens[k + 1].type === TokenType.STRING) {
          toPos = k;
          // Only override method if it's not the default POST — caller wrote
          // `send X put to` → use PUT; `send X post to` → stay POST (default).
          methodOverride = METHOD_MAP[t.canonical];
          break;
        }
      }
      if (toPos > 0) {
        const fields = [];
        const SKIP_WORDS = new Set(['as', 'a', 'an', 'new', 'the']);
        let inAsClause = false;
        for (let k = 1; k < toPos; k++) {
          if (ctx.tokens[k].canonical === 'and' || ctx.tokens[k].type === TokenType.COMMA) continue;
          const val = ctx.tokens[k].value?.toLowerCase();
          if (val === 'as') { inAsClause = true; continue; }
          if (inAsClause) continue;
          if (SKIP_WORDS.has(val)) continue;
          if (ctx.tokens[k].type === TokenType.IDENTIFIER || ctx.tokens[k].type === TokenType.KEYWORD) {
            fields.push(ctx.tokens[k].value);
          }
        }
        const url = ctx.tokens[toPos + 1].value;
        // When `post_to`/`put_to`/etc. captured the connector, the token
        // before it (if it's an identifier like `post`/`ticket`/`widget`) was
        // the resource name being created. It appears twice: once as the
        // greedy canonical token's first word, once visually in `as a new X`.
        // It's already consumed, so no extra work to strip from `fields`.
        const method = methodOverride || 'POST';
        ctx.body.push({ type: NodeType.API_CALL, method, url, fields, line: ctx.line });
        return ctx.i + 1;
      }
    }
    // 4. General respond: send back data
    const parsed = parseRespond(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  // NOTE: 'respond_with' removed — not in synonym table, was dead code.
  // Covered by 'responds_with' (synonym) and 'send_back' (canonical).
  ['set', (ctx) => {
    // Function def: "create function X:" / "make function X:"
    if (ctx.tokens.length > 1 && ctx.tokens[1].canonical === 'function') {
      const result = parseFunctionDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) { ctx.body.push(result.node); return result.endIdx; }
    }
    // Data shape: "create a Users table:" / "create data shape User:"
    if (ctx.tokens.length > 2 &&
        (ctx.tokens[1].canonical === 'data_shape' ||
         (ctx.tokens.length > 3 && ctx.tokens.some(t => t.canonical === 'data_shape')))) {
      const result = parseDataShape(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) ctx.body.push(result.node);
      return result.endIdx;
    }
    // Cookies (T2 #42): "set cookie 'name' to value" / "set signed cookie 'name' to value"
    // Secure-by-default: compiler emits httpOnly + sameSite='lax' + secure in prod.
    // `set signed cookie` flips `signed: true` + requires cookieParser(secret)
    // at module top; secret comes from process.env.COOKIE_SECRET with a
    // loud fallback warning that prints if unset at runtime.
    const signedIdx = ctx.tokens.length >= 6 &&
        typeof ctx.tokens[1].value === 'string' &&
        ctx.tokens[1].value.toLowerCase() === 'signed' &&
        typeof ctx.tokens[2].value === 'string' &&
        ctx.tokens[2].value.toLowerCase() === 'cookie' &&
        ctx.tokens[3].type === TokenType.STRING
      ? 2 : null;
    if (signedIdx !== null) {
      // set signed cookie 'name' to value  — name at idx 3, `to` somewhere after
      const cookieName = ctx.tokens[3].value;
      let toPos = -1;
      for (let k = 4; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'to_connector') { toPos = k; break; }
      }
      if (toPos > 0 && toPos + 1 < ctx.tokens.length) {
        const valueExpr = parseExpression(ctx.tokens, toPos + 1, ctx.line, ctx.tokens.length);
        if (!valueExpr.error) {
          ctx.body.push({
            type: NodeType.COOKIE_SET,
            name: cookieName,
            value: valueExpr.node,
            maxAgeMs: null,
            signed: true,
            line: ctx.line,
          });
          return ctx.i + 1;
        }
      }
    }
    if (ctx.tokens.length >= 5 &&
        typeof ctx.tokens[1].value === 'string' &&
        ctx.tokens[1].value.toLowerCase() === 'cookie' &&
        ctx.tokens[2].type === TokenType.STRING) {
      // set cookie 'name' to value [for N hours/days]
      const cookieName = ctx.tokens[2].value;
      // Find `to` connector
      let toPos = -1;
      for (let k = 3; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'to_connector') { toPos = k; break; }
      }
      if (toPos > 0 && toPos + 1 < ctx.tokens.length) {
        // Look for optional `for N hours/days` at end (maxAge)
        let valueEnd = ctx.tokens.length;
        let maxAgeMs = null;
        for (let k = toPos + 1; k < ctx.tokens.length; k++) {
          // `for` canonicalizes to `for_target` in the synonym table; that's
          // the canonical I check. Raw-value check as belt-and-suspenders
          // in case a future synonym pass changes the canonical.
          const isFor = ctx.tokens[k].canonical === 'for_target' ||
            (typeof ctx.tokens[k].value === 'string' && ctx.tokens[k].value.toLowerCase() === 'for');
          if (isFor && k + 2 < ctx.tokens.length) {
            const num = ctx.tokens[k + 1];
            const unit = typeof ctx.tokens[k + 2].value === 'string' ? ctx.tokens[k + 2].value.toLowerCase() : '';
            if (num.type === TokenType.NUMBER && ['hour', 'hours', 'day', 'days', 'minute', 'minutes'].includes(unit)) {
              const multiplier = unit.startsWith('hour') ? 3600000
                : unit.startsWith('day') ? 86400000
                : 60000; // minutes
              maxAgeMs = num.value * multiplier;
              valueEnd = k;
              break;
            }
          }
        }
        const valueExpr = parseExpression(ctx.tokens, toPos + 1, ctx.line, valueEnd);
        if (!valueExpr.error) {
          ctx.body.push({
            type: NodeType.COOKIE_SET,
            name: cookieName,
            value: valueExpr.node,
            maxAgeMs,
            line: ctx.line,
          });
          return ctx.i + 1;
        }
      }
    }
    // Map set: "set key in scope to value"
    if (ctx.tokens.length >= 5) {
      let inPos = -1, toPos = -1;
      for (let k = 1; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'in' && inPos < 0) inPos = k;
        if (ctx.tokens[k].canonical === 'to_connector' && inPos > 0) { toPos = k; break; }
      }
      if (inPos > 0 && toPos > inPos && toPos + 1 < ctx.tokens.length) {
        const keyExpr = parseExpression(ctx.tokens, 1, ctx.line, inPos);
        const mapExpr = parseExpression(ctx.tokens, inPos + 1, ctx.line, toPos);
        const valExpr = parseExpression(ctx.tokens, toPos + 1, ctx.line);
        if (!keyExpr.error && !mapExpr.error && !valExpr.error) {
          ctx.body.push({ type: NodeType.MAP_SET, map: mapExpr.node, key: keyExpr.node, value: valExpr.node, line: ctx.line });
          return ctx.i + 1;
        }
      }
    }
    // Everything else (set x = 5, create person:) → fall through to assignment
    return undefined;
  }],
  // T2 #42 cookies — clear cookie 'name' / remove cookie 'name'.
  // Compiles to res.clearCookie on JS backend. Same security posture
  // as set (matches the attributes Express uses by default).
  ['clear', (ctx) => {
    if (ctx.tokens.length >= 3 &&
        typeof ctx.tokens[1].value === 'string' &&
        ctx.tokens[1].value.toLowerCase() === 'cookie' &&
        ctx.tokens[2].type === TokenType.STRING) {
      ctx.body.push({
        type: NodeType.COOKIE_CLEAR,
        name: ctx.tokens[2].value,
        line: ctx.line,
      });
      return ctx.i + 1;
    }
    return undefined;
  }],
  // Upsert (T2 #47): "upsert X to Y by <field>" — insert if no row
  // has the match field value, otherwise update the existing row.
  // Compiles to findOne + if/else in the CRUD emit path.
  ['upsert', (ctx) => {
    if (ctx.tokens.length >= 5) {
      // upsert <var> to <Table> by <field>
      const varTok = ctx.tokens[1];
      // Find `to` and `by`
      let toPos = -1, byPos = -1;
      for (let k = 2; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'to_connector' && toPos < 0) toPos = k;
        if (ctx.tokens[k].value === 'by' && toPos > 0 && byPos < 0) { byPos = k; break; }
      }
      if (varTok && toPos > 0 && byPos > toPos && toPos + 1 < ctx.tokens.length && byPos + 1 < ctx.tokens.length) {
        const variable = varTok.value;
        const target = ctx.tokens[toPos + 1].value;
        const matchField = ctx.tokens[byPos + 1].value;
        ctx.body.push({
          type: NodeType.CRUD,
          operation: 'upsert',
          variable,
          target,
          matchField,
          line: ctx.line,
          _sourceFile: ctx.sourceFile || 'main.clear',
          _rawSource: ctx.lines[ctx.i]?.raw || '',
        });
        return ctx.i + 1;
      }
    }
    return undefined;
  }],
  // `table X:` shorthand — route to parseDataShape without the `create a`
  // prefix. Session 45 friction data showed Meph frequently reached for this
  // form (items #6 + #7, 12 rows combined) expecting it to work because
  // `table` is the canonical of `data_shape` in the synonym table. The `set`
  // handler above catches `create a X table:` but not the bare `table X:`
  // lead. Handler mirrors the same parseDataShape forwarding.
  ['data_shape', (ctx) => {
    if (ctx.tokens.length >= 2) {
      const result = parseDataShape(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) ctx.body.push(result.node);
      return result.endIdx;
    }
    return undefined;
  }],
  ['remove', (ctx) => {
    // CRUD delete: "delete the Todo with this id" (4+ tokens, table pattern)
    if (ctx.tokens.length >= 4) {
      let dPos = 1;
      if (ctx.tokens[dPos]?.value === 'the' || ctx.tokens[dPos]?.value === 'this') dPos++;
      if (dPos + 2 < ctx.tokens.length && dPos < ctx.tokens.length &&
          (ctx.tokens[dPos + 1]?.value === 'with' || ctx.tokens[dPos + 1]?.value === 'whose') &&
          (ctx.tokens[dPos + 2]?.value === 'this' || ctx.tokens[dPos + 2]?.value === 'that')) {
        const tableName = ctx.tokens[dPos].value;
        let paramName = 'id';
        if (dPos + 3 < ctx.tokens.length) paramName = ctx.tokens[dPos + 3].value;
        const condition = {
          type: NodeType.BINARY_OP, operator: '==',
          left: { type: NodeType.VARIABLE_REF, name: paramName, line: ctx.line },
          right: { type: NodeType.MEMBER_ACCESS, object: { type: NodeType.VARIABLE_REF, name: 'incoming', line: ctx.line }, member: paramName, line: ctx.line },
          line: ctx.line
        };
        ctx.body.push(crudNode('remove', null, tableName, condition, ctx.line));
        return ctx.i + 1;
      }
    }
    // List remove: "remove X from Y" (3 tokens)
    if (ctx.tokens.length >= 3) {
      let fromPos = -1;
      for (let k = 1; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'in' || ctx.tokens[k].value === 'from') { fromPos = k; break; }
      }
      if (fromPos > 0 && fromPos + 1 < ctx.tokens.length) {
        const valExpr = parseExpression(ctx.tokens, 1, ctx.line, fromPos);
        const listName = ctx.tokens[fromPos + 1].value;
        if (!valExpr.error) {
          ctx.body.push({ type: NodeType.LIST_REMOVE, list: listName, value: valExpr.node, line: ctx.line });
          return ctx.i + 1;
        }
      }
    }
    return undefined;
  }],
  ['function', (ctx) => {
    // Also matches 'define function' — 'define' router falls through here
    const result = parseFunctionDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
  }],
  ['to_connector', (ctx) => {
    // "to greet with name:" — function definition alias
    if (ctx.tokens.length > 1 &&
        (ctx.tokens[1].type === TokenType.IDENTIFIER || ctx.tokens[1].type === TokenType.KEYWORD)) {
      const result = parseFunctionDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) { ctx.body.push(result.node); return result.endIdx; }
    }
    return undefined; // not a function — fall through to other handlers
  }],
  ['call_api', (ctx) => {
    // Standalone: call api 'url': + config block
    let urlPos = 1;
    if (urlPos < ctx.tokens.length && ctx.tokens[urlPos].type === TokenType.STRING) {
      const urlNode = { type: NodeType.LITERAL_STRING, value: ctx.tokens[urlPos].value, line: ctx.line };
      const config = { method: null, headers: [], body: null, timeout: null };
      let j = ctx.i + 1;
      while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent) {
        const cfgTokens = ctx.lines[j].tokens;
        if (cfgTokens.length === 0 || cfgTokens[0].type === TokenType.COMMENT) { j++; continue; }
        const key = cfgTokens[0].value?.toLowerCase();
        if (key === 'method' && cfgTokens.length >= 3) {
          const isIdx = cfgTokens.findIndex((t, idx) => idx > 0 && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
          if (isIdx >= 0 && isIdx + 1 < cfgTokens.length) config.method = cfgTokens[isIdx + 1].value.toUpperCase();
        } else if (key === 'headers' && cfgTokens.length >= 2) {
          j++;
          while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent + 2) {
            const hTokens = ctx.lines[j].tokens;
            if (hTokens.length >= 3) {
              const headerName = hTokens[0].value;
              const nameIdx = 0;
              const isIdx = hTokens.findIndex((t, idx) => idx > nameIdx && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
              if (isIdx >= 0) {
                const valExpr = parseExpression(hTokens, isIdx + 1, ctx.lines[j].tokens[0].line);
                if (!valExpr.error) config.headers.push({ name: headerName, value: valExpr.node });
              }
            }
            j++;
          }
          continue;
        } else if (key === 'body' && cfgTokens.length >= 3) {
          const isIdx = cfgTokens.findIndex((t, idx) => idx > 0 && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
          if (isIdx >= 0) {
            const valExpr = parseExpression(cfgTokens, isIdx + 1, ctx.lines[j].tokens[0].line);
            if (!valExpr.error) config.body = valExpr.node;
          }
        } else if (key === 'timeout' && cfgTokens.length >= 3) {
          const numIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.NUMBER);
          if (numIdx >= 0) {
            const val = cfgTokens[numIdx].value;
            let unit = 'seconds';
            if (numIdx + 1 < cfgTokens.length) unit = cfgTokens[numIdx + 1].value?.toLowerCase() || 'seconds';
            config.timeout = { value: val, unit };
          }
        }
        j++;
      }
      ctx.body.push({ type: NodeType.HTTP_REQUEST, url: urlNode, config, line: ctx.line });
      return j;
    }
    return undefined;
  }],
  ['as_format', (ctx) => {
    // Transaction: "as one operation:"
    if (ctx.tokens.length >= 2 && ctx.tokens[1].value === 'one' &&
        ctx.tokens.some(t => t.value === 'operation')) {
      const { body: txBody, endIdx: txEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.TRANSACTION, body: txBody, line: ctx.line });
      return txEnd;
    }
    return undefined;
  }],
  // T2 #48 — transaction synonyms. Natural English forms Meph keeps
  // writing: `atomically:`, `transaction:`, `begin transaction:`. All
  // route to the same NodeType.TRANSACTION the canonical `as one
  // operation:` produces. Keyword handlers dispatch by the first token
  // value (raw, lowercased) so we register each form explicitly.
  ['atomically', (ctx) => {
    if (ctx.tokens.length === 1 || (ctx.tokens.length === 2 && ctx.tokens[1].value === ':')) {
      const { body: txBody, endIdx: txEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.TRANSACTION, body: txBody, line: ctx.line });
      return txEnd;
    }
    return undefined;
  }],
  ['transaction', (ctx) => {
    if (ctx.tokens.length === 1 || (ctx.tokens.length === 2 && ctx.tokens[1].value === ':')) {
      const { body: txBody, endIdx: txEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.TRANSACTION, body: txBody, line: ctx.line });
      return txEnd;
    }
    return undefined;
  }],
  ['begin', (ctx) => {
    if (ctx.tokens.length >= 2 &&
        typeof ctx.tokens[1].value === 'string' &&
        ctx.tokens[1].value.toLowerCase() === 'transaction') {
      const { body: txBody, endIdx: txEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.TRANSACTION, body: txBody, line: ctx.line });
      return txEnd;
    }
    return undefined;
  }],
  ['with', (ctx) => {
    // Timeout: "with timeout 5 seconds:"
    if (ctx.tokens.length >= 3 && ctx.tokens[1].value === 'timeout') {
      const amount = typeof ctx.tokens[2].value === 'number' ? ctx.tokens[2].value : parseInt(ctx.tokens[2].value, 10) || 5;
      let ms = amount * 1000;
      if (ctx.tokens.length >= 4 && (ctx.tokens[3].value === 'minutes' || ctx.tokens[3].value === 'minute')) {
        ms = amount * 60000;
      }
      const { body: toBody, endIdx: toEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
      ctx.body.push({ type: NodeType.TIMEOUT, ms, body: toBody, line: ctx.line });
      return toEnd;
    }
    return undefined;
  }],
  ['text_input', (ctx) => {
    const parsed = parseNewInput(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['number_input', (ctx) => {
    const parsed = parseNewInput(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['dropdown', (ctx) => {
    const parsed = parseNewInput(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['text_area', (ctx) => {
    const parsed = parseNewInput(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['checkbox', (ctx) => {
    // Guard: "toggle the X panel" is a panel action, not a checkbox
    if (ctx.tokens.length >= 2 && (ctx.tokens[1].value === 'the' || ctx.tokens[1].value === 'this')) {
      return undefined; // fall through to panel action handler
    }
    const parsed = parseNewInput(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['heading', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['subheading', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['content_text', (ctx) => {
    // Guard: 'text' acts as content when followed by a STRING literal or a variable reference
    // 'text is join(words)' is an assignment, not content — check for 'is'/'=' to avoid that
    if (ctx.tokens.length <= 1) return undefined;
    const nextTok = ctx.tokens[1];
    const isAssign = nextTok.value === 'is' || nextTok.value === '=' || nextTok.canonical === 'assign';
    if (isAssign) return undefined;
    // String with concatenation: text 'Price: ' + price → expression (dynamic content)
    // Pure string: text 'Hello' → static content via parseContent
    if (nextTok.type === TokenType.STRING) {
      // Check if there's an operator after the string (e.g. + price)
      const hasConcat = ctx.tokens.length > 2 && ctx.tokens[2].type === TokenType.OPERATOR;
      if (hasConcat) {
        // Parse as full expression: 'Price: ' + price
        const expr = parseExpression(ctx.tokens, 1, ctx.line);
        if (expr.error) ctx.errors.push({ line: ctx.line, message: expr.error });
        else ctx.body.push(showNode(expr.node, ctx.line));
        return ctx.i + 1;
      }
      const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
      if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
      else ctx.body.push(parsed.node);
      return ctx.i + 1;
    }
    // Variable/expression: text item → show node with expression (like 'show item')
    if (nextTok.type === TokenType.IDENTIFIER || nextTok.type === TokenType.KEYWORD) {
      const expr = parseExpression(ctx.tokens, 1, ctx.line);
      if (expr.error) ctx.errors.push({ line: ctx.line, message: expr.error });
      else ctx.body.push(showNode(expr.node, ctx.line));
      return ctx.i + 1;
    }
    return undefined;
  }],
  ['bold_text', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['italic_text', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['small_text', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['label_text', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['badge_text', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['link', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['divider', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['image', (ctx) => {
    const parsed = parseImage(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['video', (ctx) => {
    const parsed = parseMedia(ctx.tokens, ctx.line, 'video');
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['audio', (ctx) => {
    const parsed = parseMedia(ctx.tokens, ctx.line, 'audio');
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['code_block', (ctx) => {
    const parsed = parseContent(ctx.tokens, ctx.line, ctx.tokens[0].canonical);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
  }],
  ['background_job', (ctx) => {
    const result = parseBackground(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
  }],
  ['get_key', (ctx) => {
    // "get X from '/url'" — standalone named fetch
    // "get X from '/url' with field1, field2" — fetch that SENDS input fields.
    // When the target endpoint streams (ask claude), the compiler uses those
    // fields as a POST body and reads the SSE stream into X. When the target
    // is a regular JSON endpoint, the fields are currently ignored (plain GET).
    if (ctx.tokens.length >= 4 && ctx.tokens[1].type === TokenType.IDENTIFIER) {
      const fromIdx = ctx.tokens.findIndex((t, idx) => idx >= 2 && t.value === 'from');
      if (fromIdx > 0 && fromIdx + 1 < ctx.tokens.length && ctx.tokens[fromIdx + 1].type === TokenType.STRING) {
        const targetVar = ctx.tokens[1].value;
        const url = ctx.tokens[fromIdx + 1].value;
        // Optional: "with field1, field2, ..." → collect input fields
        const fields = [];
        let withPos = -1;
        for (let k = fromIdx + 2; k < ctx.tokens.length; k++) {
          if (ctx.tokens[k].value === 'with' || ctx.tokens[k].canonical === 'with') { withPos = k; break; }
        }
        if (withPos > 0) {
          for (let k = withPos + 1; k < ctx.tokens.length; k++) {
            if (ctx.tokens[k].type === TokenType.COMMA || ctx.tokens[k].canonical === 'and') continue;
            if (ctx.tokens[k].type === TokenType.IDENTIFIER || ctx.tokens[k].type === TokenType.KEYWORD) {
              fields.push(ctx.tokens[k].value);
            }
          }
        }
        ctx.body.push({ type: NodeType.API_CALL, method: 'GET', url, targetVar, fields, line: ctx.line });
        return ctx.i + 1;
      }
    }
    return undefined;
  }],
  ['add', (ctx) => {
    // "add X to Y" — list push
    if (ctx.tokens.length >= 3) {
      let toPos = -1;
      for (let k = 1; k < ctx.tokens.length; k++) {
        if (ctx.tokens[k].canonical === 'to_connector') { toPos = k; break; }
      }
      if (toPos > 0 && toPos + 1 < ctx.tokens.length) {
        const valExpr = parseExpression(ctx.tokens, 1, ctx.line, toPos);
        const listName = ctx.tokens[toPos + 1].value;
        if (!valExpr.error) {
          ctx.body.push({ type: NodeType.LIST_PUSH, list: listName, value: valExpr.node, line: ctx.line });
          return ctx.i + 1;
        }
      }
    }
    return undefined;
  }],
  ['define', (ctx) => {
    // Component: define component X receiving a, b:
    if (ctx.tokens.length >= 3 && ctx.tokens[1].canonical === 'component') {
      const result = parseComponentDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
      if (result.node) ctx.body.push(result.node);
      return result.endIdx;
    }
    // Define-as: define X as: expr
    if (ctx.tokens.length >= 3 &&
        (ctx.tokens[1].type === TokenType.IDENTIFIER || ctx.tokens[1].type === TokenType.KEYWORD) &&
        (ctx.tokens[2].canonical === 'as_format' || ctx.tokens[2].canonical === 'as' ||
         (typeof ctx.tokens[2].value === 'string' && ctx.tokens[2].value.toLowerCase() === 'as'))) {
      const parsed = parseDefineAs(ctx.tokens, ctx.line);
      if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
      else ctx.body.push(parsed.node);
      return ctx.i + 1;
    }
    // Function: define function X(args): OR define X with Y:
    const result = parseFunctionDef(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) { ctx.body.push(result.node); return result.endIdx; }
    return undefined;
  }],
]);

// ── Formerly RAW_DISPATCH — now unified into CANONICAL_DISPATCH ──────────────
// These words used to need a separate dispatch map because they had no synonyms.
// Now they all have self-synonyms (e.g. database → database) so every token has
// a .canonical value and one map handles everything.

CANONICAL_DISPATCH.set('database', (ctx) => {
    if (ctx.tokens.length < 3 || !(ctx.tokens[1].canonical === 'is' || ctx.tokens[1].type === TokenType.ASSIGN)) return undefined;
    const parts = ctx.tokens.slice(2).map(t => t.value);
    const atIdx = parts.indexOf('at');
    const backend = atIdx >= 0 ? parts.slice(0, atIdx).join(' ') : parts.join(' ');
    let connectionExpr = null;
    if (atIdx >= 0 && atIdx + 1 < parts.length) {
      connectionExpr = parseExpression(ctx.tokens, 2 + atIdx + 1, ctx.line);
      if (connectionExpr.error) connectionExpr = null;
      else connectionExpr = connectionExpr.node;
    }
    ctx.body.push({ type: NodeType.DATABASE_DECL, backend: backend.toLowerCase(), connection: connectionExpr, line: ctx.line });
    return ctx.i + 1;
});
// `owner is 'email'` — declares who can edit a running app via the Live
// App Editing widget. Only fires at top level and only when the line is
// exactly "owner is <string>". The word "owner" is also valid inside
// policies for RLS rules ("owner can read"); that path is handled deeper
// by the table parser and never reaches this dispatch.
CANONICAL_DISPATCH.set('owner', (ctx) => {
    if (ctx.tokens.length < 3) return undefined;
    if (!(ctx.tokens[1].canonical === 'is' || ctx.tokens[1].type === TokenType.ASSIGN)) return undefined;
    const emailTok = ctx.tokens[2];
    if (emailTok.type !== TokenType.STRING) return undefined;
    ctx.body.push({ type: NodeType.OWNER_DECL, email: emailTok.value, line: ctx.line });
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('chart', (ctx) => {
    // Old syntax: chart 'Title' as bar showing data — still supported
    if (ctx.tokens.length < 4 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const parsed = parseChart(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('bar', (ctx) => {
    if (ctx.tokens.length < 4 || ctx.tokens[1].value !== 'chart') return undefined;
    const parsed = parseChartTypeFirst(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('line', (ctx) => {
    if (ctx.tokens.length < 4 || ctx.tokens[1].value !== 'chart') return undefined;
    const parsed = parseChartTypeFirst(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('pie', (ctx) => {
    if (ctx.tokens.length < 4 || ctx.tokens[1].value !== 'chart') return undefined;
    const parsed = parseChartTypeFirst(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('area', (ctx) => {
    if (ctx.tokens.length < 4 || ctx.tokens[1].value !== 'chart') return undefined;
    const parsed = parseChartTypeFirst(ctx.tokens, ctx.line);
    if (parsed.error) ctx.errors.push({ line: ctx.line, message: parsed.error });
    else ctx.body.push(parsed.node);
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('agent', (ctx) => {
    if (ctx.tokens.length < 2) return undefined;
    const result = parseAgent(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('script', (ctx) => {
    const scriptLines = [];
    let j = ctx.i + 1;
    while (j < ctx.lines.length && ctx.lines[j].indent > ctx.indent) {
      scriptLines.push(ctx.lines[j].raw || ctx.lines[j].tokens.map(t => t.value).join(' '));
      j++;
    }
    if (scriptLines.length === 0) {
      ctx.errors.push({ line: ctx.line, message: "script: block is empty — add indented JavaScript code below it" });
    } else {
      ctx.body.push({ type: NodeType.SCRIPT, code: scriptLines.join('\n'), line: ctx.line });
    }
    return j;
});
CANONICAL_DISPATCH.set('tab', (ctx) => {
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const tabTitle = ctx.tokens[1].value;
    const { body: tabBody, endIdx: tabEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({ type: NodeType.TAB, title: tabTitle, body: tabBody, line: ctx.line });
    return tabEnd;
});
CANONICAL_DISPATCH.set('retry', (ctx) => {
    if (ctx.tokens.length < 3) return undefined;
    const count = typeof ctx.tokens[1].value === 'number' ? ctx.tokens[1].value : parseInt(ctx.tokens[1].value, 10) || 3;
    const { body: retryBody, endIdx: retryEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({ type: NodeType.RETRY, count, body: retryBody, line: ctx.line });
    return retryEnd;
});
CANONICAL_DISPATCH.set('first', (ctx) => {
    if (ctx.tokens.length < 2 || !ctx.tokens.some(t => t.value === 'finish')) return undefined;
    const { body: raceBody, endIdx: raceEnd } = parseBlock(ctx.lines, ctx.i + 1, ctx.indent, ctx.errors);
    ctx.body.push({ type: NodeType.RACE, body: raceBody, line: ctx.line });
    return raceEnd;
});
CANONICAL_DISPATCH.set('background', (ctx) => {
    // Only match if followed by STRING (not CSS background)
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const result = parseBackground(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('every', (ctx) => {
    // "every 5 minutes:" or "every day at 9am:" — cron/scheduled block
    // Only valid at backend level (inside endpoint/agent or top-level backend)
    const result = parseCron(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('store', (ctx) => {
    if (ctx.tokens.length < 2) return undefined;
    const varName = ctx.tokens[1].value;
    let key = varName;
    if (ctx.tokens.length >= 4 && (ctx.tokens[2].canonical === 'as_format' || ctx.tokens[2].value === 'as') && ctx.tokens[3].type === TokenType.STRING) {
      key = ctx.tokens[3].value;
    }
    ctx.body.push({ type: NodeType.STORE, variable: varName, key, line: ctx.line });
    return ctx.i + 1;
});
CANONICAL_DISPATCH.set('restore', (ctx) => {
    if (ctx.tokens.length < 2) return undefined;
    const varName = ctx.tokens[1].value;
    let key = varName;
    if (ctx.tokens.length >= 4 && (ctx.tokens[2].canonical === 'as_format' || ctx.tokens[2].value === 'as') && ctx.tokens[3].type === TokenType.STRING) {
      key = ctx.tokens[3].value;
    }
    ctx.body.push({ type: NodeType.RESTORE, variable: varName, key, line: ctx.line });
    return ctx.i + 1;
});
// Agent Tier 7 features
CANONICAL_DISPATCH.set('pipeline', (ctx) => {
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const result = parsePipeline(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('skill', (ctx) => {
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const result = parseSkill(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('workflow', (ctx) => {
    if (ctx.tokens.length < 2 || ctx.tokens[1].type !== TokenType.STRING) return undefined;
    const result = parseWorkflow(ctx.lines, ctx.i, ctx.indent, ctx.errors);
    if (result.node) ctx.body.push(result.node);
    return result.endIdx;
});
CANONICAL_DISPATCH.set('policy', (ctx) => {
    const policyIndent = ctx.lines[ctx.i].indent;
    const rules = [];
    let j = ctx.i + 1;
    while (j < ctx.lines.length && ctx.lines[j].indent > policyIndent) {
      const rTokens = ctx.lines[j].tokens;
      if (rTokens.length > 0) {
        const raw = rTokens.map(t => t.value).join(' ');
        const rule = parsePolicyRule(raw, rTokens, rTokens[0].line);
        if (rule) rules.push(rule);
      }
      j++;
    }
    if (rules.length > 0) ctx.body.push({ type: NodeType.POLICY, rules, line: ctx.line });
    return j;
});
CANONICAL_DISPATCH.set('mock', (ctx) => {
    // Mock AI response in test blocks: mock claude responding: + indented fields
    if (ctx.tokens.length >= 3 &&
        (ctx.tokens[1].value === 'claude' || ctx.tokens[1].value === 'ai') &&
        ctx.tokens[2].value === 'responding') {
      const mockIndent = ctx.lines[ctx.i].indent;
      const fields = [];
      let j = ctx.i + 1;
      while (j < ctx.lines.length && ctx.lines[j].indent > mockIndent) {
        const fieldTokens = ctx.lines[j].tokens;
        if (fieldTokens.length >= 3) {
          const fieldName = fieldTokens[0].value;
          if (fieldTokens[1].canonical === 'is' || fieldTokens[1].type === TokenType.ASSIGN) {
            const valToken = fieldTokens[2];
            let value;
            if (valToken.type === TokenType.STRING) value = valToken.value;
            else if (valToken.type === TokenType.NUMBER) value = valToken.value;
            else if (valToken.value === 'true') value = true;
            else if (valToken.value === 'false') value = false;
            else value = valToken.value;
            fields.push({ name: fieldName, value });
          }
        }
        j++;
      }
      ctx.body.push({ type: NodeType.MOCK_AI, fields, line: ctx.line });
      return j;
    }
    return undefined;
});

// do_parallel
CANONICAL_DISPATCH.set('do_parallel', (ctx) => {
  const assignments = [];
  const parallelIndent = ctx.lines[ctx.i].indent;
  let j = ctx.i + 1;
  while (j < ctx.lines.length && ctx.lines[j].indent > parallelIndent) {
    const childTokens = ctx.lines[j].tokens;
    if (childTokens.length > 0) {
      const childLine = childTokens[0].line;
      if (childTokens.length >= 2 && childTokens[1].type === TokenType.ASSIGN) {
        const varName = childTokens[0].value;
        const rhsResult = parseAssignment(childTokens, childLine);
        if (rhsResult.error) {
          ctx.errors.push({ line: childLine, message: rhsResult.error });
        } else if (rhsResult.expression) {
          assignments.push({ name: varName, expression: rhsResult.expression, line: childLine });
        }
      } else {
        ctx.errors.push({ line: childLine, message: "Each line inside 'do these at the same time' must be an assignment. Example: result = call 'Agent' with data" });
      }
    }
    j++;
  }
  if (assignments.length === 0) {
    ctx.errors.push({ line: ctx.line, message: "'do these at the same time' needs indented agent calls." });
    return ctx.i + 1;
  }
  ctx.body.push({ type: NodeType.PARALLEL_AGENTS, assignments, line: ctx.line });
  return j;
});

// Raw-value handlers for panel actions (toggle/open/close)
CANONICAL_DISPATCH.set('toggle', (ctx) => {
  // "toggle the X panel" — but NOT "toggle" as checkbox (handled by CANONICAL_DISPATCH checkbox handler)
  if (ctx.tokens.length >= 2 && (ctx.tokens[1].value === 'the' || ctx.tokens[1].value === 'this')) {
    const action = ctx.tokens[0].value;
    let pPos = 2;
    const nameTokens = ctx.tokens.slice(pPos).filter(t =>
      t.value !== 'panel' && t.value !== 'modal' && t.value !== 'dialog'
    );
    const target = nameTokens.map(t => t.value).join(' ') || 'this';
    ctx.body.push({ type: NodeType.PANEL_ACTION, action, target, line: ctx.line });
    return ctx.i + 1;
  }
  return undefined; // fall through to checkbox handler
});
CANONICAL_DISPATCH.set('open', (ctx) => {
  if (ctx.tokens.length >= 2) {
    const action = 'open';
    let pPos = 1;
    if (pPos < ctx.tokens.length && (ctx.tokens[pPos].value === 'the' || ctx.tokens[pPos].value === 'this')) pPos++;
    const nameTokens = ctx.tokens.slice(pPos).filter(t =>
      t.value !== 'panel' && t.value !== 'modal' && t.value !== 'dialog'
    );
    const target = nameTokens.map(t => t.value).join(' ') || 'this';
    ctx.body.push({ type: NodeType.PANEL_ACTION, action, target, line: ctx.line });
    return ctx.i + 1;
  }
  return undefined;
});
CANONICAL_DISPATCH.set('close', (ctx) => {
  if (ctx.tokens.length >= 2) {
    const action = 'close';
    let pPos = 1;
    if (pPos < ctx.tokens.length && (ctx.tokens[pPos].value === 'the' || ctx.tokens[pPos].value === 'this')) pPos++;
    const nameTokens = ctx.tokens.slice(pPos).filter(t =>
      t.value !== 'panel' && t.value !== 'modal' && t.value !== 'dialog'
    );
    const target = nameTokens.map(t => t.value).join(' ') || 'this';
    ctx.body.push({ type: NodeType.PANEL_ACTION, action, target, line: ctx.line });
    return ctx.i + 1;
  }
  return undefined;
});

// "refresh page" / "reload page" — page refresh in web apps
CANONICAL_DISPATCH.set('refresh', (ctx) => {
  ctx.body.push({ type: NodeType.REFRESH, line: ctx.line });
  return ctx.i + 1;
});

// "ask" dispatch — handles multiple forms:
// 1. ask ai/claude 'prompt' — streams AI response to client (P13)
// 2. ask user to confirm 'message' — human-in-the-loop confirmation
CANONICAL_DISPATCH.set('ask', (ctx) => {
  if (ctx.tokens.length < 2) return undefined;
  const second = ctx.tokens[1].value;

  // P13: "ask ai/claude 'prompt' with context" — streams by default in endpoints
  if (second === 'ai' || second === 'claude') {
    // Opt-out: scan for `without streaming` trailer and trim tokens before
    // parsing the context expression (otherwise parseExpression would absorb
    // `without` as a postfix operator or fail with a weird error). Default
    // is streaming; `without streaming` gives a single-shot JSON response.
    let endTokens = ctx.tokens.length;
    let noStream = false;
    for (let k = 2; k < ctx.tokens.length - 1; k++) {
      if ((ctx.tokens[k].value === 'without' || ctx.tokens[k].canonical === 'without') &&
          (ctx.tokens[k + 1].value === 'streaming' || ctx.tokens[k + 1].value === 'stream')) {
        noStream = true;
        endTokens = k;
        break;
      }
    }
    const tokens = noStream ? ctx.tokens.slice(0, endTokens) : ctx.tokens;

    let pos = 2;
    let prompt = null;
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      prompt = { type: NodeType.LITERAL_STRING, value: tokens[pos].value, line: ctx.line };
      pos++;
    } else if (pos < tokens.length) {
      const pExpr = parseExpression(tokens, pos, ctx.line);
      if (!pExpr.error) { prompt = pExpr.node; pos = pExpr.pos || pos + 1; }
    }
    if (!prompt) return undefined;
    let context = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const cExpr = parseExpression(tokens, pos, ctx.line);
      if (!cExpr.error) { context = cExpr.node; pos = cExpr.pos || pos + 1; }
    }
    ctx.body.push({ type: NodeType.STREAM_AI, prompt, context, noStream, line: ctx.line });
    return ctx.i + 1;
  }

  // Human-in-the-loop: ask user to confirm 'message'
  if (ctx.tokens.length >= 4 && second === 'user' &&
      (ctx.tokens[2].canonical === 'to_connector' || ctx.tokens[2].value === 'to') &&
      ctx.tokens[3].value === 'confirm') {
    let messageExpr = null;
    if (ctx.tokens.length > 4) {
      const expr = parseExpression(ctx.tokens, 4, ctx.line);
      if (!expr.error) messageExpr = expr.node;
    }
    if (!messageExpr) {
      ctx.errors.push({ line: ctx.line, message: "ask user to confirm needs a message. Example: ask user to confirm 'Proceed?'" });
      return ctx.i + 1;
    }
    ctx.body.push({ type: NodeType.HUMAN_CONFIRM, message: messageExpr, line: ctx.line });
    return ctx.i + 1;
  }

  return undefined; // fall through for other 'ask' forms
});

// HTTP test call: "call POST /api/users with name is 'Alice', email is 'test'"
CANONICAL_DISPATCH.set('call', (ctx) => {
  const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  if (ctx.tokens.length < 3) return undefined;
  const methodToken = ctx.tokens[1];
  const method = String(methodToken.value).toUpperCase();
  if (!HTTP_METHODS.has(method)) return undefined;
  // Tokenizer splits "/api/todos" into "/", "api", "/", "todos" — reassemble
  // until we hit something that isn't a path part (whitespace ends each token,
  // so we stop the moment we see the "with" keyword or a comma or the next line).
  if (ctx.tokens[2].value !== '/') return undefined;
  let pos = 2;
  let path = '';
  while (pos < ctx.tokens.length) {
    const tk = ctx.tokens[pos];
    const v = String(tk.value);
    // path parts: '/', identifiers/keywords (api, todos), or :param markers, or numeric ids
    const isPathPart = v === '/' || v === ':' || /^[\w-]+$/.test(v) || tk.type === 'number';
    if (!isPathPart) break;
    // Stop at "with" keyword (start of body fields)
    if (tk.canonical === 'with' || v === 'with') break;
    path += v;
    pos++;
  }
  if (!path.startsWith('/') || path === '/') return undefined;
  // Parse optional body: "with name is 'Alice', email is 'test'"
  let bodyFields = [];
  if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'with' || ctx.tokens[pos].canonical === 'with')) {
    pos++;
    while (pos < ctx.tokens.length) {
      if (ctx.tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (ctx.tokens[pos].canonical === 'and') { pos++; continue; }
      const fieldName = ctx.tokens[pos].value;
      pos++;
      // Accept "is", "=", or ":" as field-value separator
      if (pos < ctx.tokens.length && (ctx.tokens[pos].canonical === 'is' || ctx.tokens[pos].type === TokenType.ASSIGN || ctx.tokens[pos].type === TokenType.COLON)) {
        pos++;
        if (pos < ctx.tokens.length) {
          const valExpr = parseExpression(ctx.tokens, pos, ctx.line);
          if (!valExpr.error) {
            bodyFields.push({ name: fieldName, value: valExpr.node });
            pos = valExpr.pos || pos + 1;
          } else pos++;
        }
      }
    }
  }
  ctx.body.push({ type: NodeType.HTTP_TEST_CALL, method, path, bodyFields, line: ctx.line });
  return ctx.i + 1;
});

// Intent-based test assertions:
//   "can user create a new todo with title is 'Buy groceries'"
//   "can user create a todo without a title"   (expects failure)
//   "can user view all todos"
//   "can user delete a todo"
CANONICAL_DISPATCH.set('can', (ctx) => {
  // "can user ACTION [a|an|the] [new] RESOURCE [with FIELDS] [without FIELD]"
  // "can user ask agent 'Name' with message is 'text'"
  if (ctx.tokens.length < 4) return undefined;
  if (ctx.tokens[1].value !== 'user') return undefined;
  const action = ctx.tokens[2].value;

  // "can user ask agent 'Name' with message is '...'"
  if (action === 'ask' && ctx.tokens.length >= 5 && ctx.tokens[3].value === 'agent') {
    let pos = 4;
    if (pos >= ctx.tokens.length || ctx.tokens[pos].type !== TokenType.STRING) return undefined;
    const agentName = ctx.tokens[pos].value;
    pos++;
    let fields = [];
    if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'with' || ctx.tokens[pos].canonical === 'with')) {
      pos++;
      while (pos < ctx.tokens.length) {
        if (ctx.tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        if (ctx.tokens[pos].canonical === 'and') { pos++; continue; }
        const fieldName = ctx.tokens[pos].value;
        pos++;
        // Accept "is", "=", or ":" as field-value separator
        if (pos < ctx.tokens.length && (ctx.tokens[pos].canonical === 'is' || ctx.tokens[pos].type === TokenType.ASSIGN || ctx.tokens[pos].type === TokenType.COLON)) {
          pos++;
          if (pos < ctx.tokens.length) {
            const valExpr = parseExpression(ctx.tokens, pos, ctx.line);
            if (!valExpr.error) {
              fields.push({ name: fieldName, value: valExpr.node });
              pos = valExpr.pos || pos + 1;
            } else pos++;
          }
        }
      }
    }
    ctx.body.push({ type: NodeType.TEST_INTENT, intent: 'ask_agent', resource: agentName, fields, expectFailure: false, line: ctx.line });
    return ctx.i + 1;
  }

  // Normalize natural-English verbs to canonical test actions.
  // Meph reaches for "submit" on approval-queue apps, "post" on forums,
  // "edit" on admin UIs — all semantically identical for test intent purposes.
  const TEST_VERB_ALIAS = {
    submit: 'create', add: 'create', post: 'create', send: 'create', make: 'create',
    see: 'view', read: 'view', get: 'view', list: 'view',
    remove: 'delete',
    edit: 'update', change: 'update', modify: 'update',
    find: 'search',
  };
  const canonicalAction = TEST_VERB_ALIAS[action] || action;
  if (!['create', 'view', 'delete', 'update', 'search'].includes(canonicalAction)) return undefined;
  let pos = 3;
  // skip articles: a, an, the, new
  while (pos < ctx.tokens.length && ['a', 'an', 'the', 'new', 'all'].includes(ctx.tokens[pos].value)) pos++;
  if (pos >= ctx.tokens.length) return undefined;
  const resource = ctx.tokens[pos].value;
  pos++;
  // "with field is value, field is value" or "without field"
  let fields = [];
  let expectFailure = false;
  if (pos < ctx.tokens.length && ctx.tokens[pos].value === 'without') {
    pos++;
    expectFailure = true; // "can user create a todo without a title" → should fail (validation)
    if (pos < ctx.tokens.length) fields.push({ name: ctx.tokens[pos].value, value: null, missing: true });
  } else if (pos < ctx.tokens.length && (ctx.tokens[pos].value === 'with' || ctx.tokens[pos].canonical === 'with')) {
    pos++;
    // Parse field-value pairs: "field is value, field is value" or "field is value and field is value"
    // Don't use parseExpression — it consumes 'and' as logical operator
    while (pos < ctx.tokens.length) {
      if (ctx.tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (ctx.tokens[pos].canonical === 'and') { pos++; continue; }
      const fieldName = ctx.tokens[pos].value;
      pos++;
      // Accept "is", "=", or ":" as field-value separator: title is 'X', title: 'X', title = 'X'
      if (pos < ctx.tokens.length && (ctx.tokens[pos].canonical === 'is' || ctx.tokens[pos].type === TokenType.ASSIGN || ctx.tokens[pos].type === TokenType.COLON)) {
        pos++;
        if (pos < ctx.tokens.length) {
          const valToken = ctx.tokens[pos];
          if (valToken.type === TokenType.STRING) {
            fields.push({ name: fieldName, value: { type: 'literal_string', value: valToken.value, line: ctx.line } });
          } else if (valToken.type === TokenType.NUMBER) {
            fields.push({ name: fieldName, value: { type: 'literal_number', value: valToken.value, line: ctx.line } });
          } else {
            fields.push({ name: fieldName, value: { type: 'variable_ref', name: valToken.value, line: ctx.line } });
          }
          pos++;
        }
      }
    }
  }
  ctx.body.push({ type: NodeType.TEST_INTENT, intent: canonicalAction, resource, fields, expectFailure, line: ctx.line });
  return ctx.i + 1;
});

// "should" — declarative test assertions
// "deleting a todo should require login"
// "creating a todo without a title should be rejected"
// "the todo list should show 'Buy groceries'"
// Also accepts "does" as synonym (backward compat)
CANONICAL_DISPATCH.set('should', (ctx) => {
  if (ctx.tokens.length < 4) return undefined;
  const tokens = ctx.tokens;
  // "does creating/deleting/updating a RESOURCE require login"
  const action = tokens[1].value;
  if (['creating', 'deleting', 'updating', 'viewing'].includes(action)) {
    let pos = 2;
    while (pos < tokens.length && ['a', 'an', 'the', 'new'].includes(tokens[pos].value)) pos++;
    if (pos >= tokens.length) return undefined;
    const resource = tokens[pos].value;
    pos++;
    if (pos < tokens.length && tokens[pos].value === 'require' && pos + 1 < tokens.length && tokens[pos + 1].value === 'login') {
      const actionMap = { creating: 'create', deleting: 'delete', updating: 'update', viewing: 'view' };
      ctx.body.push({ type: NodeType.TEST_INTENT, intent: 'require_login', resource, action: actionMap[action], fields: [], expectFailure: false, line: ctx.line });
      return ctx.i + 1;
    }
  }
  // "X should fail with error 'message'" or "X should fail with 'message'"
  // Tokenizer merges "fail with" into canonical "send_error"
  const failIdx = tokens.findIndex(t => t.canonical === 'send_error' || t.value === 'fail');
  if (failIdx > 0) {
    let pos = failIdx + 1;
    if (pos < tokens.length && tokens[pos].value === 'with') pos++; // in case not merged
    if (pos < tokens.length && tokens[pos].value === 'error') pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      const errorMessage = tokens[pos].value;
      ctx.body.push({ type: NodeType.EXPECT_RESPONSE, property: 'body', check: 'error_contains', value: errorMessage, field: null, line: ctx.line });
      return ctx.i + 1;
    }
  }

  // "does the DISPLAY show VALUE"
  if (tokens[1].value === 'the' && tokens.length >= 5) {
    const display = tokens[2].value;
    let pos = 3;
    // skip "list", "table", "page", etc.
    if (pos < tokens.length && ['list', 'table', 'page', 'display'].includes(tokens[pos].value)) pos++;
    if (pos < tokens.length && tokens[pos].value === 'show') {
      pos++;
      if (pos < tokens.length) {
        const val = tokens[pos].type === TokenType.STRING ? tokens[pos].value : tokens[pos].value;
        ctx.body.push({ type: NodeType.TEST_INTENT, intent: 'shows', resource: display, value: val, fields: [], expectFailure: false, line: ctx.line });
        return ctx.i + 1;
      }
    }
  }
  return undefined;
});

// ── Dispatch table validation (runs once at module load) ──────────────────────
// Every CANONICAL_DISPATCH key must be reachable: either a canonical value from
// the synonym table, or a self-synonym. If a key has no way to become a token's
// .canonical, it's dead code. This check would have caught the old 'ask' and
// 'respond_with' bugs.
//
// Validation happens at tokenize time (tokens always get .canonical now via
// self-synonyms), so this is just a documentation comment. No runtime check needed.

function parseBlock(lines, startIdx, parentIndent, errors) {
  const body = [];
  let targetValue = null;
  let i = startIdx;

  while (i < lines.length) {
    let { tokens, indent } = lines[i];

    // If this line is at or below the parent's indent, the block is done
    if (parentIndent >= 0 && indent <= parentIndent) {
      break;
    }

    if (tokens.length === 0) { i++; continue; }

    let firstToken = tokens[0];
    const line = firstToken.line;

    try {
      // Comment-only line
      if (firstToken.type === TokenType.COMMENT) {
        body.push(commentNode(firstToken.value, line));
        i++;
        continue;
      }

      // --- DISPATCH TABLE LOOKUP ---
      // One unified map: CANONICAL_DISPATCH. Every keyword has a .canonical value
      // (either from a synonym or a self-synonym like database → database).
      // Handlers return undefined to fall through to pattern matchers/assignment.
      {
        // "X should Y" rewrite: if 'should' appears mid-line, move it to front
        // so "deleting a todo should require login" dispatches as "should deleting a todo require login"
        // Don't mutate the original tokens array — create a reordered copy
        const shouldIdx = tokens.findIndex(t => t.canonical === 'should' && t !== tokens[0]);
        if (shouldIdx > 0) {
          const shouldToken = tokens[shouldIdx];
          tokens = [shouldToken, ...tokens.slice(0, shouldIdx), ...tokens.slice(shouldIdx + 1)];
          firstToken = tokens[0];
        }
        const key = firstToken.canonical || firstToken.value;
        const handler = typeof key === 'string' ? CANONICAL_DISPATCH.get(key) : null;
        if (handler) {
          const ctx = { lines, i, indent, tokens, line, errors, body };
          const newI = handler(ctx);
          if (newI !== undefined) {
            if (ctx._targetValue) targetValue = ctx._targetValue;
            i = newI; continue;
          }
        }
      }
      // --- END DISPATCH TABLE LOOKUP ---

      // --- PATTERN MATCHERS (checked after dispatch, before assignment) ---

      // Text block: NAME is text block: + indented raw text
      if (tokens.length >= 3 &&
          (firstToken.type === TokenType.IDENTIFIER || firstToken.type === TokenType.KEYWORD) &&
          (tokens[1].canonical === 'is' || tokens[1].type === TokenType.ASSIGN) &&
          tokens[2].canonical === 'text_block') {
        const varName = firstToken.value;
        const textLines = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const rawLine = lines[j].raw;
          if (rawLine !== undefined && rawLine !== '') textLines.push(rawLine);
          else if (lines[j].tokens.length > 0) textLines.push(lines[j].tokens.map(t => t.value).join(' '));
          j++;
        }
        if (textLines.length === 0) {
          errors.push({ line, message: `text block needs indented lines of text. Example:\n${varName} is text block:\n  Hello {name}\n  Welcome` });
          i++; continue;
        }
        body.push({ type: NodeType.ASSIGN, name: varName, expression: { type: NodeType.TEXT_BLOCK, lines: textLines, line }, line });
        i = j; continue;
      }

      // Do all: NAME = do all: + indented expressions
      if (tokens.length >= 3 &&
          (firstToken.type === TokenType.IDENTIFIER || firstToken.type === TokenType.KEYWORD) &&
          tokens[1].type === TokenType.ASSIGN && tokens[2].canonical === 'do_all') {
        const varName = firstToken.value;
        const tasks = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const taskTokens = lines[j].tokens;
          if (taskTokens.length > 0) {
            const taskExpr = parseExpression(taskTokens, 0, taskTokens[0].line);
            if (!taskExpr.error) tasks.push(taskExpr.node);
          }
          j++;
        }
        if (tasks.length === 0) {
          errors.push({ line, message: `do all needs indented tasks. Example:\nresults = do all:\n  fetch page 'url1'\n  fetch page 'url2'` });
          i++; continue;
        }
        body.push({ type: NodeType.ASSIGN, name: varName, expression: { type: NodeType.DO_ALL, tasks, line }, line });
        i = j; continue;
      }

      // Title-first chart: 'Title' bar chart showing data
      if (firstToken.type === TokenType.STRING && tokens.length >= 4 &&
          ['bar', 'line', 'pie', 'area'].includes(tokens[1].value) &&
          tokens[2].value === 'chart') {
        const parsed = parseChartTitleFirst(tokens, line);
        if (parsed.error) errors.push({ line, message: parsed.error });
        else body.push(parsed.node);
        i++; continue;
      }

      // Label-first input: 'Label' is a text input / 'Label' as text input
      if (firstToken.type === TokenType.STRING && tokens.length >= 3 &&
          tokens[1].canonical === 'is' &&
          (tokens[2].canonical === 'a' || tokens[2].canonical === 'the')) {
        const typePos = 3;
        if (typePos < tokens.length && isInputType(tokens[typePos])) {
          const parsed = parseLabelIsInput(tokens, line);
          if (parsed) {
            if (parsed.error) errors.push({ line, message: parsed.error });
            else body.push(parsed.node);
            i++; continue;
          }
        }
      }
      if (firstToken.type === TokenType.STRING && tokens.length > 1 && tokens[1].canonical === 'as_format') {
        const parsed = parseLabelFirstInput(tokens, line);
        if (parsed) {
          if (parsed.error) errors.push({ line, message: parsed.error });
          else body.push(parsed.node);
          i++; continue;
        }
      }

      // Math-style function: total(item) = item's price * item's quantity
      if (isMathStyleFunction(tokens)) {
        const parsed = parseMathStyleFunction(tokens, line);
        if (parsed.error) errors.push({ line, message: parsed.error });
        else body.push(parsed.node);
        i++; continue;
      }

      // ---- CORE LANGUAGE (assignments, control flow, functions, tests) ----

      // Assignment: set x = expr  OR  x = expr  OR  x is expr
      // Also handles object definition: "person is" + indented fields
      // Also handles dot assignment: "person.name is expr"
      if (firstToken.canonical === 'set' || isAssignmentLine(tokens)) {
        // Check for object definition: "name is" with no expression, followed by indented block
        const objResult = tryParseObjectDef(lines, i, indent, tokens, line, errors);
        if (objResult) {
          body.push(objResult.node);
          i = objResult.endIdx;
          continue;
        }

        const parsed = parseAssignment(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
          i++;
          continue;
        }
        if (parsed.node) {
          body.push(parsed.node);
          i++;
          continue;
        }
        // Structured AI output: "ask ai 'prompt' with data returning:" + indented field block
        if (parsed.hasSchema && parsed.expression && parsed.expression.type === NodeType.ASK_AI) {
          const schema = [];
          let j = i + 1;
          while (j < lines.length && lines[j].indent > indent) {
            const fieldTokens = lines[j].tokens;
            if (fieldTokens.length === 0 || fieldTokens[0].type === TokenType.COMMENT) { j++; continue; }
            // Parse field: "name (type)" or just "name"
            const fieldName = fieldTokens[0].value;
            let fieldType = 'text';
            if (fieldTokens.length >= 2) {
              // Check for "(type)" parenthesized form: score (number)
              if (fieldTokens.length >= 4 && fieldTokens[1].type === 'lparen' && fieldTokens[3].type === 'rparen') {
                const typeName = fieldTokens[2].value;
                if (['text', 'number', 'boolean', 'list'].includes(typeName)) fieldType = typeName;
              } else if (fieldTokens.length === 2 && ['text', 'number', 'boolean', 'list'].includes(fieldTokens[1].value)) {
                fieldType = fieldTokens[1].value;
              }
            }
            schema.push({ name: fieldName, type: fieldType });
            j++;
          }
          if (schema.length === 0) {
            errors.push({ line, message: "returning: needs at least one field. Example:\n  returning:\n    score (number)\n    reasoning" });
          }
          parsed.expression.schema = schema;
          body.push(assignNode(parsed.name, parsed.expression, line));
          i = j;
          continue;
        }
        // API call with config block: "result = call api 'url':" + indented config
        if (parsed.needsBlock && parsed.expression && parsed.expression.type === NodeType.HTTP_REQUEST) {
          const config = { method: null, headers: [], body: null, timeout: null };
          let j = i + 1;
          while (j < lines.length && lines[j].indent > indent) {
            const cfgTokens = lines[j].tokens;
            if (cfgTokens.length === 0 || cfgTokens[0].type === TokenType.COMMENT) { j++; continue; }
            const key = cfgTokens[0].value?.toLowerCase();
            if (key === 'method' && cfgTokens.length >= 3) {
              // method is 'POST'
              const valIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.STRING);
              if (valIdx >= 0) config.method = cfgTokens[valIdx].value;
            } else if (key === 'header' && cfgTokens.length >= 4) {
              // header 'Authorization' is 'Bearer ...'
              const nameIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.STRING);
              if (nameIdx >= 0) {
                const headerName = cfgTokens[nameIdx].value;
                // Parse the value expression (everything after 'is')
                const isIdx = cfgTokens.findIndex((t, idx) => idx > nameIdx && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
                if (isIdx >= 0) {
                  const valExpr = parseExpression(cfgTokens, isIdx + 1, lines[j].tokens[0].line);
                  if (!valExpr.error) config.headers.push({ name: headerName, value: valExpr.node });
                }
              }
            } else if (key === 'body' && cfgTokens.length >= 3) {
              // body is data_var
              const isIdx = cfgTokens.findIndex((t, idx) => idx > 0 && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
              if (isIdx >= 0) {
                const valExpr = parseExpression(cfgTokens, isIdx + 1, lines[j].tokens[0].line);
                if (!valExpr.error) config.body = valExpr.node;
              }
            } else if (key === 'timeout' && cfgTokens.length >= 3) {
              // timeout is 10 seconds
              const numIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.NUMBER);
              if (numIdx >= 0) {
                const val = cfgTokens[numIdx].value;
                let unit = 'seconds';
                if (numIdx + 1 < cfgTokens.length) unit = cfgTokens[numIdx + 1].value?.toLowerCase() || 'seconds';
                config.timeout = { value: val, unit };
              }
            }
            j++;
          }
          parsed.expression.config = config;
          body.push(assignNode(parsed.name, parsed.expression, line));
          i = j;
          continue;
        }
        body.push(assignNode(parsed.name, parsed.expression, line));
        i++;
        continue;
      }

      // Hide element: hide <element>
      if (firstToken.type === TokenType.IDENTIFIER && firstToken.value.toLowerCase() === 'hide' && tokens.length >= 2) {
        // "hide loading" → special loading action
        if (tokens[1].value?.toLowerCase() === 'loading') {
          body.push({ type: NodeType.LOADING_ACTION, action: 'hide', line });
          i++; continue;
        }
        // "hide X" → toggle element visibility
        const target = tokens.slice(1).map(t => t.value).join(' ');
        body.push({ type: NodeType.HIDE_ELEMENT, target, line });
        i++; continue;
      }

      // Copy to clipboard: copy <var> to clipboard
      if (firstToken.type === TokenType.IDENTIFIER && firstToken.value.toLowerCase() === 'copy' && tokens.length >= 3) {
        // Find "to clipboard"
        let toPos = -1;
        for (let k = 1; k < tokens.length - 1; k++) {
          if ((tokens[k].canonical === 'to_connector' || tokens[k].value?.toLowerCase() === 'to') &&
              tokens[k + 1].value?.toLowerCase() === 'clipboard') {
            toPos = k; break;
          }
        }
        if (toPos > 0) {
          const variable = tokens.slice(1, toPos).map(t => t.value).join('_');
          body.push({ type: NodeType.CLIPBOARD_COPY, variable, line });
          i++; continue;
        }
      }

      // Download as file: download <var> as <filename>
      if (firstToken.type === TokenType.IDENTIFIER && firstToken.value.toLowerCase() === 'download' && tokens.length >= 3) {
        let asPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'as_format' || tokens[k].value?.toLowerCase() === 'as') { asPos = k; break; }
        }
        const variable = tokens.slice(1, asPos > 0 ? asPos : tokens.length).map(t => t.value).join('_');
        let filename = 'download.txt';
        if (asPos > 0 && asPos + 1 < tokens.length) {
          filename = tokens[asPos + 1].type === TokenType.STRING ? tokens[asPos + 1].value : tokens.slice(asPos + 1).map(t => t.value).join(' ');
        }
        body.push({ type: NodeType.DOWNLOAD_FILE, variable, filename, line });
        i++; continue;
      }

      // Login action: login with <field1> and <field2>
      if (firstToken.type === TokenType.IDENTIFIER && firstToken.value.toLowerCase() === 'login' && tokens.length >= 3) {
        let pos = 1;
        // Skip 'with' if present
        if (pos < tokens.length && (tokens[pos].value?.toLowerCase() === 'with' || tokens[pos].canonical === 'with')) pos++;
        // Collect field names (separated by 'and' or commas)
        const fields = [];
        while (pos < tokens.length) {
          if (tokens[pos].type === TokenType.COMMA || tokens[pos].canonical === 'and' || tokens[pos].value?.toLowerCase() === 'and') { pos++; continue; }
          if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
            fields.push(tokens[pos].value);
          }
          pos++;
        }
        if (fields.length > 0) {
          body.push({ type: NodeType.LOGIN_ACTION, fields, line });
          i++; continue;
        }
      }

      // Upload file to endpoint: upload <var> to '<url>'
      if (firstToken.type === TokenType.IDENTIFIER && firstToken.value.toLowerCase() === 'upload' && tokens.length >= 4) {
        let toPos = -1;
        for (let k = 2; k < tokens.length; k++) {
          if ((tokens[k].canonical === 'to_connector' || tokens[k].value?.toLowerCase() === 'to') &&
              k + 1 < tokens.length && tokens[k + 1].type === TokenType.STRING) {
            toPos = k; break;
          }
        }
        if (toPos > 0) {
          // Collect variable names between 'upload' and 'to'
          const variables = [];
          for (let k = 1; k < toPos; k++) {
            if (tokens[k].type === TokenType.COMMA || tokens[k].canonical === 'and') continue;
            if (tokens[k].type === TokenType.IDENTIFIER || tokens[k].type === TokenType.KEYWORD) {
              variables.push(tokens[k].value);
            }
          }
          const url = tokens[toPos + 1].value;
          body.push({ type: NodeType.UPLOAD_TO, variables, url, line });
          i++; continue;
        }
      }

      // Guard: if the line starts with a KEYWORD (recognized Clear word) but no
      // dispatch handler matched, it's almost certainly unrecognized syntax —
      // NOT a bare expression. Emit a specific error rather than silently treating
      // the keyword as a variable name, which leads to the confusing "X hasn't been
      // created yet" error from the forward-ref validator.
      //
      // Also covers common identifiers that look like Clear syntax but aren't keywords
      // (e.g. "call", "ask", "fetch") — these are frequent AI mistakes.
      const EXPRESSION_SAFE_KEYWORDS = new Set([
        'true', 'false', 'null', 'undefined', 'yes', 'no', 'none', 'not',
        'the', 'a', 'an', 'in', 'on', 'to', 'by', 'as', 'at',
        // Content type keywords that may appear before variables (e.g. "text title" in components)
        'text', 'heading', 'subheading', 'bold', 'italic', 'small', 'label', 'badge',
      ]);
      // Common near-miss identifiers that look like Clear keywords but aren't in the synonym table
      const COMMON_MISUSE_HINTS = {
        call: " — did you mean: call api 'URL'  OR  result = call api 'URL'?",
        ask:  " — did you mean: ask ai 'prompt'  OR  result = ask AgentName with input?",
        fetch:" — did you mean: data = fetch from 'URL'?",
        get:  " — did you mean: data = get from 'URL'  OR  when user calls GET /api/...?",
        post: " — did you mean: when user calls POST /api/...?",
        put:  " — did you mean: when user calls PUT /api/...?",
        delete:" — did you mean: when user calls DELETE /api/...?",
        import:" — did you mean: use 'module-name'?",
        export:" — Clear has no exports. Code is compiled, not imported by other code.",
        async:" — Clear handles async automatically. Just write the code.",
        await:" — Clear handles async automatically. No await needed.",
        const:" — did you mean: set x = value  OR  x is 'value'?",
        let:  " — did you mean: set x = value  OR  x is 'value'?",
        var:  " — did you mean: set x = value  OR  x is 'value'?",
        function:" — did you mean: define function name of params:?",
      };
      const firstVal = firstToken.value?.toLowerCase();
      const isFailedKeyword = firstToken.type === TokenType.KEYWORD && firstToken.canonical &&
        !EXPRESSION_SAFE_KEYWORDS.has(firstVal) && !isAssignmentLine(tokens);
      const isMisusedIdent = firstToken.type === TokenType.IDENTIFIER &&
        firstVal in COMMON_MISUSE_HINTS && !isAssignmentLine(tokens);
      if (isFailedKeyword || isMisusedIdent) {
        const kw = firstToken.value;
        const hint = COMMON_MISUSE_HINTS[firstVal] || '';
        errors.push({ line, message: `Unrecognized syntax near '${kw}'${hint}` });
        i++;
        continue;
      }

      // Bare expression (implicit show)
      const expr = parseExpression(tokens, 0, line);
      if (expr.error) {
        errors.push({ line, message: expr.error });
      } else {
        body.push(showNode(expr.node, line));
      }
      i++;
    } catch (err) {
      errors.push({ line, message: err.message });
      i++;
    }
  }

  return { body, endIdx: i, targetValue };
}

// =============================================================================
// BLOCK-LEVEL PARSERS (functions, loops)
// =============================================================================

// "define component TodoItem receiving title, completed:"
function parseComponentDef(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 2; // skip "define" and "component"

  // Component name
  if (pos >= tokens.length) {
    errors.push({ line, message: 'The component needs a name. Example: define component TodoItem receiving title:' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;
  pos++;

  // Check for reserved content type names that would collide with 'show' parsing
  const reservedComponentNames = new Set([
    'Text', 'Heading', 'Subheading', 'Badge', 'Link', 'Divider', 'Image',
    'Button', 'Display', 'Section',
  ]);
  if (reservedComponentNames.has(name)) {
    errors.push({ line, message: `Component name '${name}' collides with a built-in keyword. Use a more specific name like '${name}Card', 'Custom${name}', or 'My${name}'.` });
  }

  // Optional "receiving" + prop list
  const props = [];
  if (pos < tokens.length && (tokens[pos].canonical === 'receiving' || tokens[pos].canonical === 'with')) {
    pos++; // skip "receiving"
    while (pos < tokens.length) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.COMMENT) break;
      props.push(tokens[pos].value);
      pos++;
    }
  }

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  return {
    node: { type: NodeType.COMPONENT_DEF, name, props, body, line },
    endIdx,
  };
}

function parseFunctionDef(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip first keyword ("function", "define", "to", etc.)

  // Handle multi-keyword patterns:
  //   "define function greet" → skip "function" after "define"
  //   "define action greet" → skip "action" after "define"  (alias)
  //   "create function greet" → skip "function" after "create" (alias)
  if ((tokens[0].canonical === 'define' || tokens[0].canonical === 'set') &&
      pos < tokens.length && tokens[pos].canonical === 'function') {
    pos++;
  }

  // Parse function name (accept identifiers or keywords used as names)
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: 'This function definition is missing a name — add one after "define function". Example: define function greet of name' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;
  pos++;

  // Parse parameters — four accepted forms:
  //   CANONICAL: "greet(a, b)"             → define function greet(a, b):
  //   ALIAS:     "greet of a, b"           → define function greet of a, b:
  //   ALIAS:     "greet with a, b as inputs" → define function greet with a, b as inputs:
  //   ALIAS:     "greet with input a"      → define function greet with input a:
  const params = [];

  const TYPE_KEYWORDS = new Set(['text', 'number', 'list', 'boolean', 'map', 'any']);

  if (pos < tokens.length && tokens[pos].type === TokenType.LPAREN) {
    // Parens-style: greet(a, b) or greet(a is text, b is number)
    pos++; // skip (
    while (pos < tokens.length && tokens[pos].type !== TokenType.RPAREN) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
        const paramName = tokens[pos].value;
        pos++;
        let paramType = null;
        // Detect "name is type" — check .canonical === 'is' then type keyword
        if (pos < tokens.length && tokens[pos].canonical === 'is' &&
            pos + 1 < tokens.length && TYPE_KEYWORDS.has(tokens[pos + 1].value.toLowerCase())) {
          paramType = tokens[pos + 1].value.toLowerCase();
          pos += 2;
        }
        params.push({ name: paramName, type: paramType });
      } else {
        break;
      }
    }
    if (pos < tokens.length && tokens[pos].type === TokenType.RPAREN) pos++; // skip )
  } else {
    // Word-style: "of a, b" or "with a, b" or "with input a"
    const isParamIntroducer = pos < tokens.length &&
      (tokens[pos].canonical === 'with' || tokens[pos].value.toLowerCase() === 'of');
    if (isParamIntroducer) {
      pos++;
      // Skip optional "input"/"inputs"/"argument" etc.
      if (pos < tokens.length && tokens[pos].canonical === 'input_param') {
        pos++;
      }
      while (pos < tokens.length) {
        if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        if (tokens[pos].type === TokenType.COMMENT) break;
        // Stop at "as inputs" / "as arguments" tail
        if (tokens[pos].canonical === 'as_format') break;
        if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
          params.push({ name: tokens[pos].value, type: null });
          pos++;
        } else {
          break;
        }
      }
    }
  }

  // Check for "returns TYPE" after params
  // CRITICAL: 'returns' canonical is 'responds_with' — must check .value not .canonical
  let returnType = null;
  if (pos < tokens.length && tokens[pos].value === 'returns') {
    pos++;
    if (pos < tokens.length && TYPE_KEYWORDS.has(tokens[pos].value.toLowerCase())) {
      returnType = tokens[pos].value.toLowerCase();
      pos++;
    }
  }

  // Optional ", max depth N" suffix — overrides the default 1000 recursion cap.
  // PHILOSOPHY Rule 18 ("Total by default") — default is safe; override makes intent explicit.
  let maxDepth;
  if (pos < tokens.length && tokens[pos].type === TokenType.COMMA) pos++;
  if (pos + 2 < tokens.length &&
      tokens[pos].value === 'max' &&
      tokens[pos + 1].value === 'depth' &&
      tokens[pos + 2].type === TokenType.NUMBER) {
    maxDepth = tokens[pos + 2].value;
    pos += 3;
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The function "${name}" is empty — it needs code inside. Indent some code below it. Example:
  define function ${name}:
    show "hello"` });
  }

  return { node: functionDefNode(name, params, body, line, returnType, maxDepth), endIdx };
}

// Agent definit}

// Agent definition: agent 'Name' receiving varName: + indented body
function parseAgent(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip 'agent'

  // Parse agent name (must be a quoted string)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "agent needs a quoted name. Example: agent 'Lead Scorer' receives lead:" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;
  pos++;

  // Check for scheduled agent: agent 'Name' runs every 1 hour:
  if (pos < tokens.length && (tokens[pos].value === 'runs' || tokens[pos].canonical === 'runs_every')) {
    pos++; // skip 'runs'
    if (pos < tokens.length && tokens[pos].value === 'every') pos++; // skip 'every'
    let scheduleValue = 1;
    let scheduleUnit = 'hour';
    if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
      scheduleValue = tokens[pos].value;
      pos++;
    }
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      scheduleUnit = tokens[pos].value.toLowerCase().replace(/s$/, '');
      pos++;
    }
    // Optional: "at '9:00 AM'" — time-of-day for cron scheduling
    let scheduleAt = null;
    if (pos < tokens.length && tokens[pos].canonical === 'at' && pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.STRING) {
      pos++; // skip 'at'
      scheduleAt = tokens[pos].value;
      pos++;
    }
    const result = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (result.body.length === 0) {
      errors.push({ line, message: `agent '${name}' is empty — add code inside the scheduled agent` });
    }
    const schedule = { value: scheduleValue, unit: scheduleUnit, at: scheduleAt };
    return {
      node: { type: NodeType.AGENT, name, receivingVar: null, schedule, body: result.body, line },
      endIdx: result.endIdx,
    };
  }

  // Parse 'receives' keyword (also accepts 'receiving' for compatibility)
  if (pos >= tokens.length || (tokens[pos].value !== 'receives' && tokens[pos].value !== 'receiving')) {
    errors.push({ line, message: `agent '${name}' needs 'receives' or 'runs every'. Example: agent '${name}' receives lead:  OR  agent '${name}' runs every 1 hour:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Parse the receiving variable name
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: `agent '${name}' needs a variable name after 'receives'. Example: agent '${name}' receives lead: (var name should describe what the agent processes)` });
    return { node: null, endIdx: startIdx + 1 };
  }
  const receivingVar = tokens[pos].value;

  // Scan upcoming indented lines for agent directives BEFORE calling parseBlock.
  // Directives are metadata on the agent node, not executable code.
  // Must be consumed here because some keywords collide with synonyms:
  //   - `use` in `can use:` → synonym for module import
  //   - `log` → synonym for `show`
  const agentIndent = lines[startIdx].indent;
  const directives = {
    trackDecisions: false,
    streamResponse: null,  // null = auto (default), true = force stream, false = force no stream
    tools: null,
    restrictions: null,
    skills: null,
    rememberConversation: false,
    rememberPreferences: false,
    knowsAbout: null,
    model: null,
  };

  function categorizePolicy(policyText) {
    let category = 'compile', limit = null;
    if (policyText.startsWith('delete')) category = 'delete';
    else if (policyText.startsWith('modify')) category = 'modify';
    else if (policyText.startsWith('access')) category = 'access';
    else if (policyText.includes('call more than')) { category = 'max_calls'; const m = policyText.match(/call more than (\d+)/); if (m) limit = parseInt(m[1], 10); }
    else if (policyText.includes('spend more than')) { category = 'max_tokens'; const m = policyText.match(/spend more than (\d+)/); if (m) limit = parseInt(m[1], 10); }
    return { text: policyText, category, limit };
  }

  let bodyStartIdx = startIdx + 1;
  while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > agentIndent) {
    const dTokens = lines[bodyStartIdx].tokens;
    if (dTokens.length === 0) { bodyStartIdx++; continue; }

    // track agent decisions / log agent decisions
    if ((dTokens[0].value === 'track' || dTokens[0].value === 'log') && dTokens.length >= 3 &&
        dTokens[1].value === 'agent' && dTokens[2].value === 'decisions') {
      directives.trackDecisions = true; bodyStartIdx++; continue;
    }
    // stream response — explicit opt-in to streaming
    if (dTokens[0].canonical === 'stream' && dTokens.length >= 2 &&
        dTokens[1].value === 'response') {
      directives.streamResponse = true; bodyStartIdx++; continue;
    }
    // do not stream — explicit opt-out (for pipeline steps needing full response)
    if (dTokens[0].canonical === 'then' && dTokens[0].value === 'do' &&
        dTokens.length >= 3 && dTokens[1].value === 'not' &&
        dTokens[2].canonical === 'stream') {
      directives.streamResponse = false; bodyStartIdx++; continue;
    }
    // using 'model-name'
    if ((dTokens[0].value === 'using' || dTokens[0].canonical === 'with') &&
        dTokens.length >= 2 && dTokens[1].type === TokenType.STRING) {
      directives.model = dTokens[1].value; bodyStartIdx++; continue;
    }
    // Tool directive — canonical: `has tool:` (one) / `has tools:` (many).
    // Legacy aliases `can:` and `can use:` still work; all four tokenize to
    // canonical `can` via the synonym table. After the canonical-`can` head
    // there's an optional `use` (only present when the legacy two-token form
    // `can` + `use` is written — multi-word synonyms fold it into token 0).
    // Body can be inline (`has tools: f, g`) OR indented block.
    if (dTokens[0].value === 'can' || dTokens[0].canonical === 'can') {
      directives.tools = [];
      // Start scanning for function names after token 0. Skip a bare `use`
      // filler token (legacy `can use:` written as two tokens).
      let scanStart = 1;
      if (dTokens[scanStart] && (dTokens[scanStart].canonical === 'use' || dTokens[scanStart].value === 'use')) {
        scanStart++;
      }
      if (dTokens.length > scanStart) {
        for (let t = scanStart; t < dTokens.length; t++) {
          if (dTokens[t].type === TokenType.COMMA) continue;
          if (dTokens[t].type === TokenType.IDENTIFIER || dTokens[t].type === TokenType.KEYWORD) {
            directives.tools.push({ type: 'ref', name: dTokens[t].value });
          }
        }
        bodyStartIdx++;
      } else {
        bodyStartIdx++;
        const toolIndent = lines[bodyStartIdx - 1].indent;
        while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > toolIndent) {
          const tTokens = lines[bodyStartIdx].tokens;
          if (tTokens.length > 0) directives.tools.push({ type: 'inline', description: tTokens.map(t => t.value).join(' ') });
          bodyStartIdx++;
        }
      }
      continue;
    }
    // must not: single-line OR block
    if (dTokens[0].value === 'must' && dTokens.length >= 2 && dTokens[1].value === 'not') {
      directives.restrictions = [];
      if (dTokens.length > 2) {
        let startPos = 2;
        if (dTokens[startPos] && (dTokens[startPos].type === 'colon' || dTokens[startPos].value === ':')) startPos++;
        let cur = [];
        for (let t = startPos; t < dTokens.length; t++) {
          if (dTokens[t].type === TokenType.COMMA) { if (cur.length) { directives.restrictions.push(categorizePolicy(cur.join(' '))); cur = []; } }
          else cur.push(dTokens[t].value);
        }
        if (cur.length) directives.restrictions.push(categorizePolicy(cur.join(' ')));
        bodyStartIdx++;
      } else {
        bodyStartIdx++;
        const mnIndent = lines[bodyStartIdx - 1].indent;
        while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > mnIndent) {
          const pTokens = lines[bodyStartIdx].tokens;
          if (pTokens.length > 0) directives.restrictions.push(categorizePolicy(pTokens.map(t => t.value).join(' ')));
          bodyStartIdx++;
        }
      }
      continue;
    }
    // remember conversation context
    if (dTokens[0].value === 'remember' && dTokens.length >= 3 &&
        dTokens[1].value === 'conversation' && dTokens[2].value === 'context') {
      directives.rememberConversation = true; bodyStartIdx++; continue;
    }
    // remember user's preferences
    if (dTokens[0].value === 'remember' && dTokens.length >= 2 &&
        (dTokens[1].value === "user's" || (dTokens[1].value === 'user' && dTokens.length >= 3))) {
      directives.rememberPreferences = true; bodyStartIdx++; continue;
    }
    // knows about: Table1, Table2, 'https://docs.example.com', 'policy.pdf'
    // Tables are unquoted identifiers. URLs and files are quoted strings.
    if (dTokens[0].value === 'knows' && dTokens.length >= 3 && dTokens[1].value === 'about') {
      directives.knowsAbout = directives.knowsAbout || [];
      for (let t = 2; t < dTokens.length; t++) {
        if (dTokens[t].type === TokenType.COMMA) continue;
        if (dTokens[t].type === TokenType.STRING) {
          const val = dTokens[t].value;
          const srcType = val.startsWith('http://') || val.startsWith('https://') ? 'url' : 'file';
          directives.knowsAbout.push({ type: srcType, value: val });
        } else if (dTokens[t].type === TokenType.IDENTIFIER || dTokens[t].type === TokenType.KEYWORD) {
          directives.knowsAbout.push({ type: 'table', value: dTokens[t].value });
        }
      }
      bodyStartIdx++; continue;
    }
    // uses skills: 'Skill1', 'Skill2'
    if (dTokens[0].value === 'uses' && dTokens.length >= 3 && dTokens[1].value === 'skills') {
      directives.skills = [];
      for (let t = 2; t < dTokens.length; t++) {
        if (dTokens[t].type === TokenType.COMMA) continue;
        if (dTokens[t].type === TokenType.STRING) directives.skills.push(dTokens[t].value);
        else if (dTokens[t].type === TokenType.IDENTIFIER || dTokens[t].type === TokenType.KEYWORD) {
          let sn = dTokens[t].value;
          while (t + 1 < dTokens.length && dTokens[t + 1].type !== TokenType.COMMA && dTokens[t + 1].type === TokenType.IDENTIFIER) { t++; sn += ' ' + dTokens[t].value; }
          directives.skills.push(sn);
        }
      }
      bodyStartIdx++; continue;
    }
    // evals: — per-agent user-defined scenarios. Block form only.
    //   evals:
    //     scenario 'name':
    //       input is X                (scalar) OR input is:   (block-object)
    //       expect '<rubric>'         OR expect output has f1, f2
    // Stored on the agent's .evalScenarios; compiler merges into evalSuite
    // with source='user-agent'. This directive intentionally lives in the
    // directive area (before the agent's executable body) so users can see
    // the agent's test-cases at a glance.
    if (dTokens.length === 1 && dTokens[0].value === 'evals') {
      directives.evalScenarios = directives.evalScenarios || [];
      const evalsHeaderIndent = lines[bodyStartIdx].indent;
      bodyStartIdx++;
      // Walk indented children — expected to be `scenario 'name':` blocks
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > evalsHeaderIndent) {
        const sTokens = lines[bodyStartIdx].tokens;
        if (sTokens.length === 0) { bodyStartIdx++; continue; }
        if (sTokens[0].value !== 'scenario') {
          errors.push({ line: sTokens[0].line, message: `Inside \`evals:\` only \`scenario 'name':\` blocks are allowed. Got: ${sTokens[0].value}` });
          bodyStartIdx++; continue;
        }
        if (sTokens.length < 2 || sTokens[1].type !== TokenType.STRING) {
          errors.push({ line: sTokens[0].line, message: `Each scenario needs a quoted name. Example: scenario 'warm greeting':` });
          bodyStartIdx++; continue;
        }
        const scenarioName = sTokens[1].value;
        const scenarioHeaderIndent = lines[bodyStartIdx].indent;
        const scenario = { name: scenarioName, input: null, rubric: null, expectFields: null, line: sTokens[0].line };
        bodyStartIdx++;
        // Walk scenario body: `input is ...` and `expect ...`
        while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > scenarioHeaderIndent) {
          const iTokens = lines[bodyStartIdx].tokens;
          if (iTokens.length === 0) { bodyStartIdx++; continue; }
          const iFirst = iTokens[0].value;

          if (iFirst === 'input') {
            // Find `is`, then either inline value OR indented block (next line greater indent)
            const isIdx = iTokens.findIndex((tok) => tok.canonical === 'is' || tok.value === 'is');
            if (isIdx === -1) {
              errors.push({ line: iTokens[0].line, message: "Scenario line needs `input is <value>` or `input is:` + indented fields." });
              bodyStartIdx++; continue;
            }
            const afterIs = iTokens.slice(isIdx + 1);
            const lineIndent = lines[bodyStartIdx].indent;
            const isObjectBlock = afterIs.length === 0 && (bodyStartIdx + 1) < lines.length && lines[bodyStartIdx + 1].indent > lineIndent;
            if (isObjectBlock) {
              bodyStartIdx++;
              const obj = {};
              while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > lineIndent) {
                const ft = lines[bodyStartIdx].tokens;
                if (ft.length === 0) { bodyStartIdx++; continue; }
                const fname = ft[0].value;
                const fIsIdx = ft.findIndex((x) => x.canonical === 'is' || x.value === 'is');
                if (fIsIdx <= 0) { bodyStartIdx++; continue; }
                const expr = parseExpression(ft, fIsIdx + 1, ft[0].line);
                if (!expr.error) obj[fname] = _literalFromExpr(expr.node);
                bodyStartIdx++;
              }
              scenario.input = obj;
              continue;
            }
            const expr = parseExpression(iTokens, isIdx + 1, iTokens[0].line);
            if (!expr.error) scenario.input = _literalFromExpr(expr.node);
            bodyStartIdx++;
            continue;
          }

          if (iFirst === 'expect') {
            // `expect output has <fields>` (deterministic) OR `expect '<rubric>'` (LLM-graded)
            const outputIdx = iTokens.findIndex((tok, idx) => idx > 0 && tok.value === 'output');
            const hasIdx = iTokens.findIndex((tok, idx) => outputIdx !== -1 && idx > outputIdx && tok.value === 'has');
            if (outputIdx !== -1 && hasIdx !== -1) {
              const fields = iTokens.slice(hasIdx + 1)
                .filter((tok) => tok.type !== TokenType.COMMA)
                .filter((tok) => tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD)
                .map((tok) => tok.value);
              scenario.expectFields = fields;
              bodyStartIdx++;
              continue;
            }
            if (iTokens.length >= 2 && iTokens[1].type === TokenType.STRING) {
              scenario.rubric = iTokens[1].value;
              bodyStartIdx++;
              continue;
            }
            errors.push({ line: iTokens[0].line, message: "Scenario `expect` needs a rubric string or `output has field1, field2`." });
            bodyStartIdx++;
            continue;
          }

          errors.push({ line: iTokens[0].line, message: `Unexpected line inside scenario '${scenarioName}': ${iFirst}. Use \`input is ...\` and \`expect ...\`.` });
          bodyStartIdx++;
        }
        directives.evalScenarios.push(scenario);
      }
      continue;
    }
    // block arguments matching 'pattern1', 'pattern2'
    if (dTokens[0].canonical === 'block_arguments' || (dTokens[0].value === 'block' && dTokens.length >= 3 && dTokens[1].value === 'arguments')) {
      directives.argumentGuardrails = [];
      // Skip past the canonical token(s) to the string literals
      let startPos = (dTokens[0].canonical === 'block_arguments') ? 1 : 3; // after 'block arguments matching'
      for (let t = startPos; t < dTokens.length; t++) {
        if (dTokens[t].type === TokenType.COMMA) continue;
        if (dTokens[t].type === TokenType.STRING) directives.argumentGuardrails.push(dTokens[t].value);
      }
      bodyStartIdx++; continue;
    }
    break; // first non-directive line = start of body
  }

  const result = parseBlock(lines, bodyStartIdx, blockIndent, errors);

  if (result.body.length === 0 && !directives.trackDecisions) {
    errors.push({ line, message: `agent '${name}' is empty — add code inside. Example:\n  agent '${name}' receiving ${receivingVar}:\n    send back ${receivingVar}` });
  }

  return {
    node: { type: NodeType.AGENT, name, receivingVar, body: result.body, line, ...directives },
    endIdx: result.endIdx,
  };
}

// Pipeline definition: pipeline 'Name' with var: + indented steps
function parsePipeline(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "pipeline needs a quoted name. Example: pipeline 'Process Data' with input:" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value; pos++;
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    errors.push({ line, message: `pipeline '${name}' needs 'with' and an input variable.` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: `pipeline '${name}' needs a variable name after 'with'.` });
    return { node: null, endIdx: startIdx + 1 };
  }
  const inputVar = tokens[pos].value;
  const pipelineIndent = lines[startIdx].indent;
  const steps = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > pipelineIndent) {
    const sTokens = lines[j].tokens;
    const sLine = sTokens.length > 0 ? sTokens[0].line : j + 1;
    if (sTokens.length === 1 && sTokens[0].type === TokenType.STRING) {
      steps.push({ agentName: sTokens[0].value, line: sLine });
    } else if (sTokens.length >= 2 && sTokens[sTokens.length - 1].type === TokenType.STRING) {
      steps.push({ agentName: sTokens[sTokens.length - 1].value, line: sLine });
    } else if (sTokens.length > 0) {
      errors.push({ line: sLine, message: "Each pipeline step needs an agent name in quotes. Example: 'Classifier'" });
    }
    j++;
  }
  if (steps.length === 0) errors.push({ line, message: `pipeline '${name}' is empty.` });
  return { node: { type: NodeType.PIPELINE, name, inputVar, steps, line }, endIdx: j };
}

// Skill definition: skill 'Name': + indented can: and instructions:
function parseSkill(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const name = tokens[1].value;
  const skillIndent = lines[startIdx].indent;
  const tools = [];
  const instructions = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > skillIndent) {
    const sTokens = lines[j].tokens;
    if (sTokens.length === 0) { j++; continue; }
    if ((sTokens[0].value === 'can' || sTokens[0].canonical === 'can') && sTokens.length >= 2) {
      for (let t = 1; t < sTokens.length; t++) {
        if (sTokens[t].type === TokenType.COMMA) continue;
        if (sTokens[t].type === TokenType.IDENTIFIER || sTokens[t].type === TokenType.KEYWORD) tools.push(sTokens[t].value);
      }
      j++; continue;
    }
    if (sTokens[0].value === 'instructions') {
      j++;
      const instrIndent = lines[j - 1].indent;
      while (j < lines.length && lines[j].indent > instrIndent) {
        // Use raw text to preserve original formatting (parens, punctuation, spacing)
        const rawText = lines[j].raw || lines[j].tokens.map(t => t.value).join(' ');
        if (rawText.trim()) instructions.push(rawText.trim());
        j++;
      }
      continue;
    }
    j++;
  }
  return { node: { type: NodeType.SKILL, name, tools, instructions, line }, endIdx: j };
}

// Workflow definition: workflow 'Name' with state: + state has: + steps
// Supports: state has (Phase 85), conditional routing (Phase 86),
//   repeat until (Phase 87), runs on temporal / save progress to (Phase 88),
//   at the same time (Phase 89), track workflow progress (Phase 90)
// Policy rule parser — maps English policy declarations to structured guard objects
// Covers all Enact guard categories: database safety, prompt injection, access control,
// git safety, filesystem, email, CRM, cloud storage, code freeze, maintenance windows
function parsePolicyRule(raw, tokens, line) {
  const r = raw.toLowerCase();

  // Database Safety
  if (r.includes('block schema changes') || r.includes('block ddl')) return { kind: 'block_ddl', line };
  if (r.includes('block all deletes') || r === 'block deletes') return { kind: 'dont_delete_row', line };
  if (r.includes('block deletes without filter') || r.includes('block deletes without where')) return { kind: 'dont_delete_without_where', line };
  if (r.includes('block updates without filter') || r.includes('block updates without where')) return { kind: 'dont_update_without_where', line };
  if (r.startsWith('protect tables')) {
    const tables = tokens.filter(t => t.type === TokenType.IDENTIFIER || t.type === TokenType.STRING)
      .map(t => t.value).filter(v => v !== 'protect' && v !== 'tables');
    return { kind: 'protect_tables', tables, line };
  }

  // Code Freeze & Time
  if (r.includes('code freeze') || r.includes('freeze active')) return { kind: 'code_freeze_active', line };
  if (r.includes('maintenance window')) {
    const times = raw.match(/(\d{1,2}:\d{2})/g) || [];
    return { kind: 'maintenance_window', start: times[0] || '00:00', end: times[1] || '06:00', line };
  }

  // Prompt Injection
  if (r.includes('block prompt injection')) {
    const fields = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'block_prompt_injection', fields: fields.length > 0 ? fields : null, line };
  }

  // Access Control
  if (r.includes('block reads on') || r.includes('block reading')) {
    const tables = tokens.filter(t => t.type === TokenType.IDENTIFIER || t.type === TokenType.STRING)
      .map(t => t.value).filter(v => !['block', 'reads', 'on', 'reading', 'tables'].includes(v));
    return { kind: 'dont_read_sensitive_tables', tables, line };
  }
  if (r.includes('require role') || r.includes('require actor role')) {
    const roles = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'require_role', roles, line };
  }
  if (r.includes('contractors cannot write pii') || r.includes('contractor cannot write pii')) return { kind: 'contractor_cannot_write_pii', line };
  if (r.includes('require clearance')) {
    const level = tokens.find(t => t.type === TokenType.NUMBER);
    return { kind: 'require_clearance', level: level ? level.value : 1, line };
  }

  // Git Safety
  if (r.includes('block push to main') || r.includes('block pushes to main')) return { kind: 'dont_push_to_main', line };
  if (r.includes('block merge to main') || r.includes('block merges to main')) return { kind: 'dont_merge_to_main', line };
  if (r.includes('block branch deletion') || r.includes('block deleting branches')) return { kind: 'dont_delete_branch', line };
  if (r.includes('max files per commit')) {
    const n = tokens.find(t => t.type === TokenType.NUMBER);
    return { kind: 'max_files_per_commit', max: n ? n.value : 10, line };
  }
  if (r.includes('require branch prefix')) {
    const prefix = tokens.find(t => t.type === TokenType.STRING);
    return { kind: 'require_branch_prefix', prefix: prefix ? prefix.value : 'feature/', line };
  }

  // Filesystem
  if (r.includes('block file deletion') || r.includes('block deleting files')) return { kind: 'dont_delete_file', line };
  if (r.startsWith('restrict paths') || r.includes('restrict to paths')) {
    const paths = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'restrict_paths', paths, line };
  }
  if (r.includes('block file types') || r.includes('block extensions')) {
    const exts = tokens.filter(t => t.type === TokenType.STRING || (t.type === TokenType.IDENTIFIER && t.value.startsWith('.'))).map(t => t.value);
    return { kind: 'block_extensions', extensions: exts, line };
  }
  if (r.includes('restrict paths')) {
    const paths = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'restrict_paths', paths, line };
  }
  if (r.includes('block reading sensitive paths') || r.includes('block sensitive paths')) {
    const paths = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'dont_read_sensitive_paths', paths: paths.length > 0 ? paths : ['/etc', '/root', 'secrets/'], line };
  }

  // CRM
  if (r.includes('block duplicate contacts') || r.includes('no duplicate contacts')) return { kind: 'dont_duplicate_contacts', line };
  if (r.includes('limit tasks per contact')) {
    const n = tokens.find(t => t.type === TokenType.NUMBER);
    return { kind: 'limit_tasks_per_contact', max: n ? n.value : 5, line };
  }

  // Slack
  if (r.includes('require channel allowlist') || r.includes('allowed channels')) {
    const channels = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    return { kind: 'require_channel_allowlist', channels, line };
  }
  if (r.includes('block direct messages') || r.includes('block dms')) return { kind: 'block_dms', line };

  // Email
  if (r.includes('no mass emails') || r.includes('block mass emails')) return { kind: 'no_mass_emails', line };
  if (r.includes('no repeat emails') || r.includes('block repeat emails')) return { kind: 'no_repeat_emails', line };

  // Cloud Storage
  if (r.includes('require human approval for') && r.includes('delete')) {
    const service = r.includes('gdrive') ? 'gdrive' : r.includes('s3') ? 's3' : 'any';
    return { kind: 'require_human_approval_for_delete', service, line };
  }

  // Generic: require role for specific operation
  if (r.includes('require role') && r.includes('for')) {
    const roles = tokens.filter(t => t.type === TokenType.STRING).map(t => t.value);
    const op = r.includes('delete') ? 'delete' : r.includes('update') ? 'update' : r.includes('write') ? 'write' : 'any';
    return { kind: 'require_role_for_operation', roles, operation: op, line };
  }

  // Fallback: store as custom policy text
  return { kind: 'custom', text: raw, line };
}

function parseWorkflow(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip 'workflow'

  // Parse workflow name
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "workflow needs a quoted name. Example: workflow 'Support Ticket' with state:" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value; pos++;

  // Parse 'with' + state variable name
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    errors.push({ line, message: `workflow '${name}' needs 'with state:'. Example: workflow '${name}' with state:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;
  let stateVar = 'state';
  if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
    stateVar = tokens[pos].value;
  }

  const workflowIndent = lines[startIdx].indent;
  const directives = {
    stateFields: [],
    runsOnTemporal: false,
    saveProgressTo: null,
    trackProgress: false,
  };

  // Scan directives before body
  let bodyStartIdx = startIdx + 1;
  while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > workflowIndent) {
    const dTokens = lines[bodyStartIdx].tokens;
    if (dTokens.length === 0) { bodyStartIdx++; continue; }

    // state has: + indented field definitions
    if (dTokens[0].value === stateVar && dTokens.length >= 2 && dTokens[1].value === 'has') {
      bodyStartIdx++;
      const fieldIndent = lines[bodyStartIdx - 1].indent;
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > fieldIndent) {
        const fTokens = lines[bodyStartIdx].tokens;
        if (fTokens.length > 0) {
          const fieldName = fTokens[0].value;
          let fieldType = 'string';
          let required = false;
          let defaultVal = null;
          for (let t = 1; t < fTokens.length; t++) {
            if (fTokens[t].type === TokenType.COMMA) continue;
            if (fTokens[t].value === 'required') required = true;
            else if (fTokens[t].value === 'number' || (fTokens[t].type === TokenType.PAREN_OPEN && t > 0 && fTokens[t - 1]?.value === '(')) {
              // Handle (number) or (boolean) type annotation
              if (fTokens[t].value === 'number') fieldType = 'number';
            }
            else if (fTokens[t].value === 'boolean') fieldType = 'boolean';
            else if (fTokens[t].value === 'default' && t + 1 < fTokens.length) {
              t++;
              if (fTokens[t].type === TokenType.STRING) defaultVal = fTokens[t].value;
              else if (fTokens[t].type === TokenType.NUMBER) defaultVal = fTokens[t].value;
              else if (fTokens[t].value === 'true') defaultVal = true;
              else if (fTokens[t].value === 'false') defaultVal = false;
              else defaultVal = fTokens[t].value;
            }
          }
          // Check for (number) or (boolean) in parenthesized form
          const raw = fTokens.map(t => t.value).join(' ');
          if (raw.includes('(number)')) fieldType = 'number';
          if (raw.includes('(boolean)')) fieldType = 'boolean';
          if (raw.includes('(timestamp)')) fieldType = 'timestamp';
          directives.stateFields.push({ name: fieldName, type: fieldType, required, default: defaultVal });
        }
        bodyStartIdx++;
      }
      continue;
    }

    // runs durably (canonical — vendor-neutral, describes the property not
    // the backend) and runs on temporal (legacy synonym kept so existing .clear
    // sources don't break). Both set the same AST flag; the compiler selects
    // Temporal SDK or Cloudflare Workflows at emit time based on ctx.target.
    if (dTokens[0].value === 'runs' && dTokens.length >= 2 &&
        dTokens[1].value === 'durably') {
      directives.runsOnTemporal = true; bodyStartIdx++; continue;
    }
    if (dTokens[0].value === 'runs' && dTokens.length >= 3 &&
        dTokens[1].value === 'on' && dTokens[2].value === 'temporal') {
      directives.runsOnTemporal = true; bodyStartIdx++; continue;
    }

    // save progress to TableName table
    if (dTokens[0].value === 'save' && dTokens.length >= 3 &&
        dTokens[1].value === 'progress' && (dTokens[2].value === 'to' || dTokens[2].canonical === 'to_connector')) {
      let tableName = 'Workflows';
      if (dTokens.length > 3) tableName = dTokens[3].value;
      directives.saveProgressTo = tableName; bodyStartIdx++; continue;
    }

    // track workflow progress
    if (dTokens[0].value === 'track' && dTokens.length >= 3 &&
        dTokens[1].value === 'workflow' && dTokens[2].value === 'progress') {
      directives.trackProgress = true; bodyStartIdx++; continue;
    }

    break; // first non-directive line = start of steps
  }

  // Parse workflow body — steps, conditionals, parallel, repeat blocks
  const steps = [];
  while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > workflowIndent) {
    const sTokens = lines[bodyStartIdx].tokens;
    if (sTokens.length === 0) { bodyStartIdx++; continue; }
    const sLine = sTokens[0].line;

    // step 'Name' with 'Agent Name'
    if (sTokens[0].value === 'step' && sTokens.length >= 4 && sTokens[1].type === TokenType.STRING) {
      const stepName = sTokens[1].value;
      let agentName = null;
      let savesTo = null;
      for (let t = 2; t < sTokens.length; t++) {
        if ((sTokens[t].value === 'with' || sTokens[t].canonical === 'with') && t + 1 < sTokens.length && sTokens[t + 1].type === TokenType.STRING) {
          agentName = sTokens[t + 1].value; t++;
        }
        if ((sTokens[t].canonical === 'saves_to' || sTokens[t].value === 'saves') && t + 1 < sTokens.length) {
          // saves to state's field — "saves to" may be a single multi-word token (canonical saves_to)
          let nextIdx = t + 1;
          // If "saves" and "to" are separate tokens, skip "to"
          if (sTokens[t].value === 'saves' && nextIdx < sTokens.length && (sTokens[nextIdx].value === 'to' || sTokens[nextIdx].canonical === 'to_connector')) nextIdx++;
          const remaining = sTokens.slice(nextIdx).map(tk => tk.value).join(' ');
          // Strip possessive state reference: "state's sentiment" → "sentiment"
          savesTo = remaining.replace(stateVar + "'s ", '').replace("'s ", '');
          if (!savesTo) savesTo = remaining;
          t = sTokens.length;
        }
      }
      if (!agentName) {
        errors.push({ line: sLine, message: `step '${stepName}' needs an agent. Example: step '${stepName}' with 'Agent Name'` });
      }
      steps.push({ kind: 'step', name: stepName, agentName, savesTo, line: sLine });
      bodyStartIdx++;
      continue;
    }

    // if state's X is Y: (conditional routing)
    if (sTokens[0].canonical === 'if' || sTokens[0].value === 'if') {
      const condExpr = parseExpression(sTokens, 1, sLine);
      const thenSteps = [];
      const condIndent = lines[bodyStartIdx].indent;
      bodyStartIdx++;
      // Collect indented steps under this condition
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > condIndent) {
        const cTokens = lines[bodyStartIdx].tokens;
        if (cTokens.length > 0 && cTokens[0].value === 'step' && cTokens.length >= 4 && cTokens[1].type === TokenType.STRING) {
          const cLine = cTokens[0].line;
          const stepName = cTokens[1].value;
          let agentName = null;
          for (let t = 2; t < cTokens.length; t++) {
            if ((cTokens[t].value === 'with' || cTokens[t].canonical === 'with') && t + 1 < cTokens.length && cTokens[t + 1].type === TokenType.STRING) {
              agentName = cTokens[t + 1].value; t++;
            }
          }
          thenSteps.push({ kind: 'step', name: stepName, agentName, savesTo: null, line: cLine });
        }
        bodyStartIdx++;
      }
      // Check for otherwise:
      let elseSteps = [];
      if (bodyStartIdx < lines.length && lines[bodyStartIdx].indent === condIndent) {
        const oTokens = lines[bodyStartIdx].tokens;
        if (oTokens.length > 0 && (oTokens[0].canonical === 'otherwise' || oTokens[0].value === 'otherwise')) {
          bodyStartIdx++;
          while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > condIndent) {
            const eTokens = lines[bodyStartIdx].tokens;
            if (eTokens.length > 0 && eTokens[0].value === 'step' && eTokens.length >= 4 && eTokens[1].type === TokenType.STRING) {
              const eLine = eTokens[0].line;
              const stepName = eTokens[1].value;
              let agentName = null;
              for (let t = 2; t < eTokens.length; t++) {
                if ((eTokens[t].value === 'with' || eTokens[t].canonical === 'with') && t + 1 < eTokens.length && eTokens[t + 1].type === TokenType.STRING) {
                  agentName = eTokens[t + 1].value; t++;
                }
              }
              elseSteps.push({ kind: 'step', name: stepName, agentName, savesTo: null, line: eLine });
            }
            bodyStartIdx++;
          }
        }
      }
      steps.push({ kind: 'conditional', condition: condExpr.error ? null : condExpr.node, thenSteps, elseSteps, line: sLine });
      continue;
    }

    // repeat until state's X is Y, max N times:
    if (sTokens[0].value === 'repeat' && sTokens.length >= 3 && sTokens[1].value === 'until') {
      // Find "max N times" at the end
      let maxIterations = 10; // safety default
      let condEnd = sTokens.length;
      for (let t = sTokens.length - 1; t >= 3; t--) {
        if (sTokens[t].value === 'times' && t >= 2 && sTokens[t - 1].type === TokenType.NUMBER &&
            sTokens[t - 2].value === 'max') {
          maxIterations = sTokens[t - 1].value;
          condEnd = t - 2;
          // Remove trailing comma if present
          if (condEnd > 0 && sTokens[condEnd - 1].type === TokenType.COMMA) condEnd--;
          break;
        }
      }
      const condExpr = parseExpression(sTokens, 2, sLine, condEnd);
      const repeatSteps = [];
      const repeatIndent = lines[bodyStartIdx].indent;
      bodyStartIdx++;
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > repeatIndent) {
        const rTokens = lines[bodyStartIdx].tokens;
        if (rTokens.length === 0) { bodyStartIdx++; continue; }
        const rLine = rTokens[0].line;

        // Nested if inside repeat
        if (rTokens[0].canonical === 'if' || rTokens[0].value === 'if') {
          const nestedCond = parseExpression(rTokens, 1, rLine);
          const nestedThen = [];
          const nestedIndent = lines[bodyStartIdx].indent;
          bodyStartIdx++;
          while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > nestedIndent) {
            const nTokens = lines[bodyStartIdx].tokens;
            if (nTokens.length > 0 && nTokens[0].value === 'step' && nTokens.length >= 4 && nTokens[1].type === TokenType.STRING) {
              const nLine = nTokens[0].line;
              let agentName = null;
              for (let t = 2; t < nTokens.length; t++) {
                if ((nTokens[t].value === 'with' || nTokens[t].canonical === 'with') && t + 1 < nTokens.length && nTokens[t + 1].type === TokenType.STRING) {
                  agentName = nTokens[t + 1].value; t++;
                }
              }
              nestedThen.push({ kind: 'step', name: nTokens[1].value, agentName, savesTo: null, line: nLine });
            }
            bodyStartIdx++;
          }
          repeatSteps.push({ kind: 'conditional', condition: nestedCond.error ? null : nestedCond.node, thenSteps: nestedThen, elseSteps: [], line: rLine });
          continue;
        }

        // step inside repeat
        if (rTokens[0].value === 'step' && rTokens.length >= 4 && rTokens[1].type === TokenType.STRING) {
          let agentName = null;
          for (let t = 2; t < rTokens.length; t++) {
            if ((rTokens[t].value === 'with' || rTokens[t].canonical === 'with') && t + 1 < rTokens.length && rTokens[t + 1].type === TokenType.STRING) {
              agentName = rTokens[t + 1].value; t++;
            }
          }
          repeatSteps.push({ kind: 'step', name: rTokens[1].value, agentName, savesTo: null, line: rLine });
          bodyStartIdx++;
          continue;
        }
        bodyStartIdx++;
      }
      steps.push({ kind: 'repeat', condition: condExpr.error ? null : condExpr.node, maxIterations, steps: repeatSteps, line: sLine });
      continue;
    }

    // at the same time: (parallel branches with join)
    if (sTokens.length >= 4 && sTokens[0].value === 'at' && sTokens[1].value === 'the' &&
        sTokens[2].value === 'same' && sTokens[3].value === 'time') {
      const parallelSteps = [];
      const parallelIndent = lines[bodyStartIdx].indent;
      bodyStartIdx++;
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > parallelIndent) {
        const pTokens = lines[bodyStartIdx].tokens;
        if (pTokens.length > 0 && pTokens[0].value === 'step' && pTokens.length >= 4 && pTokens[1].type === TokenType.STRING) {
          const pLine = pTokens[0].line;
          const stepName = pTokens[1].value;
          let agentName = null;
          let savesTo = null;
          for (let t = 2; t < pTokens.length; t++) {
            if ((pTokens[t].value === 'with' || pTokens[t].canonical === 'with') && t + 1 < pTokens.length && pTokens[t + 1].type === TokenType.STRING) {
              agentName = pTokens[t + 1].value; t++;
            }
            if ((pTokens[t].canonical === 'saves_to' || pTokens[t].value === 'saves') && t + 1 < pTokens.length) {
              let nextIdx = t + 1;
              if (pTokens[t].value === 'saves' && nextIdx < pTokens.length && (pTokens[nextIdx].value === 'to' || pTokens[nextIdx].canonical === 'to_connector')) nextIdx++;
              // Skip possessive state reference: state's field → field
              if (nextIdx < pTokens.length && pTokens[nextIdx].value === stateVar &&
                  nextIdx + 1 < pTokens.length && pTokens[nextIdx + 1].type === TokenType.POSSESSIVE) {
                nextIdx += 2; // skip state + 's
              }
              const remaining = pTokens.slice(nextIdx).map(tk => tk.value).join(' ');
              savesTo = remaining || null;
              t = pTokens.length;
            }
          }
          parallelSteps.push({ kind: 'step', name: stepName, agentName, savesTo, line: pLine });
        }
        bodyStartIdx++;
      }
      steps.push({ kind: 'parallel', steps: parallelSteps, line: sLine });
      continue;
    }

    // Unknown line — skip
    bodyStartIdx++;
  }

  if (steps.length === 0 && directives.stateFields.length === 0) {
    errors.push({ line, message: `workflow '${name}' is empty — add steps. Example:\n  step 'Triage' with 'Triage Agent'` });
  }

  return {
    node: {
      type: NodeType.WORKFLOW, name, stateVar, steps, line,
      ...directives,
    },
    endIdx: bodyStartIdx,
  };
}

// Block-form if: "if condition:" + indented body, optional "otherwise:" block
// "match X:" with "when Y:" cases
function parseMatch(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Parse the expression being matched (everything after "match")
  const matchExpr = parseExpression(tokens, 1, line);
  if (matchExpr.error) {
    errors.push({ line, message: 'Match needs a value to check. Example: match node\'s type:' });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse indented when/otherwise cases
  const cases = [];
  let defaultBody = null;
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const caseTokens = lines[j].tokens;
    if (caseTokens.length === 0 || caseTokens[0].type === TokenType.COMMENT) { j++; continue; }

    if (caseTokens[0].canonical === 'if' || (caseTokens[0].value && caseTokens[0].value.toLowerCase() === 'when')) {
      // "when 'number':" or "when 'add':" — parse the value and body
      let vPos = 1;
      const valueExpr = parseExpression(caseTokens, vPos, caseTokens[0].line);
      if (valueExpr.error) { j++; continue; }

      const caseIndent = lines[j].indent;
      const { body: caseBody, endIdx: caseEnd } = parseBlock(lines, j + 1, caseIndent, errors);
      cases.push({ value: valueExpr.node, body: caseBody, line: caseTokens[0].line });
      j = caseEnd;
    } else if (caseTokens[0].canonical === 'otherwise') {
      const caseIndent = lines[j].indent;
      const { body: defBody, endIdx: defEnd } = parseBlock(lines, j + 1, caseIndent, errors);
      defaultBody = defBody;
      j = defEnd;
    } else {
      j++;
    }
  }

  return {
    node: { type: NodeType.MATCH, expression: matchExpr.node, cases, defaultBody, line },
    endIdx: j,
  };
}

function parseIfBlock(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Parse condition (everything after "if")
  const condExpr = parseExpression(tokens, 1, line);
  if (condExpr.error) {
    errors.push({ line, message: condExpr.error });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse then-body (indented block)
  const thenResult = parseBlock(lines, startIdx + 1, blockIndent, errors);
  let i = thenResult.endIdx;

  if (thenResult.body.length === 0) {
    errors.push({ line, message: 'The if-block is empty -- add indented code below it. Example:\n  if x is 5:\n    show "yes"' });
  }

  // Check for "otherwise:" or "otherwise if:" at the same indent level
  let otherwiseBody = [];
  if (i < lines.length && lines[i].indent <= blockIndent) {
    const nextTokens = lines[i].tokens;
    if (nextTokens.length > 0 && nextTokens[0].canonical === 'otherwise') {
      // "otherwise if X:" — else-if chain (parse as nested if-block)
      if (nextTokens.length > 1 && nextTokens[1].canonical === 'if') {
        // Create a synthetic line with just the "if ..." part (skip "otherwise")
        const ifTokens = nextTokens.slice(1);
        const synthLine = { tokens: ifTokens, indent: lines[i].indent, raw: lines[i].raw };
        const savedLine = lines[i];
        lines[i] = synthLine;
        const elseIfResult = parseIfBlock(lines, i, blockIndent, errors);
        lines[i] = savedLine; // restore
        if (elseIfResult.node) {
          otherwiseBody = [elseIfResult.node];
        }
        i = elseIfResult.endIdx;
      } else {
        // Plain "otherwise:" block
        const otherwiseResult = parseBlock(lines, i + 1, blockIndent, errors);
        otherwiseBody = otherwiseResult.body;
        i = otherwiseResult.endIdx;
      }
    }
  }

  // For block if, thenBranch is an array of nodes
  const node = ifThenNode(condExpr.node, thenResult.body, otherwiseBody.length > 0 ? otherwiseBody : null, line);
  node.isBlock = true;
  return { node, endIdx: i };
}

function parseRepeatLoop(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip "repeat"

  // `repeat until X, max N times:` — bounded refinement loop. The condition
  // checks at the END of each iteration; the max guarantees termination
  // even if the condition never holds. Canonical pattern for agent
  // self-refinement (draft → critique → revise until quality bar or cap).
  if (tokens.length > pos && tokens[pos].value === 'until') {
    // Find "max N times" at the end
    let maxIterations = 10; // safety default
    let condEnd = tokens.length;
    for (let t = tokens.length - 1; t >= pos + 2; t--) {
      if ((tokens[t].value === 'times' || tokens[t].canonical === 'times_op') &&
          t >= 2 && tokens[t - 1].type === TokenType.NUMBER &&
          tokens[t - 2].value === 'max') {
        maxIterations = tokens[t - 1].value;
        condEnd = t - 2;
        // Swallow trailing comma between the condition and `, max N times`
        if (condEnd > 0 && tokens[condEnd - 1].type === TokenType.COMMA) condEnd--;
        break;
      }
    }
    const condExpr = parseExpression(tokens, pos + 1, line, condEnd);
    if (condExpr.error) {
      errors.push({ line, message: condExpr.error });
      return { node: null, endIdx: startIdx + 1 };
    }
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: 'The repeat-until loop is empty — it needs code inside to run. Indent some code below it. Example:\n  repeat until score is greater than 8, max 5 times:\n    draft = ask claude \'Improve this\' with draft' });
    }
    return { node: repeatUntilNode(condExpr.node, maxIterations, body, line), endIdx };
  }

  // Parse count expression (up to "times" keyword)
  // Note: "times" maps to canonical "times_op" in the synonym table
  const timesPos = findCanonical(tokens, 'times_op', pos);
  if (timesPos === -1) {
    errors.push({ line, message: 'Clear doesn\'t know how many times to repeat — add "times" after the number. Example: repeat 5 times' });
    return { node: null, endIdx: startIdx + 1 };
  }

  const countExpr = parseExpression(tokens, pos, line, timesPos);
  if (countExpr.error) {
    errors.push({ line, message: countExpr.error });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: 'The repeat loop is empty — it needs code inside to run. Indent some code below it. Example:\n  repeat 5 times:\n    show "hello"' });
  }

  return { node: repeatNode(countExpr.node, body, line), endIdx };
}

function parseForEachLoop(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip "for each" (single token due to multi-word synonym)

  // Parse variable name
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: 'The for-each loop needs a name for each item — add one after "for each". Example: for each item in items list:' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const variable = tokens[pos].value;
  pos++;

  // Check for two-variable form: "for each key, value in scores:"
  let variable2 = null;
  if (pos < tokens.length && tokens[pos].type === TokenType.COMMA) {
    pos++; // skip comma
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      variable2 = tokens[pos].value;
      pos++;
    } else {
      errors.push({ line, message: 'After the comma, add a second variable name. Example: for each key, value in scores:' });
      return { node: null, endIdx: startIdx + 1 };
    }
  }

  // Expect "in"
  if (pos >= tokens.length || tokens[pos].canonical !== 'in') {
    errors.push({ line, message: `The loop doesn't know what to iterate over — add "in" and a list after "${variable}". Example: for each ${variable} in ${variable}s list:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Parse iterable — check for "X list" pattern (skip trailing "list" keyword)
  // "for each item in items list:" -> iterable is "items", "list" is filler
  let iterEnd = tokens.length;
  for (let k = pos; k < tokens.length; k++) {
    if (tokens[k].canonical === 'list' || (tokens[k].type === TokenType.KEYWORD && tokens[k].value === 'list')) {
      iterEnd = k;
      break;
    }
  }
  const iterExpr = parseExpression(tokens, pos, line, iterEnd);
  if (iterExpr.error) {
    errors.push({ line, message: iterExpr.error });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: 'The for-each loop is empty — it needs code inside to run on each item. Indent some code below it. Example:\n  for each item in my_list:\n    show item' });
  }

  return { node: forEachNode(variable, iterExpr.node, body, line, variable2), endIdx };
}

function parseWhileLoop(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Optional trailing `, max N times` — bounds the loop so it can't run forever.
  // Mirrors the `repeat until X, max N times` pattern. Without it the loop is
  // "accidentally non-total" (see PHILOSOPHY.md "Total by default").
  let maxIterations;
  let condEnd = tokens.length;
  for (let t = tokens.length - 1; t >= 3; t--) {
    if ((tokens[t].value === 'times' || tokens[t].canonical === 'times_op') &&
        t >= 2 && tokens[t - 1].type === TokenType.NUMBER &&
        tokens[t - 2].value === 'max') {
      maxIterations = tokens[t - 1].value;
      condEnd = t - 2;
      if (condEnd > 0 && tokens[condEnd - 1].type === TokenType.COMMA) condEnd--;
      break;
    }
  }

  // Parse condition (everything after "while", up to the max-clause if present)
  const condExpr = parseExpression(tokens, 1, line, condEnd);
  if (condExpr.error) {
    errors.push({ line, message: condExpr.error });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: 'The while loop is empty — it needs code inside to run. Indent some code below it. Example:\n  while count is less than 10, max 100 times:\n    increase count by 1' });
  }

  return { node: whileNode(condExpr.node, body, line, maxIterations), endIdx };
}

// Detects whether a "display" line has Phase 4 modifiers (as/called)
function hasDisplayModifiers(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].canonical === 'as_format' || tokens[i].canonical === 'called' || tokens[i].canonical === 'to_json') return true;
  }
  return false;
}

// =============================================================================
// USE / IMPORT MODULES (Phase 3)
// =============================================================================
// CANONICAL: use "helpers"
// Aliases: import "helpers", include "helpers", load "helpers"

function parseUse(tokens, line) {
  let pos = 1; // skip "use"
  if (pos >= tokens.length) {
    return { error: 'The use statement needs a module name in quotes — which file do you want to use? Example: use "helpers"' };
  }

  // npm package import: use npm 'stripe' or use npm 'stripe' as stripe_client
  if (pos < tokens.length && tokens[pos].value === 'npm') {
    pos++; // skip 'npm'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "use npm needs a package name in quotes. Example: use npm 'stripe'" };
    }
    const npmPackage = tokens[pos].value;
    pos++;
    // Optional: as alias
    let npmAlias = npmPackage.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_]/g, '_');
    if (pos < tokens.length && tokens[pos].value === 'as' && pos + 1 < tokens.length) {
      pos++; // skip 'as'
      npmAlias = tokens[pos].value;
      pos++;
    }
    const node = useNode(npmPackage, line);
    node.isNpm = true;
    node.npmPackage = npmPackage;
    node.npmAlias = npmAlias.replace(/[^a-zA-Z0-9_$]/g, '_');
    return { node };
  }

  // Inline-all import: use everything from 'helpers'
  if (pos < tokens.length && tokens[pos].value === 'everything') {
    pos++; // skip 'everything'
    if (pos < tokens.length && tokens[pos].value === 'from') {
      pos++; // skip 'from'
      if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
        const module = tokens[pos].value;
        const node = useNode(module, line);
        node.importAll = true;
        return { node };
      }
    }
    return { error: "use everything from needs a module name in quotes. Example: use everything from 'helpers'" };
  }

  // Selective import: use double, triple from 'helpers'
  // Detected when the token after "use" is NOT a string (it's an identifier or keyword name)
  if (tokens[pos].type !== TokenType.STRING) {
    const names = [];
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD) {
        // Check if this is the 'from' keyword (use .value, not .canonical, since 'from' canonicalizes to 'in')
        if (tok.value === 'from') break;
        names.push(tok.value);
        pos++;
        // Skip comma if present
        if (pos < tokens.length && tokens[pos].value === ',') pos++;
      } else {
        return { error: `Expected a name to import, but got "${tok.value}". Example: use double, triple from 'helpers'` };
      }
    }
    if (names.length === 0) {
      return { error: 'The use statement needs at least one name to import. Example: use double from "helpers"' };
    }
    // Expect 'from'
    if (pos >= tokens.length || tokens[pos].value !== 'from') {
      return { error: `Expected "from" after the import names. Example: use ${names.join(', ')} from 'helpers'` };
    }
    pos++; // skip 'from'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: `Expected a module name in quotes after "from". Example: use ${names.join(', ')} from 'helpers'` };
    }
    const module = tokens[pos].value;
    const node = useNode(module, line);
    node.selectiveImports = names;
    return { node };
  }

  // Standard import: use 'helpers' or use 'lib' from './lib.js'
  const module = tokens[pos].value;
  pos++;
  // Optional: from 'path' (external JS/Python module import)
  let source = null;
  if (pos < tokens.length && tokens[pos].value === 'from' && pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.STRING) {
    source = tokens[pos + 1].value;
  }
  const node = useNode(module, line);
  if (source) node.source = source;
  return { node };
}

// =============================================================================
// PAGE DECLARATION (Phase 4)
// =============================================================================
// CANONICAL: page "My App":
//   (indented body with ask for, display, button, etc.)

function parsePage(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  // Parse page title (string literal)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: 'The page needs a title in quotes. Example: page "My App"' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const title = tokens[pos].value;
  pos++;

  // Optional: at '/path'
  let route;
  if (pos < tokens.length && tokens[pos].value === 'at' || (tokens[pos] && tokens[pos].canonical === 'at')) {
    pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      route = tokens[pos].value;
    }
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The page "${title}" is empty — add some content inside it, indented below. Example:\n  page "${title}":\n    display "Hello!"` });
  }

  return { node: pageNode(title, body, line, route), endIdx };
}

// =============================================================================
// SECTION (Phase 7)
// =============================================================================
// CANONICAL: section "Title": + indented body

// Known inline layout modifiers for sections
// NOTE: The compiler has a parallel INLINE_LAYOUT_MODIFIERS map that translates these to
// Tailwind classes at render time. Keep both in sync when adding new modifiers.
const INLINE_MODIFIERS = {
  // Layout — long-form
  'two column layout':   { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr', gap: '1.5rem' } },
  'three column layout': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr 1fr', gap: '1.5rem' } },
  'four column layout':  { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr 1fr 1fr', gap: '1.5rem' } },
  // Grid shorthands: "as 2 columns", "as 3 columns", etc. (compiler renders as Tailwind)
  '2 columns': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr', gap: '1.25rem' } },
  '3 columns': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr 1fr', gap: '1.25rem' } },
  '4 columns': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': 'repeat(4,1fr)', gap: '1rem' } },
  '5 columns': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': 'repeat(5,1fr)', gap: '1rem' } },
  '6 columns': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': 'repeat(6,1fr)', gap: '0.75rem' } },
  // Direction shorthands: "as row", "as column" (compiler renders as Tailwind)
  'row':    { prop: 'display', val: 'flex', extra: { 'flex-direction': 'row', 'align-items': 'center', gap: '1rem' } },
  'column': { prop: 'display', val: 'flex', extra: { 'flex-direction': 'column', gap: '1rem' } },
  // Structural
  'full height':           { prop: 'height', val: '100vh' },
  'scrollable':            { prop: 'overflow-y', val: 'auto' },
  'fills remaining space': { prop: 'flex', val: '1' },
  'sticky at top':         { prop: 'position', val: 'sticky', extra: { top: '0', 'z-index': '10' } },
  'dark background':       { prop: 'background', val: '#0f172a', extra: { color: '#f8fafc' } },
  'with shadow':           { prop: 'box-shadow', val: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' },
  'stacked':               { prop: 'display', val: 'flex', extra: { 'flex-direction': 'column' } },
  'side by side':          { prop: 'display', val: 'flex', extra: { 'flex-direction': 'row' } },
  'centered':              { prop: 'max-width', val: '800px', extra: { 'margin-left': 'auto', 'margin-right': 'auto' } },
  'text centered':         { prop: 'text-align', val: 'center' },
  'padded':                { prop: 'padding', val: '1.5rem' },
  'light background':      { prop: 'background', val: '#f8fafc' },
  'rounded':               { prop: 'border-radius', val: '12px' },
};

function parseSection(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  // Parse section title (string literal)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: 'The section needs a title in quotes. Example: section "User Info"' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const title = tokens[pos].value;
  pos++;

  // Collect remaining tokens as modifier text
  let styleName;
  const inlineModifiers = [];
  if (pos < tokens.length) {
    // Check for "with style <name>" (explicit style reference) — consume it, then keep parsing modifiers
    if ((tokens[pos].value === 'with' || tokens[pos].canonical === 'with') &&
        pos + 1 < tokens.length && (tokens[pos + 1].value === 'style' || tokens[pos + 1].canonical === 'style')) {
      pos += 2;
      if (pos < tokens.length) {
        styleName = tokens[pos].value;
        pos++; // advance past the style name so modifier parsing picks up the rest
      }
    }

    // Parse inline modifiers from remaining tokens (works whether or not 'with style' was present)
    // Skip a leading 'as' or 'with' token
    if (pos < tokens.length && (tokens[pos].value === 'as' || tokens[pos].canonical === 'as_format' ||
        tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) pos++;

    if (pos < tokens.length) {
      // Collect the rest as a modifier string
      const modText = tokens.slice(pos).map(t => t.value).join(' ').toLowerCase();

      // Check for behavioral patterns first (these affect node type, not just CSS)
      if (modText.includes('tabs')) {
        inlineModifiers.push('__tabs');
      }
      if (modText.includes('modal')) {
        inlineModifiers.push('__modal');
      }
      if (modText.includes('slides in from')) {
        const dirMatch = modText.match(/slides in from (\w+)/);
        inlineModifiers.push('__slidein_' + (dirMatch ? dirMatch[1] : 'right'));
      }
      if (modText.includes('collapsible')) {
        inlineModifiers.push('__collapsible');
        if (modText.includes('starts closed') || modText.includes('starts hidden')) {
          inlineModifiers.push('__starts_closed');
        }
      }

      // Match known CSS modifiers (longest first)
      const sortedMods = Object.keys(INLINE_MODIFIERS).sort((a, b) => b.length - a.length);
      let remaining = modText;
      for (const mod of sortedMods) {
        if (remaining.includes(mod)) {
          inlineModifiers.push(mod);
          remaining = remaining.replace(mod, '').trim();
        }
      }
      // Check for "Npx wide" pattern — map common sizes to Tailwind w-* classes, else custom CSS
      const wideMatch = modText.match(/(\d+)\s*px\s*wide/);
      if (wideMatch) {
        const px = parseInt(wideMatch[1], 10);
        const TAILWIND_WIDTHS = { 120:'w-30', 128:'w-32', 144:'w-36', 160:'w-40', 176:'w-44',
          192:'w-48', 208:'w-52', 224:'w-56', 240:'w-60', 256:'w-64', 288:'w-72', 320:'w-80', 384:'w-96' };
        if (TAILWIND_WIDTHS[px]) {
          inlineModifiers.push({ tailwind: `${TAILWIND_WIDTHS[px]} shrink-0` });
        } else {
          inlineModifiers.push({ custom: true, props: { width: px + 'px', 'flex-shrink': '0' } });
        }
      }
    }
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The section "${title}" is empty — add some content inside it, indented below. Example:\n  section "${title}":\n    display "Hello!"` });
  }

  const node = sectionNode(title, body, line, styleName);
  if (inlineModifiers.length > 0) node.inlineModifiers = inlineModifiers;
  return { node, endIdx };
}

// =============================================================================
// STYLE DEF (Phase 7)
// =============================================================================
// CANONICAL: style card: + indented properties

function parseStyleDef(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: 'The style needs a name. Example: style card:' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  // Parse style body directly from token lines (not via parseBlock)
  // This allows layout patterns like "sticky at top" and bare keywords like "scrollable"
  const properties = [];
  let mediaQuery = null;
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const propTokens = lines[j].tokens;
    if (propTokens.length === 0 || propTokens[0].type === TokenType.COMMENT) { j++; continue; }

    const first = propTokens[0];
    const pLine = first.line;

    // "name = value" or "name is value" — standard property
    if (propTokens.length >= 2 && (propTokens[1].type === TokenType.ASSIGN || propTokens[1].canonical === 'is' || propTokens[1].value === 'are')) {
      const propName = first.value;
      if (propName === 'for_screen' && propTokens.length >= 3 && propTokens[2].type === TokenType.STRING) {
        mediaQuery = propTokens[2].value;
        j++; continue;
      }
      let value;
      const valToken = propTokens[2];
      if (!valToken) { value = ''; }
      else if (valToken.type === TokenType.NUMBER) { value = valToken.value; }
      else if (valToken.type === TokenType.STRING) { value = valToken.value; }
      else if (valToken.canonical === 'true') { value = true; }
      else if (valToken.canonical === 'false') { value = false; }
      else { value = valToken.value; }
      properties.push({ name: propName, value, line: pLine });
    }
    // "X at Y" — layout pattern (sticky at top, fixed on left)
    else if (propTokens.length >= 3 && (propTokens[1].canonical === 'at' || propTokens[1].value === 'at' ||
             propTokens[1].value === 'on')) {
      properties.push({ name: first.value, value: propTokens[2].value, line: pLine });
    }
    // Bare keyword — "scrollable", "centered", "wraps", "side by side"
    else if (propTokens.length === 1) {
      properties.push({ name: first.value, value: true, line: pLine });
    }
    // Multi-word pattern — "fills remaining space", "two column layout", "2 column layout"
    else if (propTokens.length >= 2) {
      const numWords = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
      const joined = propTokens.map(t => {
        if (t.type === TokenType.NUMBER && numWords[t.value]) return numWords[t.value];
        return t.value;
      }).join('_');
      properties.push({ name: joined, value: true, line: pLine });
    }

    j++;
  }
  const endIdx = j;

  if (properties.length === 0 && mediaQuery === null) {
    errors.push({ line, message: `The style "${name}" is empty — add properties inside it, indented below. Example:\n  style ${name}:\n    padding = 16\n    rounded = 8` });
  }

  return { node: styleDefNode(name, properties, mediaQuery, line), endIdx };
}

// =============================================================================
// ASK FOR (INPUT) (Phase 4)
// =============================================================================
// =============================================================================
// NEW INPUT SYNTAX
// =============================================================================
// LABEL-FIRST INPUT SYNTAX (canonical)
// =============================================================================
// 'Quantity' as number input
// 'Color' as dropdown with ['Red', 'Green', 'Blue']
// 'Gift Wrap' as checkbox
// 'Notes' as text area
// 'Hourly Rate' as number input saves to rate

function isInputType(token) {
  return ['text_input', 'number_input', 'file_input', 'dropdown', 'checkbox', 'text_area', 'rich_text'].includes(token.canonical);
}

// 'Label' is a text input that saves to var
function parseLabelIsInput(tokens, line) {
  const label = tokens[0].value;
  let pos = 3; // skip label + "is" + "a"/"the"

  if (pos >= tokens.length || !isInputType(tokens[pos])) return null;

  const typeToken = tokens[pos];
  let inputType = null;
  if (typeToken.canonical === 'text_input') inputType = 'text';
  else if (typeToken.canonical === 'number_input') inputType = 'number';
  else if (typeToken.canonical === 'file_input') inputType = 'file';
  else if (typeToken.canonical === 'dropdown') inputType = 'choice';
  else if (typeToken.canonical === 'checkbox') inputType = 'yes/no';
  else if (typeToken.canonical === 'text_area') inputType = 'long text';
  else if (typeToken.canonical === 'rich_text') inputType = 'rich text';
  pos++;

  let variable = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Skip optional "that" before "saves to"
  if (pos < tokens.length && tokens[pos].type === TokenType.IDENTIFIER && tokens[pos].value === 'that') {
    pos++;
  }

  // Optional: saves to <variable>
  if (pos < tokens.length && tokens[pos].canonical === 'saves_to') {
    pos++;
    // Skip optional article: "saved as a todo", "saved as an item"
    if (pos < tokens.length && (tokens[pos].canonical === 'a' || tokens[pos].canonical === 'the')) pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      variable = tokens[pos].value;
    }
  }

  // Dropdown choices: 'Color' is a dropdown with ['Red', 'Green']
  let choices = null;
  if (inputType === 'choice') {
    // Look for "with" followed by a list
    for (let k = pos; k < tokens.length; k++) {
      if (tokens[k].canonical === 'with' && k + 1 < tokens.length && tokens[k + 1].type === TokenType.LBRACKET) {
        choices = [];
        let j = k + 2;
        while (j < tokens.length && tokens[j].type !== TokenType.RBRACKET) {
          if (tokens[j].type === TokenType.STRING) choices.push(tokens[j].value);
          j++;
        }
        break;
      }
    }
  }

  return { node: askForNode(variable, inputType, label, line, choices) };
}

function parseLabelFirstInput(tokens, line) {
  // tokens[0] is STRING (label), tokens[1] is 'as'
  const label = tokens[0].value;
  let pos = 2; // skip label + as

  if (pos >= tokens.length) return null;

  // Determine input type from what follows 'as'
  const typeToken = tokens[pos];
  let inputType = null;

  if (typeToken.canonical === 'text_input') {
    inputType = 'text';
    pos++;
  } else if (typeToken.canonical === 'number_input') {
    inputType = 'number';
    pos++;
  } else if (typeToken.canonical === 'dropdown') {
    inputType = 'choice';
    pos++;
  } else if (typeToken.canonical === 'checkbox') {
    inputType = 'yes/no';
    pos++;
  } else if (typeToken.canonical === 'text_area') {
    inputType = 'long text';
    pos++;
  } else if (typeToken.canonical === 'rich_text') {
    inputType = 'rich text';
    pos++;
  } else if (typeToken.canonical === 'file_input') {
    inputType = 'file';
    pos++;
  } else {
    // Not an input type after 'as' — this isn't a label-first input
    return null;
  }

  // Auto-derive variable name from label
  let variable = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Optional: dropdown options — 'Color' as dropdown with ['Red', 'Green']
  let choices = null;
  if (inputType === 'choice' && pos < tokens.length &&
      ((tokens[pos].type === TokenType.KEYWORD && tokens[pos].canonical === 'with') ||
       (tokens[pos].type === TokenType.IDENTIFIER && tokens[pos].value.toLowerCase() === 'with'))) {
    pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.LBRACKET) {
      choices = [];
      pos++;
      while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACKET) {
        if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        if (tokens[pos].type === TokenType.STRING) {
          choices.push(tokens[pos].value);
        }
        pos++;
      }
      if (pos < tokens.length) pos++; // skip ]
    }
  }

  // Optional: saves to <variable>
  if (pos < tokens.length && tokens[pos].canonical === 'saves_to') {
    pos++;
    // Skip optional article: "saved as a todo", "saved as an item"
    if (pos < tokens.length && (tokens[pos].canonical === 'a' || tokens[pos].canonical === 'the')) pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      variable = tokens[pos].value;
    }
  }

  const node = askForNode(variable, inputType, label, line);
  if (choices) { node.choices = choices; node.ui.choices = choices; }
  return { node };
}

// =============================================================================
// TYPE-FIRST INPUT SYNTAX (alias)
// =============================================================================
// text input 'Name'
// number input 'Price'
// dropdown 'Color' with ['Red', 'Green', 'Blue']
// checkbox 'Gift Wrap'
// text area 'Notes'
// Any of these + "saves to variable_name"

function parseNewInput(tokens, line, canonical) {
  let pos = 1; // skip the keyword token

  // Determine input type from canonical
  const typeMap = {
    text_input: 'text',
    number_input: 'number',
    dropdown: 'choice',
    checkbox: 'yes/no',
    text_area: 'long text',
  };
  const inputType = typeMap[canonical] || 'text';

  // Parse label (string literal)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: `This ${canonical.replace(/_/g, ' ')} needs a label in quotes. Example: ${canonical.replace(/_/g, ' ')} 'Name'` };
  }
  const label = tokens[pos].value;
  pos++;

  // Auto-derive variable name from label: "Hourly Rate" -> hourly_rate
  let variable = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Optional: dropdown 'Color' with ['Red', 'Green', 'Blue']
  let choices = null;
  if (inputType === 'choice' && pos < tokens.length &&
      ((tokens[pos].type === TokenType.KEYWORD && tokens[pos].canonical === 'with') ||
       (tokens[pos].type === TokenType.IDENTIFIER && tokens[pos].value.toLowerCase() === 'with'))) {
    pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.LBRACKET) {
      choices = [];
      pos++;
      while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACKET) {
        if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        if (tokens[pos].type === TokenType.STRING) {
          choices.push(tokens[pos].value);
        }
        pos++;
      }
      if (pos < tokens.length) pos++; // skip ]
    }
  }

  // Optional: saves to <variable>
  if (pos < tokens.length && tokens[pos].canonical === 'saves_to') {
    pos++;
    // Skip optional article: "saved as a todo", "saved as an item"
    if (pos < tokens.length && (tokens[pos].canonical === 'a' || tokens[pos].canonical === 'the')) pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      variable = tokens[pos].value;
    }
  }

  const node = askForNode(variable, inputType, label, line);
  if (choices) { node.choices = choices; node.ui.choices = choices; }
  return { node };
}

// =============================================================================
// STATIC CONTENT ELEMENTS
// =============================================================================
// heading 'Welcome', subheading 'X', text 'X', bold text 'X',
// italic text 'X', small text 'X', link 'X' to '/Y', divider

function parseContent(tokens, line, canonical) {
  // divider has no text
  if (canonical === 'divider') {
    return { node: contentNode('divider', '', line) };
  }

  let pos = 1; // skip keyword

  // For bare "text" (identifier, not keyword), pos is already 1
  if (canonical === 'content_text') {
    pos = 1; // "text" is the identifier at pos 0, string at pos 1
  }

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: `This needs text in quotes. Example: show ${canonical.replace(/_/g, ' ')} 'Hello'` };
  }

  let text = tokens[pos].value;
  let textExpr = null;
  pos++;

  // Map canonical to content type
  const contentTypeMap = {
    heading: 'heading',
    subheading: 'subheading',
    content_text: 'text',
    bold_text: 'bold',
    italic_text: 'italic',
    small_text: 'small',
    label_text: 'label',
    badge_text: 'badge',
    link: 'link',
    code_block: 'code',
  };
  const contentType = contentTypeMap[canonical] || 'text';

  // For links: link 'Learn more' to '/about'  OR  link 'Chat' goes to '/'
  let href = null;
  if (contentType === 'link') {
    // Skip optional 'goes' before 'to'
    if (pos < tokens.length && tokens[pos].value === 'goes') pos++;
    if (pos < tokens.length && tokens[pos].canonical === 'to_connector') {
      pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
        href = tokens[pos].value;
      }
    }
  }

  // For badges: badge 'Active' as success/error/warning/info/neutral
  let badgeVariant = null;
  if (contentType === 'badge') {
    if (pos < tokens.length && (tokens[pos].canonical === 'as_connector' || tokens[pos].canonical === 'as_format')) {
      pos++;
      if (pos < tokens.length) {
        badgeVariant = tokens[pos].value.toLowerCase();
        pos++;
      }
    }
  }

  const node = contentNode(contentType, text, line, href);
  if (textExpr) node.textExpr = textExpr;
  if (badgeVariant) { node.badgeVariant = badgeVariant; node.ui.badgeVariant = badgeVariant; }
  return { node };
}

// =============================================================================
// IMAGE (content element)
// =============================================================================
// image 'url'
// image 'url' rounded, 40px wide, 40px tall
function parseImage(tokens, line) {
  if (tokens.length < 2 || tokens[1].type !== TokenType.STRING) {
    return { error: "Image needs a URL in quotes. Example: image 'https://example.com/photo.jpg'" };
  }
  const url = tokens[1].value;
  // Parse optional inline modifiers: rounded, Npx wide, Npx tall
  let rounded = false;
  let width = null;
  let height = null;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    const v = String(t.value);
    if (t.canonical === 'round' || v === 'rounded') rounded = true;
    else if (t.type === TokenType.COMMA) continue;
    else if (t.type === TokenType.NUMBER) {
      // Check for "40 px wide" or "40px wide" patterns
      let sizeVal = v;
      if (i + 1 < tokens.length && tokens[i + 1].value === 'px') { sizeVal = v; i++; }
      if (i + 1 < tokens.length && tokens[i + 1].value === 'wide') { width = sizeVal + 'px'; i++; }
      else if (i + 1 < tokens.length && tokens[i + 1].value === 'tall') { height = sizeVal + 'px'; i++; }
    }
  }
  const ui = { contentType: 'image', text: url };
  const node = { type: NodeType.CONTENT, contentType: 'image', text: url, line, ui };
  if (rounded) node.rounded = true;
  if (width) node.width = width;
  if (height) node.height = height;
  return { node };
}

// =============================================================================
// VIDEO / AUDIO (content elements)
// =============================================================================
// video 'url'
// audio 'url'
function parseMedia(tokens, line, mediaType) {
  if (tokens.length < 2 || tokens[1].type !== TokenType.STRING) {
    return { error: `${mediaType} needs a URL in quotes. Example: ${mediaType} 'https://example.com/file.mp4'` };
  }
  const url = tokens[1].value;
  const ui = { contentType: mediaType, text: url };
  const node = { type: NodeType.CONTENT, contentType: mediaType, text: url, line, ui };
  return { node };
}

// =============================================================================
// DATA SHAPE (Phase 9)
// =============================================================================
// create data shape User:
//   name is text
//   email is text
//   age is number

/**
 * Parse an RLS policy line inside a data shape:
 *   anyone can read
 *   owner can read, update, delete
 *   role 'admin' can read, update
 *   same org can read
 *   anyone can read where published == true
 */
function parseRLSPolicy(tokens, line) {
  let subject = tokens[0].canonical || tokens[0].value.toLowerCase();
  let role = null;
  let pos = 1;

  // Handle "role 'admin'" — subject is 'role', next token is the role name
  if (subject === 'role' && pos < tokens.length && tokens[pos].type === TokenType.STRING) {
    role = tokens[pos].value;
    pos++;
  }

  // Normalize subject
  if (subject === 'same_org') subject = 'same_org';

  // Skip "can" keyword
  if (pos < tokens.length && (tokens[pos].canonical === 'can' || tokens[pos].value.toLowerCase() === 'can')) {
    pos++;
  }

  // Parse actions (read, update, delete) — comma-separated
  const actions = [];
  let condition = null;

  while (pos < tokens.length) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    if (tokens[pos].type === TokenType.COMMENT) break;

    const val = tokens[pos].value.toLowerCase();

    // "where" starts the condition clause
    if (val === 'where') {
      pos++;
      // Collect remaining tokens as condition text
      const condParts = [];
      while (pos < tokens.length && tokens[pos].type !== TokenType.COMMENT) {
        condParts.push(tokens[pos].value);
        pos++;
      }
      condition = condParts.join(' ');
      break;
    }

    if (['read', 'select', 'update', 'insert', 'delete', 'create', 'write'].includes(val)) {
      // Normalize: read/select -> SELECT, update -> UPDATE, etc.
      actions.push(val);
    }
    pos++;
  }

  return { subject, role, actions, condition, line };
}

function parseDataShape(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Support two forms:
  //   create data shape User:    -> set, data_shape, User
  //   create a Users table:      -> set, a, Users, data_shape
  let name = null;
  if (tokens.length > 2 && tokens[1].canonical === 'data_shape') {
    // Old form: create data shape <Name>
    name = tokens[2]?.value;
  } else {
    // New form: create [a] <Name> table
    // Find name = first IDENTIFIER that isn't an article
    for (let k = 1; k < tokens.length; k++) {
      if (tokens[k].canonical === 'a') continue; // skip article
      if (tokens[k].canonical === 'data_shape') break; // stop at "table"
      if (tokens[k].type === TokenType.IDENTIFIER || tokens[k].type === TokenType.KEYWORD) {
        name = tokens[k].value;
        break;
      }
    }
  }

  if (!name) {
    errors.push({ line, message: 'This table needs a name. Example: create a Users table:' });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse field lines and RLS policy lines directly from tokens
  const fields = [];
  const policies = [];
  const compoundUniques = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const fieldTokens = lines[j].tokens;
    const fieldLine = fieldTokens[0]?.line || line;
    if (fieldTokens.length === 0) { j++; continue; }
    if (fieldTokens[0].type === TokenType.COMMENT) { j++; continue; }

    // Check if this is an RLS policy line (anyone/owner/role/same org ... can ...)
    const firstCanonical = fieldTokens[0].canonical || fieldTokens[0].value.toLowerCase();
    const hasCanKeyword = fieldTokens.some(t => (t.canonical || (typeof t.value === 'string' ? t.value.toLowerCase() : '')) === 'can');
    if ((firstCanonical === 'anyone' || firstCanonical === 'owner' || firstCanonical === 'same_org') && hasCanKeyword ||
        (firstCanonical === 'role' && fieldTokens.length > 1 && fieldTokens[1].type === TokenType.STRING)) {
      const policy = parseRLSPolicy(fieldTokens, fieldLine);
      if (policy) policies.push(policy);
      j++;
      continue;
    }

    // Compound unique: "one per student and course"
    // Means: only one row per combination of these fields
    if (fieldTokens[0].value === 'one' && fieldTokens.length >= 3 && fieldTokens[1].value === 'per') {
      const uniqueFields = [];
      for (let u = 2; u < fieldTokens.length; u++) {
        if (fieldTokens[u].value === 'and' || fieldTokens[u].value === ',') continue;
        if (fieldTokens[u].type === TokenType.IDENTIFIER || fieldTokens[u].type === TokenType.KEYWORD) {
          uniqueFields.push(fieldTokens[u].value);
        }
      }
      if (uniqueFields.length >= 2) {
        compoundUniques.push(uniqueFields);
      }
      j++;
      continue;
    }

    // Parse field: supports two forms
    //   Old: name is text, required
    //   New: name, required          (type inferred)
    //   New: score (number), default 0  (explicit type override)
    const fieldName = fieldTokens[0].value;
    let fPos = 1;
    let fieldType = null; // null = needs inference
    let fk = null;
    let explicitType = false;

    // Check for explicit type after "is"/"=" (old form)
    if (fPos < fieldTokens.length && (fieldTokens[fPos].canonical === 'is' || fieldTokens[fPos].type === TokenType.ASSIGN)) {
      fPos++;
      if (fPos < fieldTokens.length) {
        const typeVal = typeof fieldTokens[fPos].value === 'string' ? fieldTokens[fPos].value.toLowerCase() : '';
        if (typeVal === 'number' || typeVal === 'integer' || typeVal === 'int') { fieldType = 'number'; explicitType = true; }
        else if (typeVal === 'text' || typeVal === 'string') { fieldType = 'text'; explicitType = true; }
        else if (typeVal === 'boolean' || typeVal === 'bool') { fieldType = 'boolean'; explicitType = true; }
        else if (typeVal === 'timestamp' || typeVal === 'datetime') { fieldType = 'timestamp'; explicitType = true; }
        else if (typeVal === 'true' || typeVal === 'false') {
          fieldType = 'boolean'; explicitType = true;
          if (fPos + 2 < fieldTokens.length && fieldTokens[fPos + 1].value === '/' &&
              typeof fieldTokens[fPos + 2].value === 'string' && fieldTokens[fPos + 2].value.toLowerCase() === 'false') {
            fPos += 2;
          }
        } else {
          // Capitalized name = FK reference ("author is User")
          const firstChar = fieldTokens[fPos].value.charAt(0);
          if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
            fk = fieldTokens[fPos].value;
            fieldType = 'fk'; explicitType = true;
          }
        }
        fPos++;
      }
    }

    // Check for explicit type in parens: score (number)
    if (!explicitType && fPos < fieldTokens.length && fieldTokens[fPos].type === TokenType.LPAREN) {
      fPos++; // skip (
      if (fPos < fieldTokens.length) {
        const typeVal = typeof fieldTokens[fPos].value === 'string' ? fieldTokens[fPos].value.toLowerCase() : '';
        if (typeVal === 'number' || typeVal === 'integer') fieldType = 'number';
        else if (typeVal === 'text' || typeVal === 'string') fieldType = 'text';
        else if (typeVal === 'boolean' || typeVal === 'bool') fieldType = 'boolean';
        else if (typeVal === 'timestamp') fieldType = 'timestamp';
        explicitType = true;
        fPos++;
      }
      if (fPos < fieldTokens.length && fieldTokens[fPos].type === TokenType.RPAREN) fPos++;
    }

    // Parse modifiers: required, unique, default 'x', auto, has many, hidden, renamed to
    let required = false;
    let unique = false;
    let auto = false;
    let defaultValue = null;
    let hasMany = null;
    let hidden = false;
    let renamedTo = null;

    while (fPos < fieldTokens.length) {
      if (fieldTokens[fPos].type === TokenType.COMMA) { fPos++; continue; }
      if (fieldTokens[fPos].type === TokenType.COMMENT) break;

      const mod = typeof fieldTokens[fPos].value === 'string' ? fieldTokens[fPos].value.toLowerCase() : '';
      if (mod === 'required') { required = true; fPos++; }
      else if (mod === 'unique') { unique = true; fPos++; }
      else if (mod === 'auto') { auto = true; fPos++; }
      else if (mod === 'hidden') { hidden = true; fPos++; }
      else if (mod === 'renamed' && fPos + 1 < fieldTokens.length &&
               typeof fieldTokens[fPos + 1].value === 'string' && fieldTokens[fPos + 1].value.toLowerCase() === 'to') {
        fPos += 2;
        if (fPos < fieldTokens.length) {
          renamedTo = fieldTokens[fPos].value;
          fPos++;
        }
      }
      else if (mod === 'default') {
        fPos++;
        if (fPos < fieldTokens.length) {
          const defTok = fieldTokens[fPos];
          // Convert boolean/number tokens to proper types
          if (defTok.canonical === 'true') defaultValue = true;
          else if (defTok.canonical === 'false') defaultValue = false;
          else if (defTok.type === TokenType.NUMBER) defaultValue = defTok.value;
          else defaultValue = defTok.value;
          fPos++;
        }
      } else if (mod === 'belongs' && fPos + 1 < fieldTokens.length &&
                 typeof fieldTokens[fPos + 1].value === 'string' && fieldTokens[fPos + 1].value.toLowerCase() === 'to') {
        fPos += 2; // skip 'belongs to'
        if (fPos < fieldTokens.length) {
          fk = fieldTokens[fPos].value;
          fieldType = 'fk';
          explicitType = true;
          fPos++;
        }
      } else if (mod === 'has' && fPos + 1 < fieldTokens.length &&
                 typeof fieldTokens[fPos + 1].value === 'string' && fieldTokens[fPos + 1].value.toLowerCase() === 'many') {
        fPos += 2; // skip 'has many'
        if (fPos < fieldTokens.length) {
          hasMany = fieldTokens[fPos].value; // e.g. 'Posts'
          fPos++;
        }
      } else {
        fPos++;
      }
    }

    // Type inference (only if no explicit type given)
    if (!explicitType) {
      const lowerName = fieldName.toLowerCase();
      if (auto || lowerName.endsWith('_at')) {
        fieldType = 'timestamp';
      } else if (defaultValue !== null && typeof defaultValue === 'number') {
        fieldType = 'number';
      } else if (defaultValue !== null && typeof defaultValue === 'boolean') {
        fieldType = 'boolean';
      } else if (defaultValue !== null && typeof defaultValue === 'string') {
        fieldType = 'text';
      } else if (fieldName.charAt(0) === fieldName.charAt(0).toUpperCase()
                 && fieldName.charAt(0) !== fieldName.charAt(0).toLowerCase()) {
        // Capitalized = FK
        fk = fieldName;
        fieldType = 'fk';
      } else if (lowerName.endsWith('_id')) {
        fieldType = 'fk';
      } else {
        fieldType = 'text'; // safe default
      }
    }

    const fieldObj = {
      name: fieldName, fieldType, line: fieldLine,
      required, unique, auto, defaultValue, fk,
    };
    if (hasMany) fieldObj.hasMany = hasMany;
    if (hidden) fieldObj.hidden = true;
    if (renamedTo) fieldObj.renamedTo = renamedTo;
    fields.push(fieldObj);
    j++;
  }

  if (fields.length === 0) {
    errors.push({ line, message: `The ${name} table is empty -- add fields inside. Example:\n  create ${'aeiouAEIOU'.includes(name[0]) ? 'an' : 'a'} ${name} table:\n    name, required\n    email, required, unique` });
  }

  const shapeNode = dataShapeNode(name, fields, line, policies);
  if (compoundUniques.length > 0) shapeNode.compoundUniques = compoundUniques;
  return { node: shapeNode, endIdx: j };
}

// =============================================================================
// CRUD OPERATIONS (Phase 9)
// =============================================================================

function parseSave(tokens, line) {
  let pos = 1; // skip "save"
  if (pos >= tokens.length) {
    return { error: 'The save statement needs a variable and target. Example: save new_user to Users' };
  }
  // Reject inline object/array/string literals. Clear's "one operation per
  // line" philosophy says assign first, then save — and the compiler can't
  // emit a correct db.insert/update from an inline {...} anyway (we saw
  // this compile silently to `db.update('values', _pick(_, valueSchema))`
  // during the L3 counter curriculum sweep, crashing every POST).
  if (tokens[pos].type === TokenType.LBRACE
      || tokens[pos].type === TokenType.LBRACKET
      || tokens[pos].type === TokenType.STRING
      || tokens[pos].type === TokenType.NUMBER) {
    return {
      error: 'The save statement needs a variable name, not an inline literal. Assign it to a variable first, then save. Example: "new_entry = { value: 1 }" then "save new_entry to Counters"',
    };
  }
  const variable = tokens[pos].value;
  pos++;

  // expect "to" or "as" connector: "save X to Y" or "save X as new Y"
  let isInsert = false;
  if (pos < tokens.length && (tokens[pos].canonical === 'as_format' || tokens[pos].canonical === 'as'
      || (typeof tokens[pos].value === 'string' && tokens[pos].value.toLowerCase() === 'as'))) {
    isInsert = true; // "save X as Y" = insert new record
    pos++;
  } else if (pos < tokens.length && tokens[pos].canonical === 'to_connector') {
    pos++; // "save X to Y" = update existing
  }
  // Skip optional "new": "save X as new Model"
  if (pos < tokens.length && tokens[pos].value === 'new') { isInsert = true; pos++; }
  if (pos >= tokens.length) {
    return { error: 'The save statement needs a target. Example: save new_user to Users' };
  }
  const target = tokens[pos].value;

  const node = crudNode('save', variable, target, null, line);
  if (isInsert) node.isInsert = true;

  // Parse optional "with field is value" overrides (same as parseSaveAssignment)
  pos++;
  if (pos < tokens.length && tokens[pos].value === 'with') {
    pos++;
    const overrides = [];
    while (pos + 1 < tokens.length) {
      const field = tokens[pos].value;
      pos++;
      if (pos < tokens.length && tokens[pos].canonical === 'is') pos++;
      if (pos < tokens.length) {
        overrides.push({ field, value: tokens[pos].value });
        pos++;
      }
      if (pos < tokens.length && tokens[pos].type === TokenType.COMMA) pos++;
      else break;
    }
    if (overrides.length > 0) node.overrides = overrides;
  }

  return { node };
}

function parseRemoveFrom(tokens, line) {
  let pos = 1; // skip "remove from"
  if (pos >= tokens.length) {
    return { error: 'The remove statement needs a target. Example: remove from Users where age is less than 18' };
  }
  const target = tokens[pos].value;
  pos++;

  // Optional: where condition
  let condition = null;
  if (pos < tokens.length && tokens[pos].canonical === 'where') {
    pos++;
    const expr = parseExpression(tokens, pos, line);
    if (!expr.error) condition = expr.node;
  }

  return { node: crudNode('remove', null, target, condition, line) };
}

// "define X as:" assignment — the new canonical assignment form
// e.g. "define total as: price + tax"
//      "define name as 'Alice'"
//      "define all_posts as: look up all Posts"
function parseDefineAs(tokens, line) {
  // tokens[0] = "define", tokens[1] = name, tokens[2] = "as"
  const name = tokens[1].value;
  let pos = 3; // skip "define", name, "as"

  // Skip optional colon after "as"
  if (pos < tokens.length && tokens[pos].type === TokenType.COLON) {
    pos++;
  }

  if (pos >= tokens.length) {
    return { error: `define ${name} as: needs a value. Example: define ${name} as: price + tax` };
  }

  // Check for "load csv 'path'" on the right side
  if (tokens[pos].canonical === 'load_csv') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "load csv needs a file path in quotes. Example: define sales as: load csv 'sales.csv'" };
    }
    return { node: assignNode(name, { type: NodeType.LOAD_CSV, path: tokens[pos].value, line }, line) };
  }

  // Check for "read file 'path'" on the right side
  if (tokens[pos].canonical === 'read_file') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "read file needs a file path in quotes. Example: define contents as: read file 'data.csv'" };
    }
    return { node: assignNode(name, fileOpNode('read', tokens[pos].value, null, name, line), line) };
  }

  // Check for "file exists 'path'" on the right side
  if (tokens[pos].canonical === 'file_exists') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "file exists needs a file path in quotes. Example: define found as: file exists 'config.json'" };
    }
    return { node: assignNode(name, fileOpNode('exists', tokens[pos].value, null, name, line), line) };
  }

  // Check for "parse json expr" on the right side
  if (tokens[pos].canonical === 'parse_json') {
    pos++;
    const rExpr = parseExpression(tokens, pos, line);
    if (rExpr.error) return { error: rExpr.error };
    return { node: assignNode(name, { type: NodeType.JSON_PARSE, source: rExpr.node, line }, line) };
  }

  // Check for "to json expr" on the right side
  if (tokens[pos].canonical === 'to_json') {
    pos++;
    const rExpr = parseExpression(tokens, pos, line);
    if (rExpr.error) return { error: rExpr.error };
    return { node: assignNode(name, { type: NodeType.JSON_STRINGIFY, source: rExpr.node, line }, line) };
  }

  // Check for "fetch page 'URL'" on the right side (define-as path)
  if (tokens[pos].canonical === 'fetch_page') {
    pos++;
    if (pos >= tokens.length) {
      return { error: "fetch page needs a URL. Example: define page as: fetch page 'https://example.com'" };
    }
    const urlExpr = parseExpression(tokens, pos, line);
    if (urlExpr.error) return { error: urlExpr.error };
    return { node: assignNode(name, { type: NodeType.FETCH_PAGE, url: urlExpr.node, line }, line) };
  }

  // Check for "find all/first 'selector' in page" on the right side (define-as path)
  if (tokens[pos].value === 'find' &&
      pos + 1 < tokens.length && (tokens[pos + 1].value === 'all' || tokens[pos + 1].value === 'first')) {
    const mode = tokens[pos + 1].value;
    pos += 2;
    if (pos >= tokens.length) {
      return { error: `find ${mode} needs a CSS selector and a page variable. Example: define items as: find ${mode} '.title' in page` };
    }
    let selectorExpr;
    if (tokens[pos].type === TokenType.STRING) {
      selectorExpr = { type: NodeType.LITERAL_STRING, value: tokens[pos].value, line };
      pos++;
    } else {
      const parsed = parseExpression(tokens, pos, line);
      if (parsed.error) return { error: parsed.error };
      selectorExpr = parsed.node;
      pos = parsed.nextPos || pos + 1;
    }
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    if (pos >= tokens.length) {
      return { error: `find ${mode} needs 'in' and a page variable. Example: define items as: find ${mode} '.title' in page` };
    }
    const pageExpr = parseExpression(tokens, pos, line);
    if (pageExpr.error) return { error: pageExpr.error };
    return { node: assignNode(name, { type: NodeType.FIND_ELEMENTS, selector: selectorExpr, source: pageExpr.node, mode, line }, line) };
  }

  // Check for "train model on DATA predicting TARGET" (define-as path)
  if (tokens[pos].canonical === 'train_model') {
    pos++;
    if (pos >= tokens.length || tokens[pos].value !== 'on') {
      return { error: "train model needs data and a target. Example: define model as: train model on data predicting churn" };
    }
    pos++;
    if (pos >= tokens.length) return { error: "train model needs a data variable after 'on'." };
    const dataVar = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++;
    if (pos >= tokens.length || tokens[pos].value !== 'predicting') {
      return { error: "train model needs 'predicting' and a target field." };
    }
    pos++;
    if (pos >= tokens.length) return { error: "train model needs a target field after 'predicting'." };
    const target = tokens[pos].value;
    return { node: assignNode(name, { type: NodeType.TRAIN_MODEL, data: dataVar, target, line }, line) };
  }

  // Check for "classify INPUT as 'cat1', 'cat2'" (define-as path)
  // "classify" tokenizes as predict_with. Discriminator: as_format + strings after identifier.
  if (tokens[pos].canonical === 'predict_with' &&
      pos + 2 < tokens.length &&
      (tokens[pos + 1].type === TokenType.IDENTIFIER || tokens[pos + 1].type === TokenType.KEYWORD) &&
      tokens[pos + 2].canonical === 'as_format') {
    pos++; // skip 'classify' (predict_with)
    const input = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++; // skip input variable
    pos++; // skip 'as' (as_format)
    const categories = [];
    while (pos < tokens.length) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.STRING) {
        categories.push(tokens[pos].value);
        pos++;
      } else {
        break;
      }
    }
    return { node: assignNode(name, { type: NodeType.CLASSIFY, input, categories, line }, line) };
  }

  // Check for "predict with MODEL using FEATURES" (define-as path)
  if (tokens[pos].canonical === 'predict_with') {
    pos++;
    if (pos >= tokens.length) return { error: "predict with needs a model and features." };
    const modelVar = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++;
    if (pos >= tokens.length || tokens[pos].value !== 'using') {
      return { error: "predict with needs 'using' and feature names." };
    }
    pos++;
    const features = [];
    while (pos < tokens.length) {
      if (tokens[pos].value === 'and' || tokens[pos].value === ',') { pos++; continue; }
      features.push(tokens[pos].value);
      pos++;
    }
    if (features.length === 0) return { error: "predict with needs at least one feature." };
    return { node: assignNode(name, { type: NodeType.PREDICT, model: modelVar, features, line }, line) };
  }

  // Check for CRUD "look up" on the right side
  if (tokens[pos].canonical === 'look_up') {
    const result = parseLookUpAssignment(name, tokens, pos, line);
    return result;
  }

  // Check for "save" on the right side
  if (tokens[pos].canonical === 'save_to') {
    return parseSaveAssignment(name, tokens, pos, line);
  }

  // Regular expression
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) {
    return { error: expr.error };
  }
  return { node: assignNode(name, expr.node, line) };
}

// CRUD in assignment context: todos = look up all Todos
// Also: todos = look up all records in Posts table
function parseLookUpAssignment(name, tokens, pos, line) {
  pos++; // skip "look up"
  // Optional "all" or "every" (every = opt out of default LIMIT 50)
  let lookupAll = false;
  let noLimit = false;
  if (pos < tokens.length && typeof tokens[pos].value === 'string') {
    const valLower = tokens[pos].value.toLowerCase();
    if (valLower === 'all') {
      lookupAll = true;
      pos++;
    } else if (valLower === 'every') {
      lookupAll = true;
      noLimit = true;
      pos++;
    }
  }
  if (pos >= tokens.length) {
    return { error: 'Look up needs a data shape name. Example: todos = look up all Todos' };
  }

  // Check for "records in X table" pattern
  let target;
  if (tokens[pos].canonical === 'records_in') {
    pos++; // skip "records in"
    if (pos >= tokens.length) {
      return { error: 'Look up needs a table name after "records in". Example: look up all records in Posts table' };
    }
    target = tokens[pos].value;
    pos++;
    // Optional "table" keyword
    if (pos < tokens.length && tokens[pos].value && tokens[pos].value.toLowerCase() === 'table') {
      pos++;
    }
  } else {
    target = tokens[pos].value;
    pos++;
  }

  // Optional "where" condition
  let condition = null;
  if (pos < tokens.length && tokens[pos].canonical === 'where') {
    pos++;
    const expr = parseExpression(tokens, pos, line);
    if (!expr.error) condition = expr.node;
  }

  const node = crudNode('lookup', name, target, condition, line);
  node.lookupAll = lookupAll;
  if (noLimit) node.noLimit = true;
  // Optional pagination: "page N, M per page"
  if (pos < tokens.length && tokens[pos].value === 'page') {
    pos++;
    if (pos < tokens.length) {
      node.page = tokens[pos].type === TokenType.NUMBER ? tokens[pos].value : tokens[pos].value;
      pos++;
      if (pos < tokens.length && tokens[pos].value === ',') pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
        node.perPage = tokens[pos].value;
      }
    }
  }
  return { node };
}

// CRUD in assignment context: new_todo = save incoming as Todo
function parseSaveAssignment(name, tokens, pos, line) {
  pos++; // skip "save"
  let variable = 'incoming';
  if (pos < tokens.length && tokens[pos].type !== TokenType.COMMENT) {
    // Reject inline object/array/string/number literals (same as parseSave).
    // `result = save { value: 1 } to X` was silently tolerated until the
    // validator caught it with a confusing "undefined variable" error.
    // Parser-level rejection gives Meph one instructive message instead.
    if (tokens[pos].type === TokenType.LBRACE
        || tokens[pos].type === TokenType.LBRACKET
        || tokens[pos].type === TokenType.STRING
        || tokens[pos].type === TokenType.NUMBER) {
      return {
        error: 'The save statement needs a variable name, not an inline literal. Assign it to a variable first, then save. Example: "new_entry = { value: 1 }" then "' + name + ' = save new_entry to Target"',
      };
    }
    variable = tokens[pos].value;
    pos++;
  }
  // "as" or "to" -- canonical might be 'as_format' or 'to_connector'
  if (pos < tokens.length && (tokens[pos].canonical === 'as_format' || tokens[pos].canonical === 'as'
      || tokens[pos].canonical === 'to_connector'
      || (typeof tokens[pos].value === 'string' && (tokens[pos].value.toLowerCase() === 'as' || tokens[pos].value.toLowerCase() === 'to')))) {
    pos++;
  }
  // Skip optional "new" before target: "save X as new Todo"
  if (pos < tokens.length && tokens[pos].value === 'new') pos++;
  let target = 'unknown';
  if (pos < tokens.length) {
    target = tokens[pos].value;
  }

  const node = crudNode('save', variable, target, null, line);
  node.resultVar = name; // "new_todo = save incoming as Todo" -> resultVar is new_todo

  // Parse optional "with field is value" overrides. Lets the user set a
  // field from a local variable instead of the request body:
  //   saved = save request as new Report with report is final_report
  // Multiple overrides separated by commas are supported:
  //   saved = save request as new X with a is b, c is d
  pos++;
  if (pos < tokens.length && tokens[pos].value === 'with') {
    pos++;
    const overrides = [];
    while (pos + 1 < tokens.length) {
      const field = tokens[pos].value;
      pos++;
      if (pos < tokens.length && tokens[pos].canonical === 'is') pos++; // skip "is"
      if (pos < tokens.length) {
        overrides.push({ field, value: tokens[pos].value });
        pos++;
      }
      // skip comma separator
      if (pos < tokens.length && tokens[pos].type === TokenType.COMMA) pos++;
      else break;
    }
    if (overrides.length > 0) node.overrides = overrides;
  }

  return { node };
}

// =============================================================================
// TEST BLOCKS (Phase 11)
// =============================================================================

function parseTestDef(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip "test"

  let name = null;
  // Named test: test 'name':
  // Nameless test: test:  (first body line becomes the name)
  if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
    name = tokens[pos].value;
  }

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: 'Test block is empty — add assertions inside. Example: test:\n  can user view all todos' });
    return { node: null, endIdx };
  }

  // If no name given, derive it from the first body line's raw text
  if (!name) {
    // Reconstruct readable text from the first body node's tokens
    const firstLine = lines[startIdx + 1];
    if (firstLine) {
      name = firstLine.tokens.map(t => t.type === TokenType.STRING ? "'" + t.value + "'" : t.value).join(' ');
    } else {
      name = 'unnamed test';
    }
  }

  return { node: testDefNode(name, body, line), endIdx };
}

function parseExpect(tokens, line) {
  const pos = 1; // skip "expect"
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };
  return { node: expectNode(expr.node, line) };
}

/**
 * Parse a top-level `eval 'name':` block.
 *
 * Body grammar:
 *   given 'Agent Name' receives <input-expr>    → agent scenario
 *   given 'Agent Name' receives:                → agent scenario w/ indented object
 *     <field> is <value>
 *     ...
 *   call <METHOD> '<path>' with <input-expr>    → endpoint scenario
 *   expect '<rubric string>'                    → LLM-graded expectation
 *   expect output has <field>, <field>          → deterministic shape check
 *
 * Produces an EVAL_DEF AST node consumed by `generateEvalSuite` which merges
 * it into `result.evalSuite` with `source: 'user-top'`. Designed to read like
 * `test 'name':` so the language feels consistent.
 */
function parseEvalBlock(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip "eval"

  // Optional name in a string literal — matches the test-block pattern.
  let name = null;
  if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
    name = tokens[pos].value;
  }

  // Walk indented body lines. Recognized keywords at body-level: given, call, expect.
  // Everything else is an error (keeps the surface small).
  const evalNode = {
    type: NodeType.EVAL_DEF,
    name: name || 'unnamed eval',
    scope: 'top',
    line,
    // Populated below
    scenarioKind: null,   // 'agent' | 'endpoint'
    agentName: null,
    method: null,
    endpointPath: null,
    input: null,
    rubric: null,
    expectFields: null,
  };

  let i = startIdx + 1;
  while (i < lines.length && lines[i].indent > blockIndent) {
    const t = lines[i].tokens;
    if (t.length === 0) { i++; continue; }
    const lineNum = t[0].line;
    const first = t[0].value;

    // `given 'Agent' receives <value>` OR `given 'Agent' receives:` + indented block
    if (first === 'given') {
      const agentIdx = t.findIndex((tok) => tok.type === TokenType.STRING);
      if (agentIdx === -1) {
        errors.push({ line: lineNum, message: "The `given` line needs an agent name in quotes. Example: given 'Support' receives 'hello'" });
        i++; continue;
      }
      evalNode.scenarioKind = 'agent';
      evalNode.agentName = t[agentIdx].value;
      // Find "receives" — could be canonical 'receiving' or literal 'receives'
      const recvIdx = t.findIndex((tok) => tok.value === 'receives' || tok.canonical === 'receiving');
      if (recvIdx === -1) {
        errors.push({ line: lineNum, message: "The `given` line needs `receives` before the input. Example: given 'Support' receives 'hello'" });
        i++; continue;
      }
      // After `receives`: trailing tokens on this line are the scalar input.
      // If NO trailing tokens AND the next line is more indented, it's a block
      // form (tokenizer strips the trailing `:`). Otherwise it's a scalar.
      const afterRecv = t.slice(recvIdx + 1);
      const headerIndent = lines[i].indent;
      const isBlock = afterRecv.length === 0 && (i + 1) < lines.length && lines[i + 1].indent > headerIndent;
      if (isBlock) {
        // Parse indented "field is value" lines until indent drops back
        i++;
        const obj = {};
        while (i < lines.length && lines[i].indent > headerIndent) {
          const ft = lines[i].tokens;
          if (ft.length === 0) { i++; continue; }
          // `<name> is <value>` — reuse parseExpression for the RHS
          const fname = ft[0].value;
          const isIdx = ft.findIndex((x) => x.canonical === 'is' || x.value === 'is');
          if (isIdx <= 0) {
            errors.push({ line: ft[0].line, message: "Each field inside `receives:` needs `<name> is <value>`. Example: name is 'Jane'" });
            i++; continue;
          }
          const expr = parseExpression(ft, isIdx + 1, ft[0].line);
          if (expr.error) { errors.push({ line: ft[0].line, message: expr.error }); i++; continue; }
          obj[fname] = _literalFromExpr(expr.node);
          i++;
        }
        evalNode.input = obj;
        continue;
      }
      // Inline scalar value
      const expr = parseExpression(t, recvIdx + 1, lineNum);
      if (expr.error) { errors.push({ line: lineNum, message: expr.error }); i++; continue; }
      evalNode.input = _literalFromExpr(expr.node);
      i++;
      continue;
    }

    // `call POST '/api/x' with <value>` OR `call POST '/api/x' with <field> is <value>, ...`
    if (first === 'call') {
      evalNode.scenarioKind = 'endpoint';
      // t = [call, METHOD, STRING_PATH, with, ...value...]
      const methodIdx = 1;
      const pathIdx = t.findIndex((tok) => tok.type === TokenType.STRING);
      const withIdx = t.findIndex((tok) => tok.canonical === 'with' || tok.value === 'with');
      if (methodIdx >= t.length || pathIdx === -1 || withIdx === -1) {
        errors.push({ line: lineNum, message: "`call` needs METHOD + path + with + value. Example: call POST '/api/x' with text is 'hi'" });
        i++; continue;
      }
      evalNode.method = t[methodIdx].value.toUpperCase();
      evalNode.endpointPath = t[pathIdx].value;

      // Parse the body after `with`. Two forms:
      //  - `with <field> is <value>, <field> is <value>`  (inline object)
      //  - `with <bare-expr>`  (scalar — wrap as {input: value})
      const afterWith = t.slice(withIdx + 1);
      if (afterWith.some((tok) => tok.canonical === 'is' || tok.value === 'is')) {
        // Inline object — split on commas
        const obj = {};
        let fragment = [];
        const flush = () => {
          if (fragment.length === 0) return;
          const isIdx = fragment.findIndex((x) => x.canonical === 'is' || x.value === 'is');
          if (isIdx <= 0) return;
          const fname = fragment[0].value;
          const expr = parseExpression(fragment, isIdx + 1, lineNum);
          if (!expr.error) obj[fname] = _literalFromExpr(expr.node);
          fragment = [];
        };
        for (const tok of afterWith) {
          if (tok.type === TokenType.COMMA) { flush(); } else { fragment.push(tok); }
        }
        flush();
        evalNode.input = obj;
      } else {
        const expr = parseExpression(t, withIdx + 1, lineNum);
        if (expr.error) { errors.push({ line: lineNum, message: expr.error }); i++; continue; }
        evalNode.input = _literalFromExpr(expr.node);
      }
      i++;
      continue;
    }

    // `expect 'rubric'` OR `expect output has field, field, ...`
    if (first === 'expect') {
      // Deterministic form: expect output has <field-list>
      const outputIdx = t.findIndex((tok, idx) => idx > 0 && tok.value === 'output');
      const hasIdx = t.findIndex((tok, idx) => idx > outputIdx && outputIdx !== -1 && tok.value === 'has');
      if (outputIdx !== -1 && hasIdx !== -1) {
        const fields = t.slice(hasIdx + 1)
          .filter((tok) => tok.type !== TokenType.COMMA)
          .filter((tok) => tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD)
          .map((tok) => tok.value);
        evalNode.expectFields = fields;
        i++;
        continue;
      }
      // Rubric form: expect '<string>'
      if (t.length >= 2 && t[1].type === TokenType.STRING) {
        evalNode.rubric = t[1].value;
        i++;
        continue;
      }
      errors.push({ line: lineNum, message: "`expect` needs either a rubric string (expect 'Response is warm and professional') or a shape check (expect output has field1, field2)." });
      i++;
      continue;
    }

    errors.push({ line: lineNum, message: `Unexpected line inside \`eval\` block: "${first}". Use \`given\` / \`call\` for input and \`expect\` for criteria.` });
    i++;
  }

  // Validation
  if (!evalNode.scenarioKind) {
    errors.push({ line, message: `The eval block '${evalNode.name}' is empty. It needs a \`given\` or \`call\` line followed by \`expect\`. Example:\n  eval 'Agent greets politely':\n    given 'Support' receives 'hi'\n    expect 'Output is a warm greeting'` });
    return { node: null, endIdx: i };
  }
  if (!evalNode.rubric && !evalNode.expectFields) {
    errors.push({ line, message: `The eval block '${evalNode.name}' is missing an \`expect\` line. Example: expect 'The output addresses the question clearly.'` });
    return { node: null, endIdx: i };
  }

  return { node: evalNode, endIdx: i };
}

/**
 * Reduce a parsed expression node back to a plain JS literal for eval specs.
 * Handles strings, numbers, booleans, and nothing (null). Returns the literal
 * as-is if the expression tree is already simple.
 */
function _literalFromExpr(expr) {
  if (expr == null) return null;
  if (expr.type === NodeType.LITERAL_STRING) return expr.value;
  if (expr.type === NodeType.LITERAL_NUMBER) return expr.value;
  if (expr.type === NodeType.LITERAL_BOOLEAN) return expr.value;
  if (expr.type === NodeType.LITERAL_NOTHING) return null;
  if (typeof expr.value !== 'undefined' && expr.type && /literal/i.test(expr.type)) return expr.value;
  // Fall back to value if present, else stringify the tree
  return expr.value !== undefined ? expr.value : JSON.stringify(expr);
}

// =============================================================================
// ASK FOR (INPUT) (Phase 4) — legacy syntax, still supported
// =============================================================================
// CANONICAL: ask for price as number called "Item Price"
// Parses: ask for <variable> [as <type>] [called <label>]

function parseAskFor(tokens, line) {
  let pos = 1; // skip "ask for" (single multi-word token)

  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    return { error: 'The "ask for" needs a variable name — which value should the user provide? Example: ask for price as number called "Price"' };
  }
  const variable = tokens[pos].value;
  pos++;

  // Optional: as <type>
  // Supported types: number, text, percent, yes/no, long text, choice of [...]
  let inputType = 'text'; // default
  let choices = null;
  if (pos < tokens.length && tokens[pos].canonical === 'as_format') {
    pos++;
    if (pos < tokens.length) {
      const typeWord = (tokens[pos].value || '').toLowerCase();

      // "yes/no" — might be split across tokens by the / operator
      if (typeWord === 'yes' && pos + 2 < tokens.length && tokens[pos + 1].value === '/' && (tokens[pos + 2].value || '').toLowerCase() === 'no') {
        inputType = 'yes/no';
        pos += 3;
      }
      // "long text" — two-word type
      else if (typeWord === 'long' && pos + 1 < tokens.length && (tokens[pos + 1].value || '').toLowerCase() === 'text') {
        inputType = 'long text';
        pos += 2;
      }
      // "choice of [...]" — dropdown with options
      else if (typeWord === 'choice' && pos + 1 < tokens.length && (tokens[pos + 1].value || '').toLowerCase() === 'of') {
        inputType = 'choice';
        pos += 2;
        // Parse the list literal [...]
        if (pos < tokens.length && tokens[pos].type === TokenType.LBRACKET) {
          choices = [];
          pos++; // skip [
          while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACKET) {
            if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
            if (tokens[pos].type === TokenType.STRING) {
              choices.push(tokens[pos].value);
            }
            pos++;
          }
          if (pos < tokens.length) pos++; // skip ]
        }
      }
      // Simple single-word type: number, text, percent, etc.
      else if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
        inputType = typeWord;
        pos++;
      }
    }
  }

  // Optional: called <label>
  let label = variable; // default to variable name
  if (pos < tokens.length && tokens[pos].canonical === 'called') {
    pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      label = tokens[pos].value;
    }
  }

  const node = askForNode(variable, inputType, label, line);
  if (choices) { node.choices = choices; node.ui.choices = choices; }
  return { node };
}

// =============================================================================
// DISPLAY (Phase 4)
// =============================================================================
// CANONICAL: display total as dollars called "Total"
// Parses: display <expression> [as <format>] [called <label>]

function parseDisplay(tokens, line) {
  let pos = 1; // skip "display"

  if (pos >= tokens.length) {
    return { error: 'The "display" statement needs a value to show. Example: display total as dollars called "Total"' };
  }

  // Find where "as" or "called" starts (to know where expression ends)
  // Also check for "to_json" (synonym collision: "as json" tokenizes as single to_json keyword)
  let exprEnd = tokens.length;
  for (let i = pos; i < tokens.length; i++) {
    if (tokens[i].canonical === 'as_format' || tokens[i].canonical === 'called' || tokens[i].canonical === 'to_json') {
      exprEnd = i;
      break;
    }
  }

  const expr = parseExpression(tokens, pos, line, exprEnd);
  if (expr.error) return { error: expr.error };
  pos = exprEnd;

  // T2#8 chart shorthand: `display X as bar chart` / `show Y as line chart`.
  // Meph reaches for this natural English form; canonical is `bar chart
  // 'Title' showing X`. Without this branch the rest of the function sets
  // format='bar' and the compiler silently drops — no CDN, no DOM, no init.
  // Detect `as <chartType> chart` at this position and rewrite to a
  // CHART node that goes through the same codegen as the canonical form.
  if (pos + 2 < tokens.length &&
      tokens[pos].canonical === 'as_format' &&
      typeof tokens[pos + 1].value === 'string' &&
      typeof tokens[pos + 2].value === 'string' &&
      tokens[pos + 2].value.toLowerCase() === 'chart') {
    const chartType = tokens[pos + 1].value.toLowerCase();
    // Validate chart type; unknown types return a helpful error instead
    // of silently falling through to format=<word> (which would drop to
    // an empty HTML emit). parseChartRemainder uses the same whitelist.
    if (!['bar', 'line', 'pie', 'area'].includes(chartType)) {
      return {
        error: `Unknown chart type '${chartType}'. Use: line, bar, pie, or area. Example: display sales as bar chart`,
      };
    }
    // Derive a title from the expression (variable name if available,
    // otherwise fall back to a capitalized chart-type label).
    const title = expr.node && expr.node.name
      ? expr.node.name.charAt(0).toUpperCase() + expr.node.name.slice(1)
      : chartType.charAt(0).toUpperCase() + chartType.slice(1) + ' Chart';
    const dataVar = expr.node && expr.node.name ? expr.node.name : null;
    const slug = sanitizeForId(title.replace(/\s+/g, '_'));
    const ui = { tag: 'chart', id: `chart_${slug}`, label: title };
    return {
      node: {
        type: NodeType.CHART,
        title,
        chartType,
        dataVar,
        groupBy: null,
        line,
        ui,
      },
    };
  }

  // Optional: as <format>
  let format = 'text';
  if (pos < tokens.length && tokens[pos].canonical === 'as_format') {
    pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      format = tokens[pos].value.toLowerCase();
      pos++;
    }
  }
  // Handle "as json" synonym collision: tokenizer eats "as json" as single to_json keyword
  if (pos < tokens.length && tokens[pos].canonical === 'to_json') {
    format = 'json';
    pos++;
  }

  // Optional: called <label>
  let label = null;
  if (pos < tokens.length && tokens[pos].canonical === 'called') {
    pos++;
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      label = tokens[pos].value;
      pos++;
    }
  }

  // Optional: showing col1, col2, col3 (column whitelist for tables)
  let columns = null;
  if (pos < tokens.length && tokens[pos].value === 'showing') {
    pos++;
    columns = [];
    while (pos < tokens.length) {
      if (tokens[pos].canonical === 'with') break;
      if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
        columns.push(tokens[pos].value);
      }
      pos++;
      // Skip comma separators and 'and'
      if (pos < tokens.length && (tokens[pos].value === ',' || tokens[pos].value === 'and')) pos++;
    }
  }

  // Optional: with delete / with edit / with delete and edit
  let actions = null;
  if (pos < tokens.length && tokens[pos].canonical === 'with') {
    pos++;
    actions = [];
    while (pos < tokens.length) {
      const resolved = resolveCanonical(tokens[pos], 'ui');
      if (resolved === 'action_delete' || resolved === 'remove') {
        actions.push('delete');
      } else if (tokens[pos].value.toLowerCase() === 'edit') {
        actions.push('edit');
      }
      pos++;
      if (pos < tokens.length && (tokens[pos].value === ',' || tokens[pos].value === 'and')) pos++;
    }
  }

  const node = displayNode(expr.node, format, label, line);
  node.columns = columns;
  if (actions && actions.length > 0) node.actions = actions;
  return { node };
}

// =============================================================================
// CHART (Phase 30)
// =============================================================================
// CANONICAL: bar chart 'Title' showing data_var
// Also: 'Title' bar chart showing data_var
//        pie chart 'Title' showing data_var by field_name
//        chart 'Title' as line showing data_var (legacy)

function parseChart(tokens, line) {
  let pos = 1; // skip "chart"

  // Title (required, string)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: 'Chart needs a title in quotes. Example: chart \'Revenue\' as line showing sales' };
  }
  const title = tokens[pos].value;
  pos++;

  // "as" <chartType> (required)
  if (pos >= tokens.length || tokens[pos].canonical !== 'as_format') {
    return { error: 'Chart needs a type after "as". Example: chart \'Revenue\' as line showing sales' };
  }
  pos++;
  if (pos >= tokens.length) {
    return { error: 'Chart needs a type (line, bar, pie, area). Example: chart \'Revenue\' as line showing sales' };
  }
  const chartType = tokens[pos].value.toLowerCase();
  if (!['line', 'bar', 'pie', 'area'].includes(chartType)) {
    return { error: `Unknown chart type '${chartType}'. Use: line, bar, pie, or area.` };
  }
  pos++;

  // "showing" <data_var> (required)
  if (pos >= tokens.length || tokens[pos].value !== 'showing') {
    return { error: 'Chart needs "showing" followed by your data variable. Example: chart \'Revenue\' as line showing sales' };
  }
  pos++;
  if (pos >= tokens.length) {
    return { error: 'Chart needs a data variable after "showing". Example: chart \'Revenue\' as line showing sales' };
  }
  const dataVar = tokens[pos].value;
  pos++;

  // Optional: "by" <field> (for pie charts — groups by this field)
  let groupBy = null;
  if (pos < tokens.length && tokens[pos].value === 'by') {
    pos++;
    if (pos < tokens.length) {
      groupBy = tokens[pos].value;
      pos++;
    }
  }

  const slug = sanitizeForId(title.replace(/\s+/g, '_'));
  const ui = { tag: 'chart', id: `chart_${slug}`, label: title };
  return { node: { type: NodeType.CHART, title, chartType, dataVar, groupBy, line, ui } };
}

// --- New chart syntax helpers ---
// Type-first: bar chart 'Title' showing data [by field]
function parseChartTypeFirst(tokens, line) {
  const chartType = tokens[0].value.toLowerCase();
  // tokens[1] is 'chart' — skip
  let pos = 2;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    return { error: `${chartType} chart needs a title in quotes. Example: ${chartType} chart 'Revenue' showing sales` };
  }
  const title = tokens[pos].value;
  pos++;
  return parseChartRemainder(tokens, pos, title, chartType, line);
}

// Title-first: 'Title' bar chart showing data [by field]
function parseChartTitleFirst(tokens, line) {
  const title = tokens[0].value;
  const chartType = tokens[1].value.toLowerCase();
  // tokens[2] is 'chart' — skip
  let pos = 3;
  return parseChartRemainder(tokens, pos, title, chartType, line);
}

// Shared: parse "showing data [by field]" from a given position
function parseChartRemainder(tokens, pos, title, chartType, line) {
  if (!['line', 'bar', 'pie', 'area'].includes(chartType)) {
    return { error: `Unknown chart type '${chartType}'. Use: line, bar, pie, or area.` };
  }

  // Optional subtitle: bar chart 'Title' subtitle 'Last 30 days' showing data
  let subtitle = null;
  if (pos < tokens.length && tokens[pos].value === 'subtitle' && pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.STRING) {
    subtitle = tokens[pos + 1].value;
    pos += 2;
  }

  if (pos >= tokens.length || tokens[pos].value !== 'showing') {
    return { error: `Chart needs "showing" followed by your data variable. Example: ${chartType} chart '${title}' showing sales` };
  }
  pos++;
  if (pos >= tokens.length) {
    return { error: `Chart needs a data variable after "showing". Example: ${chartType} chart '${title}' showing sales` };
  }
  const dataVar = tokens[pos].value;
  pos++;

  let groupBy = null;
  if (pos < tokens.length && tokens[pos].value === 'by') {
    pos++;
    if (pos < tokens.length) {
      groupBy = tokens[pos].value;
      pos++;
    }
  }

  // Optional stacked: bar chart 'Title' showing data stacked
  let stacked = false;
  if (pos < tokens.length && tokens[pos].value === 'stacked') {
    stacked = true;
    pos++;
  }

  const slug = sanitizeForId(title.replace(/\s+/g, '_'));
  const ui = { tag: 'chart', id: `chart_${slug}`, label: title };
  const node = { type: NodeType.CHART, title, chartType, dataVar, groupBy, line, ui };
  if (subtitle) node.subtitle = subtitle;
  if (stacked) node.stacked = true;
  return { node };
}

// =============================================================================
// BUTTON (Phase 4)
// =============================================================================
// CANONICAL: button "Click Me":
//   (indented body — code that runs when clicked)

function parseButton(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: 'The button needs a label in quotes. Example: button "Click Me"' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const label = tokens[pos].value;

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The button "${label}" has no action — add code that runs when clicked, indented below it. Example:\n  button "${label}":\n    show "clicked!"` });
  }

  return { node: buttonNode(label, body, line), endIdx };
}

// =============================================================================
// ENDPOINT (Phase 5)
// =============================================================================
// CANONICAL: on GET /api/users:
//   (indented body with respond, assignments, etc.)

// =============================================================================
// ADVANCED FEATURES (Phase 20)
// =============================================================================

function parseStream(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
  if (body.length === 0) {
    errors.push({ line, message: 'The stream block is empty -- add code to stream.' });
  }
  return { node: streamNode(body, line), endIdx };
}

function parseBackground(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Background job needs a name. Example: background 'send-emails':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  let schedule = null;
  const bodyNodes = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const firstCanon = bodyTokens[0].canonical || (typeof bodyTokens[0].value === 'string' ? bodyTokens[0].value.toLowerCase() : '');
    if (firstCanon === 'runs_every' || firstCanon === 'runs') {
      let bPos = 1;
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'every') bPos++;
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.NUMBER) {
        const val = bodyTokens[bPos].value;
        bPos++;
        let unit = 'hour';
        if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string') unit = bodyTokens[bPos].value.toLowerCase().replace(/s$/, '');
        schedule = { value: val, unit };
      }
      j++;
      continue;
    }
    // Parse as regular code line
    const { body: innerBody, endIdx: innerEnd } = parseBlock(lines, j, lines[j].indent - 1, []);
    bodyNodes.push(...innerBody);
    j = innerEnd;
  }

  if (!schedule) {
    errors.push({ line, message: `Background job "${name}" needs a schedule. Example:\n  background '${name}':\n    runs every 1 hour` });
  }

  return { node: backgroundNode(name, schedule, bodyNodes, line), endIdx: j };
}

// "every 5 minutes:" / "every 1 hour:" / "every day at 9am:" / "every day at 14:30:"
function parseCron(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip 'every'

  // Form 1: every day at <time>:
  if (pos < tokens.length && (tokens[pos].value === 'day' || tokens[pos].value === 'days')) {
    pos++; // skip 'day'
    if (pos < tokens.length && tokens[pos].value === 'at') {
      pos++; // skip 'at'
      if (pos >= tokens.length) {
        errors.push({ line, message: "Expected time after 'every day at'. Example: every day at 9am:" });
        return { node: null, endIdx: startIdx + 1 };
      }
      // Parse time — may be: "9am", "9:30am", "14:30", "14"
      // Tokenizer splits 2:30pm as: NUMBER(2) COLON NUMBER(30) IDENTIFIER(pm) COLON
      // So we handle multi-token time here.
      let hour = 0, minute = 0;
      const firstTok = tokens[pos];
      if (firstTok.type === TokenType.NUMBER) {
        hour = Number(firstTok.value);
        pos++;
        // Check for ":MM" part
        if (pos < tokens.length && tokens[pos].type === TokenType.COLON) {
          pos++; // skip ':'
          if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
            minute = Number(tokens[pos].value);
            pos++;
          }
        }
        // Check for am/pm suffix (may be glued to number as identifier, or separate)
        if (pos < tokens.length) {
          const raw = String(tokens[pos].value).toLowerCase();
          if (raw === 'pm') { if (hour < 12) hour += 12; pos++; }
          else if (raw === 'am') { if (hour === 12) hour = 0; pos++; }
          else {
            // Could be something like "9am" as one token (NUMBER glued with am/pm)
            const numRaw = String(firstTok.value);
            const ampmMatch = numRaw.match(/^(\d+)(am|pm)?$/i);
            if (ampmMatch && ampmMatch[2]) {
              const ampm = ampmMatch[2].toLowerCase();
              if (ampm === 'pm' && hour < 12) hour += 12;
              if (ampm === 'am' && hour === 12) hour = 0;
            }
          }
        }
      } else if (firstTok.type === TokenType.STRING || firstTok.type === TokenType.IDENTIFIER) {
        // e.g. "9am" stored as identifier
        const timeStr = String(firstTok.value);
        pos++;
        const ampmMatch = timeStr.match(/^(\d+)(?::(\d+))?(am|pm)?$/i);
        if (ampmMatch) {
          hour = parseInt(ampmMatch[1], 10);
          minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
          const ampm = ampmMatch[3] ? ampmMatch[3].toLowerCase() : null;
          if (ampm === 'pm' && hour < 12) hour += 12;
          if (ampm === 'am' && hour === 12) hour = 0;
        } else {
          errors.push({ line, message: `Unrecognized time format '${timeStr}'. Examples: 9am, 2:30pm, 14:30` });
          return { node: null, endIdx: startIdx + 1 };
        }
      } else {
        errors.push({ line, message: `Expected a time after 'every day at'. Examples: 9am, 2:30pm, 14:30` });
        return { node: null, endIdx: startIdx + 1 };
      }
      const timeLabel = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
      if (body.length === 0) {
        errors.push({ line, message: `'every day at ${timeLabel}' block is empty — add code inside` });
      }
      return { node: { type: NodeType.CRON, mode: 'at', hour, minute, body, line }, endIdx };
    }
    errors.push({ line, message: "Expected 'at' after 'every day'. Example: every day at 9am:" });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Form 2: every N minutes/hours/seconds:
  if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
    const value = tokens[pos].value;
    pos++;
    let unit = 'minute';
    if (pos < tokens.length) {
      const raw = String(tokens[pos].value).toLowerCase().replace(/s$/, '');
      if (raw === 'second' || raw === 'minute' || raw === 'hour') {
        unit = raw;
        pos++;
      }
    }
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: `'every ${value} ${unit}s' block is empty — add code inside` });
    }
    return { node: { type: NodeType.CRON, mode: 'interval', value, unit, body, line }, endIdx };
  }

  errors.push({ line, message: "Unrecognized schedule syntax. Examples: every 5 minutes:  OR  every day at 9am:" });
  return { node: null, endIdx: startIdx + 1 };
}

function parseSubscribe(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Subscribe needs a channel name. Example: subscribe to 'messages':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const channel = tokens[pos].value;
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
  if (body.length === 0) {
    errors.push({ line, message: `The subscription to "${channel}" is empty -- add event handlers.` });
  }
  return { node: subscribeNode(channel, body, line), endIdx };
}

// "update database:" — friendly migration block
// Supports:
//   in Users table:
//     add name field as text
//     remove age field
//   create Products table:
//     name, required
function parseUpdateDatabase(lines, startIdx, blockIndent, errors) {
  const line = lines[startIdx].tokens[0].line;
  const nodes = [];
  let j = startIdx + 1;

  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const raw = lines[j].raw || '';

    // "in Users table:" — alter existing table
    if (bodyTokens[0].canonical === 'in') {
      let tableName = '';
      let tPos = 1;
      if (tPos < bodyTokens.length) { tableName = bodyTokens[tPos].value; tPos++; }
      // Skip optional "table" keyword
      if (tPos < bodyTokens.length && (bodyTokens[tPos].canonical === 'list' || bodyTokens[tPos].canonical === 'data_shape' ||
          (bodyTokens[tPos].value && bodyTokens[tPos].value.toLowerCase() === 'table'))) {
        tPos++;
      }

      // Parse indented alter operations
      const operations = [];
      const tableIndent = lines[j].indent;
      j++;
      while (j < lines.length && lines[j].indent > tableIndent) {
        const opTokens = lines[j].tokens;
        if (opTokens.length === 0) { j++; continue; }
        const opCanon = opTokens[0].canonical || '';

        if (opCanon === 'add' || opCanon === 'add_field') {
          // "add status field as text, default 'active'"
          let oPos = 1;
          let colName = '';
          if (oPos < opTokens.length) { colName = opTokens[oPos].value; oPos++; }
          // Skip "field"/"column"
          if (oPos < opTokens.length && (opTokens[oPos].canonical === 'field_kw' ||
              (opTokens[oPos].value && (opTokens[oPos].value === 'field' || opTokens[oPos].value === 'column')))) {
            oPos++;
          }
          // "as text"
          let colType = 'text';
          if (oPos < opTokens.length && (opTokens[oPos].canonical === 'as_format' ||
              (opTokens[oPos].value && opTokens[oPos].value.toLowerCase() === 'as'))) {
            oPos++;
            if (oPos < opTokens.length) { colType = opTokens[oPos].value.toLowerCase(); oPos++; }
          }
          // ", default X"
          let defaultValue = null;
          while (oPos < opTokens.length) {
            if (opTokens[oPos].type === TokenType.COMMA) { oPos++; continue; }
            if (opTokens[oPos].value && opTokens[oPos].value.toLowerCase() === 'default') {
              oPos++;
              if (oPos < opTokens.length) {
                if (opTokens[oPos].canonical === 'true') defaultValue = true;
                else if (opTokens[oPos].canonical === 'false') defaultValue = false;
                else defaultValue = opTokens[oPos].value;
                oPos++;
              }
            } else { oPos++; }
          }
          operations.push({ op: 'add_column', column: colName, table: tableName, type: colType, default: defaultValue });
        } else if (opCanon === 'remove' || opCanon === 'remove_field') {
          let oPos = 1;
          let colName = '';
          if (oPos < opTokens.length) { colName = opTokens[oPos].value; oPos++; }
          operations.push({ op: 'remove_column', column: colName, table: tableName });
        }
        j++;
      }

      if (operations.length > 0) {
        const migName = `update-${tableName.toLowerCase()}`;
        nodes.push({ type: NodeType.MIGRATION, name: migName, operations, line });
      }
      continue;
    }

    // "create Products table:" — delegates to data shape parser
    if (bodyTokens[0].canonical === 'set' || (bodyTokens[0].value && bodyTokens[0].value.toLowerCase() === 'create')) {
      // Re-parse this line + indented body as a data shape
      const shapeResult = parseDataShape(lines, j, lines[j].indent, errors);
      if (shapeResult.node) nodes.push(shapeResult.node);
      j = shapeResult.endIdx;
      continue;
    }

    j++;
  }

  return { nodes, endIdx: j };
}

function parseMigration(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Migration needs a name. Example: migration 'add-status-column':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  const operations = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const firstCanon = bodyTokens[0].canonical || (typeof bodyTokens[0].value === 'string' ? bodyTokens[0].value.toLowerCase() : '');

    if (firstCanon === 'add_column' || firstCanon === 'add') {
      let bPos = 1;
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'column') bPos++;
      let colName = '';
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.STRING) { colName = bodyTokens[bPos].value; bPos++; }
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'to') bPos++;
      let tableName = '';
      if (bPos < bodyTokens.length) { tableName = bodyTokens[bPos].value; bPos++; }
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'as') bPos++;
      let colType = 'text';
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string') { colType = bodyTokens[bPos].value.toLowerCase(); bPos++; }
      let defaultValue = null;
      while (bPos < bodyTokens.length) {
        if (bodyTokens[bPos].type === TokenType.COMMA) { bPos++; continue; }
        if (typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'default') {
          bPos++;
          if (bPos < bodyTokens.length) { defaultValue = bodyTokens[bPos].value; bPos++; }
        } else { bPos++; }
      }
      operations.push({ op: 'add_column', column: colName, table: String(tableName), type: colType, default: defaultValue });
    } else if (firstCanon === 'remove_column' || firstCanon === 'drop') {
      let bPos = 1;
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'column') bPos++;
      let colName = '';
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.STRING) { colName = bodyTokens[bPos].value; bPos++; }
      if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'from') bPos++;
      let tableName = '';
      if (bPos < bodyTokens.length) { tableName = bodyTokens[bPos].value; bPos++; }
      operations.push({ op: 'remove_column', column: colName, table: String(tableName) });
    }
    j++;
  }

  if (operations.length === 0) {
    errors.push({ line, message: `Migration "${name}" has no operations. Example:\n  migration '${name}':\n    add column 'status' to Users as text` });
  }

  return { node: migrationNode(name, operations, line), endIdx: j };
}

function parseWait(tokens, line) {
  let pos = 1;
  if (pos >= tokens.length) {
    return { error: 'Wait needs a duration. Example: wait 100ms' };
  }
  let duration, unit;
  if (tokens[pos].type === TokenType.NUMBER) {
    duration = tokens[pos].value;
    pos++;
    if (pos < tokens.length && typeof tokens[pos].value === 'string') {
      unit = tokens[pos].value.toLowerCase().replace(/s$/, '');
    } else {
      unit = 'ms';
    }
  } else if (typeof tokens[pos].value === 'string') {
    const match = tokens[pos].value.match(/^(\d+)(ms|s|seconds?|minutes?|hours?)$/i);
    if (match) {
      duration = parseInt(match[1], 10);
      unit = match[2].toLowerCase().replace(/s$/, '');
    } else {
      return { error: 'Wait needs a number and unit. Example: wait 100ms or wait 2 seconds' };
    }
  } else {
    return { error: 'Wait needs a number and unit. Example: wait 100ms or wait 2 seconds' };
  }
  if (unit === 'second') unit = 'second';
  else if (unit === 'minute') unit = 'minute';
  else if (unit === 'hour') unit = 'hour';
  return { node: waitNode(duration, unit, line) };
}

// =============================================================================
// FILE UPLOADS & EXTERNAL APIS (Phase 19)
// =============================================================================

function parseAcceptFile(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const config = { maxSize: null, allowedTypes: [] };
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const key = bodyTokens[0].canonical || bodyTokens[0].value.toLowerCase();
    if (key === 'max_size' || key === 'max' || key === 'maximum') {
      let bPos = 1;
      while (bPos < bodyTokens.length && (
        (typeof bodyTokens[bPos].value === 'string' && (bodyTokens[bPos].value.toLowerCase() === 'size' || bodyTokens[bPos].canonical === 'length'))
        || bodyTokens[bPos].canonical === 'is'
        || bodyTokens[bPos].type === TokenType.ASSIGN)) bPos++;
      if (bPos < bodyTokens.length) {
        let sizeStr = String(bodyTokens[bPos].value);
        if (bPos + 1 < bodyTokens.length && typeof bodyTokens[bPos + 1].value === 'string' && /^[km]?b$/i.test(bodyTokens[bPos + 1].value))
          sizeStr += bodyTokens[bPos + 1].value;
        config.maxSize = sizeStr.toLowerCase();
      }
    } else if (key === 'allowed_types' || key === 'allowed') {
      let bPos = 1;
      while (bPos < bodyTokens.length && bodyTokens[bPos].type !== TokenType.LBRACKET) bPos++;
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.LBRACKET) {
        bPos++;
        while (bPos < bodyTokens.length && bodyTokens[bPos].type !== TokenType.RBRACKET) {
          if (bodyTokens[bPos].type === TokenType.STRING) config.allowedTypes.push(bodyTokens[bPos].value);
          bPos++;
        }
      }
    }
    j++;
  }
  return { node: acceptFileNode(config, line), endIdx: j };
}

function parseExternalFetch(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "External fetch needs a URL. Example: data from 'https://api.example.com/data':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const url = tokens[pos].value;

  const config = { timeout: null, cache: null, errorFallback: null };
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const key = bodyTokens[0].canonical || (typeof bodyTokens[0].value === 'string' ? bodyTokens[0].value.toLowerCase() : '');
    if (key === 'timeout') {
      let bPos = 1;
      if (bPos < bodyTokens.length && (bodyTokens[bPos].canonical === 'is'
          || bodyTokens[bPos].type === TokenType.ASSIGN)) bPos++;
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.NUMBER) {
        const val = bodyTokens[bPos].value;
        let unit = 'seconds';
        bPos++;
        if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string') unit = bodyTokens[bPos].value.toLowerCase();
        config.timeout = { value: val, unit };
      }
    } else if (key === 'cache_for' || key === 'cache') {
      let bPos = 1;
      while (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'for') bPos++;
      if (bPos < bodyTokens.length && bodyTokens[bPos].type === TokenType.NUMBER) {
        const val = bodyTokens[bPos].value;
        let unit = 'minutes';
        bPos++;
        if (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string') unit = bodyTokens[bPos].value.toLowerCase();
        config.cache = { value: val, unit };
      }
    } else if (key === 'on_error_use' || key === 'on') {
      let bPos = 1;
      while (bPos < bodyTokens.length && typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() !== 'default') bPos++;
      if (bPos < bodyTokens.length) bPos++;
      if (bPos < bodyTokens.length) {
        const expr = parseExpression(bodyTokens, bPos, line);
        if (!expr.error) config.errorFallback = expr.node;
      }
    }
    j++;
  }

  // SSRF check
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1')
      || lowerUrl.includes('0.0.0.0')
      || lowerUrl.match(/192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./)) {
    errors.push({ line, message: `The URL "${url}" points to a private/local address -- external fetch only allows public URLs for security.` });
  }

  return { node: externalFetchNode(url, config, line), endIdx: j };
}

// =============================================================================
// BILLING & PAYMENTS (Phase 18)
// =============================================================================

function parseCheckout(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Checkout needs a plan name. Example: checkout 'Pro Plan':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  const config = {};
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const key = bodyTokens[0].value;
    let bPos = 1;
    if (bPos < bodyTokens.length && (bodyTokens[bPos].canonical === 'is'
        || bodyTokens[bPos].type === TokenType.ASSIGN)) bPos++;
    if (bPos < bodyTokens.length) {
      if (bodyTokens[bPos].type === TokenType.STRING) {
        config[key] = bodyTokens[bPos].value;
      } else {
        const expr = parseExpression(bodyTokens, bPos, bodyTokens[0].line);
        if (!expr.error) config[key] = expr.node;
      }
    }
    j++;
  }

  return { node: checkoutNode(name, config, line), endIdx: j };
}

// parseUsageLimit removed 2026-04-21 — zero app usage. Migration: write a
// record literal instead. See `docs/one-to-one-mapping-audit.md`.

// =============================================================================
// WEBHOOKS (Phase 17 — parseOAuthConfig removed 2026-04-21, zero app usage)
// =============================================================================

function parseWebhook(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Webhook needs a path. Example: webhook '/stripe/events' signed with env('SECRET'):" });
    return { node: null, endIdx: startIdx + 1 };
  }
  let path = tokens[pos].value;
  if (!path.startsWith('/')) path = '/' + path;
  pos++;

  let secret = null;
  if (pos < tokens.length && tokens[pos].canonical === 'signed_with') {
    pos++;
    const secretExpr = parseExpression(tokens, pos, line);
    if (!secretExpr.error) secret = secretExpr.node;
  }

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: "The webhook is empty -- add code to handle incoming events." });
  }

  return { node: webhookNode(path, secret, body, line), endIdx };
}

// parseOAuthConfig removed 2026-04-21 — zero app usage. Migration: write a
// record literal instead. See `docs/one-to-one-mapping-audit.md`.

// =============================================================================
// INPUT VALIDATION (Phase 16)
// =============================================================================

function parseValidateBlock(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const rules = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const ruleTokens = lines[j].tokens;
    if (ruleTokens.length === 0 || ruleTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const rule = parseFieldRule(ruleTokens, ruleTokens[0].line, errors);
    if (rule) rules.push(rule);
    j++;
  }
  if (rules.length === 0) {
    errors.push({ line, message: 'The validate block is empty -- add field rules inside. Example:\n  validate incoming:\n    name is text, required' });
  }
  return { node: validateNode(rules, line), endIdx: j };
}

function parseFieldRule(tokens, line, errors) {
  const name = tokens[0].value;
  let pos = 1;
  if (pos < tokens.length && (tokens[pos].canonical === 'is' || tokens[pos].type === TokenType.ASSIGN)) pos++;
  let fieldType = 'text';
  if (pos < tokens.length) {
    const typeVal = tokens[pos].value.toLowerCase();
    if (typeVal === 'number' || typeVal === 'integer') fieldType = 'number';
    else if (typeVal === 'text' || typeVal === 'string') fieldType = 'text';
    else if (typeVal === 'boolean' || typeVal === 'bool') fieldType = 'boolean';
    pos++;
  }
  const constraints = {};
  while (pos < tokens.length) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    if (tokens[pos].type === TokenType.COMMENT) break;
    const mod = tokens[pos].value.toLowerCase();
    if (mod === 'required') { constraints.required = true; pos++; }
    else if (mod === 'min') {
      pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
        constraints.min = tokens[pos].value; pos++;
      }
    }
    else if (mod === 'max') {
      pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.NUMBER) {
        constraints.max = tokens[pos].value; pos++;
      }
    }
    else if (mod === 'matches') {
      pos++;
      if (pos < tokens.length) { constraints.matches = tokens[pos].value; pos++; }
    }
    else if (mod === 'one' && pos + 1 < tokens.length && tokens[pos + 1].value.toLowerCase() === 'of') {
      pos += 2;
      if (pos < tokens.length && tokens[pos].type === TokenType.LBRACKET) {
        const options = [];
        pos++;
        while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACKET) {
          if (tokens[pos].type === TokenType.STRING || tokens[pos].type === TokenType.NUMBER)
            options.push(tokens[pos].value);
          pos++;
        }
        if (tokens[pos]?.type === TokenType.RBRACKET) pos++;
        constraints.oneOf = options;
      }
    }
    else { pos++; }
  }
  return fieldRuleNode(name, fieldType, constraints, line);
}

function parseRespondsWithBlock(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const fields = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const fieldTokens = lines[j].tokens;
    if (fieldTokens.length === 0 || fieldTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const name = fieldTokens[0].value;
    let fieldType = 'text';
    let fPos = 1;
    if (fPos < fieldTokens.length && (fieldTokens[fPos].canonical === 'is'
        || fieldTokens[fPos].type === TokenType.ASSIGN)) fPos++;
    if (fPos < fieldTokens.length) {
      const typeVal = fieldTokens[fPos].value.toLowerCase();
      if (typeVal === 'number' || typeVal === 'integer') fieldType = 'number';
      else if (typeVal === 'boolean' || typeVal === 'bool') fieldType = 'boolean';
      else if (typeVal === 'timestamp' || typeVal === 'datetime') fieldType = 'timestamp';
    }
    fields.push({ name, fieldType });
    j++;
  }
  if (fields.length === 0) {
    errors.push({ line, message: 'The responds with block is empty -- add fields. Example:\n  responds with:\n    id is text\n    name is text' });
  }
  return { node: respondsWithNode(fields, line), endIdx: j };
}

function parseRateLimit(tokens, line) {
  let pos = 1;
  if (pos >= tokens.length || tokens[pos].type !== TokenType.NUMBER) {
    return { error: 'Rate limit needs a number -- how many requests? Example: rate limit 10 per minute' };
  }
  const count = tokens[pos].value;
  pos++;
  if (pos < tokens.length && tokens[pos].value.toLowerCase() === 'per') pos++;
  let period = 'minute';
  if (pos < tokens.length) period = tokens[pos].value.toLowerCase();
  return { node: rateLimitNode(count, period, line) };
}

function parseEndpoint(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  const rawLine = (lines[startIdx].raw || '').trim().replace(/:$/, '');

  // -----------------------------------------------------------------------
  // English verb patterns — check raw line FIRST, return early if matched.
  // These bypass the HTTP-method token logic entirely.
  // -----------------------------------------------------------------------
  const getMatch = rawLine.match(/^when (?:user|someone) requests data from\s+(\/\S+)/i);
  if (getMatch) {
    const path = getMatch[1].replace(/:$/, '');
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: `The GET ${path} endpoint is empty — add code inside it. Example:\n  when user requests data from ${path}:\n    send back "OK"` });
    }
    return { node: endpointNode('GET', path, body, line), endIdx };
  }

  const postMatch = rawLine.match(/^when (?:user|someone) sends\s+(\w+)\s+to\s+(\/\S+)/i);
  if (postMatch) {
    const path = postMatch[2].replace(/:$/, '');
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: `The POST ${path} endpoint is empty — add code inside it.` });
    }
    const node = endpointNode('POST', path, body, line);
    node.receivingVar = postMatch[1];
    return { node, endIdx };
  }

  const putMatch = rawLine.match(/^when (?:user|someone) updates\s+(\w+)\s+at\s+(\/\S+)/i);
  if (putMatch) {
    const path = putMatch[2].replace(/:$/, '');
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: `The PUT ${path} endpoint is empty — add code inside it.` });
    }
    const node = endpointNode('PUT', path, body, line);
    node.receivingVar = putMatch[1];
    return { node, endIdx };
  }

  const delMatch = rawLine.match(/^when (?:user|someone) deletes\s+\w+\s+at\s+(\/\S+)/i);
  if (delMatch) {
    const path = delMatch[1].replace(/:$/, '');
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) {
      errors.push({ line, message: `The DELETE ${path} endpoint is empty — add code inside it.` });
    }
    return { node: endpointNode('DELETE', path, body, line), endIdx };
  }

  // -----------------------------------------------------------------------
  // Fallback: existing HTTP-method token parsing (when user calls GET ...)
  // -----------------------------------------------------------------------
  let pos = 1; // skip "on"

  // Parse HTTP method
  if (pos >= tokens.length) {
    errors.push({ line, message: "The endpoint needs a verb — use 'requests data from', 'sends X to', 'updates X at', or 'deletes X at'. Example: when user requests data from /api/users" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const methodToken = tokens[pos];
  const method = methodToken.value.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    errors.push({ line, message: `"${methodToken.value}" isn't a verb Clear recognizes — use 'requests data from', 'sends X to', 'updates X at', or 'deletes X at'. Example: when user requests data from /api/users` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Extract path from raw source line to preserve :param syntax
  // Tokens lose the colon in :id, so we extract from raw text instead
  const rawLineFull = lines[startIdx].raw || '';
  const methodIdx = rawLineFull.toUpperCase().indexOf(method);
  let path = '';
  if (methodIdx >= 0) {
    // Everything after the method name is the path
    path = rawLineFull.slice(methodIdx + method.length).trim();
    // Remove trailing colon (block opener) if present
    if (path.endsWith(':')) path = path.slice(0, -1).trim();
  } else {
    // Fallback: reconstruct from tokens
    while (pos < tokens.length && tokens[pos].type !== TokenType.COMMENT) {
      path += tokens[pos].value;
      pos++;
    }
    path = path.trim();
  }
  if (!path.startsWith('/')) path = '/' + path;

  // Check for "receiving <var_name>" after the path
  let receivingVar = null;
  const receivingMatch = path.match(/\s+(?:sending|receiving)\s+(\w+)$/i);
  if (receivingMatch) {
    receivingVar = receivingMatch[1];
    path = path.slice(0, receivingMatch.index).trim();
  }

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The ${method} ${path} endpoint is empty — add code inside it. Example:\n  on ${method} ${path}:\n    respond with "OK"` });
  }

  const node = endpointNode(method, path, body, line);
  if (receivingVar) node.receivingVar = receivingVar;
  return { node, endIdx };
}

// =============================================================================
// RESPOND (Phase 5)
// =============================================================================
// CANONICAL: respond with data
//            respond with "Not found" status 404

// Inline retrieval shorthand for `send back`:
//   "send back all Todos"                    → implicit lookup + respond
//   "send back all Todos where owner is ..."  → filtered lookup + respond
//   "send back the Todo with this id"         → single-record lookup + respond
//
// Returns an array of nodes [CRUD, RESPOND] if it matched, null otherwise.
// The dispatcher appends both nodes to the body. Desugars to what the user
// would write longhand:
//   todos = get all Todos
//   send back todos
//
// Why this exists: `send back all Users` reads like an English sentence.
// Requiring `users = get all Users; send back users` forces the author to
// invent a throwaway variable name. Every other web framework (Rails,
// Flask, SQL) supports inline returns — this aligns Clear with that
// convention for the common case. Long form is still valid and required
// when the retrieval result needs transformation before responding.
function tryInlineSendBackRetrieval(tokens, line) {
  if (tokens.length < 3) return null;
  const t1 = tokens[1];
  const t2 = tokens[2];
  if (!t1 || !t2) return null;

  // Pattern A: "send back all <Table>" with optional "where <cond>"
  if (t1.value === 'all' && typeof t2.value === 'string' && /^[A-Z]/.test(t2.value)) {
    const tableName = t2.value;
    const autoVar = `_resp_${line}`;
    const crud = crudNode('lookup', autoVar, tableName, null, line);
    crud.lookupAll = true;

    // Optional "where <cond>" — parse everything from after `where` to end
    let cPos = 3;
    if (cPos < tokens.length && tokens[cPos].canonical === 'where') {
      cPos++;
      const expr = parseExpression(tokens, cPos, line);
      if (!expr.error) crud.condition = expr.node;
    }

    const respond = {
      type: NodeType.RESPOND,
      expression: { type: NodeType.VARIABLE_REF, name: autoVar, line },
      line,
    };
    return [crud, respond];
  }

  // Pattern B: "send back the <Table> with this <X>" (single record lookup by URL param)
  // Also accepts "whose" as a synonym for "with", and "that" for "this".
  if (t1.value === 'the' && tokens.length >= 6 && typeof t2.value === 'string' && /^[A-Z]/.test(t2.value)) {
    const withTok = tokens[3];
    const thisTok = tokens[4];
    const paramTok = tokens[5];
    if ((withTok.value === 'with' || withTok.value === 'whose') &&
        (thisTok.value === 'this' || thisTok.value === 'that') &&
        paramTok && typeof paramTok.value === 'string') {
      const tableName = t2.value;
      const paramName = paramTok.value;
      const autoVar = `_resp_${line}`;
      const condition = {
        type: NodeType.BINARY_OP,
        operator: '==',
        left: { type: NodeType.VARIABLE_REF, name: paramName, line },
        right: { type: NodeType.MEMBER_ACCESS, object: { type: NodeType.VARIABLE_REF, name: 'incoming', line }, member: paramName, line },
        line,
      };
      const crud = crudNode('lookup', autoVar, tableName, condition, line);
      const respond = {
        type: NodeType.RESPOND,
        expression: { type: NodeType.VARIABLE_REF, name: autoVar, line },
        line,
      };
      return [crud, respond];
    }
  }

  return null;
}

function parseRespond(tokens, line) {
  let pos = 1; // skip first token

  // Handle various forms:
  //   "send back X"      → send_back canonical, pos=1 is already the expression
  //   "respond with X"   → respond_with canonical (multi-word), pos=1
  //   "respond X"        → respond canonical, skip optional "with"
  if (tokens[0].canonical === 'respond' && pos < tokens.length && tokens[pos].canonical === 'with') {
    pos++;
  }

  if (pos >= tokens.length) {
    return { error: 'The send back statement is missing a value — what should the user receive? Example: send back "OK"' };
  }

  // Find where "status" or "with success" starts (to know where expression ends)
  let exprEnd = tokens.length;
  let successMessage = false;
  for (let i = pos; i < tokens.length; i++) {
    if (tokens[i].canonical === 'status_code') {
      exprEnd = i;
      break;
    }
    // "with success message" or "with success"
    if (tokens[i].value === 'with' && i + 1 < tokens.length && tokens[i + 1].value === 'success') {
      exprEnd = i;
      successMessage = true;
      break;
    }
  }

  const expr = parseExpression(tokens, pos, line, exprEnd);
  if (expr.error) return { error: expr.error };

  // Optional: status <code>
  let status = null;
  if (successMessage) {
    status = 201;
  } else if (exprEnd < tokens.length && tokens[exprEnd].canonical === 'status_code') {
    if (exprEnd + 1 < tokens.length && tokens[exprEnd + 1].type === TokenType.NUMBER) {
      status = tokens[exprEnd + 1].value;
    }
  }

  const node = respondNode(expr.node, status, line);
  if (successMessage) node.successMessage = true;
  return { node };
}

// =============================================================================
// MATH-STYLE FUNCTION DEFINITIONS
// =============================================================================
// total_value(item) = item's price * item's quantity
// add(a, b) = a + b
// The call signature IS the definition. Self-indexing.

function isMathStyleFunction(tokens) {
  // Pattern: identifier ( params ) = expression
  // or:      identifier ( params ) is expression
  if (tokens.length < 5) return false;
  if (tokens[0].type !== TokenType.IDENTIFIER && tokens[0].type !== TokenType.KEYWORD) return false;
  if (tokens[1].type !== TokenType.LPAREN) return false;
  // Find closing paren
  for (let i = 2; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.RPAREN) {
      // Must be followed by = or "is"
      if (i + 1 < tokens.length &&
          (tokens[i + 1].type === TokenType.ASSIGN || tokens[i + 1].canonical === 'is')) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function parseMathStyleFunction(tokens, line) {
  const name = tokens[0].value;
  let pos = 2; // skip name and (

  // Parse parameter names
  const params = [];
  while (pos < tokens.length && tokens[pos].type !== TokenType.RPAREN) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
      params.push({ name: tokens[pos].value, type: null });
      pos++;
    } else {
      return { error: `The parameter list for ${name}() has something unexpected — use just names separated by commas. Example: ${name}(a, b) = a + b` };
    }
  }

  if (pos >= tokens.length) {
    return { error: `There's an unclosed parenthesis in ${name}() — add a ")" after the parameter names.` };
  }
  pos++; // skip )

  // Skip = or "is"
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.ASSIGN && tokens[pos].canonical !== 'is')) {
    return { error: `${name}(${params.join(', ')}) is missing "=" — add it to define what this function computes. Example: ${name}(${params.join(', ')}) = ${params[0] || 'x'} + 1` };
  }
  pos++;

  // Parse the expression (the function body)
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };

  // Wrap expression in a return node → single-expression function body
  const body = [returnNode(expr.node, line)];
  return { node: functionDefNode(name, params, body, line) };
}

// =============================================================================
// TRY / HANDLE
// =============================================================================
// "try" + indented block, then "handle the error" + indented block
// "the" and "error" after "handle" are optional — "handle" alone works.
// The error variable is always called "error" in the generated code.

function parseTryHandle(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Parse the try body (indented block after "try:")
  const tryResult = parseBlock(lines, startIdx + 1, blockIndent, errors);
  const tryBody = tryResult.body;
  let i = tryResult.endIdx;

  if (tryBody.length === 0) {
    errors.push({ line, message: 'The try: block is empty — it needs code to attempt. Indent some code below it. Example:\n  try:\n    result is 100 / 0' });
  }

    // Collect one or more error handlers:
  //   "if there's an error:" (catch-all, canonical if_error)
  //   "if there's a 'not found' error:" (typed, STRING after if_error token)
  const handlers = [];
  while (i < lines.length && lines[i].indent <= blockIndent) {
    const handleTokens = lines[i].tokens;
    if (!handleTokens.length) break;
    if (handleTokens[0].canonical !== 'if_error' && handleTokens[0].canonical !== 'handle') break;

    // Check for typed handler: if there's a 'not found' error:
    // Token sequence after if_error: optional STRING, then optional 'error'
    let errorType = null;
    let tPos = 1;
    if (tPos < handleTokens.length && handleTokens[tPos].type === TokenType.STRING) {
      errorType = handleTokens[tPos].value;
      tPos++;
    }

    const handlerResult = parseBlock(lines, i + 1, blockIndent, errors);
    if (handlerResult.body.length === 0) {
      errors.push({ line: handleTokens[0].line, message: "The error handler is empty — add code inside it." });
    }
    handlers.push({ errorType, body: handlerResult.body });
    i = handlerResult.endIdx;
  }

  if (handlers.length === 0) {
    errors.push({ line, message: "Add \"if there's an error:\" after the try block." });
    handlers.push({ errorType: null, body: [] });
  }

  // Optional finally: block (runs whether try succeeded or failed)
  let finallyBody = null;
  if (i < lines.length && lines[i].indent <= blockIndent) {
    const fTokens = lines[i].tokens;
    if (fTokens.length && fTokens[0].canonical === 'finally') {
      const finallyResult = parseBlock(lines, i + 1, blockIndent, errors);
      finallyBody = finallyResult.body;
      i = finallyResult.endIdx;
      if (finallyBody.length === 0) {
        errors.push({ line: fTokens[0].line, message: "The finally: block is empty — add cleanup code inside it." });
      }
    }
  }

  return { node: tryHandleNode(tryBody, handlers, line, finallyBody), endIdx: i };
}

// =============================================================================
// LIVE BLOCK — Decidable Core Path B Phase 1 (2026-04-25)
// =============================================================================
// `live:` + indented block. The body holds calls that talk to the world
// (ask claude, call API, subscribe, timers). The keyword makes the fence
// visible to the compiler so the rest of the program can be statically
// proved to be total. See PHILOSOPHY.md Rule 18.
//
// In Phase B-1 the body is permissive: any statement is allowed inside.
// Phase B-2 will add a validator rule that REJECTS effect-shaped calls
// outside `live:` fences. Splitting it this way means the keyword can
// land alone — no template migration required, no template breakage.

function parseLiveBlock(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Parse the indented body
  const bodyResult = parseBlock(lines, startIdx + 1, blockIndent, errors);
  const body = bodyResult.body;

  if (body.length === 0) {
    errors.push({
      line,
      message: "The live: block is empty — it needs effect code inside (calls to the outside world). Indent some code below it. Example:\n  live:\n    answer is ask claude 'hi'\n    send back answer"
    });
  }

  return { node: liveBlockNode(body, line), endIdx: bodyResult.endIdx };
}

// =============================================================================
// INCREASE / DECREASE
// =============================================================================

// "increase counter by 1" → counter = counter + 1
// "decrease lives by 1"   → lives = lives - 1
function parseIncDec(tokens, line, direction) {
  let pos = 1; // skip "increase" / "decrease"

  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    return { error: `The ${direction} statement is missing a variable name — which value should change? Example: ${direction} counter by 1` };
  }
  const name = tokens[pos].value;
  pos++;

  // Expect "by"
  if (pos >= tokens.length || tokens[pos].canonical !== 'by') {
    return { error: `Clear doesn't know how much to ${direction} by — add "by" and a number. Example: ${direction} ${name} by 1` };
  }
  pos++;

  // Parse the amount expression
  const amountExpr = parseExpression(tokens, pos, line);
  if (amountExpr.error) return { error: amountExpr.error };

  // Build: name = name + amount  (or name - amount for decrease)
  const op = direction === 'increase' ? '+' : '-';
  const expr = binaryOp(op, variableRef(name, line), amountExpr.node, line);
  return { node: assignNode(name, expr, line) };
}

// =============================================================================
// OBJECT DEFINITION
// =============================================================================
// "person is" followed by indented fields → record literal
// Each indented line is "key is value" or "key = value"

function tryParseObjectDef(lines, lineIdx, blockIndent, tokens, line, errors) {
  // Pattern: <name> is  (with nothing after "is")
  // OR: set <name> is  (with nothing after "is")
  let pos = 0;
  if (tokens[pos].canonical === 'set') pos++;
  if (pos >= tokens.length) return null;

  // Get variable name (might be dotted: person.address)
  const nameToken = tokens[pos];
  if (nameToken.type !== TokenType.IDENTIFIER && nameToken.type !== TokenType.KEYWORD) return null;
  let name = nameToken.value;
  pos++;

  // Handle possessive or dot in name (person's address, person.address)
  while (pos < tokens.length && (tokens[pos].type === TokenType.POSSESSIVE || tokens[pos].type === TokenType.DOT)) {
    pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      name += '.' + tokens[pos].value;
      pos++;
    }
  }

  // Two valid patterns:
  //   1. "create person" (no is/=) → check for indented block
  //   2. "person is" (with is/=, nothing after) → check for indented block
  const remainingNonComment = tokens.slice(pos).filter(t => t.type !== TokenType.COMMENT);

  if (remainingNonComment.length === 0) {
    // Pattern 1: "create person" — just the name, nothing else
    // Only valid if started with "set" canonical (includes "create")
    if (tokens[0].canonical !== 'set') return null;
  } else if (remainingNonComment.length === 1 &&
             (remainingNonComment[0].canonical === 'is' || remainingNonComment[0].type === TokenType.ASSIGN)) {
    // Pattern 2: "person is" — name followed by bare "is" or "="
    // Skip past the "is"/"=" token
  } else {
    // Has expression after "is" — this is a normal assignment, not an object
    return null;
  }

  // Must have indented lines following
  if (lineIdx + 1 >= lines.length || lines[lineIdx + 1].indent <= blockIndent) {
    return null; // No indented block — not an object definition
  }

  // Parse indented fields as key=value pairs
  const entries = [];
  let i = lineIdx + 1;
  while (i < lines.length && lines[i].indent > blockIndent) {
    const fieldTokens = lines[i].tokens;
    const fieldLine = fieldTokens[0]?.line || line;
    if (fieldTokens.length === 0 || fieldTokens[0].type === TokenType.COMMENT) {
      i++;
      continue;
    }

    // Parse field: "key is value" or "key = value"
    let fPos = 0;
    if (fieldTokens[fPos].type !== TokenType.IDENTIFIER && fieldTokens[fPos].type !== TokenType.KEYWORD) {
      errors.push({ line: fieldLine, message: `Each line inside an object needs a name. Example: name is "Alice"` });
      i++;
      continue;
    }
    const key = fieldTokens[fPos].value;
    fPos++;

    if (fPos >= fieldTokens.length ||
        (fieldTokens[fPos].canonical !== 'is' && fieldTokens[fPos].type !== TokenType.ASSIGN)) {
      errors.push({ line: fieldLine, message: `Add "is" and a value after "${key}". Example: ${key} is "something"` });
      i++;
      continue;
    }
    fPos++;

    const valueExpr = parseExpression(fieldTokens, fPos, fieldLine);
    if (valueExpr.error) {
      errors.push({ line: fieldLine, message: valueExpr.error });
      i++;
      continue;
    }

    entries.push({ key, value: valueExpr.node });
    i++;
  }

  if (entries.length === 0) {
    return null; // No fields found, fall through to normal assignment
  }

  return {
    node: assignNode(name, recordNode(entries, line), line),
    endIdx: i,
  };
}

// =============================================================================
// LINE-LEVEL PARSERS
// =============================================================================

function parseTarget(tokens, line) {
  let pos = 1;
  // Skip optional connector: "for", ":", or "="
  if (pos < tokens.length && (tokens[pos].canonical === 'for_target' || tokens[pos].value === ':' || tokens[pos].value === '=')) {
    pos++;
  }
  if (pos >= tokens.length) {
    return { error: 'The build statement is missing a platform — specify web, backend, or both. Example: build for web' };
  }

  // Collect remaining words to match compound patterns
  const remaining = [];
  for (let i = pos; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.COMMENT) break;
    remaining.push((tokens[i].value || '').toLowerCase());
  }
  const phrase = remaining.join(' ');

  // Compound targets: "web and javascript backend", "web and python backend"
  if (phrase === 'web and javascript backend' || phrase === 'web and js backend') {
    return { node: targetNode('web_and_js_backend', line) };
  }
  if (phrase === 'web and python backend') {
    return { node: targetNode('web_and_python_backend', line) };
  }
  // Backend-only with language: "javascript backend", "python backend"
  if (phrase === 'javascript backend' || phrase === 'js backend') {
    return { node: targetNode('js_backend', line) };
  }
  if (phrase === 'python backend') {
    return { node: targetNode('python_backend', line) };
  }

  // Simple targets
  const targetToken = tokens[pos];
  const canonical = targetToken.canonical || targetToken.value;
  if (['web', 'backend', 'both'].includes(canonical)) {
    return { node: targetNode(canonical, line) };
  }

  // Handle "both frontend and backend" as alias
  if (canonical === 'both' || phrase.includes('frontend') && phrase.includes('backend')) {
    return { node: targetNode('both', line) };
  }

  return { error: `"${targetToken.value}" isn't a platform Clear can build for — use web, backend, or both. Example: build for web and python backend` };
}

function isAssignmentLine(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.ASSIGN) return true;
    // "name is expression" or "name is" (object def) — bare "is" means assignment
    // (multi-word "is greater than" etc. are already consumed as single tokens)
    if (tokens[i].canonical === 'is' && i > 0 &&
        (tokens[i - 1].type === TokenType.IDENTIFIER || tokens[i - 1].type === TokenType.KEYWORD)) {
      return true;
    }
  }
  return false;
}

function parseAssignment(tokens, line) {
  let pos = 0;

  // Skip leading keyword: set/create/define/etc.
  if (tokens[pos].canonical === 'set') {
    pos++;
  }

  // Optional article: "a" or "an" — reserved words, cannot be variable names.
  if (pos < tokens.length && (tokens[pos].canonical === 'a')) {
    pos++;
  }

  if (pos >= tokens.length) {
    return { error: 'This line is missing a variable name — add one before "is" or "=". Example: price is 100' };
  }

  // Handle "called" / "named" pattern: "create a list called items with 1, 2, 3"
  let name = null;
  if (pos + 1 < tokens.length && tokens[pos].canonical === 'list' &&
      pos + 2 < tokens.length && tokens[pos + 1].canonical === 'called') {
    pos += 2;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.IDENTIFIER) {
      return { error: 'Expected a name after "called". Try: create a list called items with 1, 2, 3' };
    }
    name = tokens[pos].value;
    pos++;
    if (pos < tokens.length && tokens[pos].canonical === 'with') {
      pos++;
    }
    const elements = [];
    while (pos < tokens.length) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.COMMENT) break;
      const elem = parsePrimary(tokens, pos, line);
      if (elem.error) return { error: elem.error };
      elements.push(elem.node);
      pos = elem.nextPos;
    }
    return { name, expression: literalList(elements, line) };
  }

  // Standard pattern: name = expression (also supports name.field = expression)
  if (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD) {
    return { error: `Give your variable a name. Example: price is 100` };
  }
  name = tokens[pos].value;
  pos++;

  // Handle property access in assignment targets:
  //   person's name is "Bob"  (possessive — canonical)
  //   person.name is "Bob"    (dot — silent alias)
  while (pos < tokens.length && (tokens[pos].type === TokenType.POSSESSIVE || tokens[pos].type === TokenType.DOT)) {
    pos++; // skip 's or .
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      name += '.' + tokens[pos].value;
      pos++;
    }
  }

  // Expect "=", "is", or "to"
  if (pos >= tokens.length) {
    return { error: `"${name}" is declared but has no value — add "is" and a value after it. Example: ${name} is 100` };
  }
  if (tokens[pos].type === TokenType.ASSIGN || tokens[pos].canonical === 'to_connector' || tokens[pos].canonical === 'is') {
    pos++;
  } else {
    return { error: `"${name}" needs a value — add "is" and a value after it. Example: ${name} is 100` };
  }

  // Check for "an empty list" / "an empty array" pattern
  if (pos < tokens.length && tokens[pos].canonical === 'a' &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'empty' &&
      pos + 2 < tokens.length && (tokens[pos + 2].canonical === 'list' || tokens[pos + 2].value === 'array')) {
    return { name, expression: literalList([], line) };
  }

  // Check for "call api 'url'" on the right side of assignment
  // e.g. result = call api 'https://api.stripe.com/v1/charges'
  if (pos < tokens.length && tokens[pos].canonical === 'call_api') {
    pos++; // skip 'call api'
    if (pos >= tokens.length) {
      return { error: "call api needs a URL. Example: result = call api 'https://api.example.com'" };
    }
    // URL can be a string literal or a variable
    let url;
    if (tokens[pos].type === TokenType.STRING) {
      url = literalString(tokens[pos].value, line);
    } else {
      url = variableRef(tokens[pos].value, line);
    }
    return { name, expression: { type: NodeType.HTTP_REQUEST, url, line }, needsBlock: true };
  }

  // Check for "fetch from 'url'" / "data from 'url'" on the right side of assignment
  // e.g. data = fetch from 'https://api.example.com'
  if (pos < tokens.length && tokens[pos].canonical === 'data_from') {
    pos++; // skip 'fetch from' / 'data from'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "fetch from needs a URL in quotes. Example: data = fetch from 'https://api.example.com'" };
    }
    const baseUrl = tokens[pos].value;
    pos++;
    // SSRF guard — same check as parseExternalFetch
    const lowerUrl = baseUrl.toLowerCase();
    if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1') || lowerUrl.includes('0.0.0.0')
        || lowerUrl.match(/192\.168\.|10\.\d+\.|172\/(1[6-9]|2\d|3[01])\./)) {
      return { error: `"${baseUrl}" is a private address — fetch from only allows public URLs.` };
    }
    // Handle URL concatenation: fetch from 'url' + variable
    let urlExpr = null;
    if (pos < tokens.length && tokens[pos].type === TokenType.OPERATOR && tokens[pos].value === '+') {
      // Build a concat expression: 'baseUrl' + rest
      const restExpr = parseExpression(tokens, pos + 1, line);
      if (!restExpr.error && restExpr.node) {
        urlExpr = { type: NodeType.BINARY_OP, operator: '+', left: { type: NodeType.LITERAL_STRING, value: baseUrl, line }, right: restExpr.node, line };
      }
    }
    const fetchUrl = urlExpr || baseUrl;
    return { name, expression: { type: NodeType.EXTERNAL_FETCH, url: fetchUrl, config: { timeout: null, cache: null, errorFallback: null }, line } };
  }

  // Check for "ask AgentName with input" on the right side of assignment
  // e.g. result = ask Summarizer with topic
  // e.g. result = ask HNDigestAgent with { url: hn_url }
  // e.g. result = ask agent 'Helper' with data (keyword 'agent' before name)
  if (pos < tokens.length && tokens[pos].value === 'ask' &&
      pos + 1 < tokens.length && tokens[pos + 1].value !== 'ai' && tokens[pos + 1].value !== 'claude' &&
      (tokens[pos + 1].type === TokenType.IDENTIFIER || tokens[pos + 1].type === TokenType.KEYWORD || tokens[pos + 1].type === TokenType.STRING)) {
    pos++; // skip 'ask'
    // Skip optional 'agent' keyword: "ask agent 'Helper'" → agentName = 'Helper'
    if (tokens[pos].canonical === 'agent' && pos + 1 < tokens.length) pos++;
    const agentName = tokens[pos].value; pos++;
    let argument = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const expr = parseExpression(tokens, pos, line);
      if (!expr.error) argument = expr.node;
    }
    return { name, expression: { type: NodeType.RUN_AGENT, agentName, argument, line } };
  }

  // Check for "ask ai/claude 'prompt'" on the right side of assignment
  // e.g. answer = ask ai 'Summarize this' with context_data
  // e.g. answer = ask claude 'Summarize this' with context_data
  if (pos < tokens.length && tokens[pos].value === 'ask' &&
      pos + 1 < tokens.length && (tokens[pos + 1].value === 'ai' || tokens[pos + 1].value === 'claude')) {
    pos += 2; // skip 'ask ai' / 'ask claude'
    if (pos >= tokens.length) {
      return { error: "ask ai needs a prompt. Example: answer = ask ai 'Summarize this' with data" };
    }
    // Prompt can be a quoted string OR a variable reference (for text blocks)
    let prompt;
    if (tokens[pos].type === TokenType.STRING) {
      prompt = literalString(tokens[pos].value, line);
    } else if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
      prompt = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    } else {
      return { error: "ask ai needs a prompt (quoted string or variable). Example: answer = ask ai 'Summarize this' with data" };
    }
    pos++;
    let context = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      // Parse context — supports comma-separated: ask ai 'prompt' with X, Y, Z
      // Stop before 'returning' or 'using' keywords
      const stopIdx = tokens.findIndex((t, i) => i >= pos && (t.value === 'returning' || t.value === 'using'));
      const endPos = stopIdx >= 0 ? stopIdx : undefined;
      // Check for comma-separated contexts: collect into list if multiple
      const contexts = [];
      while (pos < (endPos || tokens.length)) {
        if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        const nextComma = tokens.findIndex((t, i) => i > pos && i < (endPos || tokens.length) && t.type === TokenType.COMMA);
        const segEnd = nextComma >= 0 ? nextComma : endPos;
        const expr = parseExpression(tokens, pos, line, segEnd);
        if (expr.error) break;
        contexts.push(expr.node);
        pos = expr.nextPos;
      }
      if (contexts.length === 1) {
        context = contexts[0];
      } else if (contexts.length > 1) {
        context = { type: 'multi_context', contexts, line };
      }
    }
    // Check for "using 'model-name'" clause
    let model = null;
    if (pos < tokens.length && tokens[pos].value === 'using') {
      pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
        model = tokens[pos].value;
        pos++;
      }
    }
    // Check for "returning:" or "returning JSON text:" at end of line
    // (structured output schema follows as indented block)
    let hasSchema = false;
    if (pos < tokens.length && tokens[pos].value === 'returning') {
      hasSchema = true;
      pos++;
      // Skip optional "JSON" and "text" qualifier words
      while (pos < tokens.length && (tokens[pos].value === 'JSON' || tokens[pos].value === 'json' || tokens[pos].value === 'text')) pos++;
    }
    return { name, expression: { type: NodeType.ASK_AI, prompt, context, model, line }, hasSchema };
  }

  // Check for "run workflow 'Name' with ..." (workflow invocation)
  if (pos < tokens.length && (tokens[pos].value === 'run' || tokens[pos].canonical === 'raw_run') &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'workflow' &&
      pos + 2 < tokens.length && tokens[pos + 2].type === TokenType.STRING) {
    pos += 2; // skip 'run workflow'
    const workflowName = tokens[pos].value; pos++;
    let argument = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const expr = parseExpression(tokens, pos, line);
      if (expr.error) return { error: expr.error };
      argument = expr.node;
    }
    return { name, expression: { type: NodeType.RUN_WORKFLOW, workflowName, argument, line } };
  }

  // Check for "run command 'cmd'" as expression (capture output)
  if (pos < tokens.length && (tokens[pos].value === 'run' || tokens[pos].canonical === 'raw_run') &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'command' &&
      pos + 2 < tokens.length && tokens[pos + 2].type === TokenType.STRING) {
    pos += 2; // skip 'run command'
    const command = tokens[pos].value;
    return { name, expression: { type: NodeType.RUN_COMMAND, command, capture: true, line } };
  }

  // Check for "call pipeline 'Name' with data" (must come BEFORE call 'Agent')
  if (pos < tokens.length && tokens[pos].value === 'call' &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'pipeline' &&
      pos + 2 < tokens.length && tokens[pos + 2].type === TokenType.STRING) {
    pos += 2; // skip 'call pipeline'
    const pipelineName = tokens[pos].value; pos++;
    let argument = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const expr = parseExpression(tokens, pos, line);
      if (expr.error) return { error: expr.error };
      argument = expr.node;
    }
    return { name, expression: { type: NodeType.RUN_PIPELINE, pipelineName, argument, line } };
  }

  // Check for "call 'Agent Name' with data" on the right side of assignment
  // e.g. result = call 'Lead Scorer' with lead_data
  // NOTE: call api is handled above (canonical call_api), so this only matches call + STRING
  if (pos < tokens.length && tokens[pos].value === 'call' &&
      pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.STRING) {
    pos++; // skip 'call'
    const agentName = tokens[pos].value;
    pos++;
    let argument = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const expr = parseExpression(tokens, pos, line);
      if (expr.error) return { error: expr.error };
      argument = expr.node;
    }
    return { name, expression: { type: NodeType.RUN_AGENT, agentName, argument, line } };
  }

  // Check for "read file 'path'" on the right side of assignment
  // e.g. contents = read file 'data.csv'
  if (pos < tokens.length && tokens[pos].canonical === 'read_file') {
    pos++; // skip 'read file'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "read file needs a file path in quotes. Example: contents = read file 'data.csv'" };
    }
    const path = tokens[pos].value;
    return { name, expression: fileOpNode('read', path, null, name, line) };
  }

  // Check for "file exists 'path'" on the right side of assignment
  // e.g. found = file exists 'config.json'
  if (pos < tokens.length && tokens[pos].canonical === 'file_exists') {
    pos++; // skip 'file exists'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "file exists needs a file path in quotes. Example: found = file exists 'config.json'" };
    }
    const path = tokens[pos].value;
    return { name, expression: fileOpNode('exists', path, null, name, line) };
  }

  // Check for "parse json expr" on the right side of assignment
  // e.g. data = parse json response_text
  if (pos < tokens.length && tokens[pos].canonical === 'parse_json') {
    pos++;
    const expr = parseExpression(tokens, pos, line);
    if (expr.error) return { error: expr.error };
    return { name, expression: { type: NodeType.JSON_PARSE, source: expr.node, line } };
  }

  // Check for "to json expr" on the right side of assignment
  // e.g. output = to json results
  if (pos < tokens.length && tokens[pos].canonical === 'to_json') {
    pos++;
    const expr = parseExpression(tokens, pos, line);
    if (expr.error) return { error: expr.error };
    return { name, expression: { type: NodeType.JSON_STRINGIFY, source: expr.node, line } };
  }

  // Check for "query 'SQL'" on the right side
  // e.g. results = query 'select * from users where active = true'
  if (pos < tokens.length && tokens[pos].canonical === 'raw_query') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "query needs a SQL string. Example: results = query 'select * from users'" };
    }
    const sql = tokens[pos].value;
    pos++;
    let params = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      const expr = parseExpression(tokens, pos, line);
      if (!expr.error) params = expr.node;
    }
    return { name, expression: { type: NodeType.RAW_QUERY, sql, params, variable: name, operation: 'query', line } };
  }

  // Check for "search Table for expr" on the right side
  // e.g. results = search Posts for query
  // Full text search: case-insensitive filter across all fields
  if (pos < tokens.length && tokens[pos].canonical === 'search') {
    pos++; // skip 'search'
    if (pos >= tokens.length) {
      return { error: "search needs a table name and a query. Example: results = search Posts for query" };
    }
    const tableName = tokens[pos].value;
    pos++;
    // Skip 'for'
    if (pos < tokens.length && (tokens[pos].value === 'for' || tokens[pos].canonical === 'for_target')) pos++;
    if (pos >= tokens.length) {
      return { error: "search needs 'for' and a search term. Example: results = search Posts for query" };
    }
    const queryExpr = parseExpression(tokens, pos, line);
    if (queryExpr.error) return { error: queryExpr.error };
    return { name, expression: { type: NodeType.SEARCH, table: tableName, query: queryExpr.node, resultVar: name, line } };
  }

  // Check for "count by field in list" on the right side
  // e.g. status_counts = count by status in orders
  // NOTE: can't use a multi-word synonym 'count by' — it collides with 'increase count by 1'
  // Instead, detect the token sequence: count_of + 'by' (where count_of canonical comes from "count")
  if (pos < tokens.length && (tokens[pos].canonical === 'length' || tokens[pos].value === 'count') &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'by') {
    pos += 2; // skip 'count' and 'by'
    if (pos >= tokens.length) {
      return { error: "count by needs a field name and a list. Example: counts = count by status in orders" };
    }
    const field = tokens[pos].value;
    pos++;
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    if (pos >= tokens.length) {
      return { error: "count by needs 'in' and a list name. Example: counts = count by status in orders" };
    }
    const listName = tokens[pos].value;
    return { name, expression: { type: NodeType.COUNT_BY, field, list: listName, line } };
  }

  // Check for "unique values of field in list" on the right side
  // e.g. regions = unique values of region in sales
  if (pos < tokens.length && tokens[pos].canonical === 'unique_values') {
    pos++;
    if (pos >= tokens.length) {
      return { error: "unique values of needs a field name and a list. Example: regions = unique values of region in sales" };
    }
    const field = tokens[pos].value;
    pos++;
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    if (pos >= tokens.length) {
      return { error: "unique values of needs 'in' and a list name. Example: regions = unique values of region in sales" };
    }
    const listName = tokens[pos].value;
    return { name, expression: { type: NodeType.UNIQUE_VALUES, field, list: listName, line } };
  }

  // Check for "group by field in list" on the right side
  // e.g. by_region = group by region in sales
  if (pos < tokens.length && tokens[pos].canonical === 'group_by') {
    pos++;
    if (pos >= tokens.length) {
      return { error: "group by needs a field name and a list. Example: by_region = group by region in sales" };
    }
    const field = tokens[pos].value;
    pos++;
    // skip 'in'
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    if (pos >= tokens.length) {
      return { error: "group by needs 'in' and a list name. Example: by_region = group by region in sales" };
    }
    const listName = tokens[pos].value;
    return { name, expression: { type: NodeType.GROUP_BY, field, list: listName, line } };
  }

  // Check for "apply fn to each in list" — MAP_APPLY
  // e.g. doubled = apply double to each in numbers
  if (pos < tokens.length && tokens[pos].value === 'apply') {
    pos++; // skip 'apply'
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      const fnName = tokens[pos].value;
      pos++;
      // expect "to each in listName"
      const toPos = tokens.findIndex((t, i) => i >= pos && t.canonical === 'to_connector');
      const eachIdx = toPos >= 0 ? toPos + 1 : -1;
      const inIdx = eachIdx >= 0 && eachIdx < tokens.length && tokens[eachIdx].value === 'each' ? eachIdx + 1 : -1;
      if (inIdx >= 0 && inIdx < tokens.length && tokens[inIdx].canonical === 'in') {
        const listExpr = parseExpression(tokens, inIdx + 1, line);
        if (!listExpr.error) {
          return { name, expression: { type: NodeType.MAP_APPLY, fn: fnName, list: listExpr.node, line } };
        }
      }
    }
  }

  // Check for "filter list using fn" — FILTER_APPLY (must come before filter_where)
  // e.g. active = filter users using is_active
  // Disambiguation: "filter X using fn" vs "filter X where field op val"
  // Key: check for 'using' (value, since canonical is 'with') vs 'where' (canonical)
  if (pos < tokens.length && tokens[pos].canonical === 'filter_where') {
    let usingIdx = -1;
    for (let si = pos + 1; si < tokens.length; si++) {
      if (tokens[si].value === 'using') { usingIdx = si; break; }
      if (tokens[si].canonical === 'where') break;
    }
    if (usingIdx !== -1) {
      const listExpr = parseExpression(tokens, pos + 1, line);
      const fnName = tokens[usingIdx + 1]?.value;
      if (fnName) {
        return { name, expression: { type: NodeType.FILTER_APPLY, fn: fnName, list: listExpr.node, line } };
      }
    }
  }

  // Check for "filter list where field op value" on the right side
  // e.g. big_sales = filter sales where revenue is greater than 10000
  if (pos < tokens.length && tokens[pos].canonical === 'filter_where') {
    pos++;
    // Next token is the list variable
    if (pos >= tokens.length) {
      return { error: "filter needs a list and a condition. Example: big_sales = filter sales where revenue is greater than 10000" };
    }
    const listName = tokens[pos].value;
    pos++;
    // Skip 'where'
    if (pos < tokens.length && tokens[pos].canonical === 'where') pos++;
    // Parse the condition as a full expression
    const condExpr = parseExpression(tokens, pos, line);
    if (condExpr.error) return { error: condExpr.error };
    return { name, expression: { type: NodeType.FILTER, list: listName, condition: condExpr.node, line } };
  }

  // Check for "load csv 'path'" on the right side of assignment
  // e.g. sales = load csv 'sales.csv'
  if (pos < tokens.length && tokens[pos].canonical === 'load_csv') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "load csv needs a file path in quotes. Example: sales = load csv 'sales.csv'" };
    }
    return { name, expression: { type: NodeType.LOAD_CSV, path: tokens[pos].value, line } };
  }

  // Check for "fetch page 'URL'" on the right side of assignment
  // e.g. page = fetch page 'https://example.com'
  if (pos < tokens.length && tokens[pos].canonical === 'fetch_page') {
    pos++;
    if (pos >= tokens.length) {
      return { error: "fetch page needs a URL. Example: page = fetch page 'https://example.com'" };
    }
    // URL can be a string literal or a variable/expression
    const urlExpr = parseExpression(tokens, pos, line);
    if (urlExpr.error) return { error: urlExpr.error };
    return { name, expression: { type: NodeType.FETCH_PAGE, url: urlExpr.node, line } };
  }

  // Check for "find all TableName where ..." — CRUD alias for "look up all"
  // e.g. orders = find all Orders where status is 'active'
  // Discriminator: token after "find all" is an identifier (table name), not a string (CSS selector)
  if (pos < tokens.length && tokens[pos].value === 'find' &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'all' &&
      pos + 2 < tokens.length && (tokens[pos + 2].type === TokenType.IDENTIFIER || tokens[pos + 2].type === TokenType.KEYWORD) &&
      tokens[pos + 2].type !== TokenType.STRING) {
    // Route through parseLookUpAssignment — skip "find", leave "all TableName where ..."
    // parseLookUpAssignment expects to start at the token after "look up"
    const result = parseLookUpAssignment(name, tokens, pos + 1, line);
    if (result.error) return { error: result.error };
    return result;
  }

  // Check for "find all 'selector' in page" or "find first 'selector' in page"
  // e.g. stories = find all '.titleline a' in page
  // e.g. title = find first 'h1' in page
  if (pos < tokens.length && tokens[pos].value === 'find' &&
      pos + 1 < tokens.length && (tokens[pos + 1].value === 'all' || tokens[pos + 1].value === 'first')) {
    const mode = tokens[pos + 1].value; // 'all' or 'first'
    pos += 2;
    if (pos >= tokens.length) {
      return { error: `find ${mode} needs a CSS selector and a page variable. Example: items = find ${mode} '.title' in page` };
    }
    // Next token is the selector (string)
    let selectorExpr;
    if (tokens[pos].type === TokenType.STRING) {
      selectorExpr = { type: NodeType.LITERAL_STRING, value: tokens[pos].value, line };
      pos++;
    } else {
      const parsed = parseExpression(tokens, pos, line);
      if (parsed.error) return { error: parsed.error };
      selectorExpr = parsed.node;
      pos = parsed.nextPos || pos + 1;
    }
    // Skip 'in'
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    if (pos >= tokens.length) {
      return { error: `find ${mode} needs 'in' and a page variable. Example: items = find ${mode} '.title' in page` };
    }
    // Page variable
    const pageExpr = parseExpression(tokens, pos, line);
    if (pageExpr.error) return { error: pageExpr.error };
    return { name, expression: { type: NodeType.FIND_ELEMENTS, selector: selectorExpr, source: pageExpr.node, mode, line } };
  }

  // Check for "train model on DATA predicting TARGET" on the right side
  // e.g. model = train model on customers predicting churn
  if (pos < tokens.length && tokens[pos].canonical === 'train_model') {
    pos++;
    // Expect 'on'
    if (pos >= tokens.length || tokens[pos].value !== 'on') {
      return { error: "train model needs data and a target. Example: model = train model on data predicting churn" };
    }
    pos++;
    // Data variable
    if (pos >= tokens.length) {
      return { error: "train model needs a data variable after 'on'. Example: model = train model on customers predicting churn" };
    }
    const dataVar = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++;
    // Expect 'predicting'
    if (pos >= tokens.length || tokens[pos].value !== 'predicting') {
      return { error: "train model needs 'predicting' and a target field. Example: model = train model on data predicting churn" };
    }
    pos++;
    // Target field
    if (pos >= tokens.length) {
      return { error: "train model needs a target field after 'predicting'. Example: model = train model on data predicting churn" };
    }
    const target = tokens[pos].value;
    return { name, expression: { type: NodeType.TRAIN_MODEL, data: dataVar, target, line } };
  }

  // Check for "classify INPUT as 'cat1', 'cat2', ..." on the right side
  // "classify" alone is a plain identifier (only "classify with" maps to predict_with).
  // Pattern: classify + identifier + as + string literals separated by commas
  // e.g. intent = classify message as 'order', 'return', 'general'
  if (pos < tokens.length && tokens[pos].value === 'classify' &&
      pos + 2 < tokens.length &&
      (tokens[pos + 1].type === TokenType.IDENTIFIER || tokens[pos + 1].type === TokenType.KEYWORD) &&
      (tokens[pos + 2].canonical === 'as_format' || tokens[pos + 2].value === 'as')) {
    pos++; // skip 'classify'
    const input = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++; // skip input variable
    pos++; // skip 'as'
    // Parse category strings separated by commas
    const categories = [];
    while (pos < tokens.length) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.STRING) {
        categories.push(tokens[pos].value);
        pos++;
      } else {
        break;
      }
    }
    return { name, expression: { type: NodeType.CLASSIFY, input, categories, line } };
  }

  // Check for "predict with MODEL using FEATURE and FEATURE" on the right side
  // e.g. result = predict with model using age and income
  if (pos < tokens.length && tokens[pos].canonical === 'predict_with') {
    pos++;
    // Model variable
    if (pos >= tokens.length) {
      return { error: "predict with needs a model and features. Example: result = predict with model using age and income" };
    }
    const modelVar = { type: NodeType.VARIABLE_REF, name: tokens[pos].value, line };
    pos++;
    // Expect 'using'
    if (pos >= tokens.length || tokens[pos].value !== 'using') {
      return { error: "predict with needs 'using' and feature names. Example: result = predict with model using age and income" };
    }
    pos++;
    // Parse feature names separated by 'and' or ','
    const features = [];
    while (pos < tokens.length) {
      if (tokens[pos].value === 'and' || tokens[pos].value === ',') {
        pos++;
        continue;
      }
      features.push(tokens[pos].value);
      pos++;
    }
    if (features.length === 0) {
      return { error: "predict with needs at least one feature. Example: result = predict with model using age and income" };
    }
    return { name, expression: { type: NodeType.PREDICT, model: modelVar, features, line } };
  }

  // Check for "current time" / "current date" / "now"
  // e.g. now = current time
  if (pos < tokens.length && tokens[pos].canonical === 'current_time') {
    return { name, expression: { type: NodeType.CURRENT_TIME, line } };
  }

  // Check for "format date expr as 'format'"
  // e.g. formatted = format date now as 'YYYY-MM-DD'
  if (pos < tokens.length && tokens[pos].canonical === 'format_date') {
    pos++;
    // Find 'as' to separate date expr from format string
    const asIdx = tokens.findIndex((t, idx) => idx >= pos && (t.value === 'as' || t.canonical === 'as'));
    if (asIdx === -1) {
      return { error: "format date needs 'as' and a format string. Example: formatted = format date now as 'YYYY-MM-DD'" };
    }
    const dateExpr = parseExpression(tokens, pos, line, asIdx);
    if (dateExpr.error) return { error: dateExpr.error };
    const fmtPos = asIdx + 1;
    if (fmtPos >= tokens.length || tokens[fmtPos].type !== TokenType.STRING) {
      return { error: "format date needs a format string after 'as'. Example: format date now as 'YYYY-MM-DD'" };
    }
    return { name, expression: { type: NodeType.FORMAT_DATE, date: dateExpr.node, format: tokens[fmtPos].value, line } };
  }

  // Check for "days between expr and expr"
  // e.g. gap = days between start_date and end_date
  if (pos < tokens.length && tokens[pos].canonical === 'days_between') {
    pos++;
    const andIdx = tokens.findIndex((t, idx) => idx >= pos && (t.canonical === 'and' || t.value === 'and'));
    if (andIdx === -1) {
      return { error: "days between needs two dates separated by 'and'. Example: gap = days between start_date and end_date" };
    }
    const startExpr = parseExpression(tokens, pos, line, andIdx);
    if (startExpr.error) return { error: startExpr.error };
    const endExpr = parseExpression(tokens, andIdx + 1, line);
    if (endExpr.error) return { error: endExpr.error };
    return { name, expression: { type: NodeType.DAYS_BETWEEN, start: startExpr.node, end: endExpr.node, line } };
  }

  // Check for "find pattern 'X' in expr" on the right side
  // e.g. matches = find pattern '[0-9]+' in text
  if (pos < tokens.length && tokens[pos].canonical === 'find_pattern') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "find pattern needs a pattern in quotes. Example: matches = find pattern '[0-9]+' in text" };
    }
    const pattern = tokens[pos].value;
    pos++;
    // skip 'in'
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    const expr = parseExpression(tokens, pos, line);
    if (expr.error) return { error: expr.error };
    return { name, expression: { type: NodeType.REGEX_FIND, pattern, source: expr.node, line } };
  }

  // Check for "matches pattern 'X' in expr" on the right side
  // e.g. is_valid = matches pattern '^[a-z]+$' in text
  if (pos < tokens.length && tokens[pos].canonical === 'matches_pattern') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "matches pattern needs a pattern in quotes. Example: is_valid = matches pattern '^[a-z]+$' in text" };
    }
    const pattern = tokens[pos].value;
    pos++;
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    const expr = parseExpression(tokens, pos, line);
    if (expr.error) return { error: expr.error };
    return { name, expression: { type: NodeType.REGEX_MATCH, pattern, source: expr.node, line } };
  }

  // Check for "replace pattern 'X' in expr with expr" on the right side
  // e.g. cleaned = replace pattern '\s+' in text with ' '
  if (pos < tokens.length && tokens[pos].canonical === 'replace_pattern') {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "replace pattern needs a pattern in quotes. Example: cleaned = replace pattern '\\s+' in text with ' '" };
    }
    const pattern = tokens[pos].value;
    pos++;
    if (pos < tokens.length && (tokens[pos].value === 'in' || tokens[pos].canonical === 'in')) pos++;
    // Parse the source expression up to 'with'
    const withIdx = tokens.findIndex((t, idx) => idx >= pos && (t.value === 'with' || t.canonical === 'with'));
    if (withIdx === -1) {
      return { error: "replace pattern needs 'with' and a replacement. Example: cleaned = replace pattern '\\s+' in text with ' '" };
    }
    const srcExpr = parseExpression(tokens, pos, line, withIdx);
    if (srcExpr.error) return { error: srcExpr.error };
    const replExpr = parseExpression(tokens, withIdx + 1, line);
    if (replExpr.error) return { error: replExpr.error };
    return { name, expression: { type: NodeType.REGEX_REPLACE, pattern, source: srcExpr.node, replacement: replExpr.node, line } };
  }

  // Shorthand: "get all Todos" / "get every Todo" -> CRUD lookup all
  // Also: "get all Todos page 2, 25 per page" -> paginated lookup
  // "every" sets noLimit (opt out of default LIMIT 50)
  if (pos < tokens.length && tokens[pos].canonical === 'get_key' &&
      pos + 1 < tokens.length &&
      (tokens[pos + 1].value === 'all' || tokens[pos + 1].value === 'every') &&
      pos + 2 < tokens.length) {
    const isEvery = tokens[pos + 1].value === 'every';
    const tableName = tokens[pos + 2].value;
    const node = crudNode('lookup', name, tableName, null, line);
    node.lookupAll = true;
    if (isEvery) node.noLimit = true;
    // Optional pagination: "page N, M per page"
    let pPos = pos + 3;
    if (pPos < tokens.length && tokens[pPos].value === 'page') {
      pPos++;
      if (pPos < tokens.length) {
        node.page = tokens[pPos].type === TokenType.NUMBER ? tokens[pPos].value : tokens[pPos].value;
        pPos++;
        // Skip comma
        if (pPos < tokens.length && tokens[pPos].value === ',') pPos++;
        if (pPos < tokens.length && tokens[pPos].type === TokenType.NUMBER) {
          node.perPage = tokens[pPos].value;
        }
      }
    }
    return { node };
  }

  // Shorthand: "get todos from '/api/url'" -> named API fetch
  // e.g. todos = get todos from '/api/todos' (inside button or on-page-load)
  // Also handles standalone: all_data = get from '/api/data'
  if (pos < tokens.length && tokens[pos].canonical === 'get_key') {
    // "get IDENTIFIER from 'URL'" or "get from 'URL'"
    let gPos = pos + 1;
    if (gPos < tokens.length && tokens[gPos].value === 'from') {
      gPos++; // skip 'from'
      if (gPos < tokens.length && tokens[gPos].type === TokenType.STRING) {
        return { name, expression: { type: NodeType.API_CALL, method: 'GET', url: tokens[gPos].value, targetVar: name, line } };
      }
    }
    // "get X from 'URL'" where X is a variable name (ignored, target is the assignment name)
    if (gPos < tokens.length && gPos + 1 < tokens.length && tokens[gPos].value === 'from' || (gPos + 1 < tokens.length && tokens[gPos + 1]?.value === 'from')) {
      const fromIdx = tokens.findIndex((t, i) => i >= pos + 1 && t.value === 'from');
      if (fromIdx > 0 && fromIdx + 1 < tokens.length && tokens[fromIdx + 1].type === TokenType.STRING) {
        return { name, expression: { type: NodeType.API_CALL, method: 'GET', url: tokens[fromIdx + 1].value, targetVar: name, line } };
      }
    }
  }

  // Shorthand: "post to '/api/url' with data" -> POST fetch
  // e.g. result = post to '/api/ask' with question
  if (pos < tokens.length && tokens[pos].canonical === 'post_to') {
    pos++; // skip 'post to'
    if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
      const url = tokens[pos].value;
      pos++;
      // Parse optional "with field1, field2" or "with data"
      const fields = [];
      if (pos < tokens.length && tokens[pos].canonical === 'with') {
        pos++;
        while (pos < tokens.length) {
          if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
            fields.push(tokens[pos].value);
          }
          pos++;
          if (pos < tokens.length && (tokens[pos].type === TokenType.COMMA || tokens[pos].canonical === 'and')) {
            pos++;
          }
        }
      }
      return { name, expression: { type: NodeType.API_CALL, method: 'POST', url, targetVar: name, fields, line } };
    }
  }

  // Check for CRUD "look up" on the right side of assignment
  if (pos < tokens.length && tokens[pos].canonical === 'look_up') {
    return parseLookUpAssignment(name, tokens, pos, line);
  }

  // Check for "save incoming as Shape" on the right side
  if (pos < tokens.length && tokens[pos].canonical === 'save_to') {
    return parseSaveAssignment(name, tokens, pos, line);
  }

  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };

  return { name, expression: expr.node };
}

function parseIfThen(tokens, line) {
  let pos = 1;

  const condEnd = findCanonical(tokens, 'then', pos);
  if (condEnd === -1) {
    return { error: 'The if-statement is missing "then" — add it after the condition. Example: if score is greater than 90 then show "great!"' };
  }

  const condition = parseExpression(tokens, pos, line, condEnd);
  if (condition.error) return { error: condition.error };
  pos = condEnd + 1;

  const otherwisePos = findCanonical(tokens, 'otherwise', pos);
  const thenEnd = otherwisePos !== -1 ? otherwisePos : tokens.length;
  const thenExpr = parseStatementInline(tokens, pos, line, thenEnd);
  if (thenExpr.error) return { error: thenExpr.error };

  let otherwiseBranch = null;
  if (otherwisePos !== -1) {
    const elseExpr = parseStatementInline(tokens, otherwisePos + 1, line, tokens.length);
    if (elseExpr.error) return { error: elseExpr.error };
    otherwiseBranch = elseExpr.node;
  }

  return { node: ifThenNode(condition.node, thenExpr.node, otherwiseBranch, line) };
}

function parseStatementInline(tokens, start, line, end) {
  if (start >= end) {
    return { error: 'The "then" branch is empty — add what should happen when the condition is true. Example: if x is 5 then show "yes!"' };
  }
  // Check if this looks like an assignment: "set x = ...", "x = ...", or "x is ..."
  if (tokens[start].canonical === 'set') {
    const sub = tokens.slice(start, end);
    const parsed = parseAssignment(sub, line);
    if (parsed.error) return { error: parsed.error };
    return { node: assignNode(parsed.name, parsed.expression, line) };
  }
  // identifier followed by = or is → inline assignment (e.g. "gift_cost = 5")
  if ((tokens[start].type === TokenType.IDENTIFIER || tokens[start].type === TokenType.KEYWORD) &&
      start + 1 < end &&
      (tokens[start + 1].type === TokenType.ASSIGN || tokens[start + 1].canonical === 'is')) {
    const sub = tokens.slice(start, end);
    const parsed = parseAssignment(sub, line);
    if (parsed.error) return { error: parsed.error };
    return { node: assignNode(parsed.name, parsed.expression, line) };
  }
  // "send back" / "respond with" / "show" as inline statements
  if (tokens[start].canonical === 'send_back') {
    const sub = tokens.slice(start, end);
    const parsed = parseRespond(sub, line);
    if (!parsed.error) return { node: parsed.node };
  }
  if (tokens[start].canonical === 'show') {
    const expr = parseExpression(tokens, start + 1, line, end);
    if (!expr.error) return { node: showNode(expr.node, line) };
  }
  // "return X" as inline statement
  if (tokens[start].canonical === 'return') {
    const expr = parseExpression(tokens, start + 1, line, end);
    if (!expr.error) return { node: returnNode(expr.node, line) };
  }
  return parseExpression(tokens, start, line, end);
}

// =============================================================================
// EXPRESSION PARSER (Pratt-style precedence climbing)
// =============================================================================

const PRECEDENCE = {
  'or': 1, '||': 1,
  'and': 2, '&&': 2,
  '==': 3, 'is': 3, 'is not': 3, '!=': 3,
  '>': 4, '<': 4, '>=': 4, '<=': 4,
  'is greater than': 4, 'is less than': 4,
  'is at least': 4, 'is at most': 4,
  '+': 5, '-': 5, 'plus': 5, 'minus': 5,
  '*': 6, '/': 6, '%': 6, 'times_op': 6, 'divided_by': 6, 'remainder': 6,
  '**': 7, 'power': 7,
};

function parseExpression(tokens, startPos, line, endPos) {
  const end = endPos || tokens.length;
  if (startPos >= end) {
    return { error: 'This line is incomplete — add a value after "is" or "=". Example: name is \'Alice\' or total = price + tax' };
  }

  const result = parseExprPrec(tokens, startPos, line, end, 0);
  return result;
}

function parseExprPrec(tokens, pos, line, end, minPrec) {
  let left = parsePrimary(tokens, pos, line, end);
  if (left.error) return left;
  pos = left.nextPos;

  // Handle property access:
  //   person's name (possessive — canonical)
  //   person.name   (dot — silent alias)
  while (pos < end && (tokens[pos].type === TokenType.POSSESSIVE || tokens[pos].type === TokenType.DOT)) {
    pos++; // skip 's or .
    if (pos >= end || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
      return { error: `Expected a property name after "'s" on line ${line}. Example: person's name` };
    }
    const memberName = tokens[pos].value;
    pos++;

    // Method call: helpers's double(5) or helpers.double(5)
    if (pos < end && tokens[pos].type === TokenType.LPAREN) {
      pos++; // skip (
      const args = [];
      while (pos < end && tokens[pos].type !== TokenType.RPAREN) {
        if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
        const arg = parseExprPrec(tokens, pos, line, end, 0);
        if (arg.error) return arg;
        args.push(arg.node);
        pos = arg.nextPos;
      }
      if (pos >= end) {
        return { error: `The method call .${memberName}() has an unclosed parenthesis — add a ")" at the end.` };
      }
      pos++; // skip )
      left = {
        node: { type: NodeType.CALL, callee: memberAccessNode(left.node, memberName, line), args, line },
        nextPos: pos,
      };
    } else {
      left = {
        node: memberAccessNode(left.node, memberName, line),
        nextPos: pos,
      };
    }
    pos = left.nextPos;
  }

  while (pos < end) {
    const tok = tokens[pos];
    if (tok.type === TokenType.COMMENT) break;

    // "X exists in Y" / "X is in Y" — map existence check (infix, after left side parsed)
    // Tokenizer combines "exists in" / "is in" into a single token with canonical 'key_exists'
    if (tok.canonical === 'key_exists') {
      pos++; // skip compound "exists in" token
      const right = parseExprPrec(tokens, pos, line, end, 0);
      if (right.error) return right;
      left = {
        node: { type: NodeType.MAP_EXISTS, key: left.node, map: right.node, line },
        nextPos: right.nextPos,
      };
      pos = left.nextPos;
      continue;
    }

    const opKey = getOperatorKey(tok);
    if (!opKey || PRECEDENCE[opKey] === undefined) break;

    const prec = PRECEDENCE[opKey];
    if (prec < minPrec) break;

    pos++;
    const normalizedOp = normalizeOperator(opKey, tok);

    const right = parseExprPrec(tokens, pos, line, end, prec + 1);
    if (right.error) return right;
    pos = right.nextPos;

    left = {
      node: binaryOp(normalizedOp, left.node, right.node, line),
      nextPos: pos,
    };
  }

  return left;
}

// Parse a string with {expr} interpolation into a parts array.
// Returns null if no interpolation found (fast path).
// Silent fallback on parse errors — parsePrimary has no errors array.
function parseStringParts(rawStr, lineNum) {
  if (!rawStr.includes('{')) return null;
  const parts = [];
  let i = 0;
  while (i < rawStr.length) {
    const open = rawStr.indexOf('{', i);
    if (open === -1) {
      if (i < rawStr.length) parts.push({ text: rawStr.slice(i) });
      break;
    }
    if (open > i) parts.push({ text: rawStr.slice(i, open) });
    const close = rawStr.indexOf('}', open + 1);
    if (close === -1) {
      parts.push({ text: rawStr.slice(open) }); // no closing } — treat rest as literal
      break;
    }
    const inner = rawStr.slice(open + 1, close);
    if (inner.trim() === '') {
      parts.push({ text: '{}' });
      i = close + 1;
      continue;
    }
    try {
      const innerTokens = tokenizeLine(inner, lineNum);
      const result = parseExpression(innerTokens, 0, lineNum);
      if (result && result.node && !result.error) {
        parts.push({ expr: result.node });
      } else {
        parts.push({ text: '{' + inner + '}' }); // silent fallback
      }
    } catch (e) {
      parts.push({ text: '{' + inner + '}' }); // silent fallback on tokenizer error
    }
    i = close + 1;
  }
  return parts.length > 0 ? parts : null;
}

function parsePrimary(tokens, pos, line, end) {
  const maxPos = end || tokens.length;
  if (pos >= maxPos) {
    return { error: 'The expression is incomplete — a value is missing at the end. Check for a missing number, variable name, or closing bracket.' };
  }

  const tok = tokens[pos];

  if (tok.type === TokenType.NUMBER) {
    return { node: literalNumber(tok.value, line), nextPos: pos + 1 };
  }

  if (tok.type === TokenType.STRING) {
    const strParts = parseStringParts(tok.value, line);
    const strNode = literalString(tok.value, line);
    if (strParts) strNode.parts = strParts;
    return { node: strNode, nextPos: pos + 1 };
  }

  // "current user" -> special variable reference to authenticated user
  if (tok.canonical === 'current_user') {
    return { node: variableRef('_current_user', line), nextPos: pos + 1 };
  }

  // "this X" → URL path parameter access (e.g. "this id" → incoming.id).
  // Lets Meph write natural English expressions: `workspace_id is this id`,
  // `items = get all Items where owner is this user_id`. Previously this
  // only worked inside specific forms (delete/update/look up with this X).
  // Now it works in any expression position.
  if (tok.value === 'this' && pos + 1 < maxPos) {
    const nextTok = tokens[pos + 1];
    // Only match if the next token is a plausible identifier name.
    // Skip if it's punctuation, a keyword we shouldn't consume, etc.
    if (nextTok && typeof nextTok.value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nextTok.value)) {
      // Don't match multi-word patterns owned by other parsers (e.g. "this id" already
      // consumed inside "delete the X with this id"). Those are matched BEFORE parseExpression
      // runs, so if we're here, the caller genuinely wants this as an expression.
      return {
        node: {
          type: NodeType.MEMBER_ACCESS,
          object: { type: NodeType.VARIABLE_REF, name: 'incoming', line },
          member: nextTok.value,
          line,
        },
        nextPos: pos + 2,
      };
    }
  }

  if (tok.canonical === 'true') {
    return { node: literalBoolean(true, line), nextPos: pos + 1 };
  }
  if (tok.canonical === 'false') {
    return { node: literalBoolean(false, line), nextPos: pos + 1 };
  }

  if (tok.canonical === 'nothing') {
    return { node: literalNothing(line), nextPos: pos + 1 };
  }

  // "today" → date expression for start of current day
  if (tok.value === 'today') {
    return { node: { type: NodeType.CURRENT_TIME, subtype: 'today', line }, nextPos: pos + 1 };
  }

  // "keys of X" → MAP_KEYS node
  // Note: "of" canonical is "in" (synonyms.js) — check .canonical === 'in', not 'of'
  if (tok.value === 'keys' && pos + 1 < maxPos && tokens[pos + 1].canonical === 'in') {
    const src = parseExprPrec(tokens, pos + 2, line, maxPos, 0);
    if (src.error) return src;
    return { node: { type: NodeType.MAP_KEYS, source: src.node, line }, nextPos: src.nextPos };
  }

  // "values of X" → MAP_VALUES node
  if (tok.value === 'values' && pos + 1 < maxPos && tokens[pos + 1].canonical === 'in') {
    const src = parseExprPrec(tokens, pos + 2, line, maxPos, 0);
    if (src.error) return src;
    return { node: { type: NodeType.MAP_VALUES, source: src.node, line }, nextPos: src.nextPos };
  }

  if (tok.canonical === 'not') {
    const operand = parsePrimary(tokens, pos + 1, line, maxPos);
    if (operand.error) return operand;
    return { node: unaryOp('not', operand.node, line), nextPos: operand.nextPos };
  }

  if (tok.type === TokenType.LPAREN) {
    const inner = parseExprPrec(tokens, pos + 1, line, maxPos, 0);
    if (inner.error) return inner;
    if (inner.nextPos >= maxPos || tokens[inner.nextPos].type !== TokenType.RPAREN) {
      return { error: `There's an unclosed parenthesis "(" — add a ")" to close it.` };
    }
    return { node: inner.node, nextPos: inner.nextPos + 1 };
  }

  if (tok.type === TokenType.LBRACKET) {
    return parseListLiteral(tokens, pos, line, maxPos);
  }

  // Inline record literal: { key is value, key is value, ... } or { key: value, ... }
  // Lets endpoints return inline JSON shapes like `send back { received is true }`.
  // The indented-block form (`x is\n  a is 1\n  b is 2`) still works — this is
  // an additional expression-level form, not a replacement.
  if (tok.type === TokenType.LBRACE) {
    return parseInlineRecord(tokens, pos, line, maxPos);
  }

  if (tok.type === TokenType.OPERATOR && tok.value === '-') {
    const operand = parsePrimary(tokens, pos + 1, line, maxPos);
    if (operand.error) return operand;
    return {
      node: unaryOp('-', operand.node, line),
      nextPos: operand.nextPos,
    };
  }

  // "pick a, b, c from X" — field projection expression (T2 #44).
  // Returns a new record/list with only the named fields. Polymorphic:
  // handles both single-object and list inputs at runtime.
  if (typeof tok.value === 'string' && tok.value.toLowerCase() === 'pick' && tok.type !== TokenType.STRING) {
    // Read field names until `from`
    const fields = [];
    let p = pos + 1;
    while (p < maxPos) {
      const t = tokens[p];
      if (t.value === 'from' || t.canonical === 'in') break;
      if (t.value === ',' || t.value === 'and') { p++; continue; }
      if (t.type === TokenType.IDENTIFIER || t.type === TokenType.KEYWORD) {
        fields.push(t.value);
        p++;
      } else {
        break;
      }
    }
    if (fields.length > 0 && p < maxPos &&
        (tokens[p].value === 'from' || tokens[p].canonical === 'in')) {
      // Parse the source expression after `from`
      const srcExpr = parseExprPrec(tokens, p + 1, line, maxPos, 0);
      if (!srcExpr.error) {
        return {
          node: { type: NodeType.PICK, fields, source: srcExpr.node, line },
          nextPos: srcExpr.nextPos,
        };
      }
    }
  }

  // "get signed cookie 'name'" — signed cookie read (T2 #42).
  // Must precede the plain `get cookie` branch below.
  if (tok.canonical === 'get_key' &&
      pos + 3 < maxPos &&
      typeof tokens[pos + 1].value === 'string' &&
      tokens[pos + 1].value.toLowerCase() === 'signed' &&
      typeof tokens[pos + 2].value === 'string' &&
      tokens[pos + 2].value.toLowerCase() === 'cookie' &&
      tokens[pos + 3].type === TokenType.STRING) {
    return {
      node: { type: NodeType.COOKIE_GET, name: tokens[pos + 3].value, signed: true, line },
      nextPos: pos + 4,
    };
  }

  // "get cookie 'name'" — cookie read expression (T2 #42).
  // Compiles to req.cookies[name] on the backend. Parser-first because
  // get_key's `from` lookahead otherwise consumes `cookie 'name'` as a
  // key expression and errors.
  if (tok.canonical === 'get_key' &&
      pos + 2 < maxPos &&
      typeof tokens[pos + 1].value === 'string' &&
      tokens[pos + 1].value.toLowerCase() === 'cookie' &&
      tokens[pos + 2].type === TokenType.STRING) {
    const cookieName = tokens[pos + 2].value;
    return {
      node: { type: NodeType.COOKIE_GET, name: cookieName, line },
      nextPos: pos + 3,
    };
  }

  // "get key from scope" — dynamic map lookup
  if (tok.canonical === 'get_key') {
    // Find "from" to know where key expression ends
    let fromPos = -1;
    for (let k = pos + 1; k < maxPos; k++) {
      if (tokens[k].canonical === 'in' || (tokens[k].value && tokens[k].value.toLowerCase() === 'from')) {
        fromPos = k;
        break;
      }
    }
    if (fromPos > pos + 1) {
      const keyExpr = parseExprPrec(tokens, pos + 1, line, fromPos, 0);
      if (!keyExpr.error) {
        const mapExpr = parsePrimary(tokens, fromPos + 1, line, maxPos);
        if (!mapExpr.error) {
          return {
            node: { type: NodeType.MEMBER_ACCESS, object: mapExpr.node, member: null, dynamicKey: keyExpr.node, line },
            nextPos: mapExpr.nextPos,
          };
        }
      }
    }
  }

  // Collection operations: "sum of X", "first of X", "count of X", etc.
  const collectionOps = {
    sum_of: 'sum', avg_of: 'avg', count_of: 'count',
    max_of: 'max', min_of: 'min',
    first_of: '_first', last_of: '_last', rest_of: '_rest',
  };
  if (collectionOps[tok.canonical]) {
    const fnName = collectionOps[tok.canonical];
    const operand = parsePrimary(tokens, pos + 1, line, maxPos);
    if (operand.error) return operand;
    // NEW: "sum of field from Table" -> SQL_AGGREGATE. Must come BEFORE the
    // "in variable" check because `from` canonicalizes to `in` (synonyms.js
    // line 57). Gate on rawValue === 'from' AND capitalized identifier.
    const sqlFns = { sum: 1, avg: 1, count: 1, max: 1, min: 1 };
    if (sqlFns[fnName] &&
        operand.nextPos < maxPos &&
        tokens[operand.nextPos].rawValue === 'from') {
      const tablePos = operand.nextPos + 1;
      // Accept identifier OR keyword (some table names like "Returns" happen
      // to be synonyms). Only requirement: starts with a capital letter.
      if (tablePos < maxPos &&
          typeof tokens[tablePos].value === 'string' &&
          /^[A-Z]/.test(tokens[tablePos].value)) {
        const fieldName = operand.node.name;
        const tableName = tokens[tablePos].value;
        let nextPos = tablePos + 1;
        // Optional WHERE clause for filtered aggregates
        let condition = null;
        if (nextPos < maxPos && tokens[nextPos].canonical === 'where') {
          nextPos++;
          const condExpr = parseExpression(tokens, nextPos, line);
          if (!condExpr.error) {
            condition = condExpr.node;
            if (typeof condExpr.nextPos === 'number') nextPos = condExpr.nextPos;
            else nextPos = maxPos;
          }
        }
        return {
          node: {
            type: NodeType.SQL_AGGREGATE,
            fn: fnName,
            field: fieldName,
            table: tableName,
            condition,
            line
          },
          nextPos
        };
      }
    }
    // Check for "field in list" pattern: sum of amount in orders
    if (operand.nextPos < maxPos && tokens[operand.nextPos].canonical === 'in') {
      const fieldName = operand.node.name; // extract field name from variable ref
      const listPos = operand.nextPos + 1; // skip 'in'
      if (listPos < maxPos) {
        const listOperand = parsePrimary(tokens, listPos, line, maxPos);
        if (!listOperand.error) {
          const fieldFnName = fnName === 'count' ? 'count' : '_' + fnName + '_field';
          return { node: callNode(fieldFnName, [listOperand.node, literalString(fieldName, line)], line), nextPos: listOperand.nextPos };
        }
      }
    }
    return { node: callNode(fnName, [operand.node], line), nextPos: operand.nextPos };
  }

  // "each user's name in active_users" -> map expression
  if (tok.canonical === 'each') {
    return parseEachExpression(tokens, pos + 1, line, maxPos);
  }

  // "combine X with Y" -> merge expression
  if (tok.canonical === 'combine_with') {
    const left = parsePrimary(tokens, pos + 1, line, maxPos);
    if (left.error) return left;
    let nextPos = left.nextPos;
    // expect "with"
    if (nextPos < maxPos && tokens[nextPos].canonical === 'with') {
      nextPos++;
      const right = parsePrimary(tokens, nextPos, line, maxPos);
      if (right.error) return right;
      return { node: callNode('_combine', [left.node, right.node], line), nextPos: right.nextPos };
    }
    return left;
  }

  if (tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD) {
    const name = tok.value;
    if (pos + 1 < maxPos && tokens[pos + 1].type === TokenType.LPAREN) {
      return parseFunctionCall(tokens, pos, line, maxPos);
    }
    return { node: variableRef(name, line), nextPos: pos + 1 };
  }

  return { error: `Clear doesn't understand "${tok.value}" in this position. If it's a variable, make sure it's defined on an earlier line. If it's a keyword, check the spelling. Example: result = price * quantity` };
}

function parseListLiteral(tokens, pos, line, end) {
  pos++;
  const elements = [];
  while (pos < end && tokens[pos].type !== TokenType.RBRACKET) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    const elem = parseExprPrec(tokens, pos, line, end, 0);
    if (elem.error) return elem;
    elements.push(elem.node);
    pos = elem.nextPos;
  }
  if (pos >= end) {
    return { error: `There's an unclosed list bracket "[" — add a "]" to close it.` };
  }
  return { node: literalList(elements, line), nextPos: pos + 1 };
}

// Inline record literal parser: { key is value, key is value, ... }
// Accepts `is`, `=`, or `:` as the key/value separator (all three feel natural:
// `is` reads as English, `=` matches assignment style, `:` matches JSON which
// Meph reaches for by instinct). Commas between entries are optional if the
// next token is clearly a new key.
function parseInlineRecord(tokens, pos, line, end) {
  pos++; // skip `{`
  const entries = [];
  while (pos < end && tokens[pos].type !== TokenType.RBRACE) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    const keyTok = tokens[pos];
    if (keyTok.type !== TokenType.IDENTIFIER && keyTok.type !== TokenType.KEYWORD && keyTok.type !== TokenType.STRING) {
      return { error: `Inside { } a field needs a name. Got "${keyTok.value}". Example: { received is true }` };
    }
    const key = keyTok.value;
    pos++;
    const sep = pos < end ? tokens[pos] : null;
    const isSep = sep && (sep.canonical === 'is' || sep.type === TokenType.ASSIGN || sep.type === TokenType.COLON);
    if (!isSep) {
      return { error: `After "${key}" inside { } add "is", "=", or ":" and a value. Example: { ${key} is true }` };
    }
    pos++; // skip separator
    // Find the end of this entry's value expression: scan forward for a comma
    // or closing brace at the same bracket depth as the opening `{`.
    let valueEnd = pos;
    let depth = 0;
    while (valueEnd < end) {
      const t = tokens[valueEnd];
      if (depth === 0 && (t.type === TokenType.COMMA || t.type === TokenType.RBRACE)) break;
      if (t.type === TokenType.LBRACE || t.type === TokenType.LBRACKET || t.type === TokenType.LPAREN) depth++;
      else if (t.type === TokenType.RBRACE || t.type === TokenType.RBRACKET || t.type === TokenType.RPAREN) depth--;
      valueEnd++;
    }
    if (valueEnd === pos) {
      return { error: `After "${key} is" inside { } add a value. Example: { ${key} is true }` };
    }
    const valueExpr = parseExpression(tokens, pos, line, valueEnd);
    if (valueExpr.error) return valueExpr;
    entries.push({ key, value: valueExpr.node });
    pos = valueEnd;
  }
  if (pos >= end) {
    return { error: `There's an unclosed "{" — add a "}" to close the record. Example: { received is true }` };
  }
  return { node: recordNode(entries, line), nextPos: pos + 1 };
}

// "each user's name in active_users" -> _map(active_users, 'name')
function parseEachExpression(tokens, pos, line, maxPos) {
  // Pattern: each <accessor> in <collection>
  // <accessor> is like "user's name" -> we need to extract the property name
  // Find the "in" keyword
  let inPos = -1;
  for (let i = pos; i < maxPos; i++) {
    if (tokens[i].canonical === 'in') {
      inPos = i;
      break;
    }
  }
  if (inPos < 0) {
    return { error: 'The "each" pattern needs "in" — example: each user\'s name in active_users' };
  }

  // Extract the property being accessed from the accessor tokens (before "in")
  // e.g. "user's name" -> property is "name"
  let propName = null;
  for (let i = pos; i < inPos; i++) {
    if (tokens[i].type === TokenType.POSSESSIVE && i + 1 < inPos) {
      propName = tokens[i + 1].value;
    }
  }

  // Parse the collection (after "in")
  const collection = parseExprPrec(tokens, inPos + 1, line, maxPos, 0);
  if (collection.error) return collection;

  if (propName) {
    return {
      node: callNode('_map_prop', [collection.node, literalString(propName, line)], line),
      nextPos: collection.nextPos,
    };
  }

  // Fallback: no possessive, just a variable after "each"
  return collection;
}

function parseFunctionCall(tokens, pos, line, end) {
  const name = tokens[pos].value;
  pos += 2;
  const args = [];
  while (pos < end && tokens[pos].type !== TokenType.RPAREN) {
    if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
    const arg = parseExprPrec(tokens, pos, line, end, 0);
    if (arg.error) return arg;
    args.push(arg.node);
    pos = arg.nextPos;
  }
  if (pos >= end) {
    return { error: `The function call ${name}() has an unclosed parenthesis — add a ")" at the end.` };
  }
  return { node: callNode(name, args, line), nextPos: pos + 1 };
}

// =============================================================================
// OPERATOR HELPERS
// =============================================================================

function getOperatorKey(tok) {
  if (tok.type === TokenType.OPERATOR) return tok.value;
  if (tok.type === TokenType.COMPARE) return tok.value;
  if (tok.canonical && PRECEDENCE[tok.canonical] !== undefined) return tok.canonical;
  return null;
}

function normalizeOperator(opKey, tok) {
  const MAP = {
    'plus': '+',
    'minus': '-',
    'times_op': '*',
    'divided_by': '/',
    'remainder': '%',
    'power': '**',
    'is': '==',
    'is not': '!=',
    'is greater than': '>',
    'is less than': '<',
    'is at least': '>=',
    'is at most': '<=',
    'and': '&&',
    'or': '||',
  };
  return MAP[opKey] || opKey;
}

function findCanonical(tokens, canonical, startPos) {
  for (let i = startPos; i < tokens.length; i++) {
    if (tokens[i].canonical === canonical) return i;
  }
  return -1;
}
