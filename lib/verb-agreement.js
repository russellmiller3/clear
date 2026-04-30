const BASE_ACTION_VERBS = new Set([
  'add',
  'call',
  'close',
  'copy',
  'create',
  'decrease',
  'delete',
  'download',
  'export',
  'filter',
  'get',
  'go',
  'hide',
  'increase',
  'load',
  'navigate',
  'open',
  'patch',
  'post',
  'put',
  'refresh',
  'reload',
  'remove',
  'restore',
  'save',
  'select',
  'send',
  'set',
  'show',
  'sort',
  'store',
  'toggle',
  'update',
  'upload',
]);

const IRREGULAR_THIRD_PERSON = new Map([
  ['go', 'goes'],
]);

function thirdPersonOf(baseVerb) {
  const verb = String(baseVerb || '').toLowerCase();
  if (IRREGULAR_THIRD_PERSON.has(verb)) return IRREGULAR_THIRD_PERSON.get(verb);
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh|o)$/.test(verb)) return verb + 'es';
  return verb + 's';
}

const THIRD_PERSON_TO_BASE = new Map(
  [...BASE_ACTION_VERBS].map(base => [thirdPersonOf(base), base])
);

function firstWord(text) {
  const match = String(text || '').match(/^(\s*)([A-Za-z]+)\b([\s\S]*)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    word: match[2],
    lower: match[2].toLowerCase(),
    rest: match[3] || '',
  };
}

function suggestionPreview(expectedVerb, rest) {
  const words = String(rest || '').trim().split(/\s+/).filter(Boolean);
  if (words[0]?.toLowerCase() === 'to') return `${expectedVerb} to`;
  if (words[0]) return `${expectedVerb} ${words[0]}`;
  return expectedVerb;
}

export function normalizeThirdPersonInteractionAction(text) {
  const hit = firstWord(text);
  if (!hit) return String(text || '');
  const base = THIRD_PERSON_TO_BASE.get(hit.lower);
  if (!base) return String(text || '');
  return `${hit.prefix}${base}${hit.rest}`;
}

export function checkInlineInteractionVerbAgreement(text, subject = 'button') {
  const hit = firstWord(text);
  if (!hit || !BASE_ACTION_VERBS.has(hit.lower)) return null;
  const expectedVerb = thirdPersonOf(hit.lower);
  const replacement = suggestionPreview(expectedVerb, hit.rest);
  return {
    verb: hit.word,
    expectedVerb,
    replacement,
    message: `Use "${replacement}" so the ${subject} reads as plain English: ${subject} that ${replacement}.`,
  };
}

