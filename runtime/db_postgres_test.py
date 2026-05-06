"""
Tests for runtime/db_postgres.py.

Run:
  python runtime/db_postgres_test.py

Tests are split into two classes:

- TestDbPostgresOffline — exercises the parts that don't need a live
  Postgres connection (schema registration, identifier guards, type
  mapping, the update_with_version stub). These run anywhere.

- TestDbPostgresLive — needs psycopg installed AND DATABASE_URL set
  to a reachable Postgres. Skipped if either is missing.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "db_postgres", os.path.join(os.path.dirname(__file__), "db_postgres.py")
)
db_pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db_pg)


class TestDbPostgresOffline(unittest.TestCase):
    """Tests that don't need a live Postgres."""

    def setUp(self):
        db_pg._reset_for_tests()

    def test_module_imports_cleanly(self):
        """Module loads without psycopg. Lazy import keeps health-check
        servers up even when psycopg isn't installed."""
        self.assertTrue(hasattr(db_pg, "create_table"))
        self.assertTrue(hasattr(db_pg, "find_all"))
        self.assertTrue(hasattr(db_pg, "insert"))
        self.assertTrue(hasattr(db_pg, "update"))
        self.assertTrue(hasattr(db_pg, "remove"))
        self.assertTrue(hasattr(db_pg, "aggregate"))

    def test_create_table_registers_schema(self):
        db_pg.create_table("users", {"name": {"type": "text"}, "age": {"type": "number"}})
        self.assertIn("users", db_pg._schemas)
        self.assertEqual(db_pg._schemas["users"]["name"]["type"], "text")
        self.assertEqual(db_pg._schemas["users"]["age"]["type"], "number")

    def test_unsafe_table_name_rejected(self):
        with self.assertRaises(ValueError):
            db_pg.create_table("users; DROP TABLE x", {})

    def test_unsafe_filter_key_rejected(self):
        # _build_where rejects unsafe column names
        with self.assertRaises(ValueError):
            db_pg._build_where({"name; DELETE": "Alice"})

    def test_build_where_empty_filter(self):
        result = db_pg._build_where(None)
        self.assertEqual(result["sql"], "")
        self.assertEqual(result["params"], [])

    def test_build_where_single_filter(self):
        result = db_pg._build_where({"status": "paid"})
        self.assertEqual(result["sql"], "WHERE status = %s")
        self.assertEqual(result["params"], ["paid"])

    def test_build_where_multi_filter(self):
        result = db_pg._build_where({"status": "paid", "team": "support"})
        # Order is dict-insertion, both keys present
        self.assertIn("status = %s", result["sql"])
        self.assertIn("team = %s", result["sql"])
        self.assertIn(" AND ", result["sql"])
        self.assertEqual(set(result["params"]), {"paid", "support"})

    def test_to_pg_type_default_text(self):
        self.assertEqual(db_pg._to_pg_type(None), "TEXT")
        self.assertEqual(db_pg._to_pg_type({}), "TEXT")
        self.assertEqual(db_pg._to_pg_type({"type": "text"}), "TEXT")

    def test_to_pg_type_mappings(self):
        self.assertEqual(db_pg._to_pg_type({"type": "number"}), "DOUBLE PRECISION")
        self.assertEqual(db_pg._to_pg_type({"type": "boolean"}), "BOOLEAN")
        self.assertEqual(db_pg._to_pg_type({"type": "fk"}), "INTEGER")
        self.assertEqual(db_pg._to_pg_type({"type": "timestamp"}), "TIMESTAMPTZ")

    def test_update_with_version_is_stubbed(self):
        # Same stub pattern as db.py's update_with_version
        with self.assertRaises(NotImplementedError):
            db_pg.update_with_version("users", {"id": 1}, {"name": "Alice"})

    def test_save_and_load_are_no_ops(self):
        # Should return None and not raise (same as JS port)
        self.assertIsNone(db_pg.save())
        self.assertIsNone(db_pg.load())

    def test_aggregate_unknown_function_rejected(self):
        with self.assertRaises(ValueError):
            db_pg.aggregate("orders", "median", "amount")  # median not supported


@unittest.skipUnless(
    db_pg._PSYCOPG_AVAILABLE and os.environ.get("DATABASE_URL"),
    "psycopg not installed or DATABASE_URL not set — skipping live Postgres tests",
)
class TestDbPostgresLive(unittest.TestCase):
    """Tests that need a real Postgres + psycopg installed.

    Skipped automatically when either is missing. Set DATABASE_URL to a
    test database before running.

    These mirror the parallel tests in runtime/db_test.py against SQLite,
    so passing both sides is the cross-runtime interop guarantee.
    """

    def setUp(self):
        db_pg._reset_for_tests()
        # Drop test tables if they exist
        for name in ["pg_test_users", "pg_test_deals"]:
            try:
                db_pg.run(f"DROP TABLE IF EXISTS {name}")
            except Exception:
                pass

    def test_create_insert_find_round_trip(self):
        db_pg.create_table("pg_test_users", {"name": {"type": "text", "required": True}})
        result = db_pg.insert("pg_test_users", {"name": "Alice"})
        self.assertEqual(result["name"], "Alice")
        self.assertIsNotNone(result["id"])
        found = db_pg.find_one("pg_test_users", {"id": result["id"]})
        self.assertEqual(found["name"], "Alice")

    def test_aggregate_sum(self):
        db_pg.create_table("pg_test_deals", {"amount": {"type": "number"}, "status": {"type": "text"}})
        db_pg.insert("pg_test_deals", {"amount": 100, "status": "paid"})
        db_pg.insert("pg_test_deals", {"amount": 250, "status": "paid"})
        db_pg.insert("pg_test_deals", {"amount": 50, "status": "pending"})
        total = db_pg.aggregate("pg_test_deals", "sum", "amount", {"status": "paid"})
        self.assertEqual(total, 350)


if __name__ == "__main__":
    unittest.main(verbosity=2)
