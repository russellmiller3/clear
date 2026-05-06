"""
CLEAR RUNTIME — DATABASE MODULE (Python port, sqlite3 stdlib backend)

Python port of runtime/db.js. Provides the `db` API that compiled Clear
Python backend code calls. Backed by SQLite via Python's stdlib `sqlite3`
module (zero PyPI deps). Durable, atomic, zero data loss.

INTEROP: Uses the same SQLite file (CLEAR_DB_PATH env var or
./clear-data.db) and the same WAL journal mode as runtime/db.js. A row
inserted by the JS runtime via better-sqlite3 is readable by this module
via sqlite3, and vice versa, as long as the schema matches. The JS
runtime is the authoritative source of truth; this Python port is the
peer that lets Python apps reach the same data.

API (matches runtime/db.js exports, snake_case for PEP 8):

    create_table(name, schema)              CREATE TABLE IF NOT EXISTS
    find_all(table, filter=None, options=None)   SELECT * with WHERE + LIMIT
    find_one(table, filter)                 SELECT * WHERE ... LIMIT 1
    aggregate(table, fn, field, filter=None) SELECT FN(col) ... equality filter
    insert(table, record)                   INSERT, returns record with id
    update(table, filter_or_record, data=None) UPDATE matching records
    remove(table, filter=None)              DELETE matching records
    run(sql)                                execute raw SQL
    execute(sql)                            alias for run
    save()                                  no-op (SQLite is durable)
    load()                                  no-op (db opens on import)
    reset()                                 DELETE FROM all known tables
    close()                                 Close the SQLite connection

DEFERRED (stubbed, raise NotImplementedError):
    update_with_version(table, where, data) optimistic lock — needs port
    Sensitive field encrypt-at-rest integration with runtime/sensitive_crypto.py

These deferred pieces are tracked in plans/plan-python-parity.md as
follow-up work. Today's scaffold gets Python apps to the point where they
can persist data; the optimistic-lock + sensitive-field integrations
follow once the basic CRUD is verified end-to-end.
"""

import os
import re
import sqlite3
from typing import Any, Dict, List, Optional, Union

DATA_FILE = os.environ.get("CLEAR_DB_PATH") or os.path.join(os.getcwd(), "clear-data.db")

_conn = sqlite3.connect(DATA_FILE, isolation_level=None)  # autocommit
_conn.row_factory = sqlite3.Row  # rows behave like dicts

# WAL mode: matches runtime/db.js for shared-file interop
_conn.execute("PRAGMA journal_mode = WAL")
_conn.execute("PRAGMA synchronous = NORMAL")

# In-memory schema registry for boolean coercion + sensitive-field decrypt
_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {}
_IDENT_RE = re.compile(r"^[a-z_][a-z0-9_]*$", re.IGNORECASE)


def _is_safe_identifier(name: str) -> bool:
    return bool(_IDENT_RE.match(name))


def _to_sqlite_type(config: Optional[Dict[str, Any]]) -> str:
    if not config or not config.get("type"):
        return "TEXT"
    type_map = {
        "number": "REAL",
        "integer": "INTEGER",  # for the auto-added id / user_id / tenant_id / _version
        "boolean": "INTEGER",
        "fk": "INTEGER",
        "timestamp": "TEXT",
    }
    return type_map.get(config["type"], "TEXT")


def _coerce_record(record: Optional[Dict[str, Any]], schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Coerce SQLite 0/1 back to Python booleans using schema. Decrypts
    sensitive fields lazily via runtime/sensitive_crypto.py."""
    if not record or not schema:
        return record
    result = dict(record)
    for field, config in schema.items():
        if config.get("type") == "boolean" and result.get(field) is not None:
            result[field] = result[field] == 1 or result[field] is True
        if config.get("sensitive") and isinstance(result.get(field), str):
            result[field] = _decrypt_value_lazy(result[field])
    return result


def _coerce_for_storage(value: Any) -> Any:
    """Coerce Python booleans to SQLite integers."""
    if isinstance(value, bool):
        return 1 if value else 0
    return value


# Lazy import of sensitive_crypto so apps without sensitive fields don't
# pay the import cost. Python's import machinery makes this awkward; the
# lazy form here matches the JS pattern exactly.
_sensitive_crypto = None


def _get_crypto():
    global _sensitive_crypto
    if _sensitive_crypto is None:
        try:
            from . import sensitive_crypto as sc  # type: ignore
        except (ImportError, ValueError):
            # Fallback for direct-script execution where the runtime/ dir
            # isn't a package
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "sensitive_crypto",
                os.path.join(os.path.dirname(__file__), "sensitive_crypto.py"),
            )
            sc = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sc)
        _sensitive_crypto = sc
    return _sensitive_crypto


def _decrypt_value_lazy(v: str) -> str:
    return _get_crypto()._decrypt_value(v)


def _encrypt_value_lazy(v: str) -> str:
    return _get_crypto()._encrypt_value(v)


def _encrypt_sensitive_fields(record: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    if not schema:
        return record
    result = dict(record)
    for field, config in schema.items():
        if config.get("sensitive") and isinstance(result.get(field), str):
            result[field] = _encrypt_value_lazy(result[field])
    return result


def _build_where(filter_dict: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a parameterized WHERE clause from a filter dict.
    Returns {sql: '...', params: [...]}. Returns {sql: '', params: []} for
    empty filter."""
    if not filter_dict:
        return {"sql": "", "params": []}
    keys = list(filter_dict.keys())
    for k in keys:
        if not _is_safe_identifier(k):
            raise ValueError(f"Unsafe column name: {k}")
    parts = [f"{k} = ?" for k in keys]
    params = [_coerce_for_storage(filter_dict[k]) for k in keys]
    return {"sql": "WHERE " + " AND ".join(parts), "params": params}


def _parse_limit(n: Any) -> Optional[int]:
    if n is None:
        return None
    try:
        v = int(n)
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def _parse_offset(n: Any) -> Optional[int]:
    if n is None:
        return None
    try:
        v = int(n)
        return v if v >= 0 else None
    except (ValueError, TypeError):
        return None


def _strip_hidden(row: Optional[Dict[str, Any]], schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Remove fields tagged `hidden` from API responses."""
    if not row or not schema:
        return row
    out = dict(row)
    for field, config in schema.items():
        if config.get("hidden"):
            out.pop(field, None)
    return out


# ----------------------------------------------------------------------
# Public API — matches runtime/db.js
# ----------------------------------------------------------------------

def create_table(name: str, schema: Dict[str, Dict[str, Any]]) -> None:
    """CREATE TABLE IF NOT EXISTS. Auto-adds id (PRIMARY KEY), user_id,
    tenant_id, _version columns matching runtime/db.js."""
    if not _is_safe_identifier(name):
        raise ValueError(f"Unsafe table name: {name}")

    # Auto-add the standard columns the JS port adds
    full_schema = dict(schema)
    if "id" not in full_schema:
        full_schema = {"id": {"type": "integer", "primary_key": True}, **full_schema}
    if "user_id" not in full_schema:
        full_schema["user_id"] = {"type": "integer"}
    if "tenant_id" not in full_schema:
        full_schema["tenant_id"] = {"type": "integer"}
    if "_version" not in full_schema:
        full_schema["_version"] = {"type": "integer", "default": 1}

    cols = []
    for field, config in full_schema.items():
        if not _is_safe_identifier(field):
            raise ValueError(f"Unsafe column name: {field}")
        if field == "id" and config.get("primary_key"):
            cols.append("id INTEGER PRIMARY KEY AUTOINCREMENT")
        else:
            sql_type = _to_sqlite_type(config)
            col_def = f"{field} {sql_type}"
            if config.get("required"):
                col_def += " NOT NULL"
            if "default" in config:
                default_val = config["default"]
                if isinstance(default_val, str):
                    col_def += f" DEFAULT '{default_val}'"
                elif isinstance(default_val, bool):
                    col_def += f" DEFAULT {1 if default_val else 0}"
                elif default_val is not None:
                    col_def += f" DEFAULT {default_val}"
            cols.append(col_def)

    sql = f"CREATE TABLE IF NOT EXISTS {name} ({', '.join(cols)})"
    _conn.execute(sql)
    _schemas[name] = schema


def find_all(table: str, filter_dict: Optional[Dict[str, Any]] = None,
             options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    where = _build_where(filter_dict)
    sql = f"SELECT * FROM {table} {where['sql']}"
    options = options or {}
    limit = _parse_limit(options.get("limit"))
    offset = _parse_offset(options.get("offset"))
    if limit is not None:
        sql += f" LIMIT {limit}"
    if offset is not None:
        sql += f" OFFSET {offset}"
    cursor = _conn.execute(sql, where["params"])
    schema = _schemas.get(table)
    rows = [dict(r) for r in cursor.fetchall()]
    return [_strip_hidden(_coerce_record(r, schema), schema) for r in rows]


def find_one(table: str, filter_dict: Dict[str, Any],
             options: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    results = find_all(table, filter_dict, {"limit": 1, **(options or {})})
    return results[0] if results else None


def insert(table: str, record: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    schema = _schemas.get(table, {})
    record = _encrypt_sensitive_fields(record, schema)

    keys = [k for k in record.keys() if _is_safe_identifier(k)]
    placeholders = ", ".join(["?"] * len(keys))
    cols = ", ".join(keys)
    params = [_coerce_for_storage(record[k]) for k in keys]

    cursor = _conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", params)
    new_id = cursor.lastrowid
    return {**record, "id": new_id}


def update(table: str, filter_or_record: Union[int, Dict[str, Any]],
           data: Optional[Dict[str, Any]] = None) -> int:
    """Two call shapes (matches JS):
    - update(table, record_with_id) — uses record's id as filter, updates all other fields
    - update(table, filter_dict, data_dict) — explicit WHERE + SET"""
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    schema = _schemas.get(table, {})

    if data is None:
        if not isinstance(filter_or_record, dict) or "id" not in filter_or_record:
            raise ValueError("update(table, record) requires an `id` field on the record")
        rec = dict(filter_or_record)
        record_id = rec.pop("id")
        filter_dict = {"id": record_id}
        data = rec
    else:
        filter_dict = filter_or_record if isinstance(filter_or_record, dict) else {"id": filter_or_record}

    data = _encrypt_sensitive_fields(data, schema)
    set_keys = [k for k in data.keys() if _is_safe_identifier(k)]
    set_clause = ", ".join([f"{k} = ?" for k in set_keys])
    set_params = [_coerce_for_storage(data[k]) for k in set_keys]

    where = _build_where(filter_dict)
    sql = f"UPDATE {table} SET {set_clause} {where['sql']}"
    cursor = _conn.execute(sql, set_params + where["params"])
    return cursor.rowcount


class VersionConflict(Exception):
    """Raised when an optimistic-lock update fails because the row's
    _version has moved since the caller read it. status=409 mirrors the
    JS port. The current_version attribute lets the caller display
    'someone else changed this; here is the latest' to the user."""
    def __init__(self, table: str, record_id: Any, expected_version: int, current_version: Optional[int]):
        self.status = 409
        self.table = table
        self.record_id = record_id
        self.expected_version = expected_version
        self.current_version = current_version
        super().__init__(
            f"VERSION_CONFLICT on {table} id={record_id}: "
            f"expected _version={expected_version}, current={current_version}"
        )


def update_with_version(table: str, record: Dict[str, Any], expected_version: Optional[int] = None) -> int:
    """Optimistic-lock UPDATE. Matches runtime/db.js's updateWithVersion
    contract:

    - Requires record['id']. Raises 400 if missing.
    - Default expected_version = 0 (first-write case).
    - Raises 404 if no row with that id exists.
    - Builds UPDATE ... SET col = ?, ... , _version = _version + 1
      WHERE id = ? AND _version = ?
    - If 0 rows matched (version moved), raises VersionConflict with the
      current _version readable by the caller.

    Returns 1 on success.
    """
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    if not isinstance(record, dict) or record.get("id") is None:
        err = ValueError(f"Cannot update {table} with optimistic lock without an id on the record.")
        err.status = 400  # type: ignore[attr-defined]
        raise err

    record_id = record["id"]
    exp_ver = 0 if expected_version is None else int(expected_version)
    schema = _schemas.get(table, {})

    # 404 guard — separate the "no record" signal from "version moved"
    cursor = _conn.execute(f"SELECT 1 FROM {table} WHERE id = ? LIMIT 1", [record_id])
    if cursor.fetchone() is None:
        err = LookupError(f"No record found with id {record_id}")
        err.status = 404  # type: ignore[attr-defined]
        raise err

    # Encrypt sensitive fields (matches JS port's behavior on locked updates)
    encrypted = _encrypt_sensitive_fields(record, schema)

    set_cols = [k for k in encrypted.keys() if k not in ("id", "_version") and _is_safe_identifier(k)]
    set_vals = [_coerce_for_storage(encrypted[k]) for k in set_cols]
    set_parts = [f"{k} = ?" for k in set_cols]
    set_parts.append("_version = _version + 1")

    sql = f"UPDATE {table} SET {', '.join(set_parts)} WHERE id = ? AND _version = ?"
    cursor = _conn.execute(sql, set_vals + [record_id, exp_ver])

    if cursor.rowcount == 0:
        # Row exists (404 guard above passed) but version moved. Read live
        # version so the caller can show "someone else changed this; here
        # is the latest" to the user.
        live = _conn.execute(f"SELECT _version FROM {table} WHERE id = ?", [record_id]).fetchone()
        current = live["_version"] if live else None
        raise VersionConflict(table, record_id, exp_ver, current)

    return cursor.rowcount


def remove(table: str, filter_dict: Optional[Dict[str, Any]] = None) -> int:
    if not _is_safe_identifier(table):
        raise ValueError(f"Unsafe table name: {table}")
    where = _build_where(filter_dict)
    if not where["sql"]:
        # Match JS behavior: bare DELETE FROM with no WHERE is allowed
        # (the validator catches unsafe deletes; runtime trusts the caller)
        cursor = _conn.execute(f"DELETE FROM {table}")
    else:
        cursor = _conn.execute(f"DELETE FROM {table} {where['sql']}", where["params"])
    return cursor.rowcount


_AGG_FNS = {"sum": "SUM", "avg": "AVG", "min": "MIN", "max": "MAX", "count": "COUNT"}


def aggregate(table: str, fn: str, field: str, filter_dict: Optional[Dict[str, Any]] = None) -> Optional[Union[int, float]]:
    if not _is_safe_identifier(table) or not _is_safe_identifier(field):
        raise ValueError(f"Unsafe identifier: table={table}, field={field}")
    sql_fn = _AGG_FNS.get(fn.lower())
    if not sql_fn:
        raise ValueError(f"Unknown aggregate function: {fn}")
    where = _build_where(filter_dict)
    sql = f"SELECT {sql_fn}({field}) AS result FROM {table} {where['sql']}"
    cursor = _conn.execute(sql, where["params"])
    row = cursor.fetchone()
    return row["result"] if row else None


def run(sql: str) -> None:
    _conn.execute(sql)


def execute(sql: str) -> None:
    run(sql)


def save() -> None:
    """No-op. SQLite is always durable in WAL mode (matches JS port)."""


def load() -> None:
    """No-op. The db opens on import (matches JS port)."""


def reset() -> None:
    """DELETE FROM all known tables. Used by test harnesses."""
    for name in list(_schemas.keys()):
        if _is_safe_identifier(name):
            _conn.execute(f"DELETE FROM {name}")


def close() -> None:
    _conn.close()


def _reset_for_tests() -> None:
    """Test helper: clears the schema registry. Doesn't drop tables."""
    _schemas.clear()
