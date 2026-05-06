"""
CLEAR RUNTIME — POSTGRES DATABASE MODULE (Python port)

Python port of runtime/db-postgres.js. Drop-in replacement for runtime/db.py
when the compiled Clear app is deployed against a real PostgreSQL database
(Railway, Render, Fly Postgres, RDS, etc.) instead of local SQLite.

API matches runtime/db.py exactly (snake_case for PEP 8). Same names,
same call shapes — the compiled Python emit picks one or the other based
on the source's `database is postgres` vs default declaration.

Library dep: `psycopg[binary]>=3.0` (PyPI).
    pip install 'psycopg[binary]>=3.0'

INTEROP: the schema this module creates matches what runtime/db-postgres.js
creates on the same DATABASE_URL — same column names, same types, same
auto-added (id PRIMARY KEY, user_id, tenant_id, _version) columns. A row
inserted by the JS Postgres runtime reads back via this Python module
(and vice versa). Use case: a Clear app deployed with the JS target on
Railway can be re-deployed with the Python target on the same DB without
data migration.

DEFERRED to follow-up (matches db.py's pattern):

- **`update_with_version(table, where, data)`** — optimistic-lock UPDATE.
  Stubbed with NotImplementedError + plan pointer, same as in db.py.
- **Tenant-scoped Row-Level Security context (`AsyncLocalStorage` in JS,
  `contextvars` in Python).** The JS port uses AsyncLocalStorage to pass
  `tenant_id` through every nested call so RLS can enforce isolation.
  Python equivalent: `contextvars.ContextVar`. Stubbed for v1; the
  underlying `SET LOCAL app.current_tenant_id` SQL runs on every query
  but the value is currently a no-op default.
- **Sensitive-field encrypt-at-rest integration with sensitive_crypto.py.**
  db.py has the lazy-import + per-call encrypt/decrypt; this module marks
  the integration points but doesn't wire them yet.

These deferred pieces are tracked in plans/plan-python-parity.md.
Today's scaffold gets Python apps to the point where they can persist
data on Postgres; the optimistic-lock + tenant-RLS-context + sensitive-
field integrations follow once the basic CRUD is verified end-to-end
against a real Postgres instance.
"""

import os
import re
import threading
from typing import Any, Dict, List, Optional, Union

try:
    import psycopg  # type: ignore
    from psycopg.rows import dict_row  # type: ignore
    _PSYCOPG_AVAILABLE = True
except ImportError:
    _PSYCOPG_AVAILABLE = False

# Defer DATABASE_URL check to first query — don't crash on import for
# health-check-only servers (matches db-postgres.js behavior).
_pool_lock = threading.Lock()
_pool: Optional[Any] = None  # psycopg.ConnectionPool when initialized


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        if not _PSYCOPG_AVAILABLE:
            raise RuntimeError(
                "[clear:db_postgres] psycopg is not installed. "
                "Run: pip install 'psycopg[binary]>=3.0'"
            )
        if not os.environ.get("DATABASE_URL"):
            raise RuntimeError(
                "[clear:db_postgres] DATABASE_URL not set. "
                "Add a Postgres database in your deploy target's dashboard."
            )
        # psycopg3's ConnectionPool — lazy connection, automatic recycling.
        # Match db-postgres.js's connection string pattern.
        from psycopg_pool import ConnectionPool  # type: ignore
        _pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=0, max_size=10)
        return _pool


# In-memory schema registry (synchronous — matches db-postgres.js)
_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {}
_tables_created: set = set()
_IDENT_RE = re.compile(r"^[a-z_][a-z0-9_]*$", re.IGNORECASE)


def _is_safe_identifier(name: str) -> bool:
    return bool(_IDENT_RE.match(name))


_PG_TYPE_MAP = {
    "number": "DOUBLE PRECISION",
    "boolean": "BOOLEAN",
    "fk": "INTEGER",
    "timestamp": "TIMESTAMPTZ",
}


def _to_pg_type(config: Optional[Dict[str, Any]]) -> str:
    if not config or not config.get("type"):
        return "TEXT"
    return _PG_TYPE_MAP.get(config["type"], "TEXT")


def _coerce_record(record: Optional[Dict[str, Any]], schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Postgres returns proper Python types via psycopg's adapters, so
    boolean coercion (which SQLite needs) is mostly a no-op here. Hooks
    are kept for parity with db.py and for future sensitive-field
    decryption integration."""
    if not record or not schema:
        return record
    return dict(record)


def _build_where(filter_dict: Optional[Dict[str, Any]], param_offset: int = 0):
    """Build a parameterized WHERE clause. Postgres uses $1, $2 syntax via
    psycopg's parameter style — we use %s which psycopg translates."""
    if not filter_dict:
        return {"sql": "", "params": []}
    keys = list(filter_dict.keys())
    for k in keys:
        if not _is_safe_identifier(k):
            raise ValueError(f"Unsafe column name: {k}")
    parts = [f"{k} = %s" for k in keys]
    params = [filter_dict[k] for k in keys]
    return {"sql": "WHERE " + " AND ".join(parts), "params": params}


def _ensure_table(table: str) -> None:
    """Lazy CREATE TABLE on first query against a registered schema.
    Matches db-postgres.js's lazy-init pattern — schemas are recorded
    synchronously by create_table(), tables are created on first use."""
    if table in _tables_created:
        return
    schema = _schemas.get(table)
    if not schema:
        return  # raw_query case — no schema registered
    full_schema = dict(schema)
    cols = ["id SERIAL PRIMARY KEY"]
    for field, config in full_schema.items():
        if not _is_safe_identifier(field):
            raise ValueError(f"Unsafe column name: {field}")
        if field == "id":
            continue
        col_def = f"{field} {_to_pg_type(config)}"
        if config.get("required"):
            col_def += " NOT NULL"
        if "default" in config:
            d = config["default"]
            if isinstance(d, str):
                col_def += f" DEFAULT '{d}'"
            elif isinstance(d, bool):
                col_def += f" DEFAULT {'TRUE' if d else 'FALSE'}"
            elif d is not None:
                col_def += f" DEFAULT {d}"
        cols.append(col_def)
    # Auto-add user_id / tenant_id / _version (mirrors db-postgres.js)
    if "user_id" not in full_schema:
        cols.append("user_id INTEGER")
    if "tenant_id" not in full_schema:
        cols.append("tenant_id INTEGER")
    if "_version" not in full_schema:
        cols.append("_version INTEGER DEFAULT 1")
    sql = f"CREATE TABLE IF NOT EXISTS {table} ({', '.join(cols)})"
    with _get_pool().connection() as conn:
        conn.execute(sql)
    _tables_created.add(table)


# ----------------------------------------------------------------------
# Public API — matches runtime/db.py
# ----------------------------------------------------------------------

def create_table(name: str, schema: Dict[str, Dict[str, Any]]) -> None:
    """Register schema. Actual CREATE TABLE happens lazily on first use
    via _ensure_table() because module load may happen before the pool
    is connectable (e.g. health-check-only servers)."""
    if not _is_safe_identifier(name):
        raise ValueError(f"Unsafe table name: {name}")
    _schemas[name] = schema


def find_all(table: str, filter_dict: Optional[Dict[str, Any]] = None,
             options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    _ensure_table(table)
    where = _build_where(filter_dict)
    sql = f"SELECT * FROM {table} {where['sql']}"
    options = options or {}
    limit = options.get("limit")
    offset = options.get("offset")
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    if offset is not None:
        sql += f" OFFSET {int(offset)}"
    schema = _schemas.get(table)
    with _get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, where["params"])
            rows = cur.fetchall()
    return [_coerce_record(r, schema) for r in rows]


def find_one(table: str, filter_dict: Dict[str, Any],
             options: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    results = find_all(table, filter_dict, {"limit": 1, **(options or {})})
    return results[0] if results else None


def insert(table: str, record: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    _ensure_table(table)
    keys = [k for k in record.keys() if _is_safe_identifier(k)]
    placeholders = ", ".join(["%s"] * len(keys))
    cols = ", ".join(keys)
    params = [record[k] for k in keys]
    sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) RETURNING *"
    with _get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
    return dict(row) if row else {**record}


def update(table: str, filter_or_record: Union[int, Dict[str, Any]],
           data: Optional[Dict[str, Any]] = None) -> int:
    """Two call shapes (matches db.py + db.js):
    - update(table, record_with_id) — uses record's id, updates all other fields
    - update(table, filter_dict, data_dict) — explicit WHERE + SET"""
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    _ensure_table(table)
    if data is None:
        if not isinstance(filter_or_record, dict) or "id" not in filter_or_record:
            raise ValueError("update(table, record) requires an `id` field on the record")
        rec = dict(filter_or_record)
        record_id = rec.pop("id")
        filter_dict = {"id": record_id}
        data = rec
    else:
        filter_dict = filter_or_record if isinstance(filter_or_record, dict) else {"id": filter_or_record}

    set_keys = [k for k in data.keys() if _is_safe_identifier(k)]
    set_clause = ", ".join([f"{k} = %s" for k in set_keys])
    set_params = [data[k] for k in set_keys]
    where = _build_where(filter_dict)
    sql = f"UPDATE {table} SET {set_clause} {where['sql']}"
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, set_params + where["params"])
            return cur.rowcount


def update_with_version(table: str, filter_dict: Dict[str, Any], data: Dict[str, Any]) -> int:
    """Optimistic-lock UPDATE. Stubbed for v1 — matches db.py's pattern."""
    raise NotImplementedError(
        "update_with_version is the optimistic-lock primitive — port deferred. "
        "Tracked in plans/plan-python-parity.md as priority follow-up."
    )


def remove(table: str, filter_dict: Optional[Dict[str, Any]] = None) -> int:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    _ensure_table(table)
    where = _build_where(filter_dict)
    sql = f"DELETE FROM {table} {where['sql']}".strip() if where["sql"] else f"DELETE FROM {table}"
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, where["params"])
            return cur.rowcount


_AGG_FNS = {"sum": "SUM", "avg": "AVG", "min": "MIN", "max": "MAX", "count": "COUNT"}


def aggregate(table: str, fn: str, field: str, filter_dict: Optional[Dict[str, Any]] = None) -> Optional[Union[int, float]]:
    if not _is_safe_identifier(table) or not _is_safe_identifier(field):
        raise ValueError(f"Unsafe identifier: table={table}, field={field}")
    sql_fn = _AGG_FNS.get(fn.lower())
    if not sql_fn:
        raise ValueError(f"Unknown aggregate function: {fn}")
    _ensure_table(table)
    where = _build_where(filter_dict)
    sql = f"SELECT {sql_fn}({field}) AS result FROM {table} {where['sql']}"
    with _get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, where["params"])
            row = cur.fetchone()
    return row["result"] if row else None


def run(sql: str) -> None:
    with _get_pool().connection() as conn:
        conn.execute(sql)


def execute(sql: str) -> None:
    run(sql)


def save() -> None:
    """No-op. Postgres is always durable (matches db-postgres.js)."""


def load() -> None:
    """No-op. Pool initializes lazily on first query."""


def reset() -> None:
    """TRUNCATE all known tables. Used by test harnesses."""
    if not _tables_created:
        return
    names = ", ".join(t for t in _tables_created if _is_safe_identifier(t))
    if names:
        with _get_pool().connection() as conn:
            conn.execute(f"TRUNCATE {names} RESTART IDENTITY CASCADE")


def close() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _reset_for_tests() -> None:
    """Test helper: clears the schema registry. Doesn't drop tables."""
    _schemas.clear()
    _tables_created.clear()
