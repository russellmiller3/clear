// =============================================================================
// CLEAR LANGUAGE — SYNONYM TABLE
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. When Claude builds a web app or data app, it writes Clear. The human
// can open the source and understand what was built without knowing JavaScript,
// Python, CSS, or SQL. Clear is the readable contract between AI and human.
//
// The 14-year-old test is the readability bar, not the audience. If a
// 14-year-old can read it, a busy founder definitely can.
//
// Clear will expand to cover styling, data models, API routes, auth, and
// deployment. Not a toy — a real full-stack language that reads like English.
//
// =============================================================================
//
// Multiple English words map to the same canonical token.
// This table is FROZEN — adding a synonym is a language version change.
//
// CONTEXT-SENSITIVE TOKENS:
//   "is" — In statement position, means assignment (=).
//          In expression/condition position, means comparison (==).
//          Multi-word forms ("is greater than") are always comparison.
//   "to" — At line start: function definition alias ("to greet with name").
//          After a name: assignment connector ("set x to 5").
//
// =============================================================================

// Each entry: canonicalToken → [synonyms]
// The canonical token is always the first entry in its own synonym list.
const SYNONYM_TABLE = Object.freeze({

  // ---------------------------------------------------------------------------
  // Assignment / creation
  // ---------------------------------------------------------------------------
  set: Object.freeze(['set', 'create', 'initialize', 'make', 'let']),

  // ---------------------------------------------------------------------------
  // Output / display
  // ---------------------------------------------------------------------------
  show: Object.freeze(['show', 'display', 'print', 'log']),

  // ---------------------------------------------------------------------------
  // Conditionals
  // ---------------------------------------------------------------------------
  if: Object.freeze(['if', 'when', 'check']),
  then: Object.freeze(['then', 'do']),
  otherwise: Object.freeze(['otherwise', 'else', 'or else']),

  // ---------------------------------------------------------------------------
  // Loops
  // ---------------------------------------------------------------------------
  repeat: Object.freeze(['repeat', 'loop']),
  for_each: Object.freeze(['for each', 'for every']),
  while: Object.freeze(['while', 'as long as']),
  in: Object.freeze(['in', 'of', 'from']),
  break: Object.freeze(['break', 'stop', 'exit loop']),
  continue: Object.freeze(['continue', 'skip', 'next']),

  // ---------------------------------------------------------------------------
  // Increment / decrement (friendly loop patterns)
  // ---------------------------------------------------------------------------
  increase: Object.freeze(['increase', 'increment', 'add to', 'raise']),
  decrease: Object.freeze(['decrease', 'decrement', 'subtract from', 'lower']),
  by: Object.freeze(['by']),

  // ---------------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------------
  // NOTE: "to" is handled by the parser as a context-sensitive alias for "function"
  // (e.g., "to greet with name" = "function greet with name")
  // It's not in this list because it conflicts with "to_connector" (set x to 5).
  // CANONICAL: "define function greet with input name"
  // "define" is its own canonical — parser handles "define function" as a two-token pattern.
  // "function", "action", "to" are silent aliases that work on their own.
  define: Object.freeze(['define']),
  function: Object.freeze(['function', 'action', 'procedure']),
  return: Object.freeze(['return', 'give back']),
  with: Object.freeze(['with', 'using', 'given', 'taking']),
  input_param: Object.freeze(['input', 'inputs', 'argument', 'arguments', 'parameter', 'parameters']),

  // ---------------------------------------------------------------------------
  // Boolean / comparison
  // ---------------------------------------------------------------------------
  // NOTE: bare "is" is NOT listed here — it is context-sensitive.
  // The tokenizer emits it as canonical "is", and the parser decides:
  //   statement position → assignment (=)
  //   expression position → comparison (==)
  // Multi-word forms are always comparison (handled by greedy matching).
  is: Object.freeze(['is', 'equals', 'equal to', '==']),
  'is not': Object.freeze(['is not', 'not equal to', 'differs from', '!=']),
  'is greater than': Object.freeze(['is greater than', 'is more than', 'exceeds', '>']),
  'is less than': Object.freeze(['is less than', 'is fewer than', 'is under', '<']),
  'is at least': Object.freeze(['is at least', 'is greater than or equal to', '>=']),
  'is at most': Object.freeze(['is at most', 'is less than or equal to', '<=']),
  and: Object.freeze(['and', 'also', '&&']),
  or: Object.freeze(['or', '||']),
  not: Object.freeze(['not', '!']),
  true: Object.freeze(['true', 'yes', 'on', 'checked']),
  false: Object.freeze(['false', 'no', 'off', 'unchecked']),

  // ---------------------------------------------------------------------------
  // List operations
  // ---------------------------------------------------------------------------
  list: Object.freeze(['list', 'array', 'collection', 'group']),
  add: Object.freeze(['add', 'append', 'push', 'insert']),
  remove: Object.freeze(['remove', 'delete', 'drop']),
  length: Object.freeze(['length', 'size', 'count']),

  // ---------------------------------------------------------------------------
  // Math (friendly names — symbols handled separately by tokenizer)
  // ---------------------------------------------------------------------------
  plus: Object.freeze(['plus', 'added to']),
  minus: Object.freeze(['minus', 'subtracted from', 'less']),
  times_op: Object.freeze(['times', 'multiplied by']),
  divided_by: Object.freeze(['divided by', 'over']),
  remainder: Object.freeze(['remainder', 'modulo', 'mod', '%']),
  power: Object.freeze(['power', 'to the power of', 'raised to', '**']),
  round: Object.freeze(['round', 'rounded']),

  // ---------------------------------------------------------------------------
  // Aggregation (friendly + terse, inherited from Cast)
  // ---------------------------------------------------------------------------
  sum: Object.freeze(['sum', 'total']),
  average: Object.freeze(['average', 'avg', 'mean']),
  minimum: Object.freeze(['minimum', 'min', 'smallest', 'lowest']),
  maximum: Object.freeze(['maximum', 'max', 'largest', 'highest']),
  median: Object.freeze(['median', 'middle value']),

  // ---------------------------------------------------------------------------
  // App target declaration
  // CANONICAL: "build for web" / "build for backend" / "build for both"
  // ---------------------------------------------------------------------------
  build: Object.freeze(['build', 'compile']),
  for_target: Object.freeze(['for']),
  target: Object.freeze(['target']),
  web: Object.freeze(['web', 'javascript', 'js', 'frontend']),
  backend: Object.freeze(['backend', 'python', 'py', 'server']),
  both: Object.freeze(['both', 'all', 'universal', 'both frontend and backend']),

  // ---------------------------------------------------------------------------
  // Error handling
  // CANONICAL: "try:" + indented block, then "if there's an error:" + indented block
  // ---------------------------------------------------------------------------
  try: Object.freeze(['try', 'attempt']),
  if_error: Object.freeze(["if there's an error", "if error", 'handle the error', 'handle', 'catch']),
  finally: Object.freeze(['finally', 'always do', 'after everything']),

  // ---------------------------------------------------------------------------
  // Modules (Phase 3)
  // CANONICAL: use "helpers"
  // ---------------------------------------------------------------------------
  use: Object.freeze(['use', 'import', 'include', 'load']),

  // ---------------------------------------------------------------------------
  // Web app features (Phase 4)
  // CANONICAL: page "My App" / ask for price as number called "Price" /
  //            display total as dollars called "Total" / button "Click Me"
  // ---------------------------------------------------------------------------
  page: Object.freeze(['page', 'screen', 'view']),
  section: Object.freeze(['section', 'group']),
  style: Object.freeze(['style']),
  theme: Object.freeze(['theme']),
  ask_for: Object.freeze(['ask for']),
  // New input syntax (canonical): text input, number input, dropdown, checkbox, text area
  text_input: Object.freeze(['text input']),
  number_input: Object.freeze(['number input']),
  file_input: Object.freeze(['file input', 'file upload']),
  dropdown: Object.freeze(['dropdown', 'select']),
  checkbox: Object.freeze(['checkbox']),
  text_area: Object.freeze(['text area', 'textarea']),
  rich_text: Object.freeze(['text editor', 'rich text editor', 'rich text', 'rich editor']),
  saves_to: Object.freeze(['saves to', 'saved as']),
  // Static content elements
  heading: Object.freeze(['heading']),
  subheading: Object.freeze(['subheading', 'subtitle']),
  content_text: Object.freeze(['text']),
  bold_text: Object.freeze(['bold text', 'strong text']),
  italic_text: Object.freeze(['italic text', 'emphasized text']),
  small_text: Object.freeze(['small text', 'fine print']),
  label_text: Object.freeze(['field label', 'eyebrow', 'caption']),
  badge_text: Object.freeze(['badge', 'status badge', 'chip']),
  link: Object.freeze(['link', 'hyperlink']),
  divider: Object.freeze(['divider', 'separator', 'horizontal rule']),
  image: Object.freeze(['image']),
  video: Object.freeze(['video', 'video player']),
  audio: Object.freeze(['audio', 'audio player']),
  code_block: Object.freeze(['code block', 'code example']),
  // NOTE: "display" is shared between show (synonym) and Phase 4 display.
  // The parser checks context: "display X as Y called Z" → Phase 4 DISPLAY node.
  // "display X" → show (same as "show X").
  button: Object.freeze(['button']),
  as_format: Object.freeze(['as']),

  // ---------------------------------------------------------------------------
  // Backend features (Phase 5)
  // CANONICAL: when user calls GET /api/users: / send back data
  // ---------------------------------------------------------------------------
  when_user_calls: Object.freeze(['when user calls', 'when user requests', 'when user sends', 'when user updates', 'when user deletes', 'when someone requests', 'when someone sends', 'when someone updates', 'when someone deletes']),
  on_method: Object.freeze(['on']),
  send_back: Object.freeze(['send back', 'respond with', 'reply with']),
  send_error: Object.freeze(['send error', 'throw error', 'fail with', 'raise error']),
  respond: Object.freeze(['respond', 'send', 'reply']),
  status_code: Object.freeze(['status']),

  // ---------------------------------------------------------------------------
  // Miscellaneous keywords
  // ---------------------------------------------------------------------------
  // Data shapes + CRUD (Phase 9)
  data_shape: Object.freeze(['data shape', 'table']),
  save_to: Object.freeze(['save']),
  look_up: Object.freeze(['look up']),
  records_in: Object.freeze(['records in', 'record in']),
  remove_from: Object.freeze(['remove from']),
  where: Object.freeze(['where']),

  // Testing (Phase 11)
  test: Object.freeze(['test']),
  eval_block: Object.freeze(['eval']),
  expect: Object.freeze(['expect']),

  // Deployment (Phase 12)
  deploy_to: Object.freeze(['deploy to']),

  // Auth & Roles (Phase 13)
  requires_auth: Object.freeze(['requires auth', 'this endpoint requires auth']),
  requires_role: Object.freeze(['requires role', 'this endpoint requires role']),
  define_role: Object.freeze(['define role']),
  guard: Object.freeze(['guard']),
  // `has tool` / `has tools` is the canonical form for listing an agent's
  // or skill's callable functions. `can` and `can use` are legacy aliases
  // kept working for backward compatibility.
  can: Object.freeze(['has tools', 'has tool', 'can use', 'can']),

  // RLS (Phase 15)
  same_org: Object.freeze(['same org']),
  anyone: Object.freeze(['anyone']),
  owner: Object.freeze(['owner']),

  // Routing
  at: Object.freeze(['at']),

  called: Object.freeze(['called', 'named']),
  to_connector: Object.freeze(['to']),
  // NOTE: 'a', 'an', 'the' are reserved articles. They cannot be used as variable names.
  // This is intentional — single-letter variable names are bad practice in Clear.
  a: Object.freeze(['a', 'an']),
  the: Object.freeze(['the']),
  nothing: Object.freeze(['nothing', 'null', 'none', 'empty', 'missing']),

  // Input validation (Phase 16)
  validate: Object.freeze(['validate', 'check incoming']),
  responds_with: Object.freeze(['responds with', 'returns']),
  rate_limit: Object.freeze(['rate limit', 'throttle']),
  matches: Object.freeze(['matches', 'looks like', 'is valid']),
  one_of: Object.freeze(['one of', 'must be']),

  // Webhooks (Phase 17 — `oauth` keyword removed 2026-04-21, zero app usage; use record literal)
  webhook: Object.freeze(['webhook', 'hook']),
  signed_with: Object.freeze(['signed with', 'verified with']),

  // Billing & Payments (Phase 18 — `limit` / `allows` / `unlimited` keywords removed 2026-04-21 with USAGE_LIMIT, zero app usage)
  checkout: Object.freeze(['checkout', 'payment']),

  // File Uploads & External APIs (Phase 19)
  accept_file: Object.freeze(['accept file', 'upload file']),
  data_from: Object.freeze(['data from', 'fetch from']),
  cache_for: Object.freeze(['cache for', 'remember for']),
  on_error_use: Object.freeze(['on error use', 'if error use', 'fallback']),

  // Frontend API calls (Phase 21)
  send_to: Object.freeze(['send to']),
  post_to: Object.freeze(['post to']),
  get_from: Object.freeze(['get from', 'load from']),
  put_to: Object.freeze(['put to', 'update to']),
  delete_from: Object.freeze(['delete from']),

  // Auth context (Phase 21)
  // Canonical form is `caller` — one word, unambiguous with entity vars.
  // `current user`, `authenticated user`, `logged in user` are legacy multi-word
  // forms kept for back-compat. `current_user` (underscore) is added because
  // Meph frequently writes it and today gets "undefined variable" — the
  // error was a DOC gap (Session 41 rejection analysis, row 1284).
  // All five resolve to the same `_current_user` runtime variable set by
  // `requires login`.
  current_user: Object.freeze(['caller', 'current user', 'authenticated user', 'logged in user', 'current_user']),

  // Components (Phase 21)
  component: Object.freeze(['component', 'widget', 'element']),
  receiving: Object.freeze(['sending', 'receiving', 'with props']),

  // Production hardening (Phase 21)
  log_requests: Object.freeze(['log every request', 'log all requests']),
  allow_cors: Object.freeze(['allow server to accept requests from frontend', 'accept requests from any website', 'allow cross-origin requests', 'enable cors']),
  auth_scaffold: Object.freeze(['allow signup and login', 'allow login and signup', 'allow sign up and login', 'allow login and sign up']),

  // Collection operations (Phase 21)
  sum_of: Object.freeze(['sum of', 'total of']),
  avg_of: Object.freeze(['avg of', 'average of', 'mean of']),
  count_of: Object.freeze(['count of', 'length of', 'size of']),
  max_of: Object.freeze(['max of', 'maximum of', 'largest of']),
  min_of: Object.freeze(['min of', 'minimum of', 'smallest of']),
  first_of: Object.freeze(['first of', 'first in']),
  last_of: Object.freeze(['last of', 'last in']),
  rest_of: Object.freeze(['rest of']),
  combine_with: Object.freeze(['combine', 'merge']),
  each: Object.freeze(['each']),

  sort_by: Object.freeze(['sort', 'order']),

  on_page_load: Object.freeze(['on page load', 'when page loads', 'on start']),
  // T2 #33 — scroll event handler. Optional trailing `every Nms`
  // becomes a throttle interval (handled in the parser handler).
  on_scroll: Object.freeze(['on scroll', 'on page scroll', 'on page scrolls', 'when page scrolls', 'when user scrolls']),
  match_kw: Object.freeze(['match', 'switch']),
  get_key: Object.freeze(['get']),
  key_exists: Object.freeze(['exists in', 'is in']),

  // Navigation (Phase 21)
  go_to: Object.freeze(['go to', 'navigate to']),

  // Database operations (Phase 21)
  update_database: Object.freeze(['update database', 'modify database', 'change database']),

  // Advanced features (Phase 20)
  stream: Object.freeze(['stream']),
  background_job: Object.freeze(['background job', 'worker']),
  runs_every: Object.freeze(['runs every']),
  subscribe_to: Object.freeze(['subscribe to', 'listen to']),
  migration_kw: Object.freeze(['migration', 'migrate']),
  add_column: Object.freeze(['add column']),
  remove_column: Object.freeze(['remove column', 'drop column']),
  wait_kw: Object.freeze(['wait', 'pause', 'delay']),

  // File I/O (Phase 21)
  read_file: Object.freeze(['read file', 'load file']),
  write_file: Object.freeze(['write file', 'save file']),
  append_to_file: Object.freeze(['append to file', 'add to file']),
  file_exists: Object.freeze(['file exists']),

  // JSON (Phase 21)
  parse_json: Object.freeze(['parse json', 'from json']),
  to_json: Object.freeze(['to json', 'as json']),

  // Regex (Phase 21)
  find_pattern: Object.freeze(['find pattern', 'find all matches of']),
  matches_pattern: Object.freeze(['matches pattern', 'test pattern']),
  replace_pattern: Object.freeze(['replace pattern']),

  // Date/Time (Phase 21)
  current_time: Object.freeze(['current time', 'current date', 'now']),
  format_date: Object.freeze(['format date']),
  days_between: Object.freeze(['days between']),

  // Data operations (Phase 22)
  load_csv: Object.freeze(['load csv', 'read csv', 'open csv']),
  save_csv: Object.freeze(['save csv', 'write csv', 'export csv']),
  filter_where: Object.freeze(['filter']),
  group_by: Object.freeze(['group by']),
  // NOTE: 'count by' is NOT a synonym — it collides with 'increase count by 1'.
  // Instead, the parser checks for the token sequence [count_of, identifier, 'by']
  // directly in the assignment handler.
  unique_values: Object.freeze(['unique values of', 'distinct values of']),

  // Database adapter (Phase 23)
  connect_to_database: Object.freeze(['connect to database', 'connect to db']),
  raw_query: Object.freeze(['query']),
  raw_run: Object.freeze(['run']),

  // Email adapter (Phase 24)
  configure_email: Object.freeze(['configure email', 'setup email']),
  // NOTE: 'send email' is NOT a synonym — it collides with 'send email to /api/...'
  // (API call: send VARIABLE to URL). Instead, the parser detects
  // 'send email:' (with colon = block) vs 'send email to URL' (API call).

  // Web scraper adapter (Phase 25)
  fetch_page: Object.freeze(['fetch page', 'scrape page', 'download page']),
  // NOTE: 'find all' and 'find first' are parsed by token sequence in the
  // assignment handler, not as synonyms — avoids collision with 'find pattern' (regex).

  // PDF adapter (Phase 26)
  create_pdf: Object.freeze(['create pdf', 'generate pdf', 'make pdf']),

  // ML adapter (Phase 27)
  train_model: Object.freeze(['train model', 'build model', 'fit model']),
  predict_with: Object.freeze(['predict with', 'classify with']),

  // Advanced features (Phase 28)
  text_block: Object.freeze(['text block', 'multiline text', 'text template']),
  do_all: Object.freeze(['do all', 'run all', 'all at once']),
  do_parallel: Object.freeze(['do these at the same time']),

  // External APIs (Phase 45)
  call_api: Object.freeze(['call api']),
  charge_via_stripe: Object.freeze(['charge via stripe']),
  send_sms_via_twilio: Object.freeze(['send sms via twilio']),
  // NOTE: 'send email via sendgrid' is NOT a synonym — collides with 'send email:' (SMTP).
  // Parser checks for 'via' token after 'send email' to disambiguate.
  needs_login: Object.freeze(['needs login', 'need login', 'requires login', 'this endpoint requires login']),
  broadcast_to_all: Object.freeze(['broadcast to all', 'broadcast to everyone']),

  // Self-synonyms — words with no alternate spellings that still need a canonical
  // value so the unified dispatch table can find them. Without these, a word like
  // 'database' has no .canonical and would need a separate RAW_DISPATCH map.
  database: Object.freeze(['database']),
  chart: Object.freeze(['chart']),
  nav: Object.freeze(['nav', 'navigation']),
  bar: Object.freeze(['bar']),
  line: Object.freeze(['line']),
  pie: Object.freeze(['pie']),
  area: Object.freeze(['area']),
  agent: Object.freeze(['agent']),
  script: Object.freeze(['script']),
  tab: Object.freeze(['tab']),
  stat: Object.freeze(['stat']),
  retry: Object.freeze(['retry']),
  first: Object.freeze(['first']),
  background: Object.freeze(['background']),
  every: Object.freeze(['every']),
  store: Object.freeze(['store']),
  restore: Object.freeze(['restore']),
  pipeline: Object.freeze(['pipeline']),
  skill: Object.freeze(['skill']),
  workflow: Object.freeze(['workflow']),
  policy: Object.freeze(['policy']),
  mock: Object.freeze(['mock']),
  toggle: Object.freeze(['toggle']),
  open: Object.freeze(['open']),
  close: Object.freeze(['close']),
  refresh: Object.freeze(['refresh', 'reload']),
  ask: Object.freeze(['ask']),
  call: Object.freeze(['call']),
  // give claude — canonical AI call form (replaces ask claude '...' with X).
  // Multi-word synonym so the tokenizer matches "give claude" as one token,
  // avoiding ambiguity with `give` used in other contexts. The verb is what
  // WE (the program) do to Claude. `ask` stays reserved for what the USER
  // does to the app (when user sends X to /api/...).
  give_claude: Object.freeze(['give claude']),
  // prompt — noun phrase introducing the instruction string in `give claude X
  // with prompt: 'Y'`. Canonical with trailing colon, parser also accepts bare
  // `with prompt 'X'`. The 14-year-old reads "with prompt 'foo'" as plain
  // English; the colon just signals "block-like content follows" consistent
  // with try:, validate:, etc.
  prompt: Object.freeze(['prompt']),
  should: Object.freeze(['should', 'does']),
  search: Object.freeze(['search']),
  block_arguments: Object.freeze(['block arguments matching', 'block arguments that match']),

  // TBD placeholder (Lean Lesson 1) — drop this anywhere a value or a block can
  // go. The compiler accepts it, records the line on the result, and emits a
  // tagged stub at runtime. Lets Meph leave one piece unfinished and keep
  // iterating on the rest of the program. Canonical is lowercase `tbd` because
  // tokenizer compares case-insensitively; Clear convention is "TBD" all-caps
  // in source so it stands out visually.
  tbd: Object.freeze(['tbd']),
});

// Build the reverse lookup: synonym string → canonical token
// e.g. "create" → "set", "display" → "show"
const REVERSE_LOOKUP = Object.freeze(
  Object.entries(SYNONYM_TABLE).reduce((map, [canonical, synonyms]) => {
    for (const syn of synonyms) {
      // Multi-word synonyms get stored as-is (matched by tokenizer as phrases)
      map[syn.toLowerCase()] = canonical;
    }
    return map;
  }, {})
);

// All multi-word synonyms, sorted longest-first for greedy matching
const MULTI_WORD_SYNONYMS = Object.freeze(
  Object.values(SYNONYM_TABLE)
    .flat()
    .filter(s => s.includes(' '))
    .sort((a, b) => b.length - a.length)
);

// Language version — bump this when synonyms change
const SYNONYM_VERSION = '0.35.0';

export { SYNONYM_TABLE, REVERSE_LOOKUP, MULTI_WORD_SYNONYMS, SYNONYM_VERSION };
