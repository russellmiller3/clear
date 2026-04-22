/*
 * Meph helpers — pure functions shared between /api/chat and the MCP server.
 *
 * These used to live in /api/chat's closure in playground/server.js. The
 * MCP server's tool handlers need them too (specifically parseTestOutput
 * for run_tests, compileForEval for list_evals/run_evals/run_eval), so
 * they move here. Zero runtime deps — just pure string/object work and
 * a compileProgram injection for compileForEval.
 *
 * server.js continues to re-export parseTestOutput from this module so
 * existing test imports (e.g. server.test.js) keep working.
 */

/**
 * Parse the stdout of `node cli/clear.js test <file>` into a structured
 * { passed, failed, results } shape the run_tests tool returns to Meph.
 *
 * Line format (both supported):
 *   PASS: test name
 *   FAIL: test name - error message [clear:42]
 *   FAIL: test name -- error message  (older dash-dash form)
 *
 * The `[clear:N]` tag is extracted into `sourceLine` so the Studio UI
 * can jump to the source line that failed.
 *
 * @param {string} stdout - raw stdout from the test runner
 * @returns {{passed: number, failed: number, results: Array<{name, status, error?, sourceLine?}>}}
 */
export function parseTestOutput(stdout) {
  const results = [];
  const lines = (stdout || '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const passMatch = trimmed.match(/^PASS:\s*(.+)/);
    const failMatch = trimmed.match(/^FAIL:\s*(.+?)(?:\s*-{1,2}\s*(.+))?$/);
    if (passMatch) {
      results.push({ name: passMatch[1], status: 'pass' });
    } else if (failMatch) {
      let err = failMatch[2] || '';
      // Extract the [clear:N] tag the compiler emits so the Studio UI can
      // jump to source.
      let sourceLine = null;
      const tagMatch = err.match(/\s*\[clear:(\d+)\]\s*$/);
      if (tagMatch) {
        sourceLine = parseInt(tagMatch[1], 10);
        err = err.slice(0, tagMatch.index).trim();
      }
      results.push({ name: failMatch[1], status: 'fail', error: err, sourceLine });
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  return { passed, failed, results };
}

/**
 * Compile a Clear source twice — once in normal mode (for the compiled
 * output the Studio UI renders) and once in eval mode (serverJS includes
 * the /_eval/* synthetic handlers the eval runner needs). Returns both,
 * or an error envelope on failure.
 *
 * compileProgram is INJECTED so this module stays free of the ~400KB
 * compiler bundle — each caller passes the version they already imported.
 *
 * @param {string} source - Clear source code
 * @param {(source: string, opts?: object) => object} compileProgram - the compiler
 * @returns {{ok: boolean, compiled?: object, serverJS?: string, error?: string, errors?: object[]}}
 */
export function compileForEval(source, compileProgram) {
  if (!source || !source.trim()) {
    return { ok: false, error: 'No source code. Load or write a .clear file first.' };
  }
  let compiled, compiledEvalMode;
  try {
    compiled = compileProgram(source);
    compiledEvalMode = compileProgram(source, { evalMode: true });
  } catch (err) {
    return { ok: false, error: 'Compile threw: ' + err.message };
  }
  if (compiled.errors && compiled.errors.length > 0) {
    return {
      ok: false,
      error: 'Source has compile errors — fix them before running evals.',
      errors: compiled.errors,
    };
  }
  // `serverJS` exists when the app builds both web + backend. Backend-only
  // apps put the code in `javascript` instead — accept either.
  const server = compiledEvalMode.serverJS || compiledEvalMode.javascript;
  if (!server) {
    return {
      ok: false,
      error: 'App has no backend to run evals against (need a javascript backend build target).',
    };
  }
  return { ok: true, compiled, serverJS: server };
}
