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
  'routes',
  'route',
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
  'deletes',
  'delete',
  'filters',
  'filter',
  'notifies',
  'notify',
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
  });

  if (shouldRequireApproval(userRequest) && normalized.length < 3) {
    errors.push('requirements need at least three observable lines for an underspecified app build.');
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
    'Return only a requirements block in this exact shape:',
    '',
    'requirements:',
    '  who can do what, under what condition',
    '  what data must be stored or shown',
    '  what routing, approval, rejection, or notification rule must hold',
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

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
