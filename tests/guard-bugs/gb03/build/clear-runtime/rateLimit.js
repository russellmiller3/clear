// =============================================================================
// CLEAR RUNTIME — RATE LIMITING
// =============================================================================
//
// PURPOSE: Simple in-memory rate limiter for compiled Clear backend apps.
// Zero external dependencies. Uses a sliding window counter per IP.
//
// API:
//   rateLimit({ windowMs, max }) — returns Express middleware
//
// =============================================================================

function rateLimit({ windowMs = 60000, max = 10 } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: `Too many requests -- limit is ${max} per ${Math.round(windowMs / 1000)} seconds. Try again later.`,
      });
    }

    next();
  };
}

module.exports = rateLimit;
