"""
Tests for runtime/rate_limit.py.

Run:
  python runtime/rate_limit_test.py
"""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "rate_limit", os.path.join(os.path.dirname(__file__), "rate_limit.py")
)
rate_limit_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rate_limit_mod)


class _FakeClient:
    def __init__(self, host):
        self.host = host


class _FakeRequest:
    def __init__(self, ip="1.2.3.4", forwarded_for=None):
        self.client = _FakeClient(ip)
        self.headers = {"x-forwarded-for": forwarded_for} if forwarded_for else {}


class TestRateLimit(unittest.TestCase):

    def test_under_limit_passes(self):
        throttle = rate_limit_mod.rate_limit(window_ms=60000, max=5)
        req = _FakeRequest("10.0.0.1")
        for _ in range(5):
            throttle(req)  # should not raise

    def test_over_limit_raises_429(self):
        throttle = rate_limit_mod.rate_limit(window_ms=60000, max=3)
        req = _FakeRequest("10.0.0.2")
        for _ in range(3):
            throttle(req)
        with self.assertRaises(rate_limit_mod.HTTPException) as ctx:
            throttle(req)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Too many requests", ctx.exception.detail)
        self.assertIn("3", ctx.exception.detail)

    def test_window_resets_after_expiry(self):
        # Use a tiny window so the test runs fast
        throttle = rate_limit_mod.rate_limit(window_ms=50, max=2)
        req = _FakeRequest("10.0.0.3")
        throttle(req)
        throttle(req)
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(req)
        # Wait for the window to expire
        time.sleep(0.07)
        # Should pass again — fresh window
        throttle(req)

    def test_per_ip_isolation(self):
        throttle = rate_limit_mod.rate_limit(window_ms=60000, max=2)
        req_a = _FakeRequest("10.0.0.4")
        req_b = _FakeRequest("10.0.0.5")
        throttle(req_a)
        throttle(req_a)
        # A is at limit; B should still pass
        throttle(req_b)
        throttle(req_b)
        # Both at limit now
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(req_a)
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(req_b)

    def test_x_forwarded_for_first_ip_used(self):
        throttle = rate_limit_mod.rate_limit(window_ms=60000, max=1)
        # Two requests with same X-Forwarded-For chain — should count as one IP
        req1 = _FakeRequest("127.0.0.1", forwarded_for="203.0.113.5, 10.0.0.1")
        req2 = _FakeRequest("127.0.0.1", forwarded_for="203.0.113.5, 10.0.0.1")
        throttle(req1)  # first hit ok
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(req2)  # second from same forwarded IP rejected

    def test_unknown_ip_falls_back(self):
        # No client, no forwarded — falls back to 'unknown'
        class BareReq:
            client = None
            headers = {}

        throttle = rate_limit_mod.rate_limit(window_ms=60000, max=1)
        throttle(BareReq())
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(BareReq())  # second 'unknown' should be rejected

    def test_default_window_and_max(self):
        # Defaults: 60000ms / 10 max — match runtime/rateLimit.js
        throttle = rate_limit_mod.rate_limit()
        req = _FakeRequest("10.0.0.6")
        for _ in range(10):
            throttle(req)
        with self.assertRaises(rate_limit_mod.HTTPException):
            throttle(req)


if __name__ == "__main__":
    unittest.main(verbosity=2)
