import { createHash } from 'node:crypto';

export const APP_BUILD_WORDS = Object.freeze([
  'app',
  'application',
  'dashboard',
  'tool',
  'portal',
  'queue',
  'workflow',
  'system',
]);

export const BUILD_VERBS = Object.freeze([
  'build',
  'create',
  'make',
  'generate',
  'scaffold',
  'ship',
]);

export const QUESTION_WORDS = Object.freeze([
  'what',
  'how',
  'which',
  'where',
  'why',
]);

export const VAGUE_REQUIREMENT_WORDS = Object.freeze([
  'robust',
  'works',
  'easy',
  'simple',
  'intuitive',
  'seamless',
  'nice',
  'good',
  'fast',
  'secure',
  'scalable',
  'reliable',
]);

export const OBSERVABLE_VERBS = Object.freeze([
  'can',
  'cannot',
  'must',
  'shows',
  'show',
  'sees',
  'see',
  'views',
  'view',
  'lists',
  'list',
  'routes',
  'route',
  'routed',
  'requires',
  'require',
  'rejects',
  'reject',
  'approves',
  'approve',
  'saves',
  'save',
  'stores',
  'store',
  'creates',
  'create',
  'updates',
  'update',
  'changes',
  'change',
  'deletes',
  'delete',
  'filters',
  'filter',
  'notifies',
  'notify',
  'notified',
  'exports',
  'export',
  'logs',
  'log',
]);

export function shouldRequireApproval(userText = '') {
  const text = normalizeText(userText);
  if (!text) return false;
  if (QUESTION_WORDS.some(word => text.startsWith(`${word} `))) return false;
  const explicitBuild = BUILD_VERBS.some(word => hasWord(text, word)) &&
    APP_BUILD_WORDS.some(word => hasWord(text, word));
  if (explicitBuild) return true;
  if (/\b(syntax|shape|pattern|example|snippet|how to)\b/.test(text)) return false;
  return false;
}

export function extractRequirementsDraft(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === 'requirements:');
  if (start === -1) return [];
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (!/^\s+/.test(line)) break;
    const item = normalizeRequirementLine(line);
    if (item) items.push(item);
  }
  return items;
}

export function validateRequirements(items = [], userRequest = '') {
  const normalized = Array.isArray(items)
    ? items.map(normalizeText).filter(Boolean)
    : [];
  const errors = [];

  if (normalized.length === 0) {
    errors.push('requirements block is empty');
  }

  normalized.forEach((item, index) => {
    const label = `Requirement ${index + 1}`;
    if (wordCount(item) < 5) {
      errors.push(`${label} is not observable: "${items[index]}" is too short to test.`);
      return;
    }
    if (VAGUE_REQUIREMENT_WORDS.some(word => hasWord(item, word))) {
      errors.push(`${label} is not observable: "${items[index]}" uses vague quality words.`);
      return;
    }
    if (!OBSERVABLE_VERBS.some(word => hasWord(item, word))) {
      errors.push(`${label} is not observable: "${items[index]}" needs an action Meph can test.`);
    }
    if (isCompoundRequirement(item)) {
      errors.push(`${label} is too broad: split "${items[index]}" into one observable claim per line.`);
    }
  });

  if (shouldRequireApproval(userRequest)) {
    if (normalized.length < 6) {
      errors.push('requirements need at least six e2e lines for an underspecified app build.');
    }
    for (const error of e2eCoverageErrors(normalized)) {
      errors.push(error);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    requirements: normalized,
    id: requirementsId(normalized),
  };
}

export function buildRequirementsInstruction(userText = '') {
  if (!shouldRequireApproval(userText)) return null;
  return [
    'Do not write Clear source yet.',
    'First translate the user request into specific, observable requirements.',
    'Requirements must be e2e. Cover the core CRUD/lifecycle path: data storage, create/submit, read/list/detail, update/decision, routing/roles, and visible UI reachability.',
    'Write one observable claim per line. Do not combine multiple behaviors with semicolons.',
    'Return only a requirements block in this exact shape:',
    '',
    'requirements:',
    '  who can create or submit what, from which form or page',
    '  what data must be stored',
    '  who can read, list, or inspect the records',
    '  who can update, approve, reject, delete, cancel, or archive records',
    '  what routing, role, threshold, notification, audit, or edge-case rule must hold',
    '  which visible UI page, button, form, table, or detail view proves the workflow is reachable',
    '',
    `User request: ${String(userText).trim()}`,
  ].join('\n');
}

export function requirementsReviewEventFromAssistantText(text = '', userRequest = '') {
  const requirements = extractRequirementsDraft(text);
  const validation = validateRequirements(requirements, userRequest);
  return {
    type: 'requirements_review',
    needsApproval: true,
    requirements,
    requirementsId: validation.id,
    valid: validation.ok,
    errors: validation.errors,
  };
}

export function requirementsId(items = []) {
  const normalized = Array.isArray(items)
    ? items.map(normalizeText).filter(Boolean).join('\n')
    : '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function normalizeRequirementLine(line) {
  return String(line)
    .trim()
    .replace(/^([-*]\s+|\d+[.)]\s+)/, '')
    .trim();
}

function normalizeText(text) {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

function wordCount(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function hasWord(text, word) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(text);
}

function isCompoundRequirement(text) {
  const normalized = normalizeText(text);
  if (normalized.includes(';')) return true;
  return false;
}

function e2eCoverageErrors(items) {
  const joined = items.join('\n');
  const checks = [
    {
      label: 'data storage',
      test: /\b(store|stores|save|saves|field|fields|table|data)\b/.test(joined),
    },
    {
      label: 'create/submit',
      test: /\b(create|creates|submit|submits|add|adds|send|sends)\b/.test(joined),
    },
    {
      label: 'read/list/detail',
      test: /\b(read|reads|see|sees|show|shows|view|views|list|lists|display|displays|detail|queue|table)\b/.test(joined),
    },
    {
      label: 'update/decision',
      test: /\b(update|updates|approve|approves|reject|rejects|change|changes|delete|deletes|cancel|cancels|archive|archives|status)\b/.test(joined),
    },
    {
      label: 'roles/routing/rules',
      test: /\b(role|roles|route|routes|routing|requires|require|approval|approver|manager|admin|threshold|assigned)\b/.test(joined),
    },
    {
      label: 'UI evidence',
      test: /\b(ui|page|pages|button|buttons|form|forms|screen|screens|visible|reachable|table|detail|navigation|nav)\b/.test(joined),
    },
  ];
  return checks
    .filter(check => !check.test)
    .map(check => `requirements need e2e coverage for ${check.label}.`);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
