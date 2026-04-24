// Local syntax-only autocomplete for Clear.
//
// We don't ship the compiler in the LSP — full diagnostics come from the
// Compiler API. But round-trips kill autocomplete UX, so we run a tiny
// local scan that returns:
//   1. Static keywords (the ~80 most-used words in real Clear programs)
//   2. Component names defined in the open document (regex over `define component X`)
//   3. Function names defined in the open document (regex over `define function X`)
//   4. Page names defined in the open document (regex over `page 'X' at`)
//
// Goal is keystroke-cheap, not exhaustive. Full validation runs on save via
// the Compiler API, which catches whatever the local scan misses.

const KEYWORDS = [
  // Top-level
  'build', 'for', 'web', 'javascript', 'python', 'backend',
  'connect', 'to', 'database', 'theme', 'is', 'are',
  // Tables / data
  'table', 'has', 'integer', 'number', 'text', 'boolean', 'date',
  'belongs', 'has many', 'unique', 'required',
  // Endpoints
  'when', 'user', 'sends', 'gets', 'updates', 'deletes',
  'send', 'back', 'save', 'as', 'a', 'new',
  // Pages + UI
  'page', 'at', 'section', 'with', 'style',
  'heading', 'subheading', 'small', 'bold', 'italic',
  'show', 'display', 'as', 'cards', 'list', 'table', 'chart',
  'showing', 'and', 'or',
  // Forms
  'input', 'text input', 'number input', 'dropdown', 'checkbox',
  'saves to', 'saved as', 'placeholder',
  // Components
  'define', 'component', 'function', 'receiving',
  // Auth / users
  'needs login', 'requires login', 'current user',
  // Imports
  'use', 'everything', 'from',
  // Logic
  'if', 'otherwise', 'else',
  'for each', 'in', 'while', 'repeat', 'times', 'max',
  // Agents
  'ask', 'claude', 'agent', 'tools', 'knows about', 'remember',
  // Modifiers
  'top right', 'bottom right', 'centered', 'right aligned',
];

export function getCompletions(documentText, prefix) {
  const out = [];
  const seen = new Set();

  // Components defined in this file
  for (const match of documentText.matchAll(/^\s*define\s+component\s+([A-Z][A-Za-z0-9_]*)/gm)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push({ label: name, kind: 7, detail: 'component (defined in this file)' });
    }
  }

  // Functions defined in this file
  for (const match of documentText.matchAll(/^\s*define\s+function\s+([a-z_][A-Za-z0-9_]*)/gm)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push({ label: name, kind: 3, detail: 'function (defined in this file)' });
    }
  }

  // Pages defined in this file (for `go to page 'X'` style refs)
  for (const match of documentText.matchAll(/^\s*page\s+'([^']+)'/gm)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push({ label: `'${name}'`, kind: 21, detail: 'page (defined in this file)' });
    }
  }

  // Imported module names — if there's `use 'foo'`, suggest `foo's` for namespaced calls
  for (const match of documentText.matchAll(/^\s*use\s+'([^']+)'/gm)) {
    const ns = match[1].split('/').pop().replace(/\.clear$/, '');
    const label = `${ns}'s `;
    if (!seen.has(label)) {
      seen.add(label);
      out.push({ label, kind: 9, detail: `module '${match[1]}' — qualified call` });
    }
  }

  // Static keywords
  for (const kw of KEYWORDS) {
    if (!seen.has(kw)) {
      seen.add(kw);
      out.push({ label: kw, kind: 14, detail: 'keyword' });
    }
  }

  if (prefix && prefix.length > 0) {
    const lower = prefix.toLowerCase();
    return out.filter((c) => c.label.toLowerCase().startsWith(lower));
  }
  return out;
}

// Given a line and a character position, extract the identifier prefix
// the user is typing (the chunk that should be matched against completions).
export function extractPrefix(line, character) {
  let start = character;
  while (start > 0 && /[A-Za-z0-9_']/.test(line[start - 1])) start--;
  return line.slice(start, character);
}
