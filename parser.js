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
//                                      parseForEachLoop, parseWhileLoop
//   USE / IMPORT MODULES .............. parseUse()
//   PAGE DECLARATION .................. parsePage()
//   SECTION ........................... parseSection()
//   STYLE DEF ......................... parseStyleDef()
//   ASK FOR (INPUT) ................... parseLabelIsInput, parseLabelFirstInput, parseNewInput
//   STATIC CONTENT ELEMENTS ........... parseContent()
//   DATA SHAPE ........................ parseDataShape(), parseRLSPolicy()
//   CRUD OPERATIONS ................... parseSave, parseRemoveFrom, parseDefineAs,
//                                      parseLookUpAssignment, parseSaveAssignment
//   TEST BLOCKS ....................... parseTestDef(), parseExpect()
//   ASK FOR (legacy) .................. parseAskFor()
//   DISPLAY ........................... parseDisplay() — includes "with delete/edit"
//   CHART ............................. parseChart() — ECharts (line, bar, pie, area)
//   BUTTON ............................ parseButton()
//   ENDPOINT .......................... parseEndpoint()
//   ADVANCED FEATURES ................. parseStream, parseBackground, parseSubscribe,
//                                      parseUpdateDatabase, parseMigration, parseWait
//   FILE UPLOADS & EXTERNAL APIS ...... parseAcceptFile, parseExternalFetch
//   BILLING & PAYMENTS ................ parseCheckout, parseUsageLimit
//   WEBHOOKS & OAUTH .................. parseWebhook, parseOAuthConfig
//   INPUT VALIDATION .................. parseValidateBlock, parseFieldRule,
//                                      parseRespondsWithBlock, parseRateLimit
//   RESPOND ........................... parseRespond()
//   MATH-STYLE FUNCTION DEFS .......... parseMathStyleFunction()
//   TRY / HANDLE ...................... parseTryHandle()
//   INCREASE / DECREASE ............... parseIncDec()
//   OBJECT DEFINITION ................. tryParseObjectDef()
//   LINE-LEVEL PARSERS ................ parseTarget, parseAssignment, parseIfThen,
//                                      parseStatementInline
//   EXPRESSION PARSER ................. parseExpression, parseExprPrec, parsePrimary,
//                                      parseListLiteral, parseEachExpression,
//                                      parseFunctionCall
//   OPERATOR HELPERS .................. getOperatorKey, normalizeOperator, findCanonical
//
// =============================================================================

import { tokenize, TokenType } from './tokenizer.js';

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
  FOR_EACH: 'for_each',
  WHILE: 'while',
  BREAK: 'break',
  CONTINUE: 'continue',

  // Objects (Phase 2)
  LITERAL_RECORD: 'literal_record',
  MEMBER_ACCESS: 'member_access',

  // Error handling (Phase 3)
  TRY_HANDLE: 'try_handle',

  // Modules (Phase 3)
  USE: 'use',

  // Database declaration
  DATABASE_DECL: 'database_decl',

  // Toast notification
  TOAST: 'toast',

  // Agent primitives
  AGENT: 'agent',
  ASK_AI: 'ask_ai',
  RUN_AGENT: 'run_agent',
  PARALLEL_AGENTS: 'parallel_agents',
  PIPELINE: 'pipeline',
  RUN_PIPELINE: 'run_pipeline',

  // Raw JavaScript escape hatch
  SCRIPT: 'script',

  // Browser storage
  STORE: 'store',
  RESTORE: 'restore',

  // Interactive layout patterns
  TAB_GROUP: 'tab_group',
  TAB: 'tab',
  PANEL_ACTION: 'panel_action',  // toggle/open/close a panel or modal

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
  EXPECT: 'expect',
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

  // Input validation (Phase 16)
  VALIDATE: 'validate',
  FIELD_RULE: 'field_rule',
  RESPONDS_WITH: 'responds_with',
  RATE_LIMIT: 'rate_limit',

  // Webhooks & OAuth (Phase 17)
  WEBHOOK: 'webhook',
  OAUTH_CONFIG: 'oauth_config',

  // Billing & Payments (Phase 18)
  CHECKOUT: 'checkout',
  USAGE_LIMIT: 'usage_limit',

  // File Uploads & External APIs (Phase 19)
  ACCEPT_FILE: 'accept_file',
  EXTERNAL_FETCH: 'external_fetch',

  // External API Calls (Phase 45)
  HTTP_REQUEST: 'http_request',
  SERVICE_CALL: 'service_call',

  // Advanced features (Phase 20)
  STREAM: 'stream',
  BACKGROUND: 'background',
  SUBSCRIBE: 'subscribe',
  MIGRATION: 'migration',
  WAIT: 'wait',

  // List operations (Phase 21)
  LIST_PUSH: 'list_push',
  LIST_REMOVE: 'list_remove',
  LIST_SORT: 'list_sort',

  ON_PAGE_LOAD: 'on_page_load',
  TRANSACTION: 'transaction',
  ON_CHANGE: 'on_change',
  RETRY: 'retry',
  TIMEOUT: 'timeout',
  RACE: 'race',
  MATCH: 'match',
  MATCH_WHEN: 'match_when',
  MAP_GET: 'map_get',
  MAP_SET: 'map_set',

  // Frontend navigation + API calls (Phase 21)
  NAVIGATE: 'navigate',
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

function functionDefNode(name, params, body, line) {
  return { type: NodeType.FUNCTION_DEF, name, params, body, line };
}

function returnNode(expression, line) {
  return { type: NodeType.RETURN, expression, line };
}

function repeatNode(count, body, line) {
  return { type: NodeType.REPEAT, count, body, line };
}

function forEachNode(variable, iterable, body, line) {
  return { type: NodeType.FOR_EACH, variable, iterable, body, line };
}

function whileNode(condition, body, line) {
  return { type: NodeType.WHILE, condition, body, line };
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
function pageNode(title, body, line, route) {
  const node = { type: NodeType.PAGE, title, body, line };
  if (route) node.route = route;
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
    tag: format === 'table' ? 'table' : 'output',
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

function tryHandleNode(tryBody, handleBody, errorVar, line) {
  return { type: NodeType.TRY_HANDLE, tryBody, handleBody, errorVar, line };
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

// Phase 17: Webhooks & OAuth
function webhookNode(path, secret, body, line) {
  return { type: NodeType.WEBHOOK, path, secret, body, line };
}

function oauthConfigNode(provider, config, line) {
  return { type: NodeType.OAUTH_CONFIG, provider, config, line };
}

// Phase 18: Billing & Payments
function checkoutNode(name, config, line) {
  return { type: NodeType.CHECKOUT, name, config, line };
}

function usageLimitNode(name, tiers, line) {
  return { type: NodeType.USAGE_LIMIT, name, tiers, line };
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
    if (cfgTokens.length >= 3) {
      const key = cfgTokens[0].value;
      const valExpr = parseExpression(cfgTokens, 2, cfgTokens[0].line);
      config[key] = valExpr.error ? cfgTokens[2].value : valExpr.node;
    }
    j++;
  }
  return { config, endIdx: j };
}

function parseBlock(lines, startIdx, parentIndent, errors) {
  const body = [];
  let targetValue = null;
  let i = startIdx;

  while (i < lines.length) {
    const { tokens, indent } = lines[i];

    // If this line is at or below the parent's indent, the block is done
    if (parentIndent >= 0 && indent <= parentIndent) {
      break;
    }

    if (tokens.length === 0) { i++; continue; }

    const firstToken = tokens[0];
    const line = firstToken.line;

    try {
      // Comment-only line
      if (firstToken.type === TokenType.COMMENT) {
        body.push(commentNode(firstToken.value, line));
        i++;
        continue;
      }

      // Target declaration: "build for web" or "target: web"
      if (firstToken.canonical === 'target' || firstToken.canonical === 'build') {
        const parsed = parseTarget(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          targetValue = parsed.value;
          body.push(targetNode(parsed.value, line));
        }
        i++;
        continue;
      }

      // ---- ADAPTERS & CONFIG (database, email, scraper, pdf, ml) ----

      // Database declaration: "database is local memory" / "database is PostgreSQL at env('DB_URL')"
      if (firstToken.value === 'database' && tokens.length >= 3 &&
          (tokens[1].canonical === 'is' || tokens[1].type === TokenType.ASSIGN)) {
        const parts = tokens.slice(2).map(t => t.value);
        // Find "at" to split backend name from connection string
        const atIdx = parts.indexOf('at');
        const backend = atIdx >= 0 ? parts.slice(0, atIdx).join(' ') : parts.join(' ');
        let connectionExpr = null;
        if (atIdx >= 0 && atIdx + 1 < parts.length) {
          // Parse the connection expression (could be env('URL') or a string)
          connectionExpr = parseExpression(tokens, 2 + atIdx + 1, line);
          if (connectionExpr.error) connectionExpr = null;
          else connectionExpr = connectionExpr.node;
        }
        body.push({ type: NodeType.DATABASE_DECL, backend: backend.toLowerCase(), connection: connectionExpr, line });
        i++;
        continue;
      }

      // Production hardening directives
      if (firstToken.canonical === 'log_requests') {
        body.push({ type: NodeType.LOG_REQUESTS, line });
        i++;
        continue;
      }
      if (firstToken.canonical === 'allow_cors') {
        body.push({ type: NodeType.ALLOW_CORS, line });
        i++;
        continue;
      }

      // File I/O: write file 'path' with data
      if (firstToken.canonical === 'write_file') {
        const parsed = parseWriteFile(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Database: connect to database: + indented config
      if (firstToken.canonical === 'connect_to_database') {
        const config = {};
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const cfgTokens = lines[j].tokens;
          if (cfgTokens.length >= 3) {
            const key = cfgTokens[0].value;
            // skip 'is' or '=' (token index 1), reconstruct full value from remaining tokens
            const val = cfgTokens.slice(2).map(t => t.value).join('');
            config[key] = val;
          }
          j++;
        }
        body.push({ type: NodeType.CONNECT_DB, config, line });
        i = j;
        continue;
      }

      // Database: query 'SQL' with params  OR  run 'SQL' with params
      if (firstToken.canonical === 'raw_query' || firstToken.canonical === 'raw_run') {
        // Handled as assignment: results = query 'SQL' with params
        // Standalone: run 'SQL' with params
        if (firstToken.canonical === 'raw_run') {
          let qPos = 1;
          if (qPos < tokens.length && tokens[qPos].type === TokenType.STRING) {
            const sql = tokens[qPos].value;
            qPos++;
            let params = null;
            if (qPos < tokens.length && (tokens[qPos].value === 'with' || tokens[qPos].canonical === 'with')) {
              qPos++;
              const expr = parseExpression(tokens, qPos, line);
              if (!expr.error) params = expr.node;
            }
            body.push({ type: NodeType.RAW_QUERY, sql, params, variable: null, operation: 'run', line });
          }
          i++;
          continue;
        }
      }

      // External API call (standalone): call api 'url': + config block
      if (firstToken.canonical === 'call_api') {
        let urlNode;
        if (tokens.length >= 2 && tokens[1].type === TokenType.STRING) {
          urlNode = literalString(tokens[1].value, line);
        } else if (tokens.length >= 2) {
          urlNode = variableRef(tokens[1].value, line);
        } else {
          errors.push({ line, message: "call api needs a URL. Example: call api 'https://api.example.com'" });
          i++; continue;
        }
        const config = { method: null, headers: [], body: null, timeout: null };
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const cfgTokens = lines[j].tokens;
          if (cfgTokens.length === 0 || cfgTokens[0].type === TokenType.COMMENT) { j++; continue; }
          const key = cfgTokens[0].value?.toLowerCase();
          if (key === 'method' && cfgTokens.length >= 3) {
            const valIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.STRING);
            if (valIdx >= 0) config.method = cfgTokens[valIdx].value;
          } else if (key === 'header' && cfgTokens.length >= 4) {
            const nameIdx = cfgTokens.findIndex((t, idx) => idx > 0 && t.type === TokenType.STRING);
            if (nameIdx >= 0) {
              const headerName = cfgTokens[nameIdx].value;
              const isIdx = cfgTokens.findIndex((t, idx) => idx > nameIdx && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
              if (isIdx >= 0) {
                const valExpr = parseExpression(cfgTokens, isIdx + 1, lines[j].tokens[0].line);
                if (!valExpr.error) config.headers.push({ name: headerName, value: valExpr.node });
              }
            }
          } else if (key === 'body' && cfgTokens.length >= 3) {
            const isIdx = cfgTokens.findIndex((t, idx) => idx > 0 && (t.canonical === 'is' || t.type === TokenType.ASSIGN));
            if (isIdx >= 0) {
              const valExpr = parseExpression(cfgTokens, isIdx + 1, lines[j].tokens[0].line);
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
        body.push({ type: NodeType.HTTP_REQUEST, url: urlNode, config, line });
        i = j;
        continue;
      }

      // Service presets: charge via stripe: / send sms via twilio:
      if (firstToken.canonical === 'charge_via_stripe') {
        const { config, endIdx } = parseConfigBlock(lines, i + 1, indent);
        body.push({ type: NodeType.SERVICE_CALL, service: 'stripe', config, line });
        i = endIdx;
        continue;
      }
      if (firstToken.canonical === 'send_sms_via_twilio') {
        const { config, endIdx } = parseConfigBlock(lines, i + 1, indent);
        body.push({ type: NodeType.SERVICE_CALL, service: 'twilio', config, line });
        i = endIdx;
        continue;
      }
      // send email via sendgrid: (must check BEFORE send email: SMTP)
      if (firstToken.canonical === 'respond' &&
          tokens.length >= 4 && tokens[1].value === 'email' &&
          tokens[2].value === 'via' && tokens[3].value === 'sendgrid' &&
          i + 1 < lines.length && lines[i + 1].indent > indent) {
        const { config, endIdx } = parseConfigBlock(lines, i + 1, indent);
        body.push({ type: NodeType.SERVICE_CALL, service: 'sendgrid', config, line });
        i = endIdx;
        continue;
      }

      // needs login / needs auth (alias for requires auth)
      if (firstToken.canonical === 'needs_login') {
        body.push({ type: NodeType.REQUIRES_AUTH, line });
        i++;
        continue;
      }

      // Email: configure email: + indented config
      if (firstToken.canonical === 'configure_email') {
        const { config, endIdx } = parseConfigBlock(lines, i + 1, indent);
        body.push({ type: NodeType.CONFIGURE_EMAIL, config, line });
        i = endIdx;
        continue;
      }

      // Email: send email: + indented config (NOT 'send email to URL' which is an API call)
      // Detect: first token canonical is 'respond' (send), second is 'email',
      // and next line is indented (block form). No colon token — tokenizer strips it.
      if (firstToken.canonical === 'respond' &&
          tokens.length >= 2 && tokens[1].value === 'email' &&
          i + 1 < lines.length && lines[i + 1].indent > indent) {
        const { config, endIdx } = parseConfigBlock(lines, i + 1, indent);
        body.push({ type: NodeType.SEND_EMAIL, config, line });
        i = endIdx;
        continue;
      }

      // Text block: NAME is text block: + indented raw text lines
      // e.g. message is text block:\n  Hello {name}\n  Welcome
      if (tokens.length >= 3 &&
          (firstToken.type === TokenType.IDENTIFIER || firstToken.type === TokenType.KEYWORD) &&
          (tokens[1].canonical === 'is' || tokens[1].type === TokenType.ASSIGN) &&
          tokens[2].canonical === 'text_block') {
        const varName = firstToken.value;
        // Collect indented raw text lines (use .raw to preserve braces for interpolation)
        const textLines = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const rawLine = lines[j].raw;
          if (rawLine !== undefined && rawLine !== '') {
            textLines.push(rawLine);
          } else if (lines[j].tokens.length > 0) {
            textLines.push(lines[j].tokens.map(t => t.value).join(' '));
          }
          j++;
        }
        if (textLines.length === 0) {
          errors.push({ line, message: `text block needs indented lines of text. Example:\n${varName} is text block:\n  Hello {name}\n  Welcome` });
          i++;
          continue;
        }
        body.push({
          type: NodeType.ASSIGN,
          name: varName,
          expression: { type: NodeType.TEXT_BLOCK, lines: textLines, line },
          line
        });
        i = j;
        continue;
      }

      // Do all: NAME = do all: + indented expressions
      // e.g. results = do all:\n  fetch page 'url1'\n  fetch page 'url2'
      if (tokens.length >= 3 &&
          (firstToken.type === TokenType.IDENTIFIER || firstToken.type === TokenType.KEYWORD) &&
          tokens[1].type === TokenType.ASSIGN &&
          tokens[2].canonical === 'do_all') {
        const varName = firstToken.value;
        // Parse each indented line as an expression
        const tasks = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const taskTokens = lines[j].tokens;
          if (taskTokens.length > 0) {
            const taskExpr = parseExpression(taskTokens, 0, taskTokens[0].line);
            if (!taskExpr.error) {
              tasks.push(taskExpr.node);
            }
          }
          j++;
        }
        if (tasks.length === 0) {
          errors.push({ line, message: `do all needs indented tasks. Example:\nresults = do all:\n  fetch page 'url1'\n  fetch page 'url2'` });
          i++;
          continue;
        }
        body.push({
          type: NodeType.ASSIGN,
          name: varName,
          expression: { type: NodeType.DO_ALL, tasks, line },
          line
        });
        i = j;
        continue;
      }

      // Parallel agents: do these at the same time: + indented agent call assignments
      // e.g. do these at the same time:\n  sentiment = call 'Sentiment' with text\n  topic = call 'Topic' with text
      if (firstToken.canonical === 'do_parallel') {
        const assignments = [];
        const parallelIndent = lines[i].indent;
        let j = i + 1;
        while (j < lines.length && lines[j].indent > parallelIndent) {
          const childTokens = lines[j].tokens;
          if (childTokens.length > 0) {
            // Each child line should be an assignment: name = call 'Agent' with data
            const childLine = childTokens[0].line;
            if (childTokens.length >= 2 && childTokens[1].type === TokenType.ASSIGN) {
              const varName = childTokens[0].value;
              const rhsResult = parseAssignment(childTokens, childLine);
              if (rhsResult.error) {
                errors.push({ line: childLine, message: rhsResult.error });
              } else if (rhsResult.expression) {
                assignments.push({ name: varName, expression: rhsResult.expression, line: childLine });
              }
            } else {
              errors.push({ line: childLine, message: `Each line inside 'do these at the same time' must be an assignment. Example: result = call 'Agent' with data` });
            }
          }
          j++;
        }
        if (assignments.length === 0) {
          errors.push({ line, message: `'do these at the same time' needs indented agent calls. Example:\ndo these at the same time:\n  a = call 'Agent1' with data\n  b = call 'Agent2' with data` });
          i++;
          continue;
        }
        body.push({
          type: NodeType.PARALLEL_AGENTS,
          assignments,
          line,
        });
        i = j;
        continue;
      }

      // PDF: create pdf 'path': + indented content elements
      if (firstToken.canonical === 'create_pdf') {
        // Next token should be the file path (string) or a variable
        let pathExpr;
        if (tokens.length >= 2 && tokens[1].type === TokenType.STRING) {
          pathExpr = { type: NodeType.LITERAL_STRING, value: tokens[1].value, line };
        } else if (tokens.length >= 2 && tokens[1].type === TokenType.IDENTIFIER) {
          pathExpr = { type: NodeType.VARIABLE_REF, name: tokens[1].value, line };
        } else {
          errors.push({ line, message: "create pdf needs a file path. Example: create pdf 'report.pdf':" });
          i++;
          continue;
        }
        // Parse indented content block
        const block = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.CREATE_PDF, path: pathExpr, content: block.body, line });
        i = block.endIdx;
        continue;
      }

      // Data: save csv 'path' with data
      if (firstToken.canonical === 'save_csv') {
        const parsed = parseSaveCsv(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // File I/O: append to file 'path' with data
      if (firstToken.canonical === 'append_to_file') {
        const parsed = parseAppendToFile(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // ---- UI & DISPLAY (show, display, toast, content elements) ----

      // Show/display/print statement
      // Check for Phase 4 display modifiers FIRST: "display X as Y called Z"
      // show toast 'message' [as warning/error/success] -- must come BEFORE display modifier check
      if (firstToken.canonical === 'show' && tokens.length >= 3 && tokens[1].value === 'toast') {
        let tPos = 2;
        let message = '';
        if (tPos < tokens.length && tokens[tPos].type === TokenType.STRING) {
          message = tokens[tPos].value;
          tPos++;
        }
        let variant = 'success'; // default
        if (tPos < tokens.length && (tokens[tPos].value === 'as' || tokens[tPos].canonical === 'as_format')) {
          tPos++;
          if (tPos < tokens.length) variant = tokens[tPos].value.toLowerCase();
        }
        body.push({ type: NodeType.TOAST, message, variant, line });
        i++;
        continue;
      }

      // chart 'Title' as line showing data
      if (firstToken.value === 'chart' && tokens.length >= 4 && tokens[1].type === TokenType.STRING) {
        const parsed = parseChart(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      if (firstToken.canonical === 'show' && hasDisplayModifiers(tokens)) {
        const parsed = parseDisplay(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      //   show name                  -> show a variable's value
      //   show 'hello'               -> show a literal string
      if (firstToken.canonical === 'show') {
        if (tokens.length <= 1) {
          errors.push({ line, message: "Show needs a value to display. Example: show heading 'Welcome' or show total" });
          i++;
          continue;
        }
        // Check if next token is a content keyword: heading, subheading, text, bold text, etc.
        const contentCanonicals = ['heading', 'subheading', 'content_text', 'bold_text', 'italic_text', 'small_text', 'link', 'divider', 'code_block'];
        if (contentCanonicals.includes(tokens[1].canonical)) {
          // Shift tokens: remove "show" and parse as content
          const contentTokens = tokens.slice(1);
          const parsed = parseContent(contentTokens, line, tokens[1].canonical);
          if (parsed.error) {
            errors.push({ line, message: parsed.error });
          } else {
            body.push(parsed.node);
          }
          i++;
          continue;
        }
        // Check for component use with children: show Card: + indented block
        // Detect: show + single identifier + next line is indented
        if (tokens.length === 2 &&
            (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD) &&
            i + 1 < lines.length && lines[i + 1].indent > indent) {
          const compName = tokens[1].value;
          const { body: childBody, endIdx: childEnd } = parseBlock(lines, i + 1, indent, errors);
          body.push({ type: NodeType.COMPONENT_USE, name: compName, children: childBody, props: [], line });
          i = childEnd;
          continue;
        }
        // Check for component call: show Card(args)
        // (Already handled by expression parser — CALL node becomes SHOW)

        // Otherwise: show a value/expression
        const expr = parseExpression(tokens, 1, line);
        if (expr.error) {
          errors.push({ line, message: expr.error });
        } else {
          body.push(showNode(expr.node, line));
        }
        i++;
        continue;
      }

      // Return statement
      if (firstToken.canonical === 'return') {
        const expr = parseExpression(tokens, 1, line);
        if (expr.error) {
          errors.push({ line, message: expr.error });
        } else {
          body.push(returnNode(expr.node, line));
        }
        i++;
        continue;
      }

      // Break statement
      if (firstToken.canonical === 'break') {
        body.push(breakNode(line));
        i++;
        continue;
      }

      // Continue statement
      if (firstToken.canonical === 'continue') {
        body.push(continueNode(line));
        i++;
        continue;
      }

      // "define component X receiving a, b:" (must be checked BEFORE define-as and function def)
      if (firstToken.canonical === 'define' && tokens.length >= 3 &&
          tokens[1].canonical === 'component') {
        const result = parseComponentDef(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // "define X as:" assignment (must be checked BEFORE function def)
      // e.g. "define total as: price + tax" or "define name as 'Alice'"
      if (firstToken.canonical === 'define' && tokens.length >= 3 &&
          (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD) &&
          (tokens[2].canonical === 'as_format' || tokens[2].canonical === 'as' ||
           (typeof tokens[2].value === 'string' && tokens[2].value.toLowerCase() === 'as'))) {
        const parsed = parseDefineAs(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Agent definition: agent 'Name' receiving varName:
      if (firstToken.value === 'agent' && tokens.length >= 2) {
        const result = parseAgent(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Pipeline definition: pipeline 'Name' with var:
      if (firstToken.value === 'pipeline' && tokens.length >= 2 && tokens[1].type === TokenType.STRING) {
        const result = parsePipeline(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Function definition:
      //   CANONICAL: "define function greet with input name"
      //   Aliases: "function greet with name", "to greet with name", "define greet with name"
      if (firstToken.canonical === 'function' ||
          firstToken.canonical === 'define' ||
          (firstToken.canonical === 'to_connector' && tokens.length > 1 &&
           (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD)) ||
          (firstToken.canonical === 'set' && tokens.length > 1 && tokens[1].canonical === 'function')) {
        const result = parseFunctionDef(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Repeat loop: repeat <N> times
      if (firstToken.canonical === 'repeat') {
        const result = parseRepeatLoop(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // For-each loop: for each <var> in <iterable>
      if (firstToken.canonical === 'for_each') {
        const result = parseForEachLoop(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // While loop: while <condition>
      if (firstToken.canonical === 'while') {
        const result = parseWhileLoop(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Try/handle error handling
      if (firstToken.canonical === 'try') {
        const result = parseTryHandle(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Transaction: "as one operation:" — all-or-nothing database operations
      if (firstToken.canonical === 'as_format' && tokens.length >= 2 &&
          tokens[1].value === 'one' &&
          tokens.some(t => t.value === 'operation')) {
        const { body: txBody, endIdx: txEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.TRANSACTION, body: txBody, line });
        i = txEnd;
        continue;
      }

      // Retry: "retry 3 times:" — retry block up to N times on failure
      if (firstToken.value === 'retry' && tokens.length >= 3) {
        const count = typeof tokens[1].value === 'number' ? tokens[1].value : parseInt(tokens[1].value, 10) || 3;
        const { body: retryBody, endIdx: retryEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.RETRY, count, body: retryBody, line });
        i = retryEnd;
        continue;
      }

      // Timeout: "with timeout 5 seconds:" — cancel if block takes too long
      if (firstToken.canonical === 'with' && tokens.length >= 3 &&
          tokens[1].value === 'timeout') {
        const amount = typeof tokens[2].value === 'number' ? tokens[2].value : parseInt(tokens[2].value, 10) || 5;
        // Detect unit: seconds or minutes
        let ms = amount * 1000; // default seconds
        if (tokens.length >= 4 && (tokens[3].value === 'minutes' || tokens[3].value === 'minute')) {
          ms = amount * 60000;
        }
        const { body: timeoutBody, endIdx: timeoutEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.TIMEOUT, ms, body: timeoutBody, line });
        i = timeoutEnd;
        continue;
      }

      // Race: "first to finish:" — run multiple tasks, take first result
      if (firstToken.value === 'first' && tokens.length >= 2 &&
          tokens.some(t => t.value === 'finish')) {
        const { body: raceBody, endIdx: raceEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.RACE, body: raceBody, line });
        i = raceEnd;
        continue;
      }

      // Use/import module: use "helpers"
      if (firstToken.canonical === 'use') {
        const parsed = parseUse(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Theme directive: theme 'midnight' / theme 'ivory' / theme 'nova'
      if (firstToken.canonical === 'theme') {
        if (tokens.length < 2) {
          errors.push({ line, message: "theme needs a name — try: theme 'midnight', theme 'ivory', or theme 'nova'" });
        } else {
          const nameToken = tokens[1];
          const themeName = nameToken.value.replace(/^['"]|['"]$/g, '');
          const validThemes = ['midnight', 'ivory', 'nova', 'arctic', 'moss'];
          if (!validThemes.includes(themeName)) {
            errors.push({ line, message: `'${themeName}' isn't a theme Clear knows — try: ${validThemes.join(', ')}` });
          } else {
            body.push({ type: NodeType.THEME, name: themeName, line });
          }
        }
        i++;
        continue;
      }

      // Script block: script: + indented raw JavaScript (escape hatch)
      if (firstToken.value === 'script') {
        const scriptLines = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          // Capture raw text (the original source line, not parsed tokens)
          scriptLines.push(lines[j].raw || lines[j].tokens.map(t => t.value).join(' '));
          j++;
        }
        if (scriptLines.length === 0) {
          errors.push({ line, message: "script: block is empty — add indented JavaScript code below it" });
        } else {
          body.push({ type: NodeType.SCRIPT, code: scriptLines.join('\n'), line });
        }
        i = j;
        continue;
      }

      // Browser storage: store X / restore X
      if (firstToken.value === 'store' && tokens.length >= 2) {
        const varName = tokens[1].value;
        let key = varName;
        // Optional: store X as 'custom-key'
        if (tokens.length >= 4 && (tokens[2].canonical === 'as' || tokens[2].value === 'as') && tokens[3].type === TokenType.STRING) {
          key = tokens[3].value;
        }
        body.push({ type: NodeType.STORE, variable: varName, key, line });
        i++;
        continue;
      }

      if (firstToken.value === 'restore' && tokens.length >= 2) {
        const varName = tokens[1].value;
        let key = varName;
        if (tokens.length >= 4 && (tokens[2].canonical === 'as' || tokens[2].value === 'as') && tokens[3].type === TokenType.STRING) {
          key = tokens[3].value;
        }
        body.push({ type: NodeType.RESTORE, variable: varName, key, line });
        i++;
        continue;
      }

      // Style block: style card: + indented properties
      if (firstToken.canonical === 'style') {
        const result = parseStyleDef(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Page declaration: page "My App"
      if (firstToken.canonical === 'page') {
        const result = parsePage(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Section: section "Title" + indented body
      if (firstToken.canonical === 'section') {
        const result = parseSection(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Ask for (input): ask for price as number called "Price" (legacy)
      if (firstToken.canonical === 'ask_for') {
        const parsed = parseAskFor(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Label-first input syntax:
      //   CANONICAL: 'Label' is a text input that saves to var
      //   ALIAS:     'Label' as text input saves to var
      // Check for "'Label' is a <input_type>" pattern
      if (firstToken.type === TokenType.STRING && tokens.length >= 3 &&
          tokens[1].canonical === 'is' &&
          (tokens[2].canonical === 'a' || tokens[2].canonical === 'the')) {
        // Skip "is a/the" and check if next token is an input type
        const typePos = 3;
        if (typePos < tokens.length && isInputType(tokens[typePos])) {
          const parsed = parseLabelIsInput(tokens, line);
          if (parsed) {
            if (parsed.error) {
              errors.push({ line, message: parsed.error });
            } else {
              body.push(parsed.node);
            }
            i++;
            continue;
          }
        }
      }
      // ALIAS: 'Label' as text input saves to var
      if (firstToken.type === TokenType.STRING && tokens.length > 1 && tokens[1].canonical === 'as_format') {
        const parsed = parseLabelFirstInput(tokens, line);
        if (parsed) {
          if (parsed.error) {
            errors.push({ line, message: parsed.error });
          } else {
            body.push(parsed.node);
          }
          i++;
          continue;
        }
        // If parseLabelFirstInput returns null, it wasn't an input — fall through
      }

      // Type-first input syntax (alias): text input 'Name', dropdown 'Color' with [...]
      // Guard: "toggle the X panel" is a panel action, not a checkbox
      const isCheckboxNotPanel = firstToken.canonical === 'checkbox' &&
        !(tokens.length >= 2 && (tokens[1].value === 'the' || tokens[1].value === 'this'));
      if (firstToken.canonical === 'text_input' || firstToken.canonical === 'number_input' ||
          firstToken.canonical === 'dropdown' || isCheckboxNotPanel ||
          firstToken.canonical === 'text_area') {
        const parsed = parseNewInput(tokens, line, firstToken.canonical);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Static content: heading, subheading, text, bold text, italic text, small text, link, divider
      // Note: 'text' (content_text) only matches when followed by a string literal.
      // 'text is ...' is a variable assignment, not a content element.
      if (firstToken.canonical === 'heading' || firstToken.canonical === 'subheading' ||
          (firstToken.canonical === 'content_text' && tokens.length > 1 && tokens[1].type === TokenType.STRING) ||
          firstToken.canonical === 'bold_text' || firstToken.canonical === 'italic_text' ||
          firstToken.canonical === 'small_text' || firstToken.canonical === 'link' ||
          firstToken.canonical === 'divider' || firstToken.canonical === 'code_block') {
        const parsed = parseContent(tokens, line, firstToken.canonical);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Button: button "Click Me" + indented body
      if (firstToken.canonical === 'button') {
        const result = parseButton(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Tab: tab 'Name': + indented content (inside a tabs section)
      if (firstToken.value === 'tab' && tokens.length >= 2 && tokens[1].type === TokenType.STRING) {
        const tabTitle = tokens[1].value;
        const { body: tabBody, endIdx: tabEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.TAB, title: tabTitle, body: tabBody, line });
        i = tabEnd;
        continue;
      }

      // Panel actions: toggle/open/close [the] X panel/modal
      // "toggle the Help panel", "open the Confirm modal", "close modal"
      if ((firstToken.value === 'toggle' || firstToken.value === 'open' || firstToken.value === 'close') &&
          tokens.length >= 2) {
        const action = firstToken.value;
        // Skip optional "the" or "this"
        let pPos = 1;
        if (pPos < tokens.length && (tokens[pPos].value === 'the' || tokens[pPos].value === 'this')) pPos++;
        // Extract target name, filtering out "panel", "modal", "dialog"
        const nameTokens = tokens.slice(pPos).filter(t =>
          t.value !== 'panel' && t.value !== 'modal' && t.value !== 'dialog'
        );
        const target = nameTokens.map(t => t.value).join(' ') || 'this';
        body.push({ type: NodeType.PANEL_ACTION, action, target, line });
        i++;
        continue;
      }

      // Deploy: deploy to 'vercel'
      if (firstToken.canonical === 'deploy_to') {
        let platform = 'vercel';
        if (tokens.length > 1 && tokens[1].type === TokenType.STRING) {
          platform = tokens[1].value;
        } else if (tokens.length > 1 && (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD)) {
          platform = tokens[1].value;
        }
        body.push(deployNode(platform, line));
        i++;
        continue;
      }

      // Auth: requires auth
      if (firstToken.canonical === 'requires_auth') {
        body.push(requiresAuthNode(line));
        i++;
        continue;
      }

      // Auth: requires role 'admin'
      if (firstToken.canonical === 'requires_role') {
        let role = 'user';
        if (tokens.length > 1 && tokens[1].type === TokenType.STRING) {
          role = tokens[1].value;
        } else if (tokens.length > 1 && (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD)) {
          role = tokens[1].value;
        }
        body.push(requiresRoleNode(role, line));
        i++;
        continue;
      }

      // Auth: define role 'admin': (block with permissions)
      if (firstToken.canonical === 'define_role') {
        let role = 'user';
        if (tokens.length > 1 && tokens[1].type === TokenType.STRING) {
          role = tokens[1].value;
        } else if (tokens.length > 1 && (tokens[1].type === TokenType.IDENTIFIER || tokens[1].type === TokenType.KEYWORD)) {
          role = tokens[1].value;
        }
        // Parse body lines directly — look for "can <action>" lines
        const permissions = [];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          const bodyTokens = lines[j].tokens;
          if (bodyTokens.length > 0 && bodyTokens[0].canonical === 'can') {
            const permText = bodyTokens.slice(1).map(t => t.value).join(' ');
            permissions.push(permText);
          }
          j++;
        }
        body.push(defineRoleNode(role, permissions, [], line));
        i = j;
        continue;
      }

      // Auth: guard <expression>
      if (firstToken.canonical === 'guard') {
        // Check for "or 'message'" at the end
        let endPos = tokens.length;
        let guardMessage = null;
        for (let k = tokens.length - 1; k > 1; k--) {
          if (tokens[k].type === TokenType.STRING && k > 0 && tokens[k-1].canonical === 'or') {
            guardMessage = tokens[k].value;
            endPos = k - 1;
            break;
          }
        }
        const result = parseExpression(tokens, 1, line, endPos);
        if (result.error) {
          errors.push({ line, message: result.error });
        } else {
          body.push(guardNode(result.node, line, guardMessage));
        }
        i++;
        continue;
      }

      // ---- BACKEND FEATURES (phases 16-20: real-time, billing, webhooks, validation) ----

      // Phase 20: stream: + indented body
      if (firstToken.canonical === 'stream') {
        const result = parseStream(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 20: background 'name': (or: background job 'name':)
      if (firstToken.canonical === 'background_job'
          || (firstToken.value === 'background' && tokens.length > 1 && tokens[1].type === TokenType.STRING)) {
        const result = parseBackground(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 20: subscribe to 'channel':
      if (firstToken.canonical === 'subscribe_to') {
        const result = parseSubscribe(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // "update database:" — friendly migration syntax
      if (firstToken.canonical === 'update_database') {
        const result = parseUpdateDatabase(lines, i, indent, errors);
        if (result.nodes) {
          for (const n of result.nodes) body.push(n);
        }
        i = result.endIdx;
        continue;
      }

      // Phase 20: migration 'name': (terse alias)
      if (firstToken.canonical === 'migration_kw') {
        const result = parseMigration(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 20: wait 100ms
      if (firstToken.canonical === 'wait_kw') {
        const parsed = parseWait(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Phase 19: accept file: + indented config
      if (firstToken.canonical === 'accept_file') {
        const result = parseAcceptFile(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 19: data from 'url': + indented config
      if (firstToken.canonical === 'data_from') {
        const result = parseExternalFetch(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 18: checkout 'Pro Plan':
      if (firstToken.canonical === 'checkout') {
        const result = parseCheckout(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 18: limit 'ai_generations':
      if (firstToken.canonical === 'usage_limit') {
        const result = parseUsageLimit(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 45: when X notifies '/path': (natural webhook syntax)
      // e.g. when stripe notifies '/stripe/events':
      if (firstToken.value === 'when' &&
          tokens.length >= 4 && tokens[2].value === 'notifies' &&
          tokens[3].type === TokenType.STRING) {
        const service = tokens[1].value; // stripe, twilio, sendgrid, github, etc.
        const path = tokens[3].value;
        // Parse the body block using parseBlock
        const result = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.WEBHOOK, path, service, body: result.body, line });
        i = result.endIdx;
        continue;
      }

      // Phase 17: webhook '/path' signed with env('SECRET'):
      if (firstToken.canonical === 'webhook') {
        const result = parseWebhook(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 17: oauth 'github':
      if (firstToken.canonical === 'oauth') {
        const result = parseOAuthConfig(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 16: validate incoming: + indented field rules
      if (firstToken.canonical === 'validate') {
        const result = parseValidateBlock(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 16: responds with: + indented fields
      if (firstToken.canonical === 'responds_with') {
        const result = parseRespondsWithBlock(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Phase 16: rate limit 10 per minute
      if (firstToken.canonical === 'rate_limit') {
        const parsed = parseRateLimit(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // ---- ENDPOINTS & DATA (REST routes, data shapes, CRUD, auth) ----

      // Backend endpoint: when user calls GET /api/users: (or: on GET /api/users:)
      if (firstToken.canonical === 'when_user_calls' || firstToken.canonical === 'on_method') {
        const result = parseEndpoint(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // "send X and Y to '/url'" — frontend API call (must check BEFORE send back)
      if (firstToken.canonical === 'respond' && tokens.length >= 3) {
        let toPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'to_connector' && k + 1 < tokens.length && tokens[k + 1].type === TokenType.STRING) {
            toPos = k;
            break;
          }
        }
        if (toPos > 0) {
          const fields = [];
          // Strip "as a new X" decoration: "send todo as a new todo to URL" -> fields = [todo]
          const SKIP_WORDS = new Set(['as', 'a', 'an', 'new', 'the']);
          let inAsClause = false;
          for (let k = 1; k < toPos; k++) {
            if (tokens[k].canonical === 'and' || tokens[k].type === TokenType.COMMA) continue;
            const val = tokens[k].value?.toLowerCase();
            if (val === 'as') { inAsClause = true; continue; }
            if (inAsClause) continue; // skip everything after "as" until "to"
            if (SKIP_WORDS.has(val)) continue;
            if (tokens[k].type === TokenType.IDENTIFIER || tokens[k].type === TokenType.KEYWORD) {
              fields.push(tokens[k].value);
            }
          }
          const url = tokens[toPos + 1].value;
          body.push({ type: NodeType.API_CALL, method: 'POST', url, fields, line });
          i++;
          continue;
        }
      }

      // Send back: send back data (or: respond with data)
      if (firstToken.canonical === 'send_back' || firstToken.canonical === 'respond' || firstToken.canonical === 'respond_with') {
        const parsed = parseRespond(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Data shape / table: "create data shape User:" or "create a Users table:"
      if (firstToken.canonical === 'set' && tokens.length > 2 &&
          (tokens[1].canonical === 'data_shape' || // create data shape User
           (tokens.length > 3 && tokens.some(t => t.canonical === 'data_shape')))) { // create a Users table
        const result = parseDataShape(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // Save: save X to Y
      if (firstToken.canonical === 'save_to') {
        const parsed = parseSave(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Remove from: remove from Users where ...
      if (firstToken.canonical === 'remove_from') {
        const parsed = parseRemoveFrom(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Test block: test 'name': + indented body
      if (firstToken.canonical === 'test') {
        const result = parseTestDef(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // "match X:" — pattern matching block
      if (firstToken.canonical === 'match_kw') {
        const result = parseMatch(lines, i, indent, errors);
        if (result.node) body.push(result.node);
        i = result.endIdx;
        continue;
      }

      // "on page load:" — runs code when page first loads
      if (firstToken.canonical === 'on_page_load') {
        // Inline form: "on page load get todos from '/api/todos'" (rest of line is the action)
        if (tokens.length > 1) {
          // Parse the remaining tokens as a statement by constructing a fake single-line block
          const restTokens = tokens.slice(1);
          // Check for "get IDENTIFIER from 'URL'" pattern inline
          if (restTokens.length >= 3 && restTokens[0].canonical === 'get_key') {
            const fromIdx = restTokens.findIndex(t => t.value === 'from');
            if (fromIdx > 0 && fromIdx + 1 < restTokens.length && restTokens[fromIdx + 1].type === TokenType.STRING) {
              const targetVar = fromIdx > 1 ? restTokens[1].value : 'response';
              const url = restTokens[fromIdx + 1].value;
              body.push({ type: NodeType.ON_PAGE_LOAD, body: [
                { type: NodeType.API_CALL, method: 'GET', url, targetVar, fields: [], line }
              ], line });
              i++;
              continue;
            }
          }
        }
        // Block form: "on page load:" + indented body
        const { body: loadBody, endIdx: loadEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.ON_PAGE_LOAD, body: loadBody, line });
        i = loadEnd;
        continue;
      }

      // "when X changes:" / "when X changes after 250ms:" — reactive input handler
      if (firstToken.value === 'when' && tokens.length >= 3 && tokens[2].value === 'changes') {
        const varName = tokens[1].value;
        let debounceMs = 0;
        // Check for "after N ms" or "after 250ms" debounce
        if (tokens.length >= 5 && tokens[3].value === 'after') {
          const delayVal = tokens[4].value;
          if (typeof delayVal === 'number') {
            debounceMs = delayVal;
          } else {
            const match = String(delayVal).match(/^(\d+)(ms)?$/);
            if (match) debounceMs = parseInt(match[1], 10);
          }
        }
        const { body: changeBody, endIdx: changeEnd } = parseBlock(lines, i + 1, indent, errors);
        body.push({ type: NodeType.ON_CHANGE, variable: varName, debounceMs, body: changeBody, line });
        i = changeEnd;
        continue;
      }

      // "go to '/signup'" — page navigation
      if (firstToken.canonical === 'go_to') {
        let url = '';
        if (tokens.length > 1 && tokens[1].type === TokenType.STRING) {
          url = tokens[1].value;
        }
        body.push({ type: NodeType.NAVIGATE, url, line });
        i++;
        continue;
      }

      // Frontend API calls:
      //   "send name and email to '/api/signup'" (canonical — friendly)
      // "get todos from '/api/todos'" -- named fetch (standalone statement)
      // Pattern: get_key + IDENTIFIER + 'from' + STRING
      if (firstToken.canonical === 'get_key' && tokens.length >= 4 &&
          tokens[1].type === TokenType.IDENTIFIER) {
        const fromIdx = tokens.findIndex((t, idx) => idx >= 2 && t.value === 'from');
        if (fromIdx > 0 && fromIdx + 1 < tokens.length && tokens[fromIdx + 1].type === TokenType.STRING) {
          const targetVar = tokens[1].value;
          const url = tokens[fromIdx + 1].value;
          body.push({ type: NodeType.API_CALL, method: 'GET', url, targetVar, fields: [], line });
          i++;
          continue;
        }
      }

      //   "post to '/api/signup'" (terse alias)
      //   "get from '/api/items'" (terse alias)
      if (firstToken.canonical === 'post_to' || firstToken.canonical === 'get_from' ||
          firstToken.canonical === 'put_to' || firstToken.canonical === 'delete_from') {
        const methodMap = { post_to: 'POST', get_from: 'GET', put_to: 'PUT', delete_from: 'DELETE' };
        const method = methodMap[firstToken.canonical];
        let url = '';
        if (tokens.length > 1 && tokens[1].type === TokenType.STRING) {
          url = tokens[1].value;
        }
        body.push({ type: NodeType.API_CALL, method, url, fields: [], line });
        i++;
        continue;
      }
      // "add X to Y" — list push
      if (firstToken.canonical === 'add' && tokens.length >= 3) {
        // Find "to" keyword
        let toPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'to_connector') { toPos = k; break; }
        }
        if (toPos > 0 && toPos + 1 < tokens.length) {
          // Value is everything between add and to
          const valExpr = parseExpression(tokens, 1, line, toPos);
          const listName = tokens[toPos + 1].value;
          if (!valExpr.error) {
            body.push({ type: NodeType.LIST_PUSH, list: listName, value: valExpr.node, line });
            i++;
            continue;
          }
        }
      }

      // "set key in scope to value" — dynamic map set
      if (firstToken.canonical === 'set' && tokens.length >= 5) {
        // Check for pattern: set <key> in <map> to <value>
        let inPos = -1;
        let toPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'in' && inPos < 0) inPos = k;
          if (tokens[k].canonical === 'to_connector' && inPos > 0) { toPos = k; break; }
        }
        if (inPos > 0 && toPos > inPos && toPos + 1 < tokens.length) {
          const keyExpr = parseExpression(tokens, 1, line, inPos);
          const mapExpr = parseExpression(tokens, inPos + 1, line, toPos);
          const valExpr = parseExpression(tokens, toPos + 1, line);
          if (!keyExpr.error && !mapExpr.error && !valExpr.error) {
            body.push({ type: NodeType.MAP_SET, map: mapExpr.node, key: keyExpr.node, value: valExpr.node, line });
            i++;
            continue;
          }
        }
      }

      // "sort X by Y" / "sort X by Y descending"
      if (firstToken.canonical === 'sort_by' && tokens.length >= 3) {
        let byPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'by') { byPos = k; break; }
        }
        if (byPos > 0 && byPos + 1 < tokens.length) {
          const listName = tokens[1].value;
          const field = tokens[byPos + 1].value;
          let descending = false;
          if (byPos + 2 < tokens.length && tokens[byPos + 2].value &&
              (tokens[byPos + 2].value.toLowerCase() === 'descending' || tokens[byPos + 2].value.toLowerCase() === 'desc')) {
            descending = true;
          }
          body.push({ type: NodeType.LIST_SORT, list: listName, field, descending, line });
          i++;
          continue;
        }
      }

      // "delete the Todo with this id" -> CRUD remove by URL param
      // Pattern: remove/delete [the] TABLE with/whose this PARAM
      if (firstToken.canonical === 'remove' && tokens.length >= 4) {
        let dPos = 1;
        // Skip optional "the"
        if (dPos < tokens.length && (tokens[dPos].canonical === 'the' || tokens[dPos].canonical === 'a' || tokens[dPos].value === 'the' || tokens[dPos].value === 'a')) dPos++;
        if (dPos + 2 < tokens.length && dPos < tokens.length &&
            (tokens[dPos + 1]?.value === 'with' || tokens[dPos + 1]?.value === 'whose') &&
            (tokens[dPos + 2]?.value === 'this' || tokens[dPos + 2]?.value === 'that')) {
          const tableName = tokens[dPos].value;
          let paramName = 'id';
          if (dPos + 3 < tokens.length) paramName = tokens[dPos + 3].value;
          const condition = {
            type: NodeType.BINARY_OP, operator: '==',
            left: { type: NodeType.VARIABLE_REF, name: paramName, line },
            right: { type: NodeType.MEMBER_ACCESS, object: { type: NodeType.VARIABLE_REF, name: 'incoming', line }, member: paramName, line },
            line
          };
          body.push(crudNode('remove', null, tableName, condition, line));
          i++;
          continue;
        }
      }

      // "remove X from Y" — list remove (not CRUD — CRUD uses remove_from canonical)
      if (firstToken.canonical === 'remove' && tokens.length >= 3) {
        let fromPos = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'in' || tokens[k].value === 'from') { fromPos = k; break; }
        }
        if (fromPos > 0 && fromPos + 1 < tokens.length) {
          const valExpr = parseExpression(tokens, 1, line, fromPos);
          const listName = tokens[fromPos + 1].value;
          if (!valExpr.error) {
            body.push({ type: NodeType.LIST_REMOVE, list: listName, value: valExpr.node, line });
            i++;
            continue;
          }
        }
      }

      // Expect statement (inside test blocks)
      if (firstToken.canonical === 'expect') {
        const parsed = parseExpect(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Check: "check X, otherwise error 'msg'" → guard node
      // `check` tokenizes as canonical `if`, so detect the `otherwise error` pattern here
      if (firstToken.canonical === 'if') {
        // Look for ", otherwise error 'message'" pattern → treat as guard
        let otherwiseIdx = -1;
        for (let k = 1; k < tokens.length; k++) {
          if (tokens[k].canonical === 'otherwise' && k + 1 < tokens.length && tokens[k + 1].value === 'error') {
            otherwiseIdx = k;
            break;
          }
        }
        if (otherwiseIdx !== -1) {
          const errorMsgIdx = otherwiseIdx + 2;
          const guardMessage = (errorMsgIdx < tokens.length && tokens[errorMsgIdx].type === TokenType.STRING)
            ? tokens[errorMsgIdx].value
            : 'Validation failed';
          // Parse the condition between 'check' and ', otherwise'
          // Skip comma before 'otherwise' if present
          let condEnd = otherwiseIdx;
          if (condEnd > 1 && tokens[condEnd - 1].type === TokenType.COMMA) condEnd--;
          const result = parseExpression(tokens, 1, line, condEnd);
          if (result.error) {
            errors.push({ line, message: result.error });
          } else {
            body.push(guardNode(result.node, line, guardMessage));
          }
          i++;
          continue;
        }
      }

      // If/then conditional (must be checked BEFORE assignment)
      if (firstToken.canonical === 'if') {
        // Check for block form: "if condition:" (no "then" keyword, has indented body)
        const hasThen = tokens.some(t => t.canonical === 'then');
        if (!hasThen) {
          const result = parseIfBlock(lines, i, indent, errors);
          if (result.node) {
            body.push(result.node);
            i = result.endIdx;
            continue;
          }
        }
        // Inline form: "if condition then action"
        const parsed = parseIfThen(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Increase/decrease: "increase counter by 1" → counter = counter + 1
      if (firstToken.canonical === 'increase' || firstToken.canonical === 'decrease') {
        const parsed = parseIncDec(tokens, line, firstToken.canonical);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
      }

      // Math-style function definition: total_value(item) = item's price * item's quantity
      // Detected BEFORE assignment because it looks like assignment but has (params) on the left
      if (isMathStyleFunction(tokens)) {
        const parsed = parseMathStyleFunction(tokens, line);
        if (parsed.error) {
          errors.push({ line, message: parsed.error });
        } else {
          body.push(parsed.node);
        }
        i++;
        continue;
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
        if (parsed.isCrud) {
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

  if (pos < tokens.length && tokens[pos].type === TokenType.LPAREN) {
    // Parens-style: greet(a, b)
    pos++; // skip (
    while (pos < tokens.length && tokens[pos].type !== TokenType.RPAREN) {
      if (tokens[pos].type === TokenType.COMMA) { pos++; continue; }
      if (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD) {
        params.push(tokens[pos].value);
        pos++;
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
          params.push(tokens[pos].value);
          pos++;
        } else {
          break;
        }
      }
    }
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The function "${name}" is empty — it needs code inside. Indent some code below it. Example:\n  define function ${name}:\n    show "hello"` });
  }

  return { node: functionDefNode(name, params, body, line), endIdx };
}

// Agent definition: agent 'Name' receiving varName: + indented body
function parseAgent(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip 'agent'

  // Parse agent name (must be a quoted string)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "agent needs a quoted name. Example: agent 'Lead Scorer' receiving data:" });
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
    }
    const result = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (result.body.length === 0) {
      errors.push({ line, message: `agent '${name}' is empty — add code inside the scheduled agent` });
    }
    const schedule = { value: scheduleValue, unit: scheduleUnit };
    return {
      node: { type: NodeType.AGENT, name, receivingVar: null, schedule, body: result.body, line },
      endIdx: result.endIdx,
    };
  }

  // Parse 'receiving' keyword
  if (pos >= tokens.length || tokens[pos].value !== 'receiving') {
    errors.push({ line, message: `agent '${name}' needs 'receiving' or 'runs every'. Example: agent '${name}' receiving data:  OR  agent '${name}' runs every 1 hour:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Parse the receiving variable name
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: `agent '${name}' needs a variable name after 'receiving'. Example: agent '${name}' receiving data:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  const receivingVar = tokens[pos].value;

  // Scan upcoming indented lines for agent directives BEFORE calling parseBlock.
  // Directives are metadata on the agent node, not executable code.
  // Must be consumed here because some keywords collide with synonyms:
  //   - `use` in `can use:` → synonym for module import
  //   - `log` (if used) → synonym for `show`
  // Directives must appear before any executable code in the agent body.
  const agentIndent = lines[startIdx].indent;
  const directives = {
    trackDecisions: false,
    tools: null,        // [{type:'ref', name:'fn1'}, ...] or [{type:'inline', description:'...'}]
    restrictions: null, // [{text:'delete any records', category:'delete'}, ...]
    rememberConversation: false,
    rememberPreferences: false,
  };
  let bodyStartIdx = startIdx + 1;
  while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > agentIndent) {
    const dTokens = lines[bodyStartIdx].tokens;
    if (dTokens.length === 0) { bodyStartIdx++; continue; }

    // track agent decisions
    if (dTokens[0].value === 'track' && dTokens.length >= 3 &&
        dTokens[1].value === 'agent' && dTokens[2].value === 'decisions') {
      directives.trackDecisions = true;
      bodyStartIdx++;
      continue;
    }

    // can use: fn1, fn2, fn3 (single-line) OR can use: (block with indented inline tools)
    // Note: `can` has canonical 'can', `use` has canonical 'use' (module import synonym)
    if ((dTokens[0].value === 'can' || dTokens[0].canonical === 'can') &&
        dTokens.length >= 2 && (dTokens[1].canonical === 'use' || dTokens[1].value === 'use')) {
      directives.tools = [];
      if (dTokens.length > 2) {
        // Single-line form: can use: fn1, fn2, fn3
        // Tokens after 'can use' are comma-separated identifiers
        for (let t = 2; t < dTokens.length; t++) {
          if (dTokens[t].type === TokenType.COMMA) continue;
          if (dTokens[t].type === TokenType.IDENTIFIER || dTokens[t].type === TokenType.KEYWORD) {
            directives.tools.push({ type: 'ref', name: dTokens[t].value });
          }
        }
        bodyStartIdx++;
      } else {
        // Block form: can use: with indented tool descriptions
        bodyStartIdx++;
        const toolIndent = lines[bodyStartIdx - 1].indent;
        while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > toolIndent) {
          const toolTokens = lines[bodyStartIdx].tokens;
          if (toolTokens.length > 0) {
            // Collect the raw text of the line as an inline tool description
            const desc = toolTokens.map(t => t.value).join(' ');
            directives.tools.push({ type: 'inline', description: desc });
          }
          bodyStartIdx++;
        }
      }
      continue;
    }

    // must not: (block form — one policy per indented line)
    if (dTokens[0].value === 'must' && dTokens.length >= 2 && dTokens[1].value === 'not') {
      directives.restrictions = [];
      bodyStartIdx++;
      const mustNotIndent = lines[bodyStartIdx - 1].indent;
      while (bodyStartIdx < lines.length && lines[bodyStartIdx].indent > mustNotIndent) {
        const policyTokens = lines[bodyStartIdx].tokens;
        if (policyTokens.length > 0) {
          const policyText = policyTokens.map(t => t.value).join(' ');
          // Categorize: delete/modify/access = compile-time, call more than/spend more than = runtime
          let category = 'compile';
          let limit = null;
          if (policyText.startsWith('delete')) category = 'delete';
          else if (policyText.startsWith('modify')) category = 'modify';
          else if (policyText.startsWith('access')) category = 'access';
          else if (policyText.includes('call more than')) {
            category = 'max_calls';
            const match = policyText.match(/call more than (\d+)/);
            if (match) limit = parseInt(match[1], 10);
          } else if (policyText.includes('spend more than')) {
            category = 'max_tokens';
            const match = policyText.match(/spend more than (\d+)/);
            if (match) limit = parseInt(match[1], 10);
          }
          directives.restrictions.push({ text: policyText, category, limit });
        }
        bodyStartIdx++;
      }
      continue;
    }

    // remember conversation context
    if (dTokens[0].value === 'remember' && dTokens.length >= 3 &&
        dTokens[1].value === 'conversation' && dTokens[2].value === 'context') {
      directives.rememberConversation = true;
      bodyStartIdx++;
      continue;
    }

    // remember user's preferences
    if (dTokens[0].value === 'remember' && dTokens.length >= 2 &&
        (dTokens[1].value === "user's" || (dTokens[1].value === 'user' && dTokens.length >= 3))) {
      directives.rememberPreferences = true;
      bodyStartIdx++;
      continue;
    }

    // Not a directive — stop scanning, rest is body code
    break;
  }

  // Parse indented body (starting after any consumed directives)
  const result = parseBlock(lines, bodyStartIdx, blockIndent, errors);

  if (result.body.length === 0 && !directives.trackDecisions) {
    errors.push({ line, message: `agent '${name}' is empty — add code inside. Example:\n  agent '${name}' receiving ${receivingVar}:\n    send back ${receivingVar}` });
  }

  return {
    node: {
      type: NodeType.AGENT, name, receivingVar, body: result.body, line,
      ...directives,
    },
    endIdx: result.endIdx,
  };
}

// Pipeline definition: pipeline 'Name' with var: + indented steps
// Each step: varname with 'Agent Name'
function parsePipeline(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip 'pipeline'

  // Parse pipeline name (must be a quoted string)
  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "pipeline needs a quoted name. Example: pipeline 'Process Data' with input:" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;
  pos++;

  // Parse 'with' keyword
  if (pos >= tokens.length || (tokens[pos].value !== 'with' && tokens[pos].canonical !== 'with')) {
    errors.push({ line, message: `pipeline '${name}' needs 'with' and an input variable. Example: pipeline '${name}' with data:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Parse input variable name
  if (pos >= tokens.length || (tokens[pos].type !== TokenType.IDENTIFIER && tokens[pos].type !== TokenType.KEYWORD)) {
    errors.push({ line, message: `pipeline '${name}' needs a variable name after 'with'. Example: pipeline '${name}' with data:` });
    return { node: null, endIdx: startIdx + 1 };
  }
  const inputVar = tokens[pos].value;

  // Parse indented steps — each step is an agent name in quotes
  // Syntax: 'Agent Name' on each line (just the quoted name)
  // OR: step_name with 'Agent Name' (if no synonym collision)
  const pipelineIndent = lines[startIdx].indent;
  const steps = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > pipelineIndent) {
    const stepTokens = lines[j].tokens;
    const stepLine = stepTokens.length > 0 ? stepTokens[0].line : j + 1;
    if (stepTokens.length === 1 && stepTokens[0].type === TokenType.STRING) {
      // Simple form: just 'Agent Name'
      const agentName = stepTokens[0].value;
      steps.push({ agentName, line: stepLine });
    } else if (stepTokens.length >= 2 &&
               stepTokens[stepTokens.length - 1].type === TokenType.STRING) {
      // Any form ending in a quoted string — the last token is the agent name
      // Handles: "step with 'Agent'" (3 tokens), "predict_with 'Agent'" (2 tokens from synonym collision)
      const agentName = stepTokens[stepTokens.length - 1].value;
      steps.push({ agentName, line: stepLine });
    } else if (stepTokens.length > 0) {
      errors.push({ line: stepLine, message: `Each pipeline step needs an agent name in quotes. Example: 'Classifier'` });
    }
    j++;
  }

  if (steps.length === 0) {
    errors.push({ line, message: `pipeline '${name}' is empty — add steps inside. Example:\n  pipeline '${name}' with ${inputVar}:\n    'Classifier'\n    'Scorer'` });
  }

  return {
    node: { type: NodeType.PIPELINE, name, inputVar, steps, line },
    endIdx: j,
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

  return { node: forEachNode(variable, iterExpr.node, body, line), endIdx };
}

function parseWhileLoop(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;

  // Parse condition (everything after "while")
  const condExpr = parseExpression(tokens, 1, line);
  if (condExpr.error) {
    errors.push({ line, message: condExpr.error });
    return { node: null, endIdx: startIdx + 1 };
  }

  // Parse indented body
  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: 'The while loop is empty — it needs code inside to run. Indent some code below it. Example:\n  while count is less than 10:\n    increase count by 1' });
  }

  return { node: whileNode(condExpr.node, body, line), endIdx };
}

// Detects whether a "display" line has Phase 4 modifiers (as/called)
function hasDisplayModifiers(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].canonical === 'as_format' || tokens[i].canonical === 'called') return true;
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
const INLINE_MODIFIERS = {
  // Layout
  'two column layout': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr', gap: '1.5rem' } },
  'three column layout': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr 1fr', gap: '1.5rem' } },
  'four column layout': { prop: 'display', val: 'grid', extra: { 'grid-template-columns': '1fr 1fr 1fr 1fr', gap: '1.5rem' } },
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
    // Check for "with style <name>" (explicit style reference)
    if ((tokens[pos].value === 'with' || tokens[pos].canonical === 'with') &&
        pos + 1 < tokens.length && (tokens[pos + 1].value === 'style' || tokens[pos + 1].canonical === 'style')) {
      pos += 2;
      if (pos < tokens.length) styleName = tokens[pos].value;
    } else {
      // Parse inline modifiers: everything after the title, separated by commas
      // Skip leading 'as' or 'with'
      if (tokens[pos].value === 'as' || tokens[pos].canonical === 'as_format' ||
          tokens[pos].value === 'with' || tokens[pos].canonical === 'with') pos++;
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
      // Check for "Npx wide" pattern
      const wideMatch = modText.match(/(\d+)\s*px\s*wide/);
      if (wideMatch) {
        inlineModifiers.push({ custom: true, props: { width: wideMatch[1] + 'px', 'flex-shrink': '0' } });
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
    if (propTokens.length >= 2 && (propTokens[1].type === TokenType.ASSIGN || propTokens[1].canonical === 'is')) {
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
  return ['text_input', 'number_input', 'file_input', 'dropdown', 'checkbox', 'text_area'].includes(token.canonical);
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
    link: 'link',
    code_block: 'code',
  };
  const contentType = contentTypeMap[canonical] || 'text';

  // For links: link 'Learn more' to '/about'
  let href = null;
  if (contentType === 'link') {
    if (pos < tokens.length && tokens[pos].canonical === 'to_connector') {
      pos++;
      if (pos < tokens.length && tokens[pos].type === TokenType.STRING) {
        href = tokens[pos].value;
      }
    }
  }

  const node = contentNode(contentType, text, line, href);
  if (textExpr) node.textExpr = textExpr;
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
    if (firstCanonical === 'anyone' || firstCanonical === 'owner' || firstCanonical === 'same_org' ||
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

    // Parse modifiers: required, unique, default 'x', auto
    let required = false;
    let unique = false;
    let auto = false;
    let defaultValue = null;

    while (fPos < fieldTokens.length) {
      if (fieldTokens[fPos].type === TokenType.COMMA) { fPos++; continue; }
      if (fieldTokens[fPos].type === TokenType.COMMENT) break;

      const mod = typeof fieldTokens[fPos].value === 'string' ? fieldTokens[fPos].value.toLowerCase() : '';
      if (mod === 'required') { required = true; fPos++; }
      else if (mod === 'unique') { unique = true; fPos++; }
      else if (mod === 'auto') { auto = true; fPos++; }
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

    fields.push({
      name: fieldName, fieldType, line: fieldLine,
      required, unique, auto, defaultValue, fk,
    });
    j++;
  }

  if (fields.length === 0) {
    errors.push({ line, message: `The ${name} table is empty -- add fields inside. Example:\n  create a ${name} table:\n    name, required\n    email, required, unique` });
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
  // Optional "all"
  let lookupAll = false;
  if (pos < tokens.length && (typeof tokens[pos].value === 'string' && tokens[pos].value.toLowerCase() === 'all')) {
    lookupAll = true;
    pos++;
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
  return { name, isCrud: true, node };
}

// CRUD in assignment context: new_todo = save incoming as Todo
function parseSaveAssignment(name, tokens, pos, line) {
  pos++; // skip "save"
  let variable = 'incoming';
  if (pos < tokens.length && tokens[pos].type !== TokenType.COMMENT) {
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
  return { name, isCrud: true, node };
}

// =============================================================================
// TEST BLOCKS (Phase 11)
// =============================================================================

function parseTestDef(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1; // skip "test"

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: 'The test needs a name in quotes. Example: test \'addition works\':' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);

  if (body.length === 0) {
    errors.push({ line, message: `The test "${name}" is empty — add assertions inside.` });
  }

  return { node: testDefNode(name, body, line), endIdx };
}

function parseExpect(tokens, line) {
  const pos = 1; // skip "expect"
  const expr = parseExpression(tokens, pos, line);
  if (expr.error) return { error: expr.error };
  return { node: expectNode(expr.node, line) };
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
  let exprEnd = tokens.length;
  for (let i = pos; i < tokens.length; i++) {
    if (tokens[i].canonical === 'as_format' || tokens[i].canonical === 'called') {
      exprEnd = i;
      break;
    }
  }

  const expr = parseExpression(tokens, pos, line, exprEnd);
  if (expr.error) return { error: expr.error };
  pos = exprEnd;

  // Optional: as <format>
  let format = 'text';
  if (pos < tokens.length && tokens[pos].canonical === 'as_format') {
    pos++;
    if (pos < tokens.length && (tokens[pos].type === TokenType.IDENTIFIER || tokens[pos].type === TokenType.KEYWORD)) {
      format = tokens[pos].value.toLowerCase();
      pos++;
    }
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
      const canon = tokens[pos].canonical;
      if (canon === 'remove') {
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
// CANONICAL: chart 'Title' as line showing data_var
// Also: chart 'Title' as bar showing data_var
//        chart 'Title' as pie showing data_var by field_name
//        chart 'Title' as area showing data_var

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

function parseUsageLimit(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "Usage limit needs a name. Example: limit 'ai_generations':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const name = tokens[pos].value;

  const tiers = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }
    const tierName = bodyTokens[0].value;
    let bPos = 1;
    if (bPos < bodyTokens.length && (bodyTokens[bPos].canonical === 'allows'
        || bodyTokens[bPos].value.toLowerCase() === 'allows')) bPos++;
    let count = null;
    let period = 'month';
    if (bPos < bodyTokens.length) {
      if (bodyTokens[bPos].canonical === 'unlimited'
          || (typeof bodyTokens[bPos].value === 'string' && bodyTokens[bPos].value.toLowerCase() === 'unlimited')) {
        count = -1;
        bPos++;
      } else if (bodyTokens[bPos].type === TokenType.NUMBER) {
        count = bodyTokens[bPos].value;
        bPos++;
        if (bPos < bodyTokens.length && bodyTokens[bPos].value.toLowerCase() === 'per') bPos++;
        if (bPos < bodyTokens.length) period = bodyTokens[bPos].value.toLowerCase();
      }
    }
    tiers.push({ tier: tierName, count, period });
    j++;
  }

  if (tiers.length === 0) {
    errors.push({ line, message: `Usage limit "${name}" has no tiers. Example:\n  limit '${name}':\n    free allows 5 per month\n    pro allows unlimited` });
  }

  return { node: usageLimitNode(name, tiers, line), endIdx: j };
}

// =============================================================================
// WEBHOOKS & OAUTH (Phase 17)
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

function parseOAuthConfig(lines, startIdx, blockIndent, errors) {
  const { tokens } = lines[startIdx];
  const line = tokens[0].line;
  let pos = 1;

  if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
    errors.push({ line, message: "OAuth needs a provider name. Example: oauth 'github':" });
    return { node: null, endIdx: startIdx + 1 };
  }
  const provider = tokens[pos].value;

  const config = {};
  let j = startIdx + 1;
  while (j < lines.length && lines[j].indent > blockIndent) {
    const bodyTokens = lines[j].tokens;
    if (bodyTokens.length === 0 || bodyTokens[0].type === TokenType.COMMENT) { j++; continue; }

    const key = bodyTokens[0].canonical || bodyTokens[0].value;
    let bPos = 1;
    if (bPos < bodyTokens.length && (bodyTokens[bPos].canonical === 'is'
        || bodyTokens[bPos].type === TokenType.ASSIGN
        || bodyTokens[bPos].value.toLowerCase() === 'are')) bPos++;

    if (bPos < bodyTokens.length) {
      if (bodyTokens[bPos].type === TokenType.LBRACKET) {
        const items = [];
        bPos++;
        while (bPos < bodyTokens.length && bodyTokens[bPos].type !== TokenType.RBRACKET) {
          if (bodyTokens[bPos].type === TokenType.STRING) items.push(bodyTokens[bPos].value);
          bPos++;
        }
        config[key] = items;
      } else {
        const expr = parseExpression(bodyTokens, bPos, bodyTokens[0].line);
        if (!expr.error) config[key] = expr.node;
      }
    }
    j++;
  }

  return { node: oauthConfigNode(provider, config, line), endIdx: j };
}

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
  let pos = 1; // skip "on"

  // Parse HTTP method
  if (pos >= tokens.length) {
    errors.push({ line, message: 'The endpoint needs an HTTP method — use GET, POST, PUT, or DELETE. Example: when user calls GET /api/users' });
    return { node: null, endIdx: startIdx + 1 };
  }
  const methodToken = tokens[pos];
  const method = methodToken.value.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    errors.push({ line, message: `"${methodToken.value}" isn't an HTTP method Clear recognizes — use GET, POST, PUT, or DELETE. Example: when user calls GET /api/users` });
    return { node: null, endIdx: startIdx + 1 };
  }
  pos++;

  // Extract path from raw source line to preserve :param syntax
  // Tokens lose the colon in :id, so we extract from raw text instead
  const rawLine = lines[startIdx].raw || '';
  const methodIdx = rawLine.toUpperCase().indexOf(method);
  let path = '';
  if (methodIdx >= 0) {
    // Everything after the method name is the path
    path = rawLine.slice(methodIdx + method.length).trim();
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
      params.push(tokens[pos].value);
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

  // Expect error handler line at same indent level:
  //   CANONICAL: "if there's an error:" (multi-word synonym → if_error)
  //   Aliases: "if error:", "handle the error", "handle", "catch"
  let handleBody = [];
  let errorVar = 'error';
  if (i < lines.length && lines[i].indent <= blockIndent) {
    const handleTokens = lines[i].tokens;
    if (handleTokens.length > 0 &&
        (handleTokens[0].canonical === 'if_error' || handleTokens[0].canonical === 'handle')) {
      const handleResult = parseBlock(lines, i + 1, blockIndent, errors);
      handleBody = handleResult.body;
      i = handleResult.endIdx;

      if (handleBody.length === 0) {
        errors.push({ line: handleTokens[0].line, message: 'The error handler is empty — it needs code to run when something goes wrong. Indent some code below it. Example:\n  if there\'s an error:\n    show "Something went wrong"' });
      }
    } else {
      errors.push({ line, message: 'Add "if there\'s an error:" after the try block. Example:\n  try:\n    risky_thing()\n  if there\'s an error:\n    show "Something went wrong"' });
    }
  } else {
    errors.push({ line, message: 'Add "if there\'s an error:" after the try block. Example:\n  try:\n    risky_thing()\n  if there\'s an error:\n    show "Something went wrong"' });
  }

  return { node: tryHandleNode(tryBody, handleBody, errorVar, line), endIdx: i };
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
    return { value: 'web_and_js_backend' };
  }
  if (phrase === 'web and python backend') {
    return { value: 'web_and_python_backend' };
  }
  // Backend-only with language: "javascript backend", "python backend"
  if (phrase === 'javascript backend' || phrase === 'js backend') {
    return { value: 'js_backend' };
  }
  if (phrase === 'python backend') {
    return { value: 'python_backend' };
  }

  // Simple targets
  const targetToken = tokens[pos];
  const canonical = targetToken.canonical || targetToken.value;
  if (['web', 'backend', 'both'].includes(canonical)) {
    return { value: canonical };
  }

  // Handle "both frontend and backend" as alias
  if (canonical === 'both' || phrase.includes('frontend') && phrase.includes('backend')) {
    return { value: 'both' };
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

  // Check for "ask ai/claude 'prompt'" on the right side of assignment
  // e.g. answer = ask ai 'Summarize this' with context_data
  // e.g. answer = ask claude 'Summarize this' with context_data
  if (pos < tokens.length && tokens[pos].value === 'ask' &&
      pos + 1 < tokens.length && (tokens[pos + 1].value === 'ai' || tokens[pos + 1].value === 'claude')) {
    pos += 2; // skip 'ask ai' / 'ask claude'
    if (pos >= tokens.length || tokens[pos].type !== TokenType.STRING) {
      return { error: "ask ai needs a quoted prompt. Example: answer = ask ai 'Summarize this' with data" };
    }
    const prompt = literalString(tokens[pos].value, line);
    pos++;
    let context = null;
    if (pos < tokens.length && (tokens[pos].value === 'with' || tokens[pos].canonical === 'with')) {
      pos++;
      // Parse context, but stop before 'returning' or 'using' if present
      const stopIdx = tokens.findIndex((t, i) => i >= pos && (t.value === 'returning' || t.value === 'using'));
      const endPos = stopIdx >= 0 ? stopIdx : undefined;
      const expr = parseExpression(tokens, pos, line, endPos);
      if (expr.error) return { error: expr.error };
      context = expr.node;
      pos = expr.nextPos;
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
    // Check for "returning:" at end of line (structured output schema follows as indented block)
    let hasSchema = false;
    if (pos < tokens.length && tokens[pos].value === 'returning') {
      hasSchema = true;
    }
    return { name, expression: { type: NodeType.ASK_AI, prompt, context, model, line }, hasSchema };
  }

  // Check for "call pipeline 'Name' with data" on the right side of assignment
  // e.g. result = call pipeline 'Process Inbound' with data
  // Must come BEFORE call 'Agent' check (call + STRING)
  if (pos < tokens.length && tokens[pos].value === 'call' &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'pipeline' &&
      pos + 2 < tokens.length && tokens[pos + 2].type === TokenType.STRING) {
    pos += 2; // skip 'call pipeline'
    const pipelineName = tokens[pos].value;
    pos++;
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

  // Shorthand: "get all Todos" -> CRUD lookup all
  // Also: "get all Todos page 2, 25 per page" -> paginated lookup
  if (pos < tokens.length && tokens[pos].canonical === 'get_key' &&
      pos + 1 < tokens.length && tokens[pos + 1].value === 'all' &&
      pos + 2 < tokens.length) {
    const tableName = tokens[pos + 2].value;
    const node = crudNode('lookup', name, tableName, null, line);
    node.lookupAll = true;
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
    return { name, isCrud: true, node };
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
    return { node: literalString(tok.value, line), nextPos: pos + 1 };
  }

  // "current user" -> special variable reference to authenticated user
  if (tok.canonical === 'current_user') {
    return { node: variableRef('_current_user', line), nextPos: pos + 1 };
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

  if (tok.type === TokenType.OPERATOR && tok.value === '-') {
    const operand = parsePrimary(tokens, pos + 1, line, maxPos);
    if (operand.error) return operand;
    return {
      node: unaryOp('-', operand.node, line),
      nextPos: operand.nextPos,
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
