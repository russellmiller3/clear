// =============================================================================
// EVAL SCENARIOS — shared source of truth for Meph tool eval
// =============================================================================
// Imported by both eval-meph.js (sequential) and eval-parallel.js (N workers).
// Single place to add/edit scenarios. Grading logic lives here too.
// =============================================================================

// Minimal Clear source that gives Meph something to work with across all
// scenarios. Expected to be passed as editorContent on every /api/chat POST.
export const DEMO_SOURCE = `build for javascript web and javascript backend

create a Todos table:
  title, required
  done, boolean, default false

when user calls GET /api/todos:
  todos = look up all Todos
  send back todos

when user calls POST /api/todos receiving data:
  validate data:
    title must not be empty
  save data to Todos
  send back data with status 201

when user calls DELETE /api/todos/:id:
  requires login
  delete Todo with this id
  send back 'ok' with status 204

page 'Todo App':
  heading 'My Todos'
  section:
    'Title' as text input saves to new_title
    button 'Add':
      send new_title to '/api/todos'

test 'posting a todo works':
  call POST /api/todos with title is 'Buy milk'
  expect response status is 201
  expect response body has id
`;

// Scenarios: prompt → expected tool → grader on tool-use + final response.
// Each scenario's grade function receives (toolCalls, finalText) and returns
// boolean. Tool-call names are grading signal; self-report text is diagnostic.
export const SCENARIOS = [
  {
    name: 'edit_code (write)',
    prompt: 'Replace the current editor source with this Clear program (exactly): a GET /api/hello endpoint that sends back "hi". Use edit_code with action=write.',
    expectTool: 'edit_code',
    grade: (calls) => calls.some(c => c.name === 'edit_code'),
  },
  {
    name: 'edit_code (read)',
    prompt: 'Tell me the first 3 lines of the current Clear source in the editor. Use edit_code action=read.',
    expectTool: 'edit_code',
    grade: (calls) => calls.some(c => c.name === 'edit_code'),
  },
  {
    name: 'compile',
    prompt: 'Compile the current source and tell me how many errors there are.',
    expectTool: 'compile',
    grade: (calls) => calls.some(c => c.name === 'compile'),
  },
  {
    name: 'run_app',
    prompt: 'Run the current app and tell me what port it started on.',
    expectTool: 'run_app',
    grade: (calls) => calls.some(c => c.name === 'run_app'),
  },
  {
    name: 'http_request',
    prompt: 'The app is running. Call GET /api/todos via http_request and tell me what came back.',
    expectTool: 'http_request',
    grade: (calls) => calls.some(c => c.name === 'http_request'),
  },
  {
    name: 'read_terminal',
    prompt: 'Read the terminal output and summarize the last few lines in one sentence.',
    expectTool: 'read_terminal',
    grade: (calls) => calls.some(c => c.name === 'read_terminal'),
  },
  {
    name: 'run_tests',
    prompt: 'Run all the tests for this app. Tell me pass/fail counts.',
    expectTool: 'run_tests',
    grade: (calls) => calls.some(c => c.name === 'run_tests'),
  },
  {
    name: 'read_file',
    prompt: 'Read the file SYNTAX.md (relative to repo root) and tell me the title of the first section.',
    expectTool: 'read_file',
    grade: (calls) => calls.some(c => c.name === 'read_file'),
  },
  {
    name: 'browse_templates',
    prompt: 'List all available Clear app templates.',
    expectTool: 'browse_templates',
    grade: (calls) => calls.some(c => c.name === 'browse_templates'),
  },
  {
    name: 'source_map',
    prompt: 'The editor source already compiles. Without reading any files or editing anything, call the source_map tool exactly once and return its raw output verbatim.',
    expectTool: 'source_map',
    grade: (calls) => calls.some(c => c.name === 'source_map'),
  },
  {
    name: 'highlight_code',
    prompt: 'Highlight lines 3 to 5 of the current editor for me.',
    expectTool: 'highlight_code',
    grade: (calls) => calls.some(c => c.name === 'highlight_code'),
  },
  {
    name: 'todo',
    prompt: 'Set your task list to: "check syntax", "compile", "run tests". Use the todo tool.',
    expectTool: 'todo',
    grade: (calls) => calls.some(c => c.name === 'todo'),
  },
  {
    name: 'read_actions',
    prompt: 'Check what actions the user has taken recently in the preview. Use read_actions.',
    expectTool: 'read_actions',
    grade: (calls) => calls.some(c => c.name === 'read_actions'),
  },
  {
    name: 'read_dom',
    prompt: 'Read the current DOM of the running app and tell me what heading is on the page.',
    expectTool: 'read_dom',
    grade: (calls) => calls.some(c => c.name === 'read_dom'),
  },
  {
    name: 'screenshot_output',
    prompt: 'Take a screenshot of the running app.',
    expectTool: 'screenshot_output',
    grade: (calls) => calls.some(c => c.name === 'screenshot_output'),
  },
  {
    name: 'stop_app',
    prompt: 'Stop the running app.',
    expectTool: 'stop_app',
    grade: (calls) => calls.some(c => c.name === 'stop_app'),
  },
];
