"""
Clear Runtime — Grammar Matcher (Python parity for Phase 1 of Lenat-in-Clear).

Mirrors runtime/grammar-matcher.js byte-for-behavior. Resolves a free-form
user input string against a runtime-extensible grammar's live frame set.

Matching algorithm (Phase 1 — canonical-phrase prefix + synonym prefix,
length tiebreak):

  1. Lowercase + trim the input.
  2. For every live frame, score by the length of the longest prefix of the
     input that matches the canonical phrase or any synonym.
  3. Longest score wins; ties produce kind 'ambiguous'.
  4. The post-prefix remainder of the ORIGINAL-case input fills the first
     declared text slot. Phase 2 swaps in the typed slot-extractor stdlib.

Live frame set = storage table rows + registry seed. Runtime rows shadow
seed frames by frame_id so users can override a compile-time frame at
runtime with an insert.

Return shape:
    {
        "kind": "matched" | "no_match" | "partial" | "ambiguous",
        "frame": <frame dict>,
        "slotValues": {name: value},
        "missingSlots": [name, ...],
        "ambiguousMatches": [frame_id, ...],
    }
"""

import json


def normalize_input(text):
    """Lowercase + strip whitespace. Pure helper."""
    if not isinstance(text, str):
        return ""
    return text.lower().strip()


def score_frame_against_input(normalized_input, frame):
    """
    Score a frame against an input by longest-matching-prefix.

    Returns a tuple (score, matched_phrase). score==0 means no match.
    """
    if not frame:
        return 0, ""
    candidates = []
    canonical = frame.get("canonical_phrase")
    if isinstance(canonical, str) and canonical:
        candidates.append(canonical.lower())
    synonyms = frame.get("synonyms") or []
    if isinstance(synonyms, list):
        for syn in synonyms:
            if isinstance(syn, str) and syn:
                candidates.append(syn.lower())
    best = 0
    best_phrase = ""
    for candidate in candidates:
        if normalized_input.startswith(candidate):
            if len(candidate) > best:
                best = len(candidate)
                best_phrase = candidate
    return best, best_phrase


def extract_slot_values(frame, remainder):
    """
    Phase 1 simple extractor: dump the entire (case-preserved) remainder
    into the first declared text slot.

    Returns (slot_values dict, missing_slots list).
    """
    slot_values = {}
    missing_slots = []
    slots = frame.get("slots") or []
    cleaned = (remainder or "").strip()
    assigned = False
    for slot in slots:
        if not isinstance(slot, dict):
            continue
        name = slot.get("name")
        if not isinstance(name, str):
            continue
        slot_type = slot.get("type")
        if not assigned and cleaned and (slot_type == "text" or slot_type is None):
            slot_values[name] = cleaned
            assigned = True
        elif slot.get("required"):
            missing_slots.append(name)
    return slot_values, missing_slots


def load_frames_from_table(db, table_name):
    """
    Read every frame currently in the grammar's storage table. Returns
    them in registry shape so callers can treat seed and runtime frames
    identically.
    """
    if db is None or not hasattr(db, "query"):
        return []
    try:
        rows = db.query(table_name) or []
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        synonyms = []
        slots = []
        syn_json = row.get("synonyms_json")
        if isinstance(syn_json, str) and syn_json:
            try:
                synonyms = json.loads(syn_json)
            except Exception:
                synonyms = []
        slots_json = row.get("slots_json")
        if isinstance(slots_json, str) and slots_json:
            try:
                slots = json.loads(slots_json)
            except Exception:
                slots = []
        out.append({
            "frame_id": row.get("frame_id"),
            "effect": row.get("effect"),
            "canonical_phrase": row.get("canonical_phrase"),
            "synonyms": synonyms,
            "slots": slots,
            "permission_scope": row.get("permission_scope"),
            "first_n_runs_require_confirm": row.get("first_n_runs_require_confirm"),
        })
    return out


def make_grammar_match(db, registry):
    """
    Build the _grammar_match helper bound to a db handle + registry.

    The compiled app calls make_grammar_match(db, _grammar_registry) once
    and stashes the result on a module-level dict for reuse across endpoint
    handlers.
    """

    def _grammar_match(name, text):
        grammar = (registry or {}).get(name)
        if not grammar:
            return {
                "kind": "no_match",
                "frame": None,
                "slotValues": {},
                "missingSlots": [],
                "ambiguousMatches": [],
            }
        seed_frames = grammar.get("frames") or []
        table_frames = load_frames_from_table(db, grammar.get("storage_table"))
        # Runtime rows shadow seed frames by frame_id.
        seen_ids = set()
        live_frames = []
        for tf in table_frames:
            fid = tf.get("frame_id")
            if fid:
                seen_ids.add(fid)
            live_frames.append(tf)
        for sf in seed_frames:
            fid = sf.get("frame_id")
            if fid and fid not in seen_ids:
                live_frames.append(sf)

        normalized = normalize_input(text)
        original = text.strip() if isinstance(text, str) else ""
        if not normalized:
            return {
                "kind": "no_match",
                "frame": None,
                "slotValues": {},
                "missingSlots": [],
                "ambiguousMatches": [],
            }

        best_score = 0
        best_frames = []
        best_phrase = ""
        for frame in live_frames:
            score, matched_phrase = score_frame_against_input(normalized, frame)
            if score == 0:
                continue
            if score > best_score:
                best_score = score
                best_frames = [frame]
                best_phrase = matched_phrase
            elif score == best_score:
                best_frames.append(frame)

        if not best_frames:
            return {
                "kind": "no_match",
                "frame": None,
                "slotValues": {},
                "missingSlots": [],
                "ambiguousMatches": [],
            }
        if len(best_frames) > 1:
            return {
                "kind": "ambiguous",
                "frame": None,
                "slotValues": {},
                "missingSlots": [],
                "ambiguousMatches": [f.get("frame_id") for f in best_frames],
            }

        matched_frame = best_frames[0]
        remainder = original[len(best_phrase):].strip()
        slot_values, missing_slots = extract_slot_values(matched_frame, remainder)
        return {
            "kind": "partial" if missing_slots else "matched",
            "frame": matched_frame,
            "slotValues": slot_values,
            "missingSlots": missing_slots,
            "ambiguousMatches": [],
        }

    return _grammar_match
