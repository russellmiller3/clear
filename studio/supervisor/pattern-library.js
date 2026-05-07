import { existsSync, readFileSync } from 'fs';
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

export function loadCoreTemplatePatterns(repoRoot = DEFAULT_REPO_ROOT, specs = CORE_TEMPLATE_SPECS) {
  return specs.map(spec => {
    const sourcePath = join(repoRoot, 'apps', spec.name, 'main.clear');
    if (!existsSync(sourcePath)) {
      throw new Error(`Canonical pattern template missing: apps/${spec.name}/main.clear`);
    }
    const source = readFileSync(sourcePath, 'utf8');
    const shape = computeShape(parse(source));
    return {
      template_name: spec.name,
      pattern_set: spec.pattern_set,
      title: spec.title,
      description: spec.description,
      archetype: shape.archetype,
      shape_signature: shape,
      feature_tags: spec.feature_tags,
      source,
    };
  });
}

export function seedCoreTemplatePatterns(factorDB, repoRoot = DEFAULT_REPO_ROOT, specs = CORE_TEMPLATE_SPECS) {
  if (!factorDB || typeof factorDB.upsertProgrammingPattern !== 'function') {
    throw new Error('seedCoreTemplatePatterns requires a FactorDB with upsertProgrammingPattern()');
  }
  const patterns = loadCoreTemplatePatterns(repoRoot, specs);
  for (const pattern of patterns) factorDB.upsertProgrammingPattern(pattern);
  return {
    seeded: patterns.length,
    names: patterns.map(p => p.template_name),
    patterns,
  };
}
