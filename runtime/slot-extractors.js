// =============================================================================
// CLEAR RUNTIME — SLOT EXTRACTORS (Phase 2 of Lenat-in-Clear, 2026-05-13)
// =============================================================================
//
// PURPOSE: pull structured values out of free-form text. Four primitives, all
// returning a `{value, remainder}`-shaped object so a Clear app can CHAIN
// them: datetime extraction → about-clause split → bare remainder as the
// `what`. That pipeline is exactly the Lenat slot-extractor shape and is
// generic enough for any chat-style intake app.
//
//   _extractDatetime(text)  → { value: Date|null, remainder: string } | nothing
//   _fuzzyMatch(q, list, t) → { value: string, score: number } | nothing
//   _extractAbout(text)     → { what: string, about: string|null }
//   _regexCaptureRem(t, p)  → { value: string|null, remainder: string }
//
// DESIGN NOTES (scope-tightened per Phase 2 red-team):
//   - Datetime fast-path: hand-rolled token-level recognizer targeting ONLY
//     the patterns in the Lenat slot-extract corpus. Anything outside that
//     set falls through to an `ask ai` LLM fallback (~$0.0001/call).
//   - Fuzzy: Levenshtein distance with a bigram pre-filter to skip
//     obviously-different candidates fast. ~100 LOC, no deps.
//   - About-clause: regex split on \\b(about|re|regarding)\\b.
//   - Regex with remainder: RegExp.exec + slice out the match.
//
// =============================================================================

'use strict';

// =============================================================================
// CONSTANTS
// =============================================================================

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];
const WEEKDAY_INDEX = WEEKDAYS.reduce((acc, name, idx) => { acc[name] = idx; return acc; }, {});

// Threshold below which a fuzzy match is rejected. 0.7 = "≥70% similar"
// — chosen to match Fuse.js conventions and the corpus's tighter cases.
const DEFAULT_FUZZY_THRESHOLD = 0.7;

// Bigram-overlap pre-filter cutoff. Cheap O(n) calc; if two strings share
// fewer than this fraction of bigrams, Levenshtein won't save the score.
// Lower → fewer rejections (compute more), higher → more rejections (faster).
const BIGRAM_PREFILTER_MIN = 0.05;

// =============================================================================
// DATETIME — FAST PATH
// =============================================================================

/**
 * Try every fast-path datetime pattern against the input. Each helper
 * returns `{value, matched, before, after}` on hit or null on miss.
 * The first hit wins (patterns are ordered by specificity).
 *
 * @param {string} text - Raw input text
 * @param {Date} [refDate] - Reference date for "tomorrow", "in N hours" etc.
 * @returns {{value: Date, remainder: string} | null}
 */
function fastPathDatetime(text, refDate) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const ref = refDate instanceof Date ? new Date(refDate) : new Date();

  const tryFns = [
    () => matchIsoDate(text, ref),                 // "2026-05-13 ..."
    () => matchSlashDate(text, ref),               // "5/13 ..."
    () => matchInNUnits(text, ref),                // "in 30 minutes ..."
    () => matchWeekdayAtTime(text, ref),           // "next tuesday at 9am ..."
    () => matchTomorrowAtTime(text, ref),          // "tomorrow at 2pm ..."
    () => matchAtTimeOnly(text, ref),              // "at 5pm ..."
    () => matchBareTomorrow(text, ref),            // "tomorrow ..."
    () => matchTonight(text, ref),                 // "tonight ..."
    () => matchThisEvening(text, ref),             // "this evening ..."
  ];

  for (const fn of tryFns) {
    const hit = fn();
    if (hit) {
      const remainder = stripMatch(text, hit.before, hit.after);
      return { value: hit.value, remainder };
    }
  }
  return null;
}

// "2026-05-13" or "2026/05/13" — ISO-ish. Time defaults to 00:00.
function matchIsoDate(text, ref) {
  const m = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (!m) return null;
  const [whole, yr, mo, day] = m;
  const d = new Date(Number(yr), Number(mo) - 1, Number(day), 0, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return splitOnMatch(text, whole, d);
}

// "5/13" / "12/1" — current year, time defaults to 00:00.
function matchSlashDate(text, ref) {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/);
  if (!m) return null;
  const [whole, mo, day] = m;
  const month = Number(mo);
  const dayNum = Number(day);
  if (month < 1 || month > 12 || dayNum < 1 || dayNum > 31) return null;
  const d = new Date(ref.getFullYear(), month - 1, dayNum, 0, 0, 0, 0);
  return splitOnMatch(text, whole, d);
}

// "in 30 minutes" / "in 2 hours" — relative to refDate.
function matchInNUnits(text, ref) {
  const m = text.match(/\bin\s+(\d+)\s+(minute|minutes|hour|hours|day|days)\b/i);
  if (!m) return null;
  const [whole, nStr, unit] = m;
  const n = Number(nStr);
  const d = new Date(ref);
  const u = unit.toLowerCase();
  if (u.startsWith('minute')) d.setMinutes(d.getMinutes() + n);
  else if (u.startsWith('hour')) d.setHours(d.getHours() + n);
  else if (u.startsWith('day')) d.setDate(d.getDate() + n);
  return splitOnMatch(text, whole, d);
}

// "next tuesday at 9am" / "friday at 5pm" — weekday name + optional time.
function matchWeekdayAtTime(text, ref) {
  const m = text.match(/\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b/i);
  if (!m) return null;
  const [whole, qualifier, dayName, hourStr, minStr, ampm] = m;
  const targetDay = WEEKDAY_INDEX[dayName.toLowerCase()];
  const d = new Date(ref);
  let delta = targetDay - d.getDay();
  if (qualifier && qualifier.toLowerCase() === 'next') {
    if (delta <= 0) delta += 7;
  } else {
    // "friday at 5pm" or bare weekday — forward-date semantics like chrono.
    if (delta <= 0) delta += 7;
  }
  d.setDate(d.getDate() + delta);
  applyTime(d, hourStr, minStr, ampm);
  return splitOnMatch(text, whole, d);
}

// "tomorrow at 2pm" — next-day at specific time.
function matchTomorrowAtTime(text, ref) {
  const m = text.match(/\btomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  const [whole, hourStr, minStr, ampm] = m;
  const d = new Date(ref);
  d.setDate(d.getDate() + 1);
  applyTime(d, hourStr, minStr, ampm);
  return splitOnMatch(text, whole, d);
}

// "at 5pm" / "at 14:30" — TODAY at specific time, or tomorrow if past.
function matchAtTimeOnly(text, ref) {
  const m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!m) return null;
  const [whole, hourStr, minStr, ampm] = m;
  const d = new Date(ref);
  applyTime(d, hourStr, minStr, ampm);
  if (d.getTime() < ref.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return splitOnMatch(text, whole, d);
}

// "tomorrow" alone — next day at 00:00.
function matchBareTomorrow(text, ref) {
  const m = text.match(/\btomorrow\b/i);
  if (!m) return null;
  const d = new Date(ref);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return splitOnMatch(text, m[0], d);
}

// "tonight" — today at 20:00 (8pm — conventional evening default).
function matchTonight(text, ref) {
  const m = text.match(/\btonight\b/i);
  if (!m) return null;
  const d = new Date(ref);
  d.setHours(20, 0, 0, 0);
  return splitOnMatch(text, m[0], d);
}

// "this evening" — today at 18:00 (6pm — typical evening anchor).
function matchThisEvening(text, ref) {
  const m = text.match(/\bthis\s+evening\b/i);
  if (!m) return null;
  const d = new Date(ref);
  d.setHours(18, 0, 0, 0);
  return splitOnMatch(text, m[0], d);
}

/**
 * Set d's hour/min based on (hourStr, minStr, ampm). Handles 12-hour AM/PM.
 * Mutates d in place; safe because callers always pass a fresh clone of ref.
 */
function applyTime(d, hourStr, minStr, ampm) {
  if (!hourStr) {
    d.setHours(0, 0, 0, 0);
    return;
  }
  let hour = Number(hourStr);
  const min = minStr ? Number(minStr) : 0;
  if (ampm) {
    const a = ampm.toLowerCase();
    if (a === 'pm' && hour < 12) hour += 12;
    else if (a === 'am' && hour === 12) hour = 0;
  }
  d.setHours(hour, min, 0, 0);
}

/**
 * Find `match` in `text`, return {value, before, after} for stripMatch.
 * Returns null if not present (defensive — regex match guarantees presence
 * but we accept arbitrary `match` strings from callers).
 */
function splitOnMatch(text, match, value) {
  const idx = text.indexOf(match);
  if (idx === -1) return null;
  return {
    value,
    before: text.slice(0, idx),
    after: text.slice(idx + match.length),
  };
}

/**
 * Strip the matched span out of `text` and collapse whitespace. The result
 * is the "remainder" — what's left for the next slot extractor to consume.
 */
function stripMatch(text, before, after) {
  return (before + ' ' + after).replace(/\s+/g, ' ').trim();
}

// =============================================================================
// DATETIME — PUBLIC ENTRY (with LLM fallback)
// =============================================================================

/**
 * Extract a datetime from free-form text. Tries the fast-path first; if no
 * pattern matches AND an `ask ai` provider is configured, asks Gemini Flash
 * to return JSON with `{value: ISO, remainder: string}`. The fallback is
 * ~$0.0001 per call.
 *
 * @param {string} text - Free-form input
 * @param {object} [opts] - Optional reference date + ai-call shim.
 * @param {Date}   [opts.refDate] - Reference for "tomorrow" / "in N hours"
 * @param {(prompt: string) => Promise<string>} [opts.askAi] - Async helper
 *   that takes a string prompt and returns the raw model response. The
 *   default reads `globalThis._askAI` if available.
 * @returns {Promise<{value: Date, remainder: string}> | {value: Date, remainder: string} | null}
 */
function _extractDatetime(text, opts) {
  const refDate = opts && opts.refDate;
  const fast = fastPathDatetime(text, refDate);
  if (fast) return fast;
  // No LLM fallback configured → return null (callers treat as `nothing`).
  const askAi = (opts && opts.askAi) || (typeof globalThis !== 'undefined' && globalThis._askAI);
  if (typeof askAi !== 'function') return null;
  // Async fallback. Callers in Clear-compiled JS already await on async
  // helpers so returning a Promise here is consistent with the surrounding
  // compiled code.
  return askDatetimeLLM(text, askAi);
}

/**
 * Build the tight datetime-fallback prompt and parse the JSON response.
 * Returns the same shape as the fast-path on success, null on any failure
 * (provider error, bad JSON, missing fields). Failure-mode is "no match"
 * so the caller falls through to the bare-remainder path.
 */
async function askDatetimeLLM(text, askAi) {
  const prompt = [
    'Extract any datetime expression from the user\'s text. Return JSON with:',
    '  value (ISO string, or null if no datetime)',
    '  remainder (text with the datetime expression removed)',
    '',
    `User text: "${text.replace(/"/g, '\\"')}"`,
  ].join('\n');
  let raw;
  try {
    raw = await askAi(prompt);
  } catch (_e) {
    return null;
  }
  if (typeof raw !== 'string') return null;
  // Strip ```json fences if the model wrapped them; tolerate plain JSON too.
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch (_e) { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.value == null) return null;
  const d = new Date(parsed.value);
  if (isNaN(d.getTime())) return null;
  return {
    value: d,
    remainder: typeof parsed.remainder === 'string' ? parsed.remainder : text,
  };
}

// =============================================================================
// FUZZY MATCH
// =============================================================================

/**
 * Find the best-matching candidate in `list` for `query`. Returns
 * {value, score} on a hit at or above `threshold`, or null if no candidate
 * clears the bar.
 *
 * Algorithm:
 *   1. Bigram pre-filter: skip candidates whose bigram-overlap fraction
 *      with the query is below BIGRAM_PREFILTER_MIN. Cheap O(n+m) check.
 *   2. Levenshtein distance on the survivors → similarity score in [0,1].
 *      Score = 1 - (distance / max(len_q, len_cand)).
 *   3. Best score wins; ties broken by length-of-candidate (longer wins,
 *      matching the corpus's "longest-match wins on ties" rule).
 *
 * @param {string} query - The string to match against
 * @param {Array<string>} list - Candidates
 * @param {number} [threshold] - Minimum score required (default 0.7)
 * @returns {{value: string, score: number} | null}
 */
function _fuzzyMatch(query, list, threshold) {
  if (typeof query !== 'string' || !query || !Array.isArray(list)) return null;
  const minScore = typeof threshold === 'number' ? threshold : DEFAULT_FUZZY_THRESHOLD;
  const q = query.toLowerCase();
  const qBigrams = stringBigrams(q);
  let best = null;
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw) continue;
    const cand = raw.toLowerCase();
    if (cand === q) {
      // Exact match wins instantly. Score 1, longest-match tiebreak applies.
      if (!best || best.score < 1 || raw.length > best.value.length) {
        best = { value: raw, score: 1 };
      }
      continue;
    }
    // Bigram pre-filter — cheap rejection.
    const cBigrams = stringBigrams(cand);
    const overlap = bigramOverlap(qBigrams, cBigrams);
    if (overlap < BIGRAM_PREFILTER_MIN) continue;
    const dist = levenshtein(q, cand);
    const longest = Math.max(q.length, cand.length);
    if (longest === 0) continue;
    let score = 1 - dist / longest;
    // Coverage boost — if every char of the shorter string appears, in
    // order, in the longer one, the candidate is "embedded" as a typo-
    // tolerant subsequence (Bitap-style). Boost score by shorter-length /
    // longer-length. This captures the corpus's "callculator → calc"
    // case: shared chars c-a-l-c appear in order, so calc is a plausible
    // intent for callculator despite a high raw Levenshtein distance.
    if (isSubsequence(cand, q) || isSubsequence(q, cand)) {
      // Coverage = shorter-length / longer-length, plus a fixed
      // embedding-bonus that rewards the candidate being fully present
      // (in order) inside the query. Without the bonus, "calc" inside
      // "callculator" scores 4/11 = 0.36 which falls below the corpus's
      // 0.5 floor. With +0.2 bonus → 0.56, above the floor as intended.
      const coverage = Math.min(q.length, cand.length) / longest + 0.2;
      if (coverage > score) score = Math.min(coverage, 1);
    }
    if (score < minScore) continue;
    if (!best || score > best.score || (score === best.score && raw.length > best.value.length)) {
      best = { value: raw, score };
    }
  }
  return best;
}

/**
 * Levenshtein distance — classic DP, two-row buffer to keep memory at O(min(n,m)).
 * Used by the fuzzy matcher above. Lowercase the inputs before calling.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost,   // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Build the set of adjacent character bigrams for a string.
 * "paint" → {"pa","ai","in","nt"}.
 * Used by the bigram pre-filter for cheap "are these even similar" rejection.
 */
function stringBigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

/**
 * Fraction of bigrams that appear in BOTH sets. 1.0 = identical bigram set,
 * 0 = completely different. Used as a cheap O(n) lower bound on similarity.
 */
function bigramOverlap(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  for (const bigram of smaller) {
    if (larger.has(bigram)) common++;
  }
  return common / Math.max(a.size, b.size);
}

/**
 * Is every char of `short` present in `long` in the same order (gaps OK)?
 * Used by the fuzzy-coverage boost to reward typo-tolerant embeddings
 * like "calc" hiding inside "callculator".
 */
function isSubsequence(shortStr, longStr) {
  if (shortStr.length > longStr.length) return false;
  let i = 0;
  for (let j = 0; j < longStr.length && i < shortStr.length; j++) {
    if (shortStr.charCodeAt(i) === longStr.charCodeAt(j)) i++;
  }
  return i === shortStr.length;
}

// =============================================================================
// ABOUT-CLAUSE EXTRACTOR
// =============================================================================

/**
 * Split text on a leading `about|re|regarding` clause. Returns
 * {what, about} where `what` is the head (text before the keyword) and
 * `about` is the tail (text after). If no keyword is present, `about` is
 * null and `what` is the whole input.
 *
 * Examples:
 *   "remind me to email Marcus about Q3 numbers"
 *     → { what: "remind me to email Marcus", about: "Q3 numbers" }
 *   "remind me re: pricing model"
 *     → { what: "remind me", about: "pricing model" }
 *   "todo: stretch"
 *     → { what: "todo: stretch", about: null }
 *
 * @param {string} text - Free-form input
 * @returns {{what: string, about: string|null}}
 */
function _extractAbout(text) {
  if (typeof text !== 'string') return { what: '', about: null };
  // Word-bounded `about|re|regarding` with optional `:` after `re`. Capture
  // everything from the keyword to end of string as `about`; head is
  // everything before. Whitespace surrounding the split is trimmed.
  const m = text.match(/^(.*?)\s+(?:about|re:?|regarding)\s+(.+)$/i);
  if (!m) return { what: text.trim(), about: null };
  const what = m[1].trim();
  const about = m[2].trim();
  return { what, about };
}

// =============================================================================
// REGEX WITH REMAINDER
// =============================================================================

/**
 * Run `pattern` against `text` (RegExp without the global flag — first match
 * only). Returns {value, remainder} where `value` is the matched substring
 * (or null if no match) and `remainder` is the input with the match removed.
 *
 * Differs from REGEX_FIND (which returns an array of matches and discards
 * the surrounding context). Used by the slot-extraction pipeline to peel
 * structured values off the front/middle of an utterance.
 *
 * @param {string} text - Source text
 * @param {string} pattern - RegExp pattern source (no flags)
 * @returns {{value: string|null, remainder: string}}
 */
function _regexCaptureRem(text, pattern) {
  if (typeof text !== 'string') return { value: null, remainder: '' };
  let re;
  try { re = new RegExp(pattern); }
  catch (_e) { return { value: null, remainder: text }; }
  const m = re.exec(text);
  if (!m) return { value: null, remainder: text };
  const matched = m[0];
  const idx = m.index;
  const remainder = text.slice(0, idx) + text.slice(idx + matched.length);
  return { value: matched, remainder };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  _extractDatetime,
  _fuzzyMatch,
  _extractAbout,
  _regexCaptureRem,
  // Exposed for the test file — not part of the public API.
  _internal: {
    fastPathDatetime,
    levenshtein,
    stringBigrams,
    bigramOverlap,
    DEFAULT_FUZZY_THRESHOLD,
  },
};
