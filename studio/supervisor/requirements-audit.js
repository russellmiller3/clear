const PASS = 'passed';
const MISSING = 'missing';
const UNVERIFIED = 'unverified';

export function auditRequirements({
  source = '',
  ast = null,
  compileResult = null,
  requirements = null,
} = {}) {
  const items = normalizeRequirements(requirements || compileResult?.requirements || [])
    .map((requirement, index) => auditRequirement(requirement, {
      source,
      ast,
      compileResult,
      evidenceLines: evidenceLinesFromSource(source),
      index,
    }));

  if (items.length === 0) {
    return {
      ok: true,
      summary: 'No requirements to audit.',
      items,
    };
  }

  return {
    ok: items.every(item => item.status === PASS),
    summary: summarize(items),
    items,
  };
}

function normalizeRequirements(requirements) {
  return (requirements || [])
    .map((item, index) => {
      if (typeof item === 'string') {
        return { id: `req_${index + 1}`, text: item };
      }
      return {
        id: item.id || `req_${index + 1}`,
        text: item.text || '',
        line: item.line,
      };
    })
    .filter(item => item.text.trim().length > 0);
}

function auditRequirement(requirement, ctx) {
  const text = requirement.text.trim();
  const normalized = normalizeText(text);
  const detectors = [
    detectDataShape,
    detectApprovalRouting,
    detectOptimisticLock,
    detectLoginSubmit,
    detectApproveReject,
  ];

  for (const detector of detectors) {
    const result = detector(text, normalized, ctx);
    if (result) {
      return {
        id: requirement.id || `req_${ctx.index + 1}`,
        text,
        ...result,
      };
    }
  }

  return {
    id: requirement.id || `req_${ctx.index + 1}`,
    text,
    status: UNVERIFIED,
    reason: 'No Ralph detector can verify this requirement yet.',
    evidence: [],
  };
}

function detectDataShape(text, normalized, ctx) {
  const match = normalized.match(/\beach\s+([a-z][a-z0-9_-]*)s?\s+stores\s+(.+)$/);
  if (!match) return null;

  const entity = singularize(match[1]);
  const fields = splitFields(match[2]);
  const tables = extractTableBlocks(ctx.evidenceLines);
  const table = tables.find(candidate => tableMatchesEntity(candidate.name, entity));

  if (!table) {
    return {
      status: MISSING,
      reason: `No ${entity} table found outside the requirements block.`,
      evidence: [],
    };
  }

  const missing = fields.filter(field => !table.fields.some(candidate => candidate.name === field));
  if (missing.length > 0) {
    return {
      status: MISSING,
      reason: `The ${table.name} table is missing ${joinEnglish(missing)}.`,
      evidence: table.evidence,
    };
  }

  return {
    status: PASS,
    reason: `${table.name} stores ${joinEnglish(fields)}.`,
    evidence: [
      table.evidence[0],
      ...fields.map(field => {
        const found = table.fields.find(candidate => candidate.name === field);
        return found.evidence;
      }).filter(Boolean),
    ],
  };
}

function detectApprovalRouting(text, normalized, ctx) {
  if (!normalized.includes('route') || !normalized.includes('approval')) return null;
  const threshold = extractThreshold(normalized);
  const target = extractApprovalTarget(normalized);
  if (!threshold || !target) return null;

  const thresholdLine = ctx.evidenceLines.find(line => line.normalized.includes(threshold.value));
  const targetLine = thresholdLine
    ? nearbyLines(ctx.evidenceLines, thresholdLine.line, 6).find(line => line.normalized.includes(target))
    : ctx.evidenceLines.find(line => line.normalized.includes(target));
  const routingLine = thresholdLine
    ? nearbyLines(ctx.evidenceLines, thresholdLine.line, 6).find(line => /\b(route|approver|approval|queue|assign|assigned)\b/.test(line.normalized))
    : null;

  if (thresholdLine && targetLine && routingLine) {
    return {
      status: PASS,
      reason: `Found ${threshold.phrase} ${threshold.value} routing to ${target}.`,
      evidence: uniqueEvidence([
        evidence(thresholdLine, 'source'),
        evidence(targetLine, 'source'),
        evidence(routingLine, 'source'),
      ]),
    };
  }

  return {
    status: MISSING,
    reason: `No route or conditional mentions ${threshold.phrase} ${threshold.value} and ${target} approval.`,
    evidence: uniqueEvidence([
      thresholdLine ? evidence(thresholdLine, 'source') : null,
      targetLine ? evidence(targetLine, 'source') : null,
    ].filter(Boolean)),
  };
}

function detectOptimisticLock(text, normalized, ctx) {
  if (!normalized.includes('optimistic') || !normalized.includes('lock')) return null;

  const markerLine = ctx.evidenceLines.find(line => /\bwith\s+optimistic\s+lock\b/.test(line.normalized));
  if (markerLine) {
    return {
      status: PASS,
      reason: 'Found optimistic-lock marker in the implemented endpoint.',
      evidence: [evidence(markerLine, 'source')],
    };
  }

  return {
    status: UNVERIFIED,
    reason: 'Approval update exists, but no optimistic-lock marker or stale-update test was found.',
    evidence: [],
  };
}

function detectLoginSubmit(text, normalized, ctx) {
  const asksForLogin = /\b(logged in|logged-in|login|authenticated)\b/.test(normalized);
  const asksForSubmit = /\b(submit|create|send)\b/.test(normalized);
  if (!asksForLogin || !asksForSubmit) return null;

  const loginLine = ctx.evidenceLines.find(line => /\b(allow signup and login|requires login|requires auth)\b/.test(line.normalized));
  const submitLine = ctx.evidenceLines.find(line => /\bwhen user sends\b/.test(line.normalized));
  const saveLine = ctx.evidenceLines.find(line => /\bsave\b/.test(line.normalized));

  if (loginLine && submitLine && saveLine) {
    return {
      status: PASS,
      reason: 'Found authenticated submit flow.',
      evidence: uniqueEvidence([evidence(loginLine, 'source'), evidence(submitLine, 'source'), evidence(saveLine, 'source')]),
    };
  }

  return {
    status: MISSING,
    reason: 'No authenticated submit flow found outside the requirements block.',
    evidence: uniqueEvidence([loginLine, submitLine, saveLine].filter(Boolean).map(line => evidence(line, 'source'))),
  };
}

function detectApproveReject(text, normalized, ctx) {
  if (!normalized.includes('approve') || !normalized.includes('reject')) return null;

  const approveLine = ctx.evidenceLines.find(line => /\bapprove(d)?\b/.test(line.normalized));
  const rejectLine = ctx.evidenceLines.find(line => /\breject(ed)?\b/.test(line.normalized));
  const statusLine = ctx.evidenceLines.find(line => /\b(status|pending)\b/.test(line.normalized));

  if (approveLine && rejectLine && statusLine) {
    return {
      status: PASS,
      reason: 'Found approve and reject status actions.',
      evidence: uniqueEvidence([evidence(approveLine, 'source'), evidence(rejectLine, 'source'), evidence(statusLine, 'source')]),
    };
  }

  return {
    status: MISSING,
    reason: 'No approve and reject status actions found outside the requirements block.',
    evidence: uniqueEvidence([approveLine, rejectLine, statusLine].filter(Boolean).map(line => evidence(line, 'source'))),
  };
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

    if (ignoredBlock || trimmed.length === 0 || /^#|^\/\//.test(trimmed)) {
      continue;
    }

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

function extractTableBlocks(lines) {
  const tables = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = tableNameFromLine(line.trimmed);
    if (!name) continue;

    const table = {
      name,
      normalizedName: normalizeIdentifier(name),
      fields: [],
      evidence: [evidence(line, 'source')],
    };

    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (candidate.indent <= line.indent) break;
      const field = fieldNameFromLine(candidate.trimmed);
      if (field) {
        table.fields.push({
          name: field,
          evidence: evidence(candidate, 'source'),
        });
      }
    }

    tables.push(table);
  }

  return tables;
}

function tableNameFromLine(line) {
  const createMatch = line.match(/^create\s+a\s+(.+?)\s+table\s*:\s*$/i);
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
  return text
    .replace(/\.$/, '')
    .replace(/\band\b/gi, ',')
    .split(',')
    .map(part => normalizeIdentifier(part))
    .filter(Boolean);
}

function extractThreshold(text) {
  const match = text.match(/\b(at least|over|above|greater than|greater than or equal to|under|below|less than)\s+\$?([0-9][0-9,]*)\b/);
  if (!match) return null;
  return {
    phrase: match[1],
    value: match[2].replace(/,/g, ''),
  };
}

function extractApprovalTarget(text) {
  const match = text.match(/\bto\s+(?:the\s+)?([a-z][a-z0-9_-]*)\s+(?:approval|queue)\b/);
  return match ? normalizeIdentifier(match[1]) : null;
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
    const key = `${item.kind}:${item.line}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function tableMatchesEntity(tableName, entity) {
  const normalizedTable = singularize(normalizeIdentifier(tableName));
  const normalizedEntity = singularize(normalizeIdentifier(entity));
  return normalizedTable === normalizedEntity || normalizedTable.includes(normalizedEntity);
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

function joinEnglish(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function summarize(items) {
  const passed = items.filter(item => item.status === PASS).length;
  const missing = items.filter(item => item.status === MISSING).length;
  const unverified = items.filter(item => item.status === UNVERIFIED).length;
  return `${passed} of ${items.length} requirements satisfied. ${missing} missing. ${unverified} unverified.`;
}
