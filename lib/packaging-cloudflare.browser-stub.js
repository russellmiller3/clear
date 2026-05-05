// Browser-side stub for `lib/packaging-cloudflare.js`.
//
// Why this exists: the real packaging-cloudflare module imports `fs`,
// `path`, and `url` at module top level — node-only modules. The browser
// bundle (`studio/clear-compiler.min.js`, used by the playground IDE
// for in-browser compile previews) only needs the COMPILER to translate
// Clear source to JavaScript / HTML / CSS. It never deploys to Cloudflare
// from the browser. esbuild can't bundle `fs` etc. for the browser, so
// the build fails as soon as the import graph touches that module.
//
// Fix: this stub exports the same four symbols compiler.js imports
// (`buildWorkerBundle`, `_selectWorkersUtilities`, `loadAuthWebcryptoSource`,
// `extractKnowledgeTextSync`) but with no node imports. The browser-side
// build script (`scripts/build-playground-bundle.mjs`) swaps this file in
// via an esbuild plugin during the resolve phase.
//
// Each stub function throws a clear error if anything in the browser ever
// reaches the Cloudflare-packaging path — that's a code-organization bug
// (the playground shouldn't call deploy paths), not a silent failure.
// Server-side Node calls into the REAL packaging-cloudflare.js as usual;
// this stub only swaps in for the browser bundle.

const BROWSER_ONLY_ERROR = new Error(
  'Cloudflare packaging is server-side only. The browser bundle stubs out '
  + 'lib/packaging-cloudflare.js. If you reached this error, the browser '
  + 'compiler tried to package for Cloudflare deploy — which it cannot do. '
  + 'Move the call to the server (studio/server.js or similar) where '
  + 'the real packaging-cloudflare.js is loaded.'
);

export function buildWorkerBundle() { throw BROWSER_ONLY_ERROR; }
export function _selectWorkersUtilities() { throw BROWSER_ONLY_ERROR; }
export function loadAuthWebcryptoSource() { throw BROWSER_ONLY_ERROR; }
export function extractKnowledgeTextSync() { throw BROWSER_ONLY_ERROR; }
