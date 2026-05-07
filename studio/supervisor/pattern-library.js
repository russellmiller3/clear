import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../../parser.js';
import { computeShape } from './program-shape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(__dirname, '..', '..');

export const CORE_TEMPLATE_SPECS = Object.freeze([
  {
    name: 'todo-fullstack',
    pattern_set: 'core',
    title: 'CRUD basics',
    description: 'Tables, endpoints, auth, validation, pages',
    feature_tags: ['crud', 'tables', 'endpoints', 'auth', 'validation', 'pages'],
  },
  {
    name: 'crm-pro',
    pattern_set: 'core',
    title: 'Data dashboard',
    description: 'Charts, filters, search, aggregates, multiple tables, has many',
    feature_tags: ['dashboard', 'charts', 'filters', 'search', 'aggregates', 'relationships'],
  },
  {
    name: 'blog-fullstack',
    pattern_set: 'core',
    title: 'Content app',
    description: 'belongs to, rich display, public and admin pages',
    feature_tags: ['content', 'belongs_to', 'public_pages', 'admin_pages'],
  },
  {
    name: 'live-chat',
    pattern_set: 'core',
    title: 'Real-time app',
    description: 'WebSocket, subscribe to, broadcast to all, auth',
    feature_tags: ['realtime', 'websocket', 'subscribe', 'broadcast', 'auth'],
  },
  {
    name: 'helpdesk-agent',
    pattern_set: 'core',
    title: 'AI agent',
    description: 'ask claude, has tools, knows about, remember conversation, guardrails, keyword search',
    feature_tags: ['agent', 'tools', 'rag', 'memory', 'guardrails', 'search'],
  },
  {
    name: 'booking',
    pattern_set: 'core',
    title: 'Workflow app',
    description: 'Multi-step logic, validation, relationships, scheduling',
    feature_tags: ['workflow', 'validation', 'relationships', 'scheduling'],
  },
  {
    name: 'expense-tracker',
    pattern_set: 'core',
    title: 'Personal app',
    description: 'CRUD, aggregates, charts, CSV export, categories',
    feature_tags: ['crud', 'aggregates', 'charts', 'csv_export', 'categories'],
  },
  {
    name: 'ecom-agent',
    pattern_set: 'core',
    title: 'E-commerce agent',
    description: 'Agent and chat UI, intent routing, skills, dashboard, RAG over products',
    feature_tags: ['ecommerce', 'agent', 'chat_ui', 'intent_routing', 'skills', 'dashboard', 'rag'],
  },
  {
    name: 'deal-desk',
    pattern_set: 'marcus',
    title: 'Discount approval with provable rules',
    description: 'Headline regulated-tier app: discount approval, audit trail, CRO sign-off',
    feature_tags: ['approval', 'rules', 'audit', 'cro', 'regulated_tier'],
  },
  {
    name: 'approval-queue',
    pattern_set: 'marcus',
    title: 'Generic approval workflow',
    description: 'Submit, queue, approve, reject, audit, notify',
    feature_tags: ['approval', 'queue', 'workflow', 'audit', 'notifications'],
  },
  {
    name: 'internal-request-queue',
    pattern_set: 'marcus',
    title: 'IT and ops request queue',
    description: 'Internal request intake, triage, assignment, status tracking',
    feature_tags: ['request_queue', 'triage', 'assignment', 'status_tracking'],
  },
  {
    name: 'onboarding-tracker',
    pattern_set: 'marcus',
    title: 'New-hire and customer onboarding',
    description: 'Onboarding checklist, owner assignment, milestones, progress tracking',
    feature_tags: ['onboarding', 'checklist', 'owners', 'milestones', 'progress'],
  },
  {
    name: 'lead-router',
    pattern_set: 'marcus',
    title: 'Lead routing logic',
    description: 'Lead intake, routing rules, assignment, sales operations',
    feature_tags: ['lead_routing', 'rules', 'assignment', 'revops'],
  },
]);

const PRIMITIVE_DETECTORS = Object.freeze([
  { kind: 'database', tags: ['database'], match: line => /^database\b/i.test(line) },
  { kind: 'data_table', tags: ['database', 'table', 'schema'], match: line => /^(?:create (?:a |an )?.+\btable|table\s+\w+):/i.test(line) },
  { kind: 'auth_scaffold', tags: ['auth', 'users', 'login'], match: line => /^allow\s+signup\s+and\s+login\b/i.test(line), maxLines: 12 },
  { kind: 'relationship', tags: ['database', 'relationship'], match: line => /\b(has many|belongs to)\b/i.test(line), maxLines: 8 },
  { kind: 'queue', tags: ['queue', 'workflow', 'approval', 'assignment', 'routing', 'reviewer', 'approver'], match: line => /^queue\s+for\b/i.test(line) },
  { kind: 'routing', tags: ['routing', 'rules', 'assignment'], match: line => /^route\s+\w+\s+by\b/i.test(line) },
  { kind: 'policy', tags: ['policy', 'security', 'rules'], match: line => /^policy\b/i.test(line), maxLines: 24 },
  { kind: 'proof', tags: ['proof', 'prover', 'policy'], match: line => /^prove\b/i.test(line), maxLines: 12 },
  { kind: 'rule', tags: ['rule', 'validation', 'policy'], match: line => /^rule\b/i.test(line) },
  { kind: 'validation', tags: ['validation', 'schema'], match: line => /^validate\s+\w+:/i.test(line) },
  { kind: 'endpoint', tags: ['endpoint', 'api', 'backend'], match: line => /^(when user|webhook\b)/i.test(line) },
  { kind: 'auth_guard', tags: ['auth', 'security'], match: line => /^requires\s+(login|auth|role|admin)\b/i.test(line) },
  { kind: 'page', tags: ['page', 'ui'], match: line => /^page\s+/i.test(line), maxLines: 36 },
  { kind: 'detail_panel', tags: ['ui', 'detail', 'selection'], match: line => /^detail panel for\b/i.test(line), maxLines: 28 },
  { kind: 'display_table', tags: ['ui', 'table', 'actions'], match: line => /^display\s+.+\s+as\s+table\b/i.test(line), maxLines: 24 },
  { kind: 'chart', tags: ['ui', 'chart', 'analytics'], match: line => /\b(chart|graph)\b/i.test(line), maxLines: 18 },
  { kind: 'filter', tags: ['ui', 'filter', 'search'], match: line => /\b(filter|search)\b/i.test(line), maxLines: 12 },
  { kind: 'export', tags: ['export', 'csv', 'report'], match: line => /\b(export|download)\b/i.test(line), maxLines: 12 },
  { kind: 'button_action', tags: ['ui', 'button', 'action'], match: line => /^(?:add\s+)?button\s+['"]/i.test(line), maxLines: 16 },
  { kind: 'row_action', tags: ['ui', 'table', 'action'], match: line => /^['"][^'"]+['"]\s+is\s+(primary|secondary|danger|ghost)\b/i.test(line), maxLines: 12 },
  { kind: 'input_control', tags: ['ui', 'input', 'form'], match: line => /(?:text input|number input|dropdown|checkbox|text area|textarea|select)\b/i.test(line), maxLines: 8 },
  { kind: 'agent', tags: ['agent', 'ai'], match: line => /^(agent\b|.*\bask claude\b|has tools:|knows about:|remember conversation|block arguments matching)/i.test(line), maxLines: 28 },
  { kind: 'realtime', tags: ['realtime', 'websocket'], match: line => /^(subscribe to|broadcast to all|stream\b|websocket\b)/i.test(line), maxLines: 18 },
  { kind: 'background', tags: ['background', 'schedule'], match: line => /^background\b/i.test(line), maxLines: 18 },
  { kind: 'test', tags: ['test', 'uat'], match: line => /^test\b/i.test(line), maxLines: 18 },
  { kind: 'component', tags: ['component', 'ui'], match: line => /^define component\b/i.test(line), maxLines: 28 },
]);

function lineIndent(line) {
  return (line.match(/^\s*/) || [''])[0].length;
}

function slugPart(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'pattern';
}

function leadingCommentStart(lines, startIndex) {
  let i = startIndex - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0) return startIndex;
  if (lines[i].trim().endsWith('*/')) {
    let j = i;
    while (j >= 0 && !lines[j].includes('/*')) j--;
    if (j >= 0 && startIndex - j <= 8) return j;
  }
  if (lines[i].trim().startsWith('//')) {
    let j = i;
    while (j >= 0 && lines[j].trim().startsWith('//')) j--;
    if (startIndex - (j + 1) <= 5) return j + 1;
  }
  return startIndex;
}

function capturePrimitiveBlock(lines, startIndex, detector) {
  const baseIndent = lineIndent(lines[startIndex]);
  const maxLines = detector.maxLines || 32;
  let endIndex = startIndex;
  for (let i = startIndex + 1; i < lines.length && i < startIndex + maxLines; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      endIndex = i;
      continue;
    }
    if (lineIndent(lines[i]) > baseIndent) {
      endIndex = i;
      continue;
    }
    break;
  }
  while (endIndex > startIndex && !lines[endIndex].trim()) endIndex--;
  const contextStart = leadingCommentStart(lines, startIndex);
  return {
    startIndex: contextStart,
    endIndex,
    source: lines.slice(contextStart, endIndex + 1).join('\n'),
  };
}

export function extractTemplatePrimitivePatterns(source, spec, shape = null) {
  const src = String(source || '');
  const lines = src.split(/\r?\n/);
  const parentName = spec.name || spec.template_name;
  const parentShape = shape || computeShape(parse(src));
  const primitives = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '*/' || trimmed === '/*') continue;
    const detector = PRIMITIVE_DETECTORS.find(d => d.match(trimmed));
    if (!detector) continue;
    const block = capturePrimitiveBlock(lines, i, detector);
    const key = `${detector.kind}:${block.startIndex}:${block.endIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    primitives.push({
      template_name: `${parentName}::${detector.kind}::${i + 1}::${slugPart(trimmed)}`,
      parent_template_name: parentName,
      pattern_kind: detector.kind,
      is_primitive: 1,
      pattern_set: spec.pattern_set,
      title: `${spec.title}: ${detector.kind.replace(/_/g, ' ')}`,
      description: `Primitive pattern from ${parentName}: ${trimmed}`,
      archetype: parentShape.archetype,
      shape_signature: parentShape,
      feature_tags: [...new Set([...(spec.feature_tags || []), detector.kind, ...detector.tags])],
      source: block.source,
      source_start_line: block.startIndex + 1,
      source_end_line: block.endIndex + 1,
    });
  }
  return primitives;
}

function titleFromName(name) {
  return String(name || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Template';
}

function descriptionFromSource(source, fallback = '') {
  const firstComment = String(source || '').match(/^#\s*(.+)$/m);
  if (firstComment) return firstComment[1].trim();
  const firstText = String(source || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('/*') && !line.startsWith('*') && line !== '*/');
  return firstText || fallback;
}

function safeShape(source) {
  try { return computeShape(parse(source)); }
  catch { return computeShape(null); }
}

export function discoverReferenceTemplateSpecs(repoRoot = DEFAULT_REPO_ROOT, canonicalSpecs = CORE_TEMPLATE_SPECS) {
  const appsDir = join(repoRoot, 'apps');
  const canonicalNames = new Set(canonicalSpecs.map(spec => spec.name));
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir)
    .filter(name => !canonicalNames.has(name))
    .filter(name => {
      try { return statSync(join(appsDir, name)).isDirectory() && existsSync(join(appsDir, name, 'main.clear')); }
      catch { return false; }
    })
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({
      name,
      pattern_set: 'reference',
      title: titleFromName(name),
      description: '',
      feature_tags: ['reference_template'],
    }));
}

export function loadTemplatePatterns(repoRoot = DEFAULT_REPO_ROOT, specs = CORE_TEMPLATE_SPECS) {
  return specs.map(spec => {
    const sourcePath = join(repoRoot, 'apps', spec.name, 'main.clear');
    if (!existsSync(sourcePath)) {
      throw new Error(`Canonical pattern template missing: apps/${spec.name}/main.clear`);
    }
    const source = readFileSync(sourcePath, 'utf8');
    const shape = safeShape(source);
    return {
      template_name: spec.name,
      pattern_set: spec.pattern_set,
      title: spec.title,
      description: spec.description || descriptionFromSource(source, spec.title),
      archetype: shape.archetype,
      shape_signature: shape,
      feature_tags: spec.feature_tags,
      source,
    };
  });
}

export function loadCoreTemplatePatterns(repoRoot = DEFAULT_REPO_ROOT, specs = CORE_TEMPLATE_SPECS) {
  return loadTemplatePatterns(repoRoot, specs);
}

export function loadReferenceTemplatePatterns(repoRoot = DEFAULT_REPO_ROOT, canonicalSpecs = CORE_TEMPLATE_SPECS) {
  return loadTemplatePatterns(repoRoot, discoverReferenceTemplateSpecs(repoRoot, canonicalSpecs));
}

export function seedCoreTemplatePatterns(factorDB, repoRoot = DEFAULT_REPO_ROOT, specs = CORE_TEMPLATE_SPECS, options = {}) {
  if (!factorDB || typeof factorDB.upsertProgrammingPattern !== 'function') {
    throw new Error('seedCoreTemplatePatterns requires a FactorDB with upsertProgrammingPattern()');
  }
  const includeReferencePrimitives = options.includeReferencePrimitives !== false;
  const patterns = loadCoreTemplatePatterns(repoRoot, specs);
  const primitives = [];
  for (const pattern of patterns) {
    factorDB.upsertProgrammingPattern({
      ...pattern,
      pattern_kind: 'app',
      is_primitive: 0,
      source_start_line: 1,
      source_end_line: pattern.source.split(/\r?\n/).length,
    });
    const spec = specs.find(s => s.name === pattern.template_name) || pattern;
    for (const primitive of extractTemplatePrimitivePatterns(pattern.source, spec, pattern.shape_signature)) {
      factorDB.upsertProgrammingPattern(primitive);
      primitives.push(primitive);
    }
  }
  const referencePatterns = includeReferencePrimitives ? loadReferenceTemplatePatterns(repoRoot, specs) : [];
  const referencePrimitives = [];
  for (const pattern of referencePatterns) {
    const spec = {
      name: pattern.template_name,
      pattern_set: 'reference',
      title: pattern.title,
      description: pattern.description,
      feature_tags: pattern.feature_tags,
    };
    for (const primitive of extractTemplatePrimitivePatterns(pattern.source, spec, pattern.shape_signature)) {
      factorDB.upsertProgrammingPattern(primitive);
      referencePrimitives.push(primitive);
    }
  }
  return {
    seeded: patterns.length,
    primitiveSeeded: primitives.length,
    referenceTemplateCount: referencePatterns.length,
    referencePrimitiveSeeded: referencePrimitives.length,
    names: patterns.map(p => p.template_name),
    patterns,
    primitives,
    referencePatterns,
    referencePrimitives,
  };
}
