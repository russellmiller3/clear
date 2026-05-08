const PASS = 'passed';
const MISSING = 'missing';

export function normalizeRequirementFacts(requirements = []) {
  return normalizeRequirementItems(requirements).flatMap(item => factsFromRequirement(item));
}

export function extractAppFacts({
  source = '',
  runtimeEvidence = null,
} = {}) {
  const lines = evidenceLinesFromSource(source);
  return [
    ...storageFactsFromLines(lines),
    ...endpointFactsFromLines(lines),
    ...domainRuleFactsFromLines(lines),
    ...uiFactsFromLines(lines),
    ...runtimeFacts(runtimeEvidence),
  ];
}

export function compareRequirementFacts(requirementFacts = [], appFacts = []) {
  return requirementFacts.map(requirement => {
    const matches = matchingAppFacts(requirement, appFacts);
    const evidenceItems = uniqueEvidence(matches.flatMap(match => match.evidence || []));
    if (matches.length > 0) {
      return {
        status: PASS,
        requirement,
        matches,
        evidence: evidenceItems,
        reason: `Found ${requirement.kind} evidence for ${requirement.object || 'the requirement'}.`,
      };
    }
    return {
      status: MISSING,
      requirement,
      matches: [],
      evidence: [],
      reason: `No ${requirement.kind} evidence found for ${requirement.object || 'the requirement'}.`,
    };
  });
}

function normalizeRequirementItems(requirements) {
  return (requirements || [])
    .map((item, index) => {
      if (typeof item === 'string') {
        return { id: `req_${index + 1}`, text: item };
      }
      return {
        id: item?.id || `req_${index + 1}`,
        text: item?.text || '',
      };
    })
    .filter(item => item.text.trim().length > 0);
}

function factsFromRequirement(item) {
  const text = normalizeText(item.text);
  const facts = [];

  const bookingObject = /\b(bookings?|reservations?|rooms?)\b/.test(text);
  const overlapCondition = /\b(double bookings?|overlap|overlaps|overlapping|same room|same-room|conflict|conflicts|time range)\b/.test(text);
  const rejectExpected = /\b(prevent|prevents|reject|rejects|block|blocks|cannot|cant|fail|fails|returns? 400|error)\b/.test(text);
  if (bookingObject && overlapCondition && rejectExpected) {
    facts.push({
      id: item.id,
      text: item.text,
      kind: 'domain_rule',
      object: 'booking',
      condition: 'overlap',
      expected: 'reject',
    });
  }

  const storedObjects = extractStoredObjects(text);
  for (const object of storedObjects) {
    facts.push({
      id: item.id,
      text: item.text,
      kind: 'storage',
      object,
      fields: [],
    });
  }

  const storedFields = extractStoredFields(text);
  if (storedFields) {
    facts.push({
      id: item.id,
      text: item.text,
      kind: 'storage',
      object: storedFields.object,
      fields: storedFields.fields,
    });
  }

  const decisionAction = /\b(approve|reject|cancel|archive|delete|update|change)\b/.exec(text);
  const decisionObject = objectFromText(text);
  if (decisionAction && decisionObject) {
    facts.push({
      id: item.id,
      text: item.text,
      kind: 'update',
      action: singularize(decisionAction[1]),
      object: decisionObject,
    });
  }

  if (/\b(page|button|form|table|detail|visible|reachable|nav|navigation)\b/.test(text)) {
    facts.push({
      id: item.id,
      text: item.text,
      kind: 'ui_reachability',
      object: decisionObject || objectFromText(text) || 'workflow',
      action: uiActionFromText(text),
    });
  }

  return facts;
}

function storageFactsFromLines(lines) {
  const facts = [];
  for (let i = 0; i < lines.length; i++) {
    const tableName = tableNameFromLine(lines[i].trimmed);
    if (!tableName) continue;
    const fields = [];
    const evidenceItems = [evidence(lines[i], 'source')];
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (candidate.indent <= lines[i].indent) break;
      const field = fieldNameFromLine(candidate.trimmed);
      if (!field) continue;
      fields.push(field);
      evidenceItems.push(evidence(candidate, 'source'));
    }
    facts.push({
      kind: 'storage',
      object: singularize(normalizeIdentifier(tableName)),
      fields,
      evidence: evidenceItems,
    });
  }
  return facts;
}

function endpointFactsFromLines(lines) {
  const facts = [];
  for (const line of lines) {
    const endpoint = line.normalized.match(/\bwhen user (?:sends|calls|updates|deletes)\b.*\s(\/api\/[a-z0-9_/:.-]+)/);
    if (!endpoint) continue;
    const verb = endpointVerb(line.normalized);
    facts.push({
      kind: verb,
      object: objectFromText(line.normalized),
      endpoint: endpoint[1],
      evidence: [evidence(line, 'source')],
    });
  }
  return facts;
}

function domainRuleFactsFromLines(lines) {
  const facts = [];
  const overlapLine = lines.find(line => isBookingOverlapLine(line.normalized));
  if (!overlapLine) return facts;

  const localLines = nearbyLines(lines, overlapLine.line, 4);
  const rejectLine = localLines.find(line => /\b(fail with error message|return 400|returns 400|reject|block|prevent|cannot save|error)\b/.test(line.normalized));
  const saveLine = localLines.find(line => /\bsave\b/.test(line.normalized));
  const bookingLine = localLines.find(line => /\b(bookings?|reservation|room_id)\b/.test(line.normalized));
  if (rejectLine) {
    facts.push({
      kind: 'domain_rule',
      object: 'booking',
      condition: 'overlap',
      expected: 'reject',
      evidence: uniqueEvidence([
        evidence(overlapLine, 'source'),
        evidence(rejectLine, 'source'),
        bookingLine ? evidence(bookingLine, 'source') : null,
        saveLine ? evidence(saveLine, 'source') : null,
      ]),
    });
  }
  return facts;
}

function uiFactsFromLines(lines) {
  const facts = [];
  for (const line of lines) {
    const page = line.trimmed.match(/^page\s+['"]?([^'":]+)['"]?/i);
    if (page) {
      facts.push({
        kind: 'ui_reachability',
        action: 'page',
        object: normalizeIdentifier(page[1]) || 'page',
        evidence: [evidence(line, 'source')],
      });
      continue;
    }
    const button = line.trimmed.match(/^button\s+['"]?([^'":]+)['"]?/i);
    if (button) {
      facts.push({
        kind: 'ui_reachability',
        action: 'button',
        object: normalizeIdentifier(button[1]) || 'button',
        evidence: [evidence(line, 'source')],
      });
      continue;
    }
    const accordion = line.trimmed.match(/^accordion\s+['"]?([^'":]+)['"]?/i);
    if (accordion) {
      facts.push({
        kind: 'ui_reachability',
        action: 'accordion',
        object: normalizeIdentifier(accordion[1]) || 'accordion',
        evidence: [evidence(line, 'source')],
      });
    }
  }
  return facts;
}

function runtimeFacts(runtimeEvidence) {
  const tools = Array.isArray(runtimeEvidence?.tools) ? runtimeEvidence.tools : [];
  const facts = [];
  const map = new Map([
    ['run_app', 'running_app'],
    ['click_element', 'click'],
    ['fill_input', 'input'],
    ['read_dom', 'dom'],
    ['read_actions', 'actions'],
    ['read_network', 'network'],
    ['screenshot_output', 'screenshot'],
    ['http_request', 'api_request'],
    ['db_inspect', 'state_read'],
  ]);
  for (const tool of tools) {
    const action = map.get(tool);
    if (!action) continue;
    facts.push({
      kind: ['http_request', 'db_inspect'].includes(tool) ? 'state_evidence' : 'browser_evidence',
      action,
      object: 'generated_app',
      evidence: [{ kind: 'tool', text: tool }],
    });
  }
  return facts;
}

function matchingAppFacts(requirement, appFacts) {
  return (appFacts || []).filter(fact => {
    if (requirement.kind !== fact.kind) return false;
    if (requirement.kind === 'domain_rule') {
      return sameValue(requirement.object, fact.object)
        && sameValue(requirement.condition, fact.condition)
        && sameValue(requirement.expected, fact.expected);
    }
    if (requirement.kind === 'storage') {
      if (!sameValue(requirement.object, fact.object)) return false;
      const fields = requirement.fields || [];
      return fields.every(field => (fact.fields || []).includes(field));
    }
    if (requirement.kind === 'update') {
      return sameValue(requirement.object, fact.object)
        || normalizeText(fact.endpoint || '').includes(requirement.object || '');
    }
    if (requirement.kind === 'ui_reachability') {
      return fact.kind === 'ui_reachability' || fact.kind === 'browser_evidence';
    }
    return false;
  });
}

function extractStoredFields(text) {
  const match = text.match(/\b([a-z][a-z0-9_-]*)s?\s+(?:must\s+)?stor(?:e|es)\s+(.+)$/);
  if (!match) return null;
  return {
    object: singularize(normalizeIdentifier(match[1])),
    fields: splitFields(match[2]),
  };
}

function extractStoredObjects(text) {
  const match = text.match(/\b(.+?)\s+(?:data\s+)?must\s+be\s+stored\b/);
  if (!match) return [];
  const tokens = normalizeText(match[1])
    .split(/\s+/)
    .map(token => singularize(token))
    .filter(Boolean);
  const objectWords = new Set([
    'room',
    'customer',
    'booking',
    'deal',
    'request',
    'ticket',
    'expense',
    'company',
    'contact',
    'message',
  ]);
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    if (!objectWords.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function objectFromText(text) {
  const normalized = normalizeText(text);
  const candidates = [
    'booking',
    'reservation',
    'deal',
    'request',
    'ticket',
    'expense',
    'customer',
    'company',
    'contact',
    'message',
    'room',
  ];
  for (const candidate of candidates) {
    if (new RegExp(`\\b${candidate}s?\\b`).test(normalized)) {
      return candidate === 'reservation' ? 'booking' : candidate;
    }
  }
  return null;
}

function endpointVerb(text) {
  if (/\bwhen user sends\b/.test(text)) return 'create';
  if (/\bwhen user updates\b/.test(text)) return 'update';
  if (/\bwhen user deletes\b/.test(text)) return 'delete';
  return 'read';
}

function uiActionFromText(text) {
  if (/\bbutton\b/.test(text)) return 'button';
  if (/\bform\b/.test(text)) return 'form';
  if (/\btable\b/.test(text)) return 'table';
  if (/\bdetail\b/.test(text)) return 'detail';
  if (/\bnav|navigation\b/.test(text)) return 'navigation';
  return 'page';
}

function isBookingOverlapLine(text) {
  if (!/(?:\bbookings?\b|\b\w*booking\w*\b|\breservations?\b|\broom_id\b|\broom\b)/.test(text)) return false;
  if (/\b(overlap|overlaps|overlapping|double booking|same room|same-room|conflict|conflicts)\b/.test(text)) return true;
  return /\bstart_time\b/.test(text) && /\bend_time\b/.test(text) && /\b(before|after|less than|greater than)\b/.test(text);
}

function evidenceLinesFromSource(source) {
  const lines = String(source || '').split(/\r?\n/);
  const out = [];
  let ignoredBlock = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)?.[0].length || 0;
    if (ignoredBlock && trimmed.length > 0 && indent <= ignoredBlock.indent) {
      ignoredBlock = null;
    }
    if (!ignoredBlock && /^(requirements|test)\s*:\s*$/i.test(trimmed)) {
      ignoredBlock = { indent };
      continue;
    }
    if (ignoredBlock || trimmed.length === 0 || /^#|^\/\//.test(trimmed)) continue;
    out.push({
      line: i + 1,
      text: raw,
      trimmed,
      normalized: normalizeText(stripInlineComment(raw)),
      indent,
    });
  }
  return out.filter(line => line.normalized.length > 0);
}

function tableNameFromLine(line) {
  const createMatch = line.match(/^create\s+an?\s+(.+?)\s+table\s*:\s*$/i);
  if (createMatch) return createMatch[1].trim();
  const tableMatch = line.match(/^table\s+(.+?)\s*:\s*$/i);
  if (tableMatch) return tableMatch[1].trim();
  return null;
}

function fieldNameFromLine(line) {
  const match = line.match(/^([a-z][a-z0-9_-]*)\b/i);
  if (!match) return null;
  const name = normalizeIdentifier(match[1]);
  if (['anyone', 'the', 'requires', 'when', 'if', 'otherwise'].includes(name)) return null;
  return name;
}

function splitFields(text) {
  return String(text || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\.$/, '')
    .replace(/\band\b/gi, ',')
    .split(',')
    .map(part => normalizeIdentifier(part))
    .filter(Boolean);
}

function nearbyLines(lines, lineNumber, radius) {
  return lines.filter(line => Math.abs(line.line - lineNumber) <= radius);
}

function evidence(line, kind) {
  return {
    kind,
    line: line.line,
    text: line.trimmed,
  };
}

function uniqueEvidence(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item) continue;
    const key = `${item.kind}:${item.line || ''}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sameValue(left, right) {
  return normalizeIdentifier(left) === normalizeIdentifier(right);
}

function singularize(value) {
  const normalized = normalizeIdentifier(value);
  if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('s') && normalized.length > 1) return normalized.slice(0, -1);
  return normalized;
}

function normalizeIdentifier(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an|the)\s+/, '')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9_-]+/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9_/$.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripInlineComment(value) {
  return String(value || '').replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '');
}
