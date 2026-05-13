"""
Unit tests for runtime/grammar_matcher.py.

Run:
  python runtime/grammar_matcher_test.py
OR:
  python -m unittest runtime.grammar_matcher_test

Uses a FakeDb in-memory stub so the matcher works without a real SQLite.
The matcher only needs a db.query(table_name) method.
"""

import json
import os
import sys
import unittest
import importlib.util

# Direct-script execution path setup.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "grammar_matcher",
    os.path.join(os.path.dirname(__file__), "grammar_matcher.py"),
)
grammar_matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grammar_matcher)


class FakeDb:
    """Tiny in-memory stub. Holds rows per table; supports query() + insert."""

    def __init__(self, initial=None):
        self._tables = {}
        if initial:
            for tbl, rows in initial.items():
                self._tables[tbl] = list(rows)

    def query(self, table):
        return list(self._tables.get(table, []))

    def insert(self, table, row):
        self._tables.setdefault(table, []).append(row)


SEED_REGISTRY = {
    "concepts": {
        "storage_table": "concepts",
        "frames": [
            {
                "frame_id": "TASK",
                "effect": "internal",
                "canonical_phrase": "remind me to",
                "synonyms": ["todo:", "remember to"],
                "slots": [{"name": "what", "type": "text", "required": True}],
                "permission_scope": None,
                "first_n_runs_require_confirm": None,
            },
            {
                "frame_id": "ENERGY_LOG",
                "effect": "internal",
                "canonical_phrase": "energy",
                "synonyms": [],
                "slots": [{"name": "level", "type": "number", "required": False}],
                "permission_scope": None,
                "first_n_runs_require_confirm": None,
            },
            {
                "frame_id": "OPEN_NOTEPAD",
                "effect": "external",
                "canonical_phrase": "open notepad",
                "synonyms": ["launch notepad"],
                "slots": [],
                "permission_scope": "spawn:notepad.exe",
                "first_n_runs_require_confirm": 3,
            },
        ],
    },
}


class TestGrammarMatcher(unittest.TestCase):

    def test_canonical_phrase_prefix_matches_and_extracts_remainder(self):
        db = FakeDb()
        match = grammar_matcher.make_grammar_match(db, SEED_REGISTRY)
        result = match("concepts", "remind me to call Marcus")
        self.assertEqual(result["kind"], "matched")
        self.assertEqual(result["frame"]["frame_id"], "TASK")
        self.assertEqual(result["slotValues"]["what"], "call Marcus")
        self.assertEqual(result["missingSlots"], [])

    def test_synonym_prefix_fallback(self):
        db = FakeDb()
        match = grammar_matcher.make_grammar_match(db, SEED_REGISTRY)
        result = match("concepts", "todo: pick up groceries")
        self.assertEqual(result["kind"], "matched")
        self.assertEqual(result["frame"]["frame_id"], "TASK")
        self.assertEqual(result["slotValues"]["what"], "pick up groceries")

    def test_no_match_when_no_prefix_matches(self):
        db = FakeDb()
        match = grammar_matcher.make_grammar_match(db, SEED_REGISTRY)
        result = match("concepts", "random gibberish input here")
        self.assertEqual(result["kind"], "no_match")
        self.assertIsNone(result["frame"])

    def test_no_match_when_grammar_name_unknown(self):
        db = FakeDb()
        match = grammar_matcher.make_grammar_match(db, SEED_REGISTRY)
        result = match("does_not_exist", "remind me to call Marcus")
        self.assertEqual(result["kind"], "no_match")

    def test_longest_prefix_wins(self):
        registry = {
            "concepts": {
                "storage_table": "concepts",
                "frames": [
                    {
                        "frame_id": "OPEN_ANYTHING",
                        "effect": "internal",
                        "canonical_phrase": "open",
                        "synonyms": [],
                        "slots": [],
                    },
                    {
                        "frame_id": "OPEN_NOTEPAD",
                        "effect": "external",
                        "canonical_phrase": "open notepad",
                        "synonyms": [],
                        "slots": [],
                    },
                ],
            },
        }
        db = FakeDb()
        match = grammar_matcher.make_grammar_match(db, registry)
        result = match("concepts", "open notepad")
        self.assertEqual(result["kind"], "matched")
        self.assertEqual(result["frame"]["frame_id"], "OPEN_NOTEPAD")

    def test_runtime_inserted_frame_is_picked_up_without_recompile(self):
        # This is the runtime-extensible property the whole primitive exists
        # for. A row inserted into the storage table at runtime must match
        # against user input even when the registry seed has no such frame.
        db = FakeDb({"concepts": [
            {
                "frame_id": "DRINK_WATER",
                "effect": "internal",
                "canonical_phrase": "drink water",
                "synonyms_json": json.dumps(["hydrate"]),
                "slots_json": json.dumps([{"name": "amount", "type": "text", "required": False}]),
                "permission_scope": None,
                "first_n_runs_require_confirm": None,
            },
        ]})
        empty_registry = {"concepts": {"storage_table": "concepts", "frames": []}}
        match = grammar_matcher.make_grammar_match(db, empty_registry)
        result = match("concepts", "drink water 16oz")
        self.assertEqual(result["kind"], "matched")
        self.assertEqual(result["frame"]["frame_id"], "DRINK_WATER")
        self.assertEqual(result["slotValues"]["amount"], "16oz")


if __name__ == "__main__":
    unittest.main()
