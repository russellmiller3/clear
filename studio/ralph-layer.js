import { RALPH_FAMILIES, evaluateAudit } from './supervisor/miller-ralph.js';

// Family priority lookup for ranking gaps worst-first in the retry message.
const FAMILY_TIER = new Map(RALPH_FAMILIES.map(family => [family.key, family.tier]));

export const RALPH_DEFAULTS = Object.freeze({
  MAX_RETRIES: 2,
  ENABLED_ENV: 'MEPH_REQUIREMENTS_RALPH',
  MAX_RETRIES_ENV: 'MEPH_RALPH_MAX_RETRIES',
  BLOCK_UNVERIFIED_ENV: 'MEPH_RALPH_BLOCK_UNVERIFIED',
});

export function shouldRalphRetry({
  audit,
  retryCount = 0,
  maxRetries,
  layerOff = false,
  blockOnUnverified = true,
} = {}) {
  if (layerOff || !audit || audit.ok) {
    return { retry: false, blocked: false, gaps: [] };
  }

  const gaps = blockingItems(audit.items || [], blockOnUnverified);
  if (gaps.length === 0) {
    return { retry: false, blocked: false, gaps: [] };
  }

  const cap = normalizeRetryCap(maxRetries);
  if (retryCount < cap) {
    return { retry: true, blocked: false, gaps };
  }

  return {
    retry: false,
    blocked: true,
    gaps,
    reason: `Ralph reached the retry cap (${cap}).`,
  };
}

export function formatRalphMessage({ audit, retryIndex, maxRetries, blockOnUnverified = true } = {}) {
  const gaps = blockingItems(audit?.items || [], blockOnUnverified);
  // A/B control arm: CLEAR_MILLER_RANK_DISABLE=1 reproduces the pre-Miller message (original gap
  // order, no violation-vector line), so the A/B sweep can isolate the ranked-feedback variable.
  const rankDisabled = process.env.CLEAR_MILLER_RANK_DISABLE === '1';
  const orderedGaps = rankDisabled ? gaps : rankGapsWorstFirst(gaps);
  const showCount = Math.min(5, orderedGaps.length);
  const lines = orderedGaps.slice(0, showCount).map(formatGapLine);
  const more = orderedGaps.length > showCount ? `\n  ... and ${orderedGaps.length - showCount} more` : '';

  const messageLines = ['You are not done yet. The app does not satisfy the approved requirements.'];
  if (!rankDisabled) {
    // Miller view of exactly the blocking gaps: which constraint families are violated, how hard.
    const { vector } = evaluateAudit({ items: gaps });
    const vectorSummary = formatVector(vector);
    if (vectorSummary) messageLines.push(`Violation vector (worst first): ${vectorSummary}`);
  }
  messageLines.push(lines.join('\n') + more);
  messageLines.push('');
  messageLines.push('Fix the Clear source. Do not rewrite the requirements unless the user asks.');
  messageLines.push(`(ralph-retry ${retryIndex}/${normalizeRetryCap(maxRetries)})`);
  return messageLines.join('\n');
}

export function readRalphConfig(env = {}) {
  const enabledRaw = env[RALPH_DEFAULTS.ENABLED_ENV];
  const layerOff = enabledRaw === '0' || enabledRaw === 'false';
  const overrideRaw = env[RALPH_DEFAULTS.MAX_RETRIES_ENV];
  const overrideNum = overrideRaw != null ? Number(overrideRaw) : NaN;
  const maxRetries = Number.isFinite(overrideNum) && overrideNum >= 0
    ? overrideNum
    : RALPH_DEFAULTS.MAX_RETRIES;
  const blockRaw = env[RALPH_DEFAULTS.BLOCK_UNVERIFIED_ENV];
  const blockOnUnverified = !(blockRaw === '0' || blockRaw === 'false');

  return {
    layerOff,
    maxRetries,
    blockOnUnverified,
  };
}

function blockingItems(items, blockOnUnverified) {
  return (items || []).filter(item => {
    if (!item || item.status === 'passed' || item.status === 'waived') return false;
    if (item.status === 'unverified') return blockOnUnverified;
    return true;
  });
}

function formatGapLine(item) {
  const text = item.text || 'Unnamed requirement';
  const status = item.status || 'missing';
  const reason = item.reason || 'No evidence found.';
  return `  - [${status}] ${text}: ${reason}`;
}

function normalizeRetryCap(maxRetries) {
  return (typeof maxRetries === 'number' && maxRetries >= 0)
    ? maxRetries
    : RALPH_DEFAULTS.MAX_RETRIES;
}

function tierOfFamily(familyKey) {
  return FAMILY_TIER.has(familyKey) ? FAMILY_TIER.get(familyKey) : 1;
}

// Worst-first: hardest constraint family first, then missing before unverified.
function rankGapsWorstFirst(gaps) {
  const STATUS_RANK = { missing: 2, unverified: 1 };
  return [...gaps].sort((left, right) => {
    const tierGap = tierOfFamily(right.family) - tierOfFamily(left.family);
    if (tierGap !== 0) return tierGap;
    return (STATUS_RANK[right.status] || 0) - (STATUS_RANK[left.status] || 0);
  });
}

// Compact "approval=2, audit=1" summary, families ordered hardest-first, zeros omitted.
function formatVector(vector) {
  return Object.entries(vector || {})
    .filter(([, magnitude]) => magnitude > 0)
    .sort((left, right) => tierOfFamily(right[0]) - tierOfFamily(left[0]))
    .map(([familyKey, magnitude]) => `${familyKey}=${magnitude}`)
    .join(', ');
}
