"""
Tests for runtime/auth.py.

Covers:
  - Password hashing round-trip (verify with same password / wrong password)
  - hash_password format (`<salt-hex>:<hash-hex>`, 16-byte salt, 64-byte hash)
  - Token signing + verification round-trip
  - Tampered tokens rejected (mutated payload, mutated signature)
  - Tokens signed with a different secret rejected
  - Expired tokens rejected
  - Middleware sets request.user correctly
  - verify_authorization_header header parsing
  - Cross-runtime interop: hash from Node bcryptjs-equivalent (PBKDF2 in
    matching format) and JWT-shaped HMAC token signed by Node, both verified
    by Python — runs only if Node is available on PATH; skips otherwise.

Run: python runtime/auth_test.py
Or:  python -m pytest runtime/auth_test.py -v
"""

import json
import os
import shutil
import subprocess
import sys
import time
import unittest

# Import via path so the test can run from any cwd. Tests are colocated with
# the module so a flat sys.path insertion is the cleanest approach.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import auth  # noqa: E402


class PasswordHashingTests(unittest.TestCase):
    def test_hash_password_returns_salt_colon_hash_hex(self):
        h = auth.hash_password("hunter2")
        self.assertIn(":", h)
        salt, hashed = h.split(":")
        # 16-byte salt → 32 hex chars; 64-byte hash → 128 hex chars
        self.assertEqual(len(salt), 32)
        self.assertEqual(len(hashed), 128)
        # Both halves must be valid lowercase hex
        int(salt, 16)
        int(hashed, 16)

    def test_hash_password_produces_different_output_each_time(self):
        a = auth.hash_password("hunter2")
        b = auth.hash_password("hunter2")
        self.assertNotEqual(a, b)  # random salts

    def test_check_password_round_trip_succeeds(self):
        h = auth.hash_password("correct horse battery staple")
        self.assertTrue(auth.check_password("correct horse battery staple", h))

    def test_check_password_rejects_wrong_password(self):
        h = auth.hash_password("hunter2")
        self.assertFalse(auth.check_password("hunter3", h))
        self.assertFalse(auth.check_password("", h))
        self.assertFalse(auth.check_password("HUNTER2", h))  # case sensitive

    def test_check_password_rejects_malformed_hash(self):
        self.assertFalse(auth.check_password("pw", "no-colon-here"))
        self.assertFalse(auth.check_password("pw", ":missing-salt"))
        self.assertFalse(auth.check_password("pw", "missing-hash:"))
        self.assertFalse(auth.check_password("pw", ""))

    def test_check_password_rejects_non_string_inputs(self):
        h = auth.hash_password("pw")
        self.assertFalse(auth.check_password(None, h))
        self.assertFalse(auth.check_password("pw", None))
        self.assertFalse(auth.check_password(123, h))

    def test_hash_password_rejects_non_string(self):
        with self.assertRaises(TypeError):
            auth.hash_password(None)
        with self.assertRaises(TypeError):
            auth.hash_password(12345)


class TokenSigningTests(unittest.TestCase):
    def test_create_token_returns_two_segment_token(self):
        token = auth.create_token({"id": 1, "email": "a@b.com"})
        parts = token.split(".")
        self.assertEqual(len(parts), 2)
        self.assertTrue(parts[0])
        self.assertTrue(parts[1])

    def test_create_then_verify_round_trip(self):
        token = auth.create_token({"id": 42, "email": "x@y.com", "role": "admin"})
        decoded = auth.verify_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["id"], 42)
        self.assertEqual(decoded["email"], "x@y.com")
        self.assertEqual(decoded["role"], "admin")
        # exp should be roughly now + 24h, in milliseconds
        now_ms = int(time.time() * 1000)
        self.assertGreater(decoded["exp"], now_ms)
        self.assertLess(decoded["exp"], now_ms + 25 * 60 * 60 * 1000)

    def test_default_role_is_user_when_not_provided(self):
        token = auth.create_token({"id": 1, "email": "a@b.com"})
        decoded = auth.verify_token(token)
        self.assertEqual(decoded["role"], "user")

    def test_create_token_accepts_object_with_attrs(self):
        class FakeUser:
            id = 7
            email = "obj@y.com"
            role = "manager"

        token = auth.create_token(FakeUser())
        decoded = auth.verify_token(token)
        self.assertEqual(decoded["id"], 7)
        self.assertEqual(decoded["role"], "manager")

    def test_verify_returns_none_for_garbage(self):
        self.assertIsNone(auth.verify_token(None))
        self.assertIsNone(auth.verify_token(""))
        self.assertIsNone(auth.verify_token("no-dot-here"))
        self.assertIsNone(auth.verify_token("a.b.c"))  # too many parts
        self.assertIsNone(auth.verify_token(12345))  # non-string

    def test_verify_rejects_tampered_signature(self):
        token = auth.create_token({"id": 1, "email": "a@b.com"})
        payload, sig = token.split(".")
        # Mutate one char of the signature mid-string
        if sig:
            mutated_char = "A" if sig[len(sig) // 2] != "A" else "B"
            tampered_sig = sig[: len(sig) // 2] + mutated_char + sig[len(sig) // 2 + 1 :]
            tampered = f"{payload}.{tampered_sig}"
            self.assertIsNone(auth.verify_token(tampered))

    def test_verify_rejects_tampered_payload(self):
        token = auth.create_token({"id": 1, "email": "a@b.com"})
        payload, sig = token.split(".")
        # Mutate a char in the middle of the payload — re-using the original
        # sig must fail the HMAC check.
        if payload:
            mutated_char = "A" if payload[len(payload) // 2] != "A" else "B"
            tampered_payload = (
                payload[: len(payload) // 2]
                + mutated_char
                + payload[len(payload) // 2 + 1 :]
            )
            tampered = f"{tampered_payload}.{sig}"
            self.assertIsNone(auth.verify_token(tampered))

    def test_verify_rejects_token_signed_with_different_secret(self):
        # Build a token by hand using a different secret. Verify under the
        # module's secret should fail.
        import base64
        import hashlib
        import hmac

        payload = {"id": 99, "role": "user", "email": "x@y.com", "exp": int(time.time() * 1000) + 60000}
        payload_json = json.dumps(payload, separators=(",", ":"))
        payload_b64 = (
            base64.urlsafe_b64encode(payload_json.encode("utf-8"))
            .rstrip(b"=")
            .decode("ascii")
        )
        wrong_sig = (
            base64.urlsafe_b64encode(
                hmac.new(
                    b"different-secret",
                    payload_b64.encode("ascii"),
                    hashlib.sha256,
                ).digest()
            )
            .rstrip(b"=")
            .decode("ascii")
        )
        bogus_token = f"{payload_b64}.{wrong_sig}"
        self.assertIsNone(auth.verify_token(bogus_token))

    def test_verify_rejects_expired_token(self):
        # Build a token by hand whose exp is in the past.
        import base64
        import hashlib
        import hmac

        payload = {
            "id": 1,
            "role": "user",
            "email": "x@y.com",
            "exp": int(time.time() * 1000) - 60000,  # 60s ago
        }
        payload_json = json.dumps(payload, separators=(",", ":"))
        payload_b64 = (
            base64.urlsafe_b64encode(payload_json.encode("utf-8"))
            .rstrip(b"=")
            .decode("ascii")
        )
        sig = (
            base64.urlsafe_b64encode(
                hmac.new(
                    auth.SECRET.encode("utf-8"),
                    payload_b64.encode("ascii"),
                    hashlib.sha256,
                ).digest()
            )
            .rstrip(b"=")
            .decode("ascii")
        )
        expired_token = f"{payload_b64}.{sig}"
        self.assertIsNone(auth.verify_token(expired_token))


class MiddlewareTests(unittest.TestCase):
    def test_middleware_sets_user_on_dict_request(self):
        token = auth.create_token({"id": 5, "email": "m@n.com"})
        request = {"headers": {"authorization": f"Bearer {token}"}}
        mw = auth.middleware()
        mw(request)
        self.assertIsNotNone(request.get("user"))
        self.assertEqual(request["user"]["id"], 5)

    def test_middleware_sets_user_on_object_request(self):
        class FakeRequest:
            def __init__(self, headers):
                self.headers = headers
                self.user = None

        token = auth.create_token({"id": 6, "email": "o@p.com"})
        req = FakeRequest({"authorization": f"Bearer {token}"})
        mw = auth.middleware()
        result = mw(req)
        self.assertIsNotNone(result)
        self.assertEqual(req.user["id"], 6)

    def test_middleware_handles_capitalized_header_name(self):
        token = auth.create_token({"id": 7, "email": "q@r.com"})
        request = {"headers": {"Authorization": f"Bearer {token}"}}
        mw = auth.middleware()
        mw(request)
        self.assertIsNotNone(request.get("user"))

    def test_middleware_no_auth_header_yields_none(self):
        request = {"headers": {}}
        mw = auth.middleware()
        result = mw(request)
        self.assertIsNone(result)
        self.assertIsNone(request.get("user"))

    def test_middleware_non_bearer_yields_none(self):
        request = {"headers": {"authorization": "Basic abc123"}}
        mw = auth.middleware()
        result = mw(request)
        self.assertIsNone(result)

    def test_middleware_invalid_token_yields_none(self):
        request = {"headers": {"authorization": "Bearer not-a-real-token"}}
        mw = auth.middleware()
        result = mw(request)
        self.assertIsNone(result)
        self.assertIsNone(request.get("user"))

    def test_verify_authorization_header_helper(self):
        token = auth.create_token({"id": 8, "email": "s@t.com"})
        result = auth.verify_authorization_header(f"Bearer {token}")
        self.assertIsNotNone(result)
        self.assertEqual(result["id"], 8)
        # Empty / non-Bearer → None
        self.assertIsNone(auth.verify_authorization_header(""))
        self.assertIsNone(auth.verify_authorization_header(None))
        self.assertIsNone(auth.verify_authorization_header("Basic abc"))


class AliasTests(unittest.TestCase):
    """The compiler emit may use camelCase aliases (matching JS surface).
    Verify both name shapes refer to the same callable."""

    def test_camel_case_aliases_match(self):
        self.assertIs(auth.createToken, auth.create_token)
        self.assertIs(auth.verifyToken, auth.verify_token)
        self.assertIs(auth.hashPassword, auth.hash_password)
        self.assertIs(auth.checkPassword, auth.check_password)


# =============================================================================
# CROSS-RUNTIME INTEROP — runs only if Node is on PATH. The point is to prove
# the JS file and the Python file produce byte-identical hashes and tokens
# given the same input + secret. Skipped (with a printed note) if Node is
# missing; a CI environment with Node will exercise these.
# =============================================================================


def _node_available():
    return shutil.which("node") is not None


@unittest.skipUnless(_node_available(), "Node not on PATH; cross-runtime interop test skipped")
class CrossRuntimeInteropTests(unittest.TestCase):
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js_auth_path = os.path.join(repo_root, "runtime", "auth.js")

    def setUp(self):
        # Sanity: the JS auth file exists. If it doesn't, the test environment
        # is misconfigured — skip rather than fail.
        if not os.path.exists(self.js_auth_path):
            self.skipTest(f"runtime/auth.js missing at {self.js_auth_path}")

    def _run_node(self, script):
        """Run a Node script that requires runtime/auth.js. Returns stdout."""
        env = dict(os.environ)
        # Use the same default secret as the Python side so tokens interop.
        # If CLEAR_AUTH_SECRET is already set, leave it alone.
        env.setdefault("CLEAR_AUTH_SECRET", auth.SECRET)
        # Point Node at the runtime dir so require('./auth') works without
        # path mangling.
        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            cwd=os.path.join(self.repo_root, "runtime"),
            env=env,
            timeout=30,
        )
        if result.returncode != 0:
            self.fail(
                f"Node script failed (exit {result.returncode}):\n"
                f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
            )
        return result.stdout.strip()

    def test_node_hashed_password_verifies_in_python(self):
        # JS hashes a password; Python verifies it.
        script = """
const auth = require('./auth.js');
const hash = auth.hashPassword('cross-runtime-pw');
process.stdout.write(hash);
"""
        node_hash = self._run_node(script)
        self.assertIn(":", node_hash)
        self.assertTrue(
            auth.check_password("cross-runtime-pw", node_hash),
            f"Python failed to verify Node-hashed password: {node_hash}",
        )
        # Wrong password must still fail
        self.assertFalse(auth.check_password("wrong-pw", node_hash))

    def test_python_hashed_password_verifies_in_node(self):
        # Python hashes; Node verifies.
        py_hash = auth.hash_password("python-side-pw")
        script = f"""
const auth = require('./auth.js');
const ok = auth.checkPassword('python-side-pw', '{py_hash}');
const wrong = auth.checkPassword('wrong-pw', '{py_hash}');
process.stdout.write(ok + ':' + wrong);
"""
        out = self._run_node(script)
        self.assertEqual(out, "true:false", f"Node verify result mismatch: {out}")

    def test_node_signed_token_verifies_in_python(self):
        script = """
const auth = require('./auth.js');
const t = auth.createToken({ id: 123, email: 'n@js.com', role: 'admin' });
process.stdout.write(t);
"""
        node_token = self._run_node(script)
        decoded = auth.verify_token(node_token)
        self.assertIsNotNone(
            decoded, f"Python failed to verify Node-signed token: {node_token}"
        )
        self.assertEqual(decoded["id"], 123)
        self.assertEqual(decoded["email"], "n@js.com")
        self.assertEqual(decoded["role"], "admin")

    def test_python_signed_token_verifies_in_node(self):
        py_token = auth.create_token(
            {"id": 456, "email": "p@py.com", "role": "manager"}
        )
        script = f"""
const auth = require('./auth.js');
const decoded = auth.verifyToken('{py_token}');
process.stdout.write(JSON.stringify(decoded));
"""
        out = self._run_node(script)
        decoded = json.loads(out)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["id"], 456)
        self.assertEqual(decoded["email"], "p@py.com")
        self.assertEqual(decoded["role"], "manager")


if __name__ == "__main__":
    unittest.main(verbosity=2)
