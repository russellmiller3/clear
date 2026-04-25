// HTTPS client for the Clear Compiler API.
// Calls POST /compile and returns { errors, warnings, html, javascript, ... }.
//
// API endpoint is configurable via:
//   1. CLEAR_COMPILER_API env var
//   2. workspace settings (passed via initialize)
//   3. fallback to https://compile.clearlang.dev

const DEFAULT_API = 'https://compile.clearlang.dev';

export function createCompilerClient(apiUrl) {
  const base = (apiUrl || process.env.CLEAR_COMPILER_API || DEFAULT_API).replace(/\/$/, '');

  async function compile(source, modules) {
    const body = JSON.stringify(modules ? { source, modules } : { source });
    const res = await fetch(`${base}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail || (await res.text()); } catch {}
      return {
        errors: [{ line: 1, message: `Compiler API ${res.status}: ${detail || res.statusText}` }],
        warnings: [],
      };
    }
    return res.json();
  }

  return { base, compile };
}
