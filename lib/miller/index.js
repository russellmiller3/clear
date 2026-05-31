// Miller v2 violation-vector engine — domain-agnostic core.
//
//   constraints  ->  ViolationVector V  ->  energy E = P(V)  ->  ranked repair hints
//
// The vector is the primary object; energy is a DERIVED projection. A "constraint family"
// is a named lane of related constraints with an integer priority tier (higher tier = harder
// / more important). The engine knows nothing about Clear, requirements, or the app-checker —
// any domain that can express its failures as (family, magnitude) pairs can consume it.
//
// The four Miller-admissibility axioms are enforced structurally and locked by index.test.js:
//   1. Coverage           — every declared family appears in V (0 when unviolated).
//   2. Monotonicity        — raising any one magnitude never lowers energy.
//   3. Distinguishability  — families are distinct dimensions, never summed into one total.
//   4. Priority-preserving — one violation in a hard family outweighs all soft violations combined.

const DEFAULT_MAX_MAGNITUDE = 1000;

function indexFamilies(families) {
  if (!Array.isArray(families) || families.length === 0) {
    throw new Error('miller: families must be a non-empty array of { key, tier }.');
  }
  const byKey = new Map();
  for (const family of families) {
    if (!family || typeof family.key !== 'string' || family.key.length === 0) {
      throw new Error('miller: every family needs a non-empty string key.');
    }
    if (!Number.isInteger(family.tier) || family.tier < 0) {
      throw new Error(`miller: family "${family.key}" needs an integer tier >= 0.`);
    }
    byKey.set(family.key, family);
  }
  return byKey;
}

// Positional-base weighting. B = maxMagnitude * familyCount + 1 guarantees that one unit at
// tier t exceeds the maximum achievable total of every lower tier combined, so weight(t) = B^t
// is priority-preserving for any magnitudes <= maxMagnitude. This also makes Miller-equivalence
// precise: any weights satisfying the same tier-separation inequality induce the same ordering.
function makeWeights(families, maxMagnitude) {
  const base = Math.max(maxMagnitude * families.length + 1, 2);
  let maxTier = 0;
  for (const family of families) maxTier = Math.max(maxTier, family.tier);
  // Guard: keep the largest weight exact + comparable. Float drift above 2^53 would silently
  // break the ordering the whole engine depends on.
  if (base ** maxTier > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `miller: energy weight ${base}^${maxTier} exceeds safe-integer range — `
      + 'lower maxMagnitude, use fewer families, or collapse tiers.',
    );
  }
  return { base, weightFor: (tier) => base ** tier };
}

export function buildViolationVector(violations, families) {
  const byKey = indexFamilies(families);
  const vector = {};
  // Coverage axiom: seed every declared family at 0 before applying violations.
  for (const family of families) vector[family.key] = 0;

  for (const violation of (violations || [])) {
    if (!violation || typeof violation.family !== 'string') {
      throw new Error('miller: every violation needs a string family.');
    }
    if (!byKey.has(violation.family)) {
      throw new Error(`miller: unknown family "${violation.family}" — declare it in families first.`);
    }
    const magnitude = violation.magnitude == null ? 1 : violation.magnitude;
    if (typeof magnitude !== 'number' || !Number.isFinite(magnitude) || magnitude < 0) {
      throw new Error(`miller: magnitude for "${violation.family}" must be a finite number >= 0.`);
    }
    // Distinguishability axiom: accumulate within the family, never across families.
    vector[violation.family] += magnitude;
  }
  return { vector, families };
}

export function projectEnergy(vector, families, opts = {}) {
  indexFamilies(families);
  const maxMagnitude = opts.maxMagnitude == null ? DEFAULT_MAX_MAGNITUDE : opts.maxMagnitude;
  const { weightFor } = makeWeights(families, maxMagnitude);

  let energy = 0;
  for (const family of families) {
    const magnitude = vector[family.key] || 0;
    if (magnitude > maxMagnitude) {
      throw new Error(
        `miller: family "${family.key}" magnitude ${magnitude} exceeds maxMagnitude ${maxMagnitude} — `
        + 'priority preservation no longer holds. Raise maxMagnitude.',
      );
    }
    // Monotonicity axiom: weights are strictly positive, so energy only ever rises with magnitude.
    energy += magnitude * weightFor(family.tier);
  }
  return energy;
}

export function generateRepairHints(violations, families, opts = {}) {
  const byKey = indexFamilies(families);
  const maxMagnitude = opts.maxMagnitude == null ? DEFAULT_MAX_MAGNITUDE : opts.maxMagnitude;
  const { weightFor } = makeWeights(families, maxMagnitude);

  const hints = (violations || [])
    .filter(violation => violation && typeof violation.family === 'string' && byKey.has(violation.family))
    .map(violation => {
      const family = byKey.get(violation.family);
      const magnitude = violation.magnitude == null ? 1 : violation.magnitude;
      return {
        family: violation.family,
        label: family.label || violation.family,
        tier: family.tier,
        magnitude,
        hint: violation.hint || '',
        energyContribution: magnitude * weightFor(family.tier),
      };
    });

  // Worst-first: the fix that removes the most energy comes first. Priority preservation means a
  // hard-family fix always outranks any pile of soft-family fixes, regardless of raw counts.
  hints.sort((left, right) => right.energyContribution - left.energyContribution);
  return hints;
}

export function evaluate(violations, families, opts = {}) {
  const { vector } = buildViolationVector(violations, families);
  const energy = projectEnergy(vector, families, opts);
  const hints = generateRepairHints(violations, families, opts);
  return { vector, energy, hints };
}
