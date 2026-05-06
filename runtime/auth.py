"""
CLEAR RUNTIME — AUTH MODULE (Python port)

Python port of runtime/auth.js. Provides authentication helpers for compiled
Clear backend apps that emit Python (FastAPI). Zero external dependencies —
uses only the Python standard library (hmac, hashlib, secrets, base64, json,
time, os) — matching the JS file's "zero deps" goal.

API (snake_case per PEP 8):
  create_token(user)              — Create a signed token for a user dict
  verify_token(token)             — Verify and decode a token, returns dict or None
  hash_password(plain)            — Hash a password (PBKDF2, no bcrypt dep)
  check_password(plain, stored)   — Compare password to stored hash
  middleware()                    — Returns a callable that extracts/verifies
                                    a Bearer token from a request-like object
                                    (mirrors the JS Express middleware shape)
  verify_authorization_header(hdr) — Low-level helper for ASGI/FastAPI use

Token format: base64url(payload).base64url(signature)
Payload: JSON with { id, role, email, exp }
Signature: HMAC-SHA256(payload_b64, secret)
Note: NOT a standard JWT — no header segment. Matches the JS port's custom
two-segment token shape so a token signed by JS verifies under Python (and
vice versa) on the same CLEAR_AUTH_SECRET.

Password format: <salt-hex>:<hash-hex>
PBKDF2-HMAC-SHA512, 10000 iterations, 16-byte salt, 64-byte hash.
A password hashed by JS verifies under Python on the same input string.

The secret comes from os.environ['CLEAR_AUTH_SECRET'] or a default dev key.
IMPORTANT: In production, always set CLEAR_AUTH_SECRET. The module prints a
warning to stderr at import time if the env var is missing, mirroring the JS
console.warn behavior.

INTEROP NOTES (verified by auth_test.py):
  - JWT-like token signed by Node `crypto.createHmac('sha256', SECRET)` with
    base64url-encoded payload roundtrips through verify_token() here.
  - Password hashed by Node `crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512')`
    in `<salt-hex>:<hash-hex>` form roundtrips through check_password() here.
  - Token expiry uses milliseconds since epoch (JS Date.now() shape) so
    int(time.time() * 1000) matches the JS expiry encoding.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets as _secrets
import sys
import time

# =============================================================================
# CONSTANTS — match runtime/auth.js exactly so cross-runtime tokens interop
# =============================================================================

SECRET = os.environ.get(
    "CLEAR_AUTH_SECRET", "clear-dev-secret-change-in-production"
)
TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000  # 24 hours, milliseconds (matches JS)

# PBKDF2 parameters — must match runtime/auth.js
PBKDF2_ITERATIONS = 10000
PBKDF2_KEY_LEN = 64  # bytes
PBKDF2_HASH = "sha512"
SALT_BYTES = 16

if not os.environ.get("CLEAR_AUTH_SECRET"):
    print(
        "[clear-auth] WARNING: Using default auth secret. "
        "Set CLEAR_AUTH_SECRET in production.",
        file=sys.stderr,
    )


# =============================================================================
# BASE64URL HELPERS — Python's base64.urlsafe_b64encode pads with '=' but the
# JS Node `Buffer.toString('base64url')` strips the padding. Match the JS
# behavior so tokens are byte-identical across runtimes.
# =============================================================================


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    # Re-add the padding Python's decoder requires; JS strips it on encode.
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


# =============================================================================
# TOKEN OPERATIONS
# =============================================================================


def _now_ms() -> int:
    """Current time in milliseconds since epoch — matches JS Date.now()."""
    return int(time.time() * 1000)


def _hmac_sha256_b64url(payload_b64: str) -> str:
    """HMAC-SHA256(payload_b64, SECRET), base64url-encoded with no padding."""
    sig = hmac.new(
        SECRET.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(sig)


def create_token(user) -> str:
    """Create a signed token for a user dict.

    Args:
        user: dict-like with .get('id'), .get('role'), .get('email').
              Tolerates dicts and any attribute-bearing object.

    Returns:
        Token string in form 'base64url(payload).base64url(signature)'.
    """
    # Tolerate both dicts and objects with attributes — JS does the same via
    # property access on the user param.
    def _get(key, default=None):
        if isinstance(user, dict):
            return user.get(key, default)
        return getattr(user, key, default)

    payload = {
        "id": _get("id"),
        "role": _get("role") or "user",
        "email": _get("email"),
        "exp": _now_ms() + TOKEN_EXPIRY_MS,
    }
    # Use compact separators so the JSON is byte-identical to JS JSON.stringify
    # output for the same key/value set. JS JSON.stringify emits no spaces
    # around colons or commas by default.
    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_b64 = _b64url_encode(payload_json.encode("utf-8"))
    signature = _hmac_sha256_b64url(payload_b64)
    return f"{payload_b64}.{signature}"


def verify_token(token):
    """Verify and decode a token. Returns the payload dict on success, or
    None on any failure (invalid format, signature mismatch, expired,
    malformed JSON). Mirrors the JS verifyToken's null-return shape.
    """
    if not token or not isinstance(token, str):
        return None

    parts = token.split(".")
    if len(parts) != 2:
        return None

    payload_b64, signature = parts
    expected_sig = _hmac_sha256_b64url(payload_b64)

    # Constant-time compare to avoid signature-timing attacks. Python's
    # hmac.compare_digest is the stdlib equivalent of crypto.timingSafeEqual.
    if not hmac.compare_digest(signature, expected_sig):
        return None

    try:
        decoded = _b64url_decode(payload_b64).decode("utf-8")
        payload = json.loads(decoded)
    except (ValueError, UnicodeDecodeError):
        return None

    exp = payload.get("exp") if isinstance(payload, dict) else None
    if exp is not None and exp < _now_ms():
        return None  # expired

    return payload


# =============================================================================
# PASSWORD HASHING — PBKDF2-HMAC-SHA512, 10000 iterations, 64-byte hash.
# Matches Node `crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512')`. A password
# hashed by JS verifies under Python on the same input string.
# =============================================================================


def hash_password(password: str) -> str:
    """Hash a password. Returns 'salt:hash' in hex. Matches the JS format
    so a hash created by Node verifies here and vice versa.
    """
    if not isinstance(password, str):
        raise TypeError("hash_password: password must be a string")
    salt = _secrets.token_bytes(SALT_BYTES).hex()
    hashed = hashlib.pbkdf2_hmac(
        PBKDF2_HASH,
        password.encode("utf-8"),
        salt.encode("ascii"),  # JS uses the hex string itself as salt input
        PBKDF2_ITERATIONS,
        dklen=PBKDF2_KEY_LEN,
    ).hex()
    return f"{salt}:{hashed}"


def check_password(password: str, stored: str) -> bool:
    """Compare plaintext password to a stored 'salt:hash' hex string. Uses
    constant-time compare to avoid hash-timing attacks. Returns False on
    any malformed input rather than raising.
    """
    if not isinstance(password, str) or not isinstance(stored, str):
        return False
    parts = stored.split(":")
    if len(parts) != 2:
        return False
    salt, hash_hex = parts
    if not salt or not hash_hex:
        return False
    try:
        check = hashlib.pbkdf2_hmac(
            PBKDF2_HASH,
            password.encode("utf-8"),
            salt.encode("ascii"),
            PBKDF2_ITERATIONS,
            dklen=PBKDF2_KEY_LEN,
        ).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(hash_hex, check)


# =============================================================================
# REQUEST MIDDLEWARE — JS returns Express-style (req, res, next) middleware.
# Python web frameworks vary (FastAPI uses dependencies, Starlette uses
# middleware classes, Flask uses before_request). We expose two shapes:
#
#   1. middleware() — returns a callable mirroring JS behavior. Caller passes
#      a request-like object with a .headers dict (case-insensitive lookup
#      attempted) and the function attaches a `.user` attribute / dict key.
#      The callable returns the (possibly decoded) user payload or None.
#
#   2. verify_authorization_header(header_value) — low-level helper for use
#      inside FastAPI dependencies, ASGI middleware, or any framework that
#      hands you the raw Authorization header string.
# =============================================================================


def verify_authorization_header(header_value):
    """Given an Authorization header value (e.g. 'Bearer abc.def'), return
    the decoded user payload or None. Doesn't raise on malformed input.
    """
    if not header_value or not isinstance(header_value, str):
        return None
    if not header_value.startswith("Bearer "):
        return None
    token = header_value[7:]
    return verify_token(token)


def _read_authorization(request):
    """Best-effort case-insensitive Authorization header read. Tolerates
    dict-style headers (request['headers']), attribute-style (request.headers
    where headers is a dict), and starlette-style request.headers.
    """
    headers = None
    if isinstance(request, dict):
        headers = request.get("headers")
    else:
        headers = getattr(request, "headers", None)
    if headers is None:
        return ""
    if hasattr(headers, "get"):
        # dict or starlette Headers — both have .get
        return (
            headers.get("authorization")
            or headers.get("Authorization")
            or ""
        )
    return ""


def middleware():
    """Return a middleware function that verifies a Bearer token from a
    request-like object and attaches the decoded user to it.

    The callable accepts (request, *_args) so it works from frameworks that
    pass extra positional args (e.g. response, next-handler). Mirrors the
    JS middleware shape: req.user is set to the payload or None.

    Usage in a FastAPI dependency:
        from runtime.auth import middleware
        verify = middleware()
        def get_user(request: Request):
            verify(request)
            return getattr(request, 'user', None)
    """

    def _middleware(request, *_args, **_kwargs):
        header = _read_authorization(request)
        user = verify_authorization_header(header)
        if isinstance(request, dict):
            request["user"] = user
        else:
            try:
                setattr(request, "user", user)
            except (AttributeError, TypeError):
                # Some request objects (e.g. immutable mappings) reject
                # attribute assignment. Caller can still read the return.
                pass
        return user

    return _middleware


# =============================================================================
# PUBLIC API — module-level callables matching the JS module.exports surface.
# Snake_case for Python consumers; CamelCase aliases provided so the compiler
# emit can drop in either name shape without breaking.
# =============================================================================

# camelCase aliases for compiler-emitted code that mirrors the JS surface
createToken = create_token
verifyToken = verify_token
hashPassword = hash_password
checkPassword = check_password


__all__ = [
    "create_token",
    "verify_token",
    "hash_password",
    "check_password",
    "middleware",
    "verify_authorization_header",
    # camelCase aliases
    "createToken",
    "verifyToken",
    "hashPassword",
    "checkPassword",
    # constants (testing / introspection)
    "SECRET",
    "TOKEN_EXPIRY_MS",
    "PBKDF2_ITERATIONS",
    "PBKDF2_KEY_LEN",
    "PBKDF2_HASH",
    "SALT_BYTES",
]
