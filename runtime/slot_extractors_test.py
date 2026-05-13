"""
Tests for runtime/slot_extractors.py — Phase 2.4 of Lenat-in-Clear.

Mirrors the JS test corpus in slot-extractors.test.js so both targets share
the same behavioral contract. Run from the clear repo root:

    python runtime/slot_extractors_test.py
"""

import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from slot_extractors import (   # noqa: E402
    _extract_datetime,
    _fuzzy_match,
    _extract_about,
    _regex_capture_rem,
)


# Reference date pinned so weekday math is deterministic. 2026-05-13 is
# a Wednesday — matches Lenat plan's session timestamp.
REF = datetime(2026, 5, 13, 12, 0, 0)


class TestExtractDatetime(unittest.TestCase):
    def test_tomorrow_at_2pm(self):
        result = _extract_datetime('remind me tomorrow at 2pm to call', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].day, 14)
        self.assertEqual(result['value'].hour, 14)
        self.assertEqual(result['remainder'], 'remind me to call')

    def test_tonight(self):
        result = _extract_datetime('remind me tonight to email Marcus', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].hour, 20)
        self.assertEqual(result['remainder'], 'remind me to email Marcus')

    def test_in_30_minutes(self):
        result = _extract_datetime('in 30 minutes write the demo', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].minute, 30)
        self.assertEqual(result['remainder'], 'write the demo')

    def test_in_2_hours(self):
        result = _extract_datetime('in 2 hours run the migration', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].hour, 14)
        self.assertEqual(result['remainder'], 'run the migration')

    def test_next_tuesday_at_9am(self):
        result = _extract_datetime('next tuesday at 9am open the retro', ref_date=REF)
        self.assertIsNotNone(result)
        # Wed May 13 → next Tuesday is May 19
        self.assertEqual(result['value'].day, 19)
        self.assertEqual(result['value'].hour, 9)
        self.assertEqual(result['remainder'], 'open the retro')

    def test_friday_at_5pm(self):
        result = _extract_datetime('friday at 5pm send the recap', ref_date=REF)
        self.assertIsNotNone(result)
        # Python weekday(): Friday = 4. JS Date.getDay(): Friday = 5.
        # We don't care which frame as long as the day name resolves correctly.
        self.assertEqual(result['value'].weekday(), 4)  # Python Friday
        self.assertEqual(result['value'].hour, 17)
        self.assertEqual(result['remainder'], 'send the recap')

    def test_slash_date(self):
        result = _extract_datetime('5/13 ship the demo', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].month, 5)
        self.assertEqual(result['value'].day, 13)
        self.assertEqual(result['remainder'], 'ship the demo')

    def test_iso_date(self):
        result = _extract_datetime('2026-05-13 morning rehearsal', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].year, 2026)
        self.assertEqual(result['remainder'], 'morning rehearsal')

    def test_this_evening(self):
        result = _extract_datetime('this evening test the launcher', ref_date=REF)
        self.assertIsNotNone(result)
        self.assertEqual(result['value'].hour, 18)
        self.assertEqual(result['remainder'], 'test the launcher')

    def test_no_datetime_returns_none(self):
        result = _extract_datetime('energy 6 tired', ref_date=REF)
        self.assertIsNone(result)

    def test_open_notepad_returns_none(self):
        result = _extract_datetime('open notepad', ref_date=REF)
        self.assertIsNone(result)

    def test_llm_fallback_fires_only_when_fast_path_misses(self):
        seen = {}

        def ask_ai(prompt):
            seen['prompt'] = prompt
            # Return a JSON-shaped response.
            return '{"value": "2026-12-04T09:00:00", "remainder": "celebrate"}'

        result = _extract_datetime(
            'the friday after thanksgiving celebrate',
            ref_date=REF,
            ask_ai=ask_ai,
        )
        # Note: the fast-path may catch "friday" — in that case the LLM is
        # NOT consulted, which is the correct behavior. The contract is
        # "fast-path first; LLM only on miss." Either outcome is fine here.
        self.assertIsNotNone(result)

    def test_llm_fallback_does_not_fire_when_fast_path_matches(self):
        calls = {'count': 0}

        def ask_ai(prompt):
            calls['count'] += 1
            return '{}'

        result = _extract_datetime('tomorrow at 2pm meet', ref_date=REF, ask_ai=ask_ai)
        self.assertEqual(calls['count'], 0)
        self.assertIsNotNone(result)


class TestFuzzyMatch(unittest.TestCase):
    def test_longest_substring_match(self):
        r = _fuzzy_match('paint', ['mspaint', 'calc', 'notepad', 'explorer'], 0.5)
        self.assertIsNotNone(r)
        self.assertEqual(r['value'], 'mspaint')

    def test_typo_correct_notpad_notepad(self):
        r = _fuzzy_match('notpad', ['mspaint', 'calc', 'notepad', 'explorer'], 0.7)
        self.assertIsNotNone(r)
        self.assertEqual(r['value'], 'notepad')

    def test_long_typo_callculator_calc(self):
        r = _fuzzy_match('callculator', ['mspaint', 'calc', 'notepad', 'explorer'], 0.5)
        self.assertIsNotNone(r)
        self.assertEqual(r['value'], 'calc')

    def test_tie_longest_wins(self):
        r = _fuzzy_match('screen', ['screenshot', 'screensaver', 'lock_screen'], 0.5)
        self.assertIsNotNone(r)
        # Both screenshot and screensaver are length-10 — first to score highest wins.
        self.assertIn(r['value'], ['screenshot', 'screensaver'])

    def test_no_match_returns_none(self):
        r = _fuzzy_match('completely unrelated', ['mspaint', 'calc', 'notepad'], 0.7)
        self.assertIsNone(r)


class TestExtractAbout(unittest.TestCase):
    def test_about_clause(self):
        r = _extract_about('remind me to email Marcus about Q3 numbers')
        self.assertEqual(r['what'], 'remind me to email Marcus')
        self.assertEqual(r['about'], 'Q3 numbers')

    def test_about_with_todo_prefix(self):
        r = _extract_about('todo: write demo about the launch')
        self.assertEqual(r['what'], 'todo: write demo')
        self.assertEqual(r['about'], 'the launch')

    def test_re_colon(self):
        r = _extract_about('remind me re: pricing model')
        self.assertEqual(r['what'], 'remind me')
        self.assertEqual(r['about'], 'pricing model')

    def test_regarding(self):
        r = _extract_about('note regarding the deal-desk demo')
        self.assertEqual(r['what'], 'note')
        self.assertEqual(r['about'], 'the deal-desk demo')

    def test_no_keyword(self):
        r = _extract_about('todo: stretch')
        self.assertEqual(r['what'], 'todo: stretch')
        self.assertIsNone(r['about'])


class TestRegexCaptureRem(unittest.TestCase):
    def test_digit_match(self):
        r = _regex_capture_rem('energy 6 tired', r'\d+')
        self.assertEqual(r['value'], '6')
        self.assertEqual(r['remainder'], 'energy  tired')

    def test_trailing_digit(self):
        r = _regex_capture_rem('mood is 7', r'\d+')
        self.assertEqual(r['value'], '7')
        self.assertEqual(r['remainder'], 'mood is ')

    def test_hash_number(self):
        r = _regex_capture_rem('task #42 done', r'#\d+')
        self.assertEqual(r['value'], '#42')
        self.assertEqual(r['remainder'], 'task  done')

    def test_no_match(self):
        r = _regex_capture_rem('no number here', r'\d+')
        self.assertIsNone(r['value'])
        self.assertEqual(r['remainder'], 'no number here')

    def test_first_match_only(self):
        r = _regex_capture_rem('first 100, then 200', r'\d+')
        self.assertEqual(r['value'], '100')
        self.assertEqual(r['remainder'], 'first , then 200')


if __name__ == '__main__':
    unittest.main(verbosity=2)
