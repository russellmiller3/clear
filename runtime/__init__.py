"""Clear runtime helpers for compiled Python apps.

Imported as `clear_runtime` by compiled apps when the source declares
a non-default backend (e.g. `database is local file` or `database is
postgres`). The CLI's runtime-copy step (cli/clear.js) drops this
directory next to the compiled server.py so the imports resolve.

Public modules:
    db                — persistent SQLite via stdlib sqlite3
    db_postgres       — Postgres adapter via psycopg3
    auth              — login + JWT (zero deps; matches JS byte-for-byte)
    rate_limit        — FastAPI dependency for OWASP login throttle
    sensitive_crypto  — AES-256-GCM encrypt-at-rest (cryptography PyPI)
"""
