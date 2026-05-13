// =============================================================================
// CLEAR RUNTIME — GRAMMAR MATCHER (Phase 1 of Lenat-in-Clear, 2026-05-13)
// =============================================================================
//
// PURPOSE: Resolve a free-form user input string against a runtime-extensible
// grammar's live frame set. Used by the `match input against 'name'`
// expression compiled by the new RUNTIME_GRAMMAR node type.
//
// MATCHING ALGORITHM (Phase 1 — canonical-phrase prefix + synonym prefix,
// length-tiebreak):
//
//   1. Lowercase the input and trim surrounding whitespace.
//   2. For every frame in the live set (registry seed + storage table rows):
//      a. Score = length of the longest prefix of the input that matches
//         either the canonical phrase OR any synonym.
//      b. Track the best-scoring frame; ties record an ambiguous result.
//   3. If no frame scored above zero, return kind 'no_match'.
//   4. If a single best frame won, extract slot values from the remainder
//      and return kind 'matched'. The remainder becomes the first declared
//      text slot's value (Phase 1 simple extraction; richer slot extractors
//      land in Phase 2 of the plan).
//   5. If a tie was found, return kind 'ambiguous' with both frame ids.
//
// LIVE FRAME SET = registry seed (compile-time frames) merged with rows from
// the storage table. The storage table is read on every match call so new
// frames inserted via a normal CRUD save take effect without recompile.
// That's the runtime-extensible property the whole primitive exists for.
//
// RETURN SHAPE:
//   {
//     kind: 'matched' | 'no_match' | 'partial' | 'ambiguous',
//     frame: <frame object>,           // present when kind === 'matched'
//     slotValues: { name: value, ... }, // values extracted from the input
//     missingSlots: [name, ...],        // required slots with no value
//     ambiguousMatches: [frameId, ...], // present when kind === 'ambiguous'
//   }
//
// =============================================================================

'use strict';

/**
 * Tokenize an input string by lowercasing + splitting on whitespace.
 * Pure helper, exported for the test file.
 *
 * @param {string} input - Raw user input string
 * @returns {string} Lowercased trimmed input
 */
function normalizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.toLowerCase().trim();
}

/**
 * Score a frame against an input. Returns the length of the longest prefix
 * of the input that matches either the canonical phrase or any synonym.
 * Zero means no match.
 *
 * @param {string} normalizedInput - Already-lowercased input
 * @param {object} frame - Frame with canonical_phrase + synonyms array
 * @returns {{ score: number, matchedPhrase: string }}
 */
function scoreFrameAgainstInput(normalizedInput, frame) {
  if (!frame) return { score: 0, matchedPhrase: '' };
  const candidates = [];
  if (typeof frame.canonical_phrase === 'string' && frame.canonical_phrase) {
    candidates.push(frame.canonical_phrase.toLowerCase());
  }
  if (Array.isArray(frame.synonyms)) {
    for (const syn of frame.synonyms) {
      if (typeof syn === 'string' && syn) candidates.push(syn.toLowerCase());
    }
  }
  let best = 0;
  let bestPhrase = '';
  for (const candidate of candidates) {
    if (normalizedInput.startsWith(candidate)) {
      if (candidate.length > best) {
        best = candidate.length;
        bestPhrase = candidate;
      }
    }
  }
  return { score: best, matchedPhrase: bestPhrase };
}

/**
 * Extract slot values from the remainder of the input (whatever's left
 * after the matched canonical phrase / synonym). Phase 1 keeps this simple:
 * the entire remainder becomes the value of the first declared text slot.
 * Phase 2 of the plan adds typed slot extractors (datetime, fuzzy, about,
 * regex+remainder) — those will replace this body.
 *
 * @param {object} frame - The matched frame
 * @param {string} remainder - The post-prefix portion of the input
 * @returns {{ slotValues: object, missingSlots: string[] }}
 */
function extractSlotValues(frame, remainder) {
  const slotValues = {};
  const missingSlots = [];
  const slots = Array.isArray(frame.slots) ? frame.slots : [];
  const cleaned = (remainder || '').trim();
  let assigned = false;
  for (const slot of slots) {
    if (!slot || typeof slot.name !== 'string') continue;
    if (!assigned && cleaned && (slot.type === 'text' || slot.type == null)) {
      slotValues[slot.name] = cleaned;
      assigned = true;
    } else if (slot.required) {
      missingSlots.push(slot.name);
    }
  }
  return { slotValues, missingSlots };
}

/**
 * Read every frame currently in the grammar's storage table. Each row is
 * normalized into the registry shape so callers can treat seed frames and
 * runtime frames identically.
 *
 * @param {object} db - The compiled-app db handle (has db.findAll)
 * @param {string} tableName - SQL table name, e.g. 'concepts'
 * @returns {Array<object>} Array of frame objects
 */
function loadFramesFromTable(db, tableName) {
  if (!db || typeof db.findAll !== 'function') return [];
  let rows;
  try {
    rows = db.findAll(tableName);
  } catch (_err) {
    // Table may not exist yet on first run; treat as empty set.
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    let synonyms = [];
    let slots = [];
    try {
      if (typeof row.synonyms_json === 'string' && row.synonyms_json) {
        synonyms = JSON.parse(row.synonyms_json);
      }
    } catch (_e) { /* ignore malformed JSON */ }
    try {
      if (typeof row.slots_json === 'string' && row.slots_json) {
        slots = JSON.parse(row.slots_json);
      }
    } catch (_e) { /* ignore malformed JSON */ }
    return {
      frame_id: row.frame_id,
      effect: row.effect,
      canonical_phrase: row.canonical_phrase,
      synonyms,
      slots,
      permission_scope: row.permission_scope,
      first_n_runs_require_confirm: row.first_n_runs_require_confirm,
    };
  });
}

/**
 * Build the _grammarMatch helper bound to a db handle + registry.
 * The compiled app calls makeGrammarMatch(db, _grammarRegistry) once and
 * stashes the result on globalThis so every endpoint reuses it.
 *
 * @param {object} db - The compiled-app db handle
 * @param {object} registry - Map of grammarName → { storageTable, frames }
 * @returns {(name: string, input: string) => object}
 */
function makeGrammarMatch(db, registry) {
  /**
   * Match an input against the named grammar.
   *
   * @param {string} name - Grammar name (the string after `runtime grammar`)
   * @param {string} input - Raw user input
   * @returns {object} Match result — see file header for full shape
   */
  return function _grammarMatch(name, input) {
    const grammar = registry && registry[name];
    if (!grammar) {
      return { kind: 'no_match', frame: null, slotValues: {}, missingSlots: [], ambiguousMatches: [] };
    }
    const seedFrames = Array.isArray(grammar.frames) ? grammar.frames : [];
    const tableFrames = loadFramesFromTable(db, grammar.storageTable);
    // Runtime rows shadow seed frames by frame_id — the user can override a
    // compile-time frame by inserting a row with the same id at runtime.
    const seenIds = new Set();
    const liveFrames = [];
    for (const tf of tableFrames) {
      if (tf.frame_id) seenIds.add(tf.frame_id);
      liveFrames.push(tf);
    }
    for (const sf of seedFrames) {
      if (sf.frame_id && !seenIds.has(sf.frame_id)) liveFrames.push(sf);
    }

    const normalized = normalizeInput(input);
    const originalInput = typeof input === 'string' ? input.trim() : '';
    if (!normalized) {
      return { kind: 'no_match', frame: null, slotValues: {}, missingSlots: [], ambiguousMatches: [] };
    }

    let bestScore = 0;
    let bestFrames = [];
    let bestPhrase = '';
    for (const frame of liveFrames) {
      const { score, matchedPhrase } = scoreFrameAgainstInput(normalized, frame);
      if (score === 0) continue;
      if (score > bestScore) {
        bestScore = score;
        bestFrames = [frame];
        bestPhrase = matchedPhrase;
      } else if (score === bestScore) {
        bestFrames.push(frame);
      }
    }

    if (bestFrames.length === 0) {
      return { kind: 'no_match', frame: null, slotValues: {}, missingSlots: [], ambiguousMatches: [] };
    }
    if (bestFrames.length > 1) {
      return {
        kind: 'ambiguous',
        frame: null,
        slotValues: {},
        missingSlots: [],
        ambiguousMatches: bestFrames.map(f => f.frame_id),
      };
    }

    const matchedFrame = bestFrames[0];
    const remainder = originalInput.slice(bestPhrase.length).trim();
    const { slotValues, missingSlots } = extractSlotValues(matchedFrame, remainder);
    return {
      kind: missingSlots.length > 0 ? 'partial' : 'matched',
      frame: matchedFrame,
      slotValues,
      missingSlots,
      ambiguousMatches: [],
    };
  };
}

module.exports = {
  makeGrammarMatch,
  // Exported for the test suite; not part of the public API.
  _internal: { normalizeInput, scoreFrameAgainstInput, extractSlotValues, loadFramesFromTable },
};
