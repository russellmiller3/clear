"""
Round-trip + edge case tests for runtime/db.py.

Run:
  python runtime/db_test.py
OR (no pytest needed):
  python -m unittest runtime.db_test

Uses an in-memory SQLite by setting CLEAR_DB_PATH to ':memory:' BEFORE
importing the module (the module opens its connection at import time).
"""

import os
import sys
import unittest

# Force the module to use an in-memory db before import. Each test class
# that needs a fresh schema can call _reset_for_tests + drop tables.
os.environ["CLEAR_DB_PATH"] = ":memory:"

# Allow direct-script execution without sys.path tweaks
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "db", os.path.join(os.path.dirname(__file__), "db.py")
)
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)


class TestDb(unittest.TestCase):

    def setUp(self):
        # Drop any leftover test tables from prior cases
        for name in ["users", "deals", "items"]:
            try:
                db.run(f"DROP TABLE IF EXISTS {name}")
            except Exception:
                pass
        db._reset_for_tests()

    def test_create_and_insert_and_find_round_trip(self):
        db.create_table("users", {"name": {"type": "text", "required": True}})
        result = db.insert("users", {"name": "Alice"})
        self.assertEqual(result["name"], "Alice")
        self.assertIsNotNone(result["id"])
        found = db.find_one("users", {"id": result["id"]})
        self.assertEqual(found["name"], "Alice")

    def test_find_all_with_filter(self):
        db.create_table("users", {"name": {"type": "text"}, "role": {"type": "text"}})
        db.insert("users", {"name": "Alice", "role": "admin"})
        db.insert("users", {"name": "Bob", "role": "user"})
        db.insert("users", {"name": "Carol", "role": "admin"})
        admins = db.find_all("users", {"role": "admin"})
        self.assertEqual(len(admins), 2)
        names = sorted(u["name"] for u in admins)
        self.assertEqual(names, ["Alice", "Carol"])

    def test_find_all_with_limit_and_offset(self):
        db.create_table("items", {"label": {"type": "text"}})
        for i in range(10):
            db.insert("items", {"label": f"item-{i}"})
        page = db.find_all("items", None, {"limit": 3, "offset": 2})
        self.assertEqual(len(page), 3)
        self.assertEqual(page[0]["label"], "item-2")

    def test_boolean_coercion_round_trip(self):
        db.create_table(
            "items",
            {"label": {"type": "text"}, "done": {"type": "boolean"}},
        )
        db.insert("items", {"label": "task-1", "done": True})
        db.insert("items", {"label": "task-2", "done": False})
        all_items = db.find_all("items", None, {"limit": 50})
        done_lookup = {i["label"]: i["done"] for i in all_items}
        self.assertIs(done_lookup["task-1"], True)
        self.assertIs(done_lookup["task-2"], False)

    def test_update_by_record_with_id(self):
        db.create_table("users", {"name": {"type": "text"}, "role": {"type": "text"}})
        result = db.insert("users", {"name": "Alice", "role": "user"})
        rows_affected = db.update("users", {"id": result["id"], "name": "Alice", "role": "admin"})
        self.assertEqual(rows_affected, 1)
        found = db.find_one("users", {"id": result["id"]})
        self.assertEqual(found["role"], "admin")

    def test_update_by_filter_and_data(self):
        db.create_table("users", {"name": {"type": "text"}, "role": {"type": "text"}})
        db.insert("users", {"name": "Alice", "role": "user"})
        db.insert("users", {"name": "Bob", "role": "user"})
        db.update("users", {"role": "user"}, {"role": "guest"})
        guests = db.find_all("users", {"role": "guest"})
        self.assertEqual(len(guests), 2)

    def test_remove_with_filter(self):
        db.create_table("items", {"label": {"type": "text"}})
        db.insert("items", {"label": "keep"})
        db.insert("items", {"label": "drop"})
        rows = db.remove("items", {"label": "drop"})
        self.assertEqual(rows, 1)
        remaining = db.find_all("items")
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["label"], "keep")

    def test_aggregate_sum_and_count(self):
        db.create_table("deals", {"amount": {"type": "number"}, "status": {"type": "text"}})
        db.insert("deals", {"amount": 100, "status": "paid"})
        db.insert("deals", {"amount": 250, "status": "paid"})
        db.insert("deals", {"amount": 50, "status": "pending"})
        total_paid = db.aggregate("deals", "sum", "amount", {"status": "paid"})
        self.assertEqual(total_paid, 350)
        count_pending = db.aggregate("deals", "count", "id", {"status": "pending"})
        self.assertEqual(count_pending, 1)

    def test_unsafe_table_name_rejected(self):
        with self.assertRaises(ValueError):
            db.create_table("users; DROP TABLE x", {})

    def test_unsafe_filter_key_rejected(self):
        db.create_table("users", {"name": {"type": "text"}})
        with self.assertRaises(ValueError):
            db.find_all("users", {"name; DELETE": "Alice"})

    def test_update_with_version_is_stubbed(self):
        with self.assertRaises(NotImplementedError):
            db.update_with_version("users", {"id": 1}, {"name": "Alice"})

    def test_hidden_field_stripped_from_responses(self):
        db.create_table(
            "users",
            {"name": {"type": "text"}, "deprecated": {"type": "text", "hidden": True}},
        )
        db.insert("users", {"name": "Alice", "deprecated": "old-value"})
        rows = db.find_all("users")
        self.assertEqual(rows[0]["name"], "Alice")
        self.assertNotIn("deprecated", rows[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
