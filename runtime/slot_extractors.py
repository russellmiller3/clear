"""
Clear Runtime — Slot Extractors (Python parity for Phase 2 of Lenat-in-Clear).

Mirrors runtime/slot-extractors.js. Pulls structured values out of free-form
text via four primitives that all return a `{value, remainder}`-style dict so
callers can CHAIN them: datetime → about-clause → bare remainder as `what`.

    _extract_datetime(text)         → {value: datetime, remainder: str} | None
    _fuzzy_match(query, list, t)    → {value: str, score: float} | None
    _extract_about(text)            → {what: str, about: str|None}
    _regex_capture_rem(text, p)     → {value: str|None, remainder: str}

Design notes:
    - Datetime fast-path is hand-rolled token-level recognizer, targeting only
      the patterns in Lenat's slot-extract corpus. Anything outside that set
      returns None (the JS sibling has an async LLM fallback; in Python we
      keep it sync — callers pass a `ask_ai` callable explicitly if they want
      the fallback). Phase 6 wires real provider routing.
    - Fuzzy uses Levenshtein distance with a bigram pre-filter, plus a
      subsequence-coverage boost for typo-tolerant embeddings (calc inside
      callculator). ~100 LOC, no deps.
    - About-clause = regex split on \\b(about|re|regarding)\\b.
    - Regex with remainder = re.search + slice.
"""

import math
import re
from datetime import datetime, timedelta


# =============================================================================
# CONSTANTS
# =============================================================================

_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
_WEEKDAY_INDEX = {name: idx for idx, name in enumerate(_WEEKDAYS)}

# Threshold below which a fuzzy match is rejected. 0.7 = "≥70% similar".
DEFAULT_FUZZY_THRESHOLD = 0.7

# Bigram-overlap pre-filter cutoff. Cheap O(n) calc; if two strings share
# fewer than this fraction of bigrams, Levenshtein won't save the score.
_BIGRAM_PREFILTER_MIN = 0.05


# =============================================================================
# DATETIME — FAST PATH
# =============================================================================

def _fast_path_datetime(text, ref_date=None):
    """Try every fast-path datetime pattern against the input. The first
    hit wins (patterns ordered by specificity).

    Returns {'value': datetime, 'remainder': str} on match, None on miss.
    """
    if not isinstance(text, str) or not text.strip():
        return None
    ref = ref_date if isinstance(ref_date, datetime) else datetime.now()

    try_fns = [
        _match_iso_date,            # "2026-05-13 ..."
        _match_slash_date,          # "5/13 ..."
        _match_in_n_units,          # "in 30 minutes ..."
        _match_weekday_at_time,     # "next tuesday at 9am ..."
        _match_tomorrow_at_time,    # "tomorrow at 2pm ..."
        _match_at_time_only,        # "at 5pm ..."
        _match_bare_tomorrow,       # "tomorrow ..."
        _match_tonight,             # "tonight ..."
        _match_this_evening,        # "this evening ..."
    ]
    for fn in try_fns:
        hit = fn(text, ref)
        if hit:
            remainder = _strip_match(text, hit['before'], hit['after'])
            return {'value': hit['value'], 'remainder': remainder}
    return None


# "2026-05-13" or "2026/05/13" — ISO-ish. Time defaults to 00:00.
def _match_iso_date(text, ref):
    m = re.search(r'\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b', text)
    if not m:
        return None
    whole, yr, mo, day = m.group(0), m.group(1), m.group(2), m.group(3)
    try:
        d = datetime(int(yr), int(mo), int(day))
    except ValueError:
        return None
    return _split_on_match(text, whole, d)


# "5/13" / "12/1" — current year, time defaults to 00:00.
def _match_slash_date(text, ref):
    m = re.search(r'\b(\d{1,2})/(\d{1,2})\b(?!/)', text)
    if not m:
        return None
    whole, mo, day = m.group(0), m.group(1), m.group(2)
    month = int(mo)
    day_num = int(day)
    if not (1 <= month <= 12 and 1 <= day_num <= 31):
        return None
    try:
        d = datetime(ref.year, month, day_num)
    except ValueError:
        return None
    return _split_on_match(text, whole, d)


# "in 30 minutes" / "in 2 hours" — relative to ref_date.
def _match_in_n_units(text, ref):
    m = re.search(r'\bin\s+(\d+)\s+(minute|minutes|hour|hours|day|days)\b', text, re.IGNORECASE)
    if not m:
        return None
    whole, n_str, unit = m.group(0), m.group(1), m.group(2)
    n = int(n_str)
    u = unit.lower()
    if u.startswith('minute'):
        d = ref + timedelta(minutes=n)
    elif u.startswith('hour'):
        d = ref + timedelta(hours=n)
    else:
        d = ref + timedelta(days=n)
    return _split_on_match(text, whole, d)


# "next tuesday at 9am" / "friday at 5pm" — weekday name + optional time.
def _match_weekday_at_time(text, ref):
    m = re.search(
        r'\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)'
        r'(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b',
        text, re.IGNORECASE,
    )
    if not m:
        return None
    whole = m.group(0)
    qualifier = m.group(1)
    day_name = m.group(2)
    hour_str = m.group(3)
    min_str = m.group(4)
    ampm = m.group(5)
    # Python's weekday(): Monday=0..Sunday=6. Our table: Sunday=0..Saturday=6
    # (matches JS Date.getDay()). Convert ref.weekday() into that frame.
    js_today = (ref.weekday() + 1) % 7  # Mon=0 → 1, ..., Sun=6 → 0
    target_day = _WEEKDAY_INDEX[day_name.lower()]
    delta = target_day - js_today
    # Both "next" and bare weekday roll forward when delta <= 0 (chrono-style
    # forward-date semantics — "friday at 5pm" on Friday means next Friday).
    if delta <= 0:
        delta += 7
    d = ref + timedelta(days=delta)
    d = _apply_time(d, hour_str, min_str, ampm)
    return _split_on_match(text, whole, d)


# "tomorrow at 2pm" — next-day at specific time.
def _match_tomorrow_at_time(text, ref):
    m = re.search(r'\btomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b', text, re.IGNORECASE)
    if not m:
        return None
    whole = m.group(0)
    hour_str, min_str, ampm = m.group(1), m.group(2), m.group(3)
    d = ref + timedelta(days=1)
    d = _apply_time(d, hour_str, min_str, ampm)
    return _split_on_match(text, whole, d)


# "at 5pm" / "at 14:30" — TODAY at specific time, or tomorrow if past.
def _match_at_time_only(text, ref):
    m = re.search(r'\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b', text, re.IGNORECASE)
    if not m:
        return None
    whole = m.group(0)
    hour_str, min_str, ampm = m.group(1), m.group(2), m.group(3)
    d = _apply_time(ref, hour_str, min_str, ampm)
    if d < ref:
        d = d + timedelta(days=1)
    return _split_on_match(text, whole, d)


# "tomorrow" alone — next day at 00:00.
def _match_bare_tomorrow(text, ref):
    m = re.search(r'\btomorrow\b', text, re.IGNORECASE)
    if not m:
        return None
    d = (ref + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return _split_on_match(text, m.group(0), d)


# "tonight" — today at 20:00 (8pm — conventional evening default).
def _match_tonight(text, ref):
    m = re.search(r'\btonight\b', text, re.IGNORECASE)
    if not m:
        return None
    d = ref.replace(hour=20, minute=0, second=0, microsecond=0)
    return _split_on_match(text, m.group(0), d)


# "this evening" — today at 18:00 (6pm — typical evening anchor).
def _match_this_evening(text, ref):
    m = re.search(r'\bthis\s+evening\b', text, re.IGNORECASE)
    if not m:
        return None
    d = ref.replace(hour=18, minute=0, second=0, microsecond=0)
    return _split_on_match(text, m.group(0), d)


def _apply_time(d, hour_str, min_str, ampm):
    """Return new datetime with hour/minute set per the (hour_str, min_str, ampm)
    tuple. Handles 12-hour AM/PM. If hour_str is None, returns midnight.
    """
    if not hour_str:
        return d.replace(hour=0, minute=0, second=0, microsecond=0)
    hour = int(hour_str)
    minute = int(min_str) if min_str else 0
    if ampm:
        a = ampm.lower()
        if a == 'pm' and hour < 12:
            hour += 12
        elif a == 'am' and hour == 12:
            hour = 0
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _split_on_match(text, match, value):
    """Find `match` in `text`, return dict for _strip_match. Returns None if
    not present (defensive)."""
    idx = text.find(match)
    if idx == -1:
        return None
    return {
        'value': value,
        'before': text[:idx],
        'after': text[idx + len(match):],
    }


def _strip_match(text, before, after):
    """Strip the matched span out of `text` and collapse whitespace."""
    return re.sub(r'\s+', ' ', before + ' ' + after).strip()


# =============================================================================
# DATETIME — PUBLIC ENTRY
# =============================================================================

def _extract_datetime(text, ref_date=None, ask_ai=None):
    """Extract a datetime from free-form text. Fast-path only on the Python
    side; if no pattern matches and `ask_ai` is provided, calls it with a
    tight prompt expecting JSON `{value: ISO, remainder: str}`. Returns
    None if both paths fail.

    Args:
        text: Free-form input.
        ref_date: Reference datetime for relative terms (tomorrow, in N hours).
        ask_ai: Optional sync callable (prompt: str) -> str (raw model output).
    """
    fast = _fast_path_datetime(text, ref_date)
    if fast:
        return fast
    if not callable(ask_ai):
        return None
    return _ask_datetime_llm(text, ask_ai)


def _ask_datetime_llm(text, ask_ai):
    """Sync fallback that asks the LLM for a datetime. Failure mode is `None`
    so the caller falls through to the bare-remainder path."""
    import json as _json
    prompt = (
        "Extract any datetime expression from the user's text. Return JSON with:\n"
        "  value (ISO string, or null if no datetime)\n"
        "  remainder (text with the datetime expression removed)\n"
        "\n"
        f'User text: "{text.replace(chr(34), chr(92) + chr(34))}"'
    )
    try:
        raw = ask_ai(prompt)
    except Exception:
        return None
    if not isinstance(raw, str):
        return None
    # Strip ```json fences if the model wrapped them.
    cleaned = re.sub(r'^\s*```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```\s*$', '', cleaned)
    try:
        parsed = _json.loads(cleaned)
    except (ValueError, TypeError):
        return None
    if not isinstance(parsed, dict) or parsed.get('value') is None:
        return None
    try:
        # Tolerate trailing 'Z' as UTC marker.
        iso = parsed['value'].rstrip('Z')
        d = datetime.fromisoformat(iso)
    except (ValueError, TypeError, AttributeError):
        return None
    remainder = parsed.get('remainder') if isinstance(parsed.get('remainder'), str) else text
    return {'value': d, 'remainder': remainder}


# =============================================================================
# FUZZY MATCH
# =============================================================================

def _fuzzy_match(query, candidates, threshold=None):
    """Find the best-matching candidate in `candidates` for `query`. Returns
    {'value': str, 'score': float} on a hit at or above `threshold`, or None
    if no candidate clears the bar.

    Algorithm:
        1. Bigram pre-filter (cheap O(n+m) rejection).
        2. Levenshtein → score in [0,1].
        3. Subsequence-coverage boost for typo-tolerant embeddings.
        4. Best score wins; ties broken by length-of-candidate (longer wins).
    """
    if not isinstance(query, str) or not query or not isinstance(candidates, list):
        return None
    min_score = threshold if isinstance(threshold, (int, float)) else DEFAULT_FUZZY_THRESHOLD
    q = query.lower()
    q_bigrams = _string_bigrams(q)
    best = None
    for raw in candidates:
        if not isinstance(raw, str) or not raw:
            continue
        cand = raw.lower()
        if cand == q:
            # Exact match wins instantly. Score 1, longest-match tiebreak.
            if best is None or best['score'] < 1 or len(raw) > len(best['value']):
                best = {'value': raw, 'score': 1.0}
            continue
        # Bigram pre-filter — cheap rejection.
        c_bigrams = _string_bigrams(cand)
        overlap = _bigram_overlap(q_bigrams, c_bigrams)
        if overlap < _BIGRAM_PREFILTER_MIN:
            continue
        dist = _levenshtein(q, cand)
        longest = max(len(q), len(cand))
        if longest == 0:
            continue
        score = 1 - dist / longest
        # Coverage boost — embedded subsequence with +0.2 bonus.
        # See JS comment in slot-extractors.js for the calc-inside-callculator
        # rationale (raw Levenshtein 4/11=0.36 is below the corpus's 0.5
        # floor; +0.2 boost brings it to 0.56).
        if _is_subsequence(cand, q) or _is_subsequence(q, cand):
            coverage = min(len(q), len(cand)) / longest + 0.2
            if coverage > score:
                score = min(coverage, 1.0)
        if score < min_score:
            continue
        if best is None or score > best['score'] or (score == best['score'] and len(raw) > len(best['value'])):
            best = {'value': raw, 'score': score}
    return best


def _levenshtein(a, b):
    """Classic DP, two-row buffer for O(min(n,m)) memory. Lowercase inputs
    before calling."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    curr = [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        curr[0] = i
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(
                curr[j - 1] + 1,        # insertion
                prev[j] + 1,            # deletion
                prev[j - 1] + cost,     # substitution
            )
        prev, curr = curr, prev
    return prev[len(b)]


def _string_bigrams(s):
    """Build the set of adjacent character bigrams. "paint" → {pa, ai, in, nt}."""
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _bigram_overlap(a, b):
    """Fraction of bigrams that appear in BOTH sets."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    common = sum(1 for bg in a if bg in b)
    return common / max(len(a), len(b))


def _is_subsequence(short_str, long_str):
    """Is every char of `short` present in `long` in the same order (gaps OK)?"""
    if len(short_str) > len(long_str):
        return False
    i = 0
    for ch in long_str:
        if i >= len(short_str):
            break
        if short_str[i] == ch:
            i += 1
    return i == len(short_str)


# =============================================================================
# ABOUT-CLAUSE EXTRACTOR
# =============================================================================

def _extract_about(text):
    """Split text on a leading `about|re|regarding` clause. Returns dict
    {what, about}. `about` is None if no keyword is present and `what` is
    the whole input.

    Examples:
        "remind me to email Marcus about Q3 numbers"
            → {what: "remind me to email Marcus", about: "Q3 numbers"}
        "todo: stretch"
            → {what: "todo: stretch", about: None}
    """
    if not isinstance(text, str):
        return {'what': '', 'about': None}
    m = re.search(r'^(.*?)\s+(?:about|re:?|regarding)\s+(.+)$', text, re.IGNORECASE)
    if not m:
        return {'what': text.strip(), 'about': None}
    return {'what': m.group(1).strip(), 'about': m.group(2).strip()}


# =============================================================================
# REGEX WITH REMAINDER
# =============================================================================

def _regex_capture_rem(text, pattern):
    """Run `pattern` against `text` (first match only). Returns
    {value, remainder} where `value` is the matched substring (or None) and
    `remainder` is the input with the match removed.

    Differs from REGEX_FIND (array of matches, no remainder). Used by the
    slot-extraction pipeline to peel structured values off an utterance.
    """
    if not isinstance(text, str):
        return {'value': None, 'remainder': ''}
    try:
        regex = re.compile(pattern)
    except re.error:
        return {'value': None, 'remainder': text}
    m = regex.search(text)
    if not m:
        return {'value': None, 'remainder': text}
    matched = m.group(0)
    start = m.start()
    end = m.end()
    remainder = text[:start] + text[end:]
    return {'value': matched, 'remainder': remainder}
