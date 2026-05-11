import {
  compareRequirementFacts,
  extractAppFacts,
  normalizeRequirementFacts,
} from './requirements-facts.js';

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
      appFacts: extractAppFacts({ source }),
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
    detectTypedFacts,
    detectDealCreation,
    detectApprovalRouting,
    detectAuditTrail,
    detectNamedAgent,
    detectOptimisticLock,
    detectLoginSubmit,
    detectApproveReject,
    detectNotification,
    detectDashboardList,
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

function detectTypedFacts(text, normalized, ctx) {
  const requirementFacts = normalizeRequirementFacts([{ id: `req_${ctx.index + 1}`, text }])
    .filter(fact => ['domain_rule', 'read', 'role_rule', 'storage'].includes(fact.kind));
  if (requirementFacts.length === 0) return null;

  const comparisons = compareRequirementFacts(requirementFacts, ctx.appFacts || []);
  if (comparisons.length === 0) return null;
  const failed = comparisons.filter(item => item.status !== PASS);
  const kindLabels = { domain_rule: 'domain rule', read: 'read-access', role_rule: 'role restriction', approval_rule: 'approval routing', storage: 'storage' };
  const kindLabel = kindLabels[requirementFacts[0]?.kind] || 'typed rule';

  if (requirementFacts[0]?.kind === 'storage') {
    const storageFact = requirementFacts[0];
    const fields = storageFact.fields || [];
    const obj = storageFact.object || 'entity';
    if (failed.length === 0) {
      return {
        status: PASS,
        reason: fields.length > 0
          ? `${obj} stores ${joinEnglish(fields)}.`
          : `Found storage evidence for ${obj}.`,
        evidence: uniqueEvidence(comparisons.flatMap(item => item.evidence || [])),
        facts: requirementFacts,
      };
    }
    return {
      status: MISSING,
      reason: failed[0]?.reason || `No storage table for ${obj} with required fields found.`,
      evidence: uniqueEvidence(comparisons.flatMap(item => item.evidence || [])),
      facts: requirementFacts,
    };
  }

  if (failed.length === 0) {
    return {
      status: PASS,
      reason: `Found typed ${kindLabel} evidence for ${joinEnglish(requirementFacts.map(fact => fact.object))}.`,
      evidence: uniqueEvidence(comparisons.flatMap(item => item.evidence || [])),
      facts: requirementFacts,
    };
  }

  return {
    status: MISSING,
    reason: failed[0]?.reason || `No typed ${kindLabel} evidence found outside the requirements block.`,
    evidence: uniqueEvidence(comparisons.flatMap(item => item.evidence || [])),
    facts: requirementFacts,
  };
}

function detectDataShape(text, normalized, ctx) {
  const shape = parseDataShapeRequirement(text, normalized);
  if (!shape) return null;

  const entity = singularize(shape.entity);
  const fields = shape.fields;
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

function detectDealCreation(text, normalized, ctx) {
  if (!/\b(create|submit|add)\b/.test(normalized) || !/\bdeals?\b/.test(normalized)) return null;
  const fields = extractFieldsAfterWith(text);
  const table = extractTableBlocks(ctx.evidenceLines)
    .find(candidate => tableMatchesEntity(candidate.name, 'deal'));
  const endpointLine = ctx.evidenceLines.find(line =>
    /\bwhen user sends\b/.test(line.normalized) &&
    /\bdeals?\b/.test(line.normalized) &&
    /\/api\//.test(line.normalized)
  );
  const saveLine = ctx.evidenceLines.find(line => /\bsave\b/.test(line.normalized) && /\bnew deal\b/.test(line.normalized));
  const loginLine = /\bsales reps?\b/.test(normalized)
    ? ctx.evidenceLines.find(line => /\b(requires login|requires auth|caller|owner_email|rep_email)\b/.test(line.normalized))
    : null;
  const statusLine = /\bstatus\b/.test(normalized)
    ? ctx.evidenceLines.find(line => /\b(status|pending|draft)\b/.test(line.normalized))
    : null;

  const missingFields = table && fields.length > 0
    ? fields.filter(field => !table.fields.some(candidate => candidate.name === field))
    : [];

  if (table && endpointLine && saveLine && missingFields.length === 0) {
    return {
      status: PASS,
      reason: 'Found deal create flow with matching stored fields.',
      evidence: uniqueEvidence([
        table.evidence[0],
        ...fields.map(field => {
          const found = table.fields.find(candidate => candidate.name === field);
          return found ? found.evidence : null;
        }),
        evidence(endpointLine, 'source'),
        evidence(saveLine, 'source'),
        loginLine ? evidence(loginLine, 'source') : null,
        statusLine ? evidence(statusLine, 'source') : null,
      ]),
    };
  }

  const missing = [];
  if (!table) missing.push('deal table');
  if (missingFields.length > 0) missing.push(`${joinEnglish(missingFields)} field${missingFields.length === 1 ? '' : 's'}`);
  if (!endpointLine) missing.push('create endpoint');
  if (!saveLine) missing.push('new deal save');

  return {
    status: MISSING,
    reason: `No complete deal create flow found; missing ${joinEnglish(missing)}.`,
    evidence: uniqueEvidence([
      table ? table.evidence[0] : null,
      endpointLine ? evidence(endpointLine, 'source') : null,
      saveLine ? evidence(saveLine, 'source') : null,
      loginLine ? evidence(loginLine, 'source') : null,
      statusLine ? evidence(statusLine, 'source') : null,
    ]),
  };
}

function detectApprovalRouting(text, normalized, ctx) {
  if (!normalized.includes('route') && !normalized.includes('approval')) return null;
  const threshold = extractThreshold(normalized);
  const target = extractApprovalTarget(normalized);
  if (!threshold || !target) return null;

  const thresholdLine = ctx.evidenceLines.find(line => line.normalized.includes(threshold.value));
  const nearThreshold = thresholdLine ? nearbyLines(ctx.evidenceLines, thresholdLine.line, 6) : [];
  const targetLine = thresholdLine
    ? nearThreshold.find(line => isApprovalTargetEvidenceLine(line, target))
    : ctx.evidenceLines.find(line => isApprovalTargetEvidenceLine(line, target));
  const routingLine = thresholdLine
    ? nearThreshold.find(line => /\b(route|approver|approval|queue|assign|assigned|role|approver_role|approval_role|is_vp_approval)\b/.test(line.normalized) && !isFailureMessageLine(line))
    : null;

  // Enforcement pattern: "enforce ... fail with error message '...VP approval...'"
  // The threshold, target, and routing intent are all on one "enforce" line.
  const enforceApproveLine = thresholdLine
    ? nearThreshold.find(line =>
        /\b(enforce|rule)\b/.test(line.normalized) &&
        line.normalized.includes(target) &&
        /\b(approval|approve|escalat)\b/.test(line.normalized) &&
        isFailureMessageLine(line)
      )
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

  // Enforcement-only is insufficient — there must also be a concrete approval queue or reviewer assignment
  const hasApprovalQueueEvidence = ctx.evidenceLines.some(line =>
    /\b(queue for|reviewer is|requires approval from|approval queue)\b/.test(line.normalized)
  );
  if (thresholdLine && enforceApproveLine && hasApprovalQueueEvidence) {
    return {
      status: PASS,
      reason: `Found ${threshold.phrase} ${threshold.value} enforcement requiring ${target} approval.`,
      evidence: uniqueEvidence([
        evidence(thresholdLine, 'source'),
        evidence(enforceApproveLine, 'source'),
      ]),
    };
  }

  return {
    status: MISSING,
    reason: `No route or conditional assigns ${threshold.phrase} ${threshold.value} deals to ${target} approval.`,
    evidence: uniqueEvidence([
      thresholdLine ? evidence(thresholdLine, 'source') : null,
      targetLine ? evidence(targetLine, 'source') : null,
    ].filter(Boolean)),
  };
}

function detectAuditTrail(text, normalized, ctx) {
  const asksForAudit = /\b(audit|audit trail|audit log)\b/.test(normalized);
  const asksForStatusHistory = /\b(store|record|track|log|logs|logging)\b/.test(normalized) && /\bstatus\b/.test(normalized) && /\b(change|changes|changed)\b/.test(normalized);
  if (!asksForAudit && !asksForStatusHistory) return null;

  const tables = extractTableBlocks(ctx.evidenceLines);
  const auditTable = tables.find(table => /\baudit|log|history/.test(table.normalizedName));
  const fieldNames = auditTable ? auditTable.fields.map(field => field.name) : [];
  const hasActor = fieldNames.some(field => /\b(actor|user|approver|changed_by|rep)_?email\b/.test(field) || /\bactor\b/.test(field));
  const hasTimestamp = fieldNames.some(field => /\b(changed_at|logged_at|timestamp|created_at|time|date|occurred_at|recorded_at)\b/.test(field));
  const hasStatus = fieldNames.some(field => /\b(status|old_status|new_status)\b/.test(field));
  const writeLine = ctx.evidenceLines.find(line => /\b(save|create)\b/.test(line.normalized) && /\b(audit|log|history)\b/.test(line.normalized));
  const actorLine = ctx.evidenceLines.find(line => /\b(actor|caller|email)\b/.test(line.normalized) && /\b(audit|actor_email|caller)\b/.test(line.normalized));
  const timestampLine = ctx.evidenceLines.find(line => /\b(changed_at|timestamp|now|time)\b/.test(line.normalized));

  if (auditTable && hasActor && hasTimestamp && hasStatus && writeLine) {
    return {
      status: PASS,
      reason: 'Found audit-trail storage with actor, status, timestamp, and write evidence.',
      evidence: uniqueEvidence([
        auditTable.evidence[0],
        ...auditTable.fields.map(field => field.evidence),
        evidence(writeLine, 'source'),
        actorLine ? evidence(actorLine, 'source') : null,
        timestampLine ? evidence(timestampLine, 'source') : null,
      ]),
    };
  }

  // The queue primitive auto-generates a <entity>_decisions audit table with actor email,
  // status, and timestamp on every approve/reject/counter action — compiler-guaranteed.
  const queueLine = ctx.evidenceLines.find(line => /\bqueue for\b/.test(line.normalized));
  if (queueLine) {
    return {
      status: PASS,
      reason: 'Found queue primitive — compiler auto-generates audit trail with actor email and timestamp.',
      evidence: [evidence(queueLine, 'source')],
    };
  }

  return {
    status: MISSING,
    reason: 'No audit-trail storage found with actor email, status change, timestamp, and save evidence.',
    evidence: uniqueEvidence([
      auditTable ? auditTable.evidence[0] : null,
      writeLine ? evidence(writeLine, 'source') : null,
      actorLine ? evidence(actorLine, 'source') : null,
      timestampLine ? evidence(timestampLine, 'source') : null,
    ]),
  };
}

function detectNamedAgent(text, normalized, ctx) {
  if (!/\bagent\b/.test(normalized)) return null;
  const names = extractQuotedPhrases(text).filter(phrase => phrase.trim().length > 0);
  const agentName = names[0] || null;
  const normalizedName = agentName ? normalizeText(agentName) : null;
  const agentLine = normalizedName
    ? ctx.evidenceLines.find(line => /\bagent\b/.test(line.normalized) && line.normalized.includes(normalizedName))
    : ctx.evidenceLines.find(line => /\bagent\b/.test(line.normalized));
  const callLine = normalizedName
    ? ctx.evidenceLines.find(line => /\bask agent\b/.test(line.normalized) && line.normalized.includes(normalizedName))
    : ctx.evidenceLines.find(line => /\bask agent\b/.test(line.normalized));
  const outputLine = ctx.evidenceLines.find(line => /\b(description|draft|notes|generate)\b/.test(line.normalized));

  if (agentLine && callLine && outputLine) {
    return {
      status: PASS,
      reason: 'Found named agent declaration and call evidence.',
      evidence: uniqueEvidence([
        evidence(agentLine, 'source'),
        evidence(callLine, 'source'),
        evidence(outputLine, 'source'),
      ]),
    };
  }

  // Extended: named function using ask claude / ask ai is also AI agent capability
  const askClaudeLine = ctx.evidenceLines.find(line => /\b(ask claude|ask ai)\b/.test(line.normalized));
  const functionLine = ctx.evidenceLines.find(line => /\bdefine function\b/.test(line.normalized));
  if (askClaudeLine && functionLine) {
    return {
      status: PASS,
      reason: 'Found agent capability — AI function using ask claude.',
      evidence: uniqueEvidence([
        evidence(functionLine, 'source'),
        evidence(askClaudeLine, 'source'),
        outputLine ? evidence(outputLine, 'source') : null,
      ]),
    };
  }

  return {
    status: MISSING,
    reason: agentName
      ? `No implemented agent named ${agentName} with a concrete call was found.`
      : 'No implemented agent declaration with a concrete call was found.',
    evidence: uniqueEvidence([agentLine, callLine, outputLine].filter(Boolean).map(line => evidence(line, 'source'))),
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
  if (!/\bapprove\b/.test(normalized) || !/\breject\b/.test(normalized)) return null;

  const approveLine = ctx.evidenceLines.find(line => isDecisionActionLine(line, 'approve'));
  const rejectLine = ctx.evidenceLines.find(line => isDecisionActionLine(line, 'reject'));
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

function detectNotification(text, normalized, ctx) {
  if (!/\b(notify|notification|email)\b/.test(normalized)) return null;

  const emailLine = ctx.evidenceLines.find(line => /\b(send email|email to|notify)\b/.test(line.normalized));
  const statusLine = ctx.evidenceLines.find(line => /\b(status|approved|rejected|changes?)\b/.test(line.normalized));
  const recipient = extractNotificationRecipient(normalized);
  const recipientLine = recipient
    ? ctx.evidenceLines.find(line => line.normalized.includes(recipient))
    : null;

  if (emailLine && statusLine && (!recipient || recipientLine)) {
    return {
      status: PASS,
      reason: 'Found status-change email notification evidence.',
      evidence: uniqueEvidence([
        evidence(emailLine, 'source'),
        evidence(statusLine, 'source'),
        recipientLine ? evidence(recipientLine, 'source') : null,
      ]),
    };
  }

  return {
    status: MISSING,
    reason: 'No concrete email or notification action found for this requirement.',
    evidence: uniqueEvidence([emailLine, statusLine, recipientLine].filter(Boolean).map(line => evidence(line, 'source'))),
  };
}

function detectDashboardList(text, normalized, ctx) {
  // "list" alone (as in "list price") is a domain noun, not a UI list signal
  const hasUISignal = /\b(show|dashboard|queue)\b/.test(normalized) ||
    (/\blist\b/.test(normalized) && /\b(show|display|view|table|pending|approval)\b/.test(normalized));
  if (!hasUISignal) return null;
  const labelPhrases = extractQuotedPhrases(text).filter(phrase => /\b(queue|deals|dashboard)\b/i.test(phrase));

  const pageLine = ctx.evidenceLines.find(line => /\b(page|dashboard)\b/.test(line.normalized));
  const displayLine = ctx.evidenceLines.find(line => /\b(display|table|list)\b/.test(line.normalized));
  const missingLabels = labelPhrases.filter(phrase => {
    const normalizedPhrase = normalizeText(phrase);
    return !ctx.evidenceLines.some(line => line.normalized.includes(normalizedPhrase));
  });

  if (pageLine && displayLine && missingLabels.length === 0) {
    return {
      status: PASS,
      reason: 'Found dashboard/list display evidence.',
      evidence: uniqueEvidence([
        evidence(pageLine, 'source'),
        evidence(displayLine, 'source'),
        ...labelPhrases.map(phrase => {
          const normalizedPhrase = normalizeText(phrase);
          const line = ctx.evidenceLines.find(candidate => candidate.normalized.includes(normalizedPhrase));
          return line ? evidence(line, 'source') : null;
        }),
      ]),
    };
  }

  return {
    status: MISSING,
    reason: missingLabels.length > 0
      ? `Dashboard/list evidence is missing ${joinEnglish(missingLabels)}.`
      : 'No dashboard/list display evidence found.',
    evidence: uniqueEvidence([pageLine, displayLine].filter(Boolean).map(line => evidence(line, 'source'))),
  };
}

function parseDataShapeRequirement(text, normalized) {
  const direct = normalized.match(/\beach\s+([a-z][a-z0-9_-]*)s?\s+stores\s+(.+)$/);
  if (direct) return { entity: direct[1], fields: splitFields(direct[2]) };

  const mustStore = String(text || '').trim().match(/^([A-Za-z][A-Za-z0-9_-]*)s?\s+must\s+store:?\s+(.+)$/i);
  if (mustStore) return { entity: mustStore[1], fields: splitFields(mustStore[2]) };

  // "X must be stored with Y" (no qualifier word required)
  const storedWithSimple = normalized.match(/\b([a-z][a-z0-9_-]*)s?\s+must\s+be\s+stored?\s+with\s+(.+)$/);
  if (storedWithSimple) return { entity: storedWithSimple[1], fields: splitFields(storedWithSimple[2]) };

  // "X data must be stored with Y" / "X information must be stored with Y"
  const storedWith = normalized.match(/\b([a-z][a-z0-9_-]*)s?\s+(?:data|information|info|details?)\s+must\s+be\s+stored?\s+(?:with\s+)?(.+)$/);
  if (storedWith) return { entity: storedWith[1], fields: splitFields(storedWith[2]) };

  // "X records must store Y" / "X records must be stored with Y"
  const recordsMustStore = normalized.match(/\b([a-z][a-z0-9_-]*)s?\s+records?\s+must\s+(?:be\s+)?stored?\s*(?:with\s+)?(.+)$/);
  if (recordsMustStore) return { entity: recordsMustStore[1], fields: splitFields(recordsMustStore[2]) };

  return null;
}

function extractFieldsAfterWith(text) {
  const match = String(text || '').match(/\bwith\s+(.+)$/i);
  if (!match) return [];
  return splitFields(match[1].replace(/\([^)]*\)/g, ''));
}

function isDecisionActionLine(line, verb) {
  const text = line.normalized || '';
  const action = verb === 'approve' ? /\bapprove\b/.test(text) : /\breject\b/.test(text);
  if (!action) return false;
  if (/\b(status|approved|rejected|pending)\b/.test(text)) return false;
  return /\b(button|action|when user sends|api|endpoint|route|decision)\b/.test(text);
}

function isApprovalTargetEvidenceLine(line, target) {
  const text = line.normalized || '';
  if (!text.includes(target)) return false;
  if (isFailureMessageLine(line)) return false;
  return /\b(approver|approval|queue|assign|assigned|role|reviewer|approver_role|approval_role|is_vp_approval)\b/.test(text);
}

function isFailureMessageLine(line) {
  return /\b(fail with error message|error message|rejected|reject with)\b/.test(line.normalized || '');
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
    .map(part => normalizeFieldName(part))
    .filter(Boolean);
}

function extractThreshold(text) {
  // "X percent or more" / "X% or more" — e.g. "discounts of 30 percent or more"
  const percentOrMore = text.match(/\b([0-9][0-9,]*)\s*(?:percent|%)\s+or\s+(?:more|above|greater)\b/);
  if (percentOrMore) {
    const numeric = Number(String(percentOrMore[1]).replace(/,/g, ''));
    return { phrase: 'at least', value: String(numeric) };
  }
  const wordMatch = text.match(/\b(at least|over|above|greater than|greater than or equal to|under|below|less than)\s+\$?([0-9][0-9,]*)(k)?\b/);
  const symbolOrBareMatch = wordMatch ? null : text.match(/\$?([0-9][0-9,]*)(k)\b/);
  const match = wordMatch || symbolOrBareMatch;
  if (!match) return null;
  const phrase = wordMatch ? match[1] : 'greater than';
  const rawValue = wordMatch ? match[2] : match[1];
  const suffix = wordMatch ? match[3] : match[2];
  const numeric = Number(String(rawValue).replace(/,/g, '')) * (suffix === 'k' ? 1000 : 1);
  return {
    phrase,
    value: String(numeric),
  };
}

function extractApprovalTarget(text) {
  const match = text.match(/\brequire(?:s|d)?\s+(?:a\s+|the\s+)?([a-z][a-z0-9_-]*)\s+approval\b/) ||
    text.match(/\bto\s+(?:a\s+|the\s+)?([a-z][a-z0-9_-]*)\s+(?:approval|queue)\b/) ||
    text.match(/\broute(?:d|s)?\s+to\s+(?:a\s+|the\s+)?([a-z][a-z0-9_-]*)\b/);
  if (!match && /\b(vice president|vp)\b/.test(text)) return 'vp';
  return match ? normalizeIdentifier(match[1]) : null;
}

function extractNotificationRecipient(normalized) {
  const match = normalized.match(/\b(?:notify|email)\s+(?:the\s+)?([a-z][a-z0-9_-]*)\b/);
  return match ? normalizeIdentifier(match[1]) : null;
}

function extractQuotedPhrases(text) {
  const out = [];
  for (const match of String(text || '').matchAll(/['"]([^'"]+)['"]/g)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
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

function normalizeFieldName(value) {
  const stripped = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an|the)\s+/, '')
    .replace(/['"()]/g, '')
    .trim();
  if (!stripped) return '';
  return stripped.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
