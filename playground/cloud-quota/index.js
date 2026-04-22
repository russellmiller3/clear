/*
 * Clear Cloud quota enforcement — CC-3d.
 *
 * Pure-function helpers. Single responsibility: "can tenant T on plan P
 * make another agent call this billing period?" Composes with the Phase 85
 * AI proxy, which consults checkQuota before forwarding any Anthropic
 * request. Over-quota → proxy returns 402 with an upgrade link; the
 * Anthropic call is never made.
 *
 * Plan limits are the single source of truth for BOTH this enforcement
 * AND the pricing page (landing/pricing.html). If they drift, billing
 * breaks or marketing lies. Keep them in sync and test they match.
 *
 * Billing period: calendar month (UTC). Simple, predictable, matches
 * what Stripe Usage API wants to see. A future rev may switch to the
 * tenant's Stripe-subscription-anchored month to handle mid-month
 * upgrades cleanly; until CC-3c usage-rollup is wired, calendar-month
 * is honest.
 */

// =============================================================================
// PLAN QUOTAS — source of truth, mirrors landing/pricing.html
// =============================================================================
// Shape: every plan has agent_calls + apps + seats. A null value means
// "unlimited" — callers must check for null before comparing to a count.
// Numbers are HARD caps (enforcement) not soft suggestions (marketing).
export const PLAN_QUOTAS = Object.freeze({
  free:       Object.freeze({ agent_calls: 100,    apps: 3,    seats: 1    }),
  team:       Object.freeze({ agent_calls: 5000,   apps: 25,   seats: 10   }),
  business:   Object.freeze({ agent_calls: 50000,  apps: null, seats: 50   }),
  enterprise: Object.freeze({ agent_calls: null,   apps: null, seats: null }),
});

// =============================================================================
// Overage billing (CC-3c)
// =============================================================================
// When a tenant exceeds the agent_call cap on a paid plan, the overage
// rate applies per extra call. Free plan has NO overage — quota is a
// hard stop to force the upgrade conversation.
export const OVERAGE_PER_CALL_USD = 0.02;

/**
 * Safe lookup for plan limits. Throws with a grep-able message on
 * unknown plans so a typo in config (or a bad DB value) fails loud
 * instead of silently letting every call through.
 */
export function getPlanQuotas(plan) {
  const q = PLAN_QUOTAS[plan];
  if (!q) {
    throw new Error(
      `cloud-quota: unknown plan "${plan}". ` +
      `Valid plans: ${Object.keys(PLAN_QUOTAS).join(', ')}.`
    );
  }
  return q;
}

/**
 * Check whether a tenant can make another agent call this billing period.
 * Returns a structured decision:
 *   - ok: boolean — true if the next call is within the cap
 *   - used: number — agent calls counted this period
 *   - limit: number | null — cap (null = unlimited)
 *   - remaining: number | null — limit - used (null = unlimited; can be
 *     negative when over limit, to surface the overage count)
 *
 * One SQL round-trip. Caller is responsible for deciding how to react
 * to ok=false (return 402, add overage billing, etc).
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {number} tenantId
 * @param {string} plan - one of 'free' | 'team' | 'business' | 'enterprise'
 * @param {Date} [now] - time anchor; defaults to new Date() (calendar month)
 * @returns {Promise<{ok:boolean, used:number, limit:(number|null), remaining:(number|null)}>}
 */
export async function checkQuota(db, tenantId, plan, now = new Date()) {
  const quotas = getPlanQuotas(plan);
  const limit = quotas.agent_calls;

  // Count usage rows for this tenant's apps in the current calendar month.
  // usage_rows.app_id → apps.id → apps.tenant_id = $1 gives the tenant's
  // total spend; the period filter is (ts >= first of month, ts < next month).
  const { rows } = await db.query(
    `SELECT COUNT(*)::integer AS count
     FROM usage_rows ur
     JOIN apps a ON a.id = ur.app_id
     WHERE a.tenant_id = $1
       AND ur.ts >= date_trunc('month', $2::timestamptz)
       AND ur.ts <  date_trunc('month', $2::timestamptz) + interval '1 month'`,
    [tenantId, now]
  );
  const used = Number(rows[0]?.count || 0);

  if (limit === null) {
    return { ok: true, used, limit: null, remaining: null };
  }
  return {
    ok: used < limit,
    used,
    limit,
    remaining: limit - used,
  };
}
