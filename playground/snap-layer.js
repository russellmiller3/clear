/*
Snap Layer — auto-fix Meph's broken Clear before the user sees it.

When Meph indicates he's done with a chat turn, this layer checks whether the
source still has compile errors. If so, we inject a synthetic user follow-up
("you have N errors, fix them before stopping") and re-roll. Up to N retries.

The user only ever sees the final converged output — never a half-broken
intermediate state. Costs ~1 extra Claude call per session that Meph would
have shipped broken anyway, which is exactly the moment the cost is worth it.

This module exposes two pure functions that drive the wedge in /api/chat:
- shouldSnapRetry — "should we retry, given errors + retry count + env?"
- formatSnapMessage — "what synthetic user message do we inject?"

The wedge itself lives in playground/server.js around the end_turn detection.
Keeping the decision pure makes it cheap to test and easy to audit.
*/

export const SNAP_DEFAULTS = Object.freeze({
  MAX_RETRIES: 3,
  LAYER_OFF_ENV: 'SNAP_LAYER_OFF',
  MAX_RETRIES_ENV: 'SNAP_MAX_RETRIES',
});

/**
 * Decide whether to fire a snap retry.
 * Pure — no side effects, no env reads (caller passes layerOff explicitly).
 *
 * @param {object} args
 * @param {Array|null|undefined} args.currentErrors - current compile errors
 * @param {number} args.snapRetryCount - retries already used this turn
 * @param {number|undefined} args.maxRetries - cap (defaults to SNAP_DEFAULTS.MAX_RETRIES)
 * @param {boolean} args.layerOff - true to disable the layer entirely
 * @returns {boolean}
 */
export function shouldSnapRetry({ currentErrors, snapRetryCount, maxRetries, layerOff }) {
  if (layerOff) return false;
  if (!Array.isArray(currentErrors) || currentErrors.length === 0) return false;
  const cap = (typeof maxRetries === 'number' && maxRetries >= 0) ? maxRetries : SNAP_DEFAULTS.MAX_RETRIES;
  return snapRetryCount < cap;
}

/**
 * Format the synthetic user follow-up that asks Meph to fix the errors.
 * Reads as a real user nudge so Meph's response register stays consistent.
 *
 * @param {object} args
 * @param {Array} args.errors - the current compile errors
 * @param {number} args.retryIndex - 1-based retry number this firing represents
 * @param {number} args.maxRetries - the cap (used to show progress: "1/3")
 * @returns {string}
 */
export function formatSnapMessage({ errors, retryIndex, maxRetries }) {
  const total = errors.length;
  const noun = total === 1 ? 'compile error' : 'compile errors';
  const showCount = Math.min(5, total);
  const lines = errors.slice(0, showCount).map(e => formatErrorLine(e));
  const more = total > showCount ? `\n  ... and ${total - showCount} more` : '';

  return [
    `Wait — the source still has ${total} ${noun}:`,
    lines.join('\n') + more,
    '',
    `Fix these before stopping. (snap-retry ${retryIndex}/${maxRetries})`,
  ].join('\n');
}

function formatErrorLine(err) {
  if (typeof err === 'string') return `  - ${err}`;
  if (err && typeof err === 'object') {
    const lineLabel = err.line != null ? `line ${err.line}` : 'line ?';
    const msg = err.message || err.error || JSON.stringify(err);
    return `  - ${lineLabel}: ${msg}`;
  }
  return `  - ${String(err)}`;
}

/**
 * Convenience: read SNAP_DEFAULTS-aware env settings into a config object.
 * The handler in server.js calls this once at the top of /api/chat.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{maxRetries: number, layerOff: boolean}}
 */
export function readSnapConfig(env) {
  const layerOff = env[SNAP_DEFAULTS.LAYER_OFF_ENV] === '1' || env[SNAP_DEFAULTS.LAYER_OFF_ENV] === 'true';
  const overrideRaw = env[SNAP_DEFAULTS.MAX_RETRIES_ENV];
  const overrideNum = overrideRaw != null ? Number(overrideRaw) : NaN;
  const maxRetries = Number.isFinite(overrideNum) && overrideNum >= 0 ? overrideNum : SNAP_DEFAULTS.MAX_RETRIES;
  return { maxRetries, layerOff };
}
