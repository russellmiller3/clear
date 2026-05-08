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
  const showCount = Math.min(5, gaps.length);
  const lines = gaps.slice(0, showCount).map(formatGapLine);
  const more = gaps.length > showCount ? `\n  ... and ${gaps.length - showCount} more` : '';

  return [
    'You are not done yet. The app does not satisfy the approved requirements.',
    lines.join('\n') + more,
    '',
    'Fix the Clear source. Do not rewrite the requirements unless the user asks.',
    `(ralph-retry ${retryIndex}/${normalizeRetryCap(maxRetries)})`,
  ].join('\n');
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
