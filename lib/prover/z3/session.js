// Z3 session — a single, memoized SMT-solver context for the whole prover process.
//
// z3-solver's init() loads a WASM module and is async + expensive, so we boot it
// exactly once and hand every caller the same high-level Context. The high-level API
// serializes long-running calls internally, so a single shared context is correct
// (the prover proves one goal at a time anyway).

let cachedContext = null;

/**
 * Get the shared Z3 Context, booting the WASM solver on first call.
 * @returns {Promise<object>} the z3-solver high-level Context (Solver, Int, Bool, ...).
 */
export async function getZ3() {
  if (cachedContext) return cachedContext;
  const { init } = await import('z3-solver');
  const { Context } = await init();
  cachedContext = Context('clear-prover');
  return cachedContext;
}
