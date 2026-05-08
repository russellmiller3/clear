import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizeRequirementFacts } from './requirements-facts.js';

const COMPLEX_REQUEST_RE = /\b(what|how|build|create|make|add|modify|change|implement|wire|show|guard|route|filter|approve|reject|deploy)\b/i;
const CLEAR_SHAPE_RE = /\b(app|feature|shape|syntax|pattern|primitive|queue|approval|routing|route|workflow|agent|dashboard|table|endpoint|auth|login|manager|detail|selected-row|selected row|concurrency|optimistic lock|tenant|policy|rule)\b/i;

const PROMPT_SEARCH_GUARD =
  'For any user question asking for a Clear feature shape, syntax shape, or reusable pattern, you MUST call `browse_templates` with `action: "search"` before answering. This includes narrow approval questions such as threshold routing, selected-row detail, and approval manager gate. Reading docs is allowed after search, but not instead of search.';

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(block => typeof block === 'string' ? block : (block?.text || '')).join('\n');
  }
  return '';
}

function normalizeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/)
    .filter(token => token.length > 2);
}

function docExcerpt(text, query, maxChars = 1400) {
  const src = String(text || '');
  if (!src.trim()) return '';
  const lines = src.split(/\r?\n/);
  const terms = new Set(normalizeTokens(query));
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    let score = /^#{1,3}\s/.test(lines[i]) ? 0.5 : 0;
    for (const term of terms) {
      if (lower.includes(term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  let start = Math.max(0, bestIndex - 6);
  let end = Math.min(lines.length - 1, bestIndex + 18);
  while (end > start && lines.slice(start, end + 1).join('\n').length > maxChars) {
    if (bestIndex - start > end - bestIndex) start++;
    else end--;
  }
  return lines.slice(start, end + 1).join('\n').trim();
}

function readDocExcerpt(rootDir, filename, query) {
  const path = join(rootDir, filename);
  if (!existsSync(path)) return null;
  const excerpt = docExcerpt(readFileSync(path, 'utf8'), query);
  return excerpt ? { filename, excerpt } : null;
}

function searchTextForRequirements(userText, approvedRequirements = []) {
  const requirements = Array.isArray(approvedRequirements)
    ? approvedRequirements.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const facts = formatRequirementFactsForSearch(approvedRequirements);
  return [String(userText || '').trim(), ...requirements, facts].filter(Boolean).join('\n');
}

function formatRequirementFactsForSearch(approvedRequirements = []) {
  const facts = normalizeRequirementFacts(approvedRequirements);
  return facts.map(formatRequirementFact).filter(Boolean).join('\n');
}

function formatRequirementFact(fact) {
  if (fact.kind === 'domain_rule') {
    return `${fact.kind} ${fact.object} ${fact.condition} ${fact.expected}`;
  }
  if (fact.kind === 'storage') {
    const fields = Array.isArray(fact.fields) && fact.fields.length > 0
      ? ` fields ${fact.fields.join(' ')}`
      : '';
    return `${fact.kind} ${fact.object}${fields}`;
  }
  if (fact.kind === 'update') {
    return `${fact.kind} ${fact.object} ${fact.action}`;
  }
  if (fact.kind === 'ui_reachability') {
    return `${fact.kind} ${fact.object} ${fact.action}`;
  }
  return '';
}

function formatRequirementFactsForPrompt(approvedRequirements = []) {
  const facts = normalizeRequirementFacts(approvedRequirements);
  const lines = facts.map(fact => {
    if (fact.kind === 'domain_rule') return `- ${fact.kind}: ${fact.object} ${fact.condition} -> ${fact.expected}`;
    if (fact.kind === 'storage') return `- ${fact.kind}: ${fact.object}${fact.fields?.length ? ` (${fact.fields.join(', ')})` : ''}`;
    if (fact.kind === 'update') return `- ${fact.kind}: ${fact.object} ${fact.action}`;
    if (fact.kind === 'ui_reachability') return `- ${fact.kind}: ${fact.object} ${fact.action}`;
    return '';
  }).filter(Boolean);
  return lines.length ? lines.join('\n') : 'No typed facts extracted.';
}

function formatPattern(row, index) {
  const source = row.source_excerpt || row.source || '';
  const parent = row.parent_template_name ? ` parent=${row.parent_template_name}` : '';
  const kind = row.pattern_kind ? ` kind=${row.pattern_kind}` : '';
  const set = row.pattern_set ? ` set=${row.pattern_set}` : '';
  return [
    `### Pattern ${index + 1}: ${row.template_name}${parent}${kind}${set}`,
    '```clear',
    String(source).slice(0, 1200).trim(),
    '```',
  ].join('\n');
}

export function shouldRunPatternPreflight(userText) {
  const text = String(userText || '').trim();
  if (!text) return false;
  return COMPLEX_REQUEST_RE.test(text) && CLEAR_SHAPE_RE.test(text);
}

export function buildPatternPreflight({
  userText = '',
  approvedRequirements = [],
  currentSource = '',
  factorDB = null,
  rootDir = process.cwd(),
  topK = 5,
  mode = 'full',
} = {}) {
  const text = String(userText || '');
  const searchText = searchTextForRequirements(text, approvedRequirements);
  const required = shouldRunPatternPreflight(searchText);
  const normalizedMode = mode === 'docs' ? 'docs' : 'full';
  if (!required) return { required: false, mode: normalizedMode, text: '', docs: [], patterns: [] };

  const docs = ['SYNTAX.md', 'AI-INSTRUCTIONS.md']
    .map(filename => readDocExcerpt(rootDir, filename, searchText))
    .filter(Boolean);

  let patterns = [];
  if (normalizedMode === 'full' && factorDB && typeof factorDB.queryProgrammingPatterns === 'function') {
    try {
      patterns = factorDB.queryProgrammingPatterns({
        query: searchText,
        source: currentSource,
        topK,
      }) || [];
    } catch {
      patterns = [];
    }
  }

  const docText = docs.map(doc => [
    `### ${doc.filename}`,
    '```text',
    doc.excerpt,
    '```',
  ].join('\n')).join('\n\n');

  if (normalizedMode === 'docs') {
    return {
      required,
      mode: normalizedMode,
      docs,
      patterns: [],
      text: [
        '## Required Meph Docs Preflight',
        '',
        'This request looks like a complex Clear app, feature, or syntax-shape request.',
        'Before answering or editing, use these Clear doc excerpts. The server already loaded your system prompt.',
        '',
        '### Required doc excerpts',
        docText || 'No SYNTAX.md / AI-INSTRUCTIONS.md excerpts found.',
        '',
        'Use the syntax and AI instructions before answering or editing.',
      ].join('\n'),
    };
  }

  const patternText = patterns.length
    ? patterns.map(formatPattern).join('\n\n')
    : 'No pattern DB matches were available. Say that explicitly before proceeding.';
  const requirementText = Array.isArray(approvedRequirements) && approvedRequirements.length > 0
    ? approvedRequirements.map(item => `- ${item}`).join('\n')
    : 'No approved requirements were supplied.';
  const requirementFactText = formatRequirementFactsForPrompt(approvedRequirements);

  return {
    required,
    mode: normalizedMode,
    docs,
    patterns,
    text: [
      '## Required Meph Preflight Hook',
      '',
      'This request looks like a complex Clear app, feature, syntax-shape, or reusable-pattern request.',
      'Before answering or editing, use this context. The server already loaded your system prompt. These doc excerpts and pattern DB results are the required next context.',
      '',
      '### Required doc excerpts',
      docText || 'No SYNTAX.md / AI-INSTRUCTIONS.md excerpts found.',
      '',
      '### Approved requirements',
      requirementText,
      '',
      '### Machine-readable requirement facts',
      requirementFactText,
      '',
      '### Required pattern DB search results',
      patternText,
      '',
      'Use the pattern shape first. If you need more detail after this, call `browse_templates` search or `read_file`, but do not answer from memory alone.',
    ].join('\n'),
  };
}

export function appendPatternPreflightToMessages(messages, preflightText) {
  if (!preflightText) return Array.isArray(messages) ? [...messages] : [];
  const out = Array.isArray(messages) ? messages.map(message => ({ ...message })) : [];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]?.role !== 'user') continue;
    if (typeof out[i].content === 'string') {
      out[i].content = `${out[i].content}\n\n${preflightText}`;
    } else if (Array.isArray(out[i].content)) {
      out[i].content = [
        ...out[i].content,
        { type: 'text', text: preflightText },
      ];
    }
    return out;
  }
  return out;
}

export function stripPatternSearchPromptGuard(prompt) {
  return String(prompt || '')
    .replace(/\n?## Pattern search - fire it BEFORE writing unfamiliar syntax[\s\S]*?(?=\n## Workflow\n)/, '\n')
    .replace(PROMPT_SEARCH_GUARD, '')
    .replace(/\n\| A canonical \.clear example or reusable app pattern \|[^\n]+\n/, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function lastUserText(messages) {
  const lastUser = [...(Array.isArray(messages) ? messages : [])].reverse().find(m => m && m.role === 'user');
  return textFromContent(lastUser?.content);
}
