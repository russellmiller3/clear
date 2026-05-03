// Build script for the in-browser playground compiler bundle.
//
// Why this script exists: the Studio playground (`playground/ide.html`)
// loads `playground/clear-compiler.min.js` to compile Clear source to
// JavaScript / HTML / CSS in the browser, with no server round-trip. The
// bundle starts at `index.js` and walks the import graph to gather
// everything the compiler needs.
//
// One module in that graph — `lib/packaging-cloudflare.js` — imports
// `fs`, `path`, and `url` at the top level (node-only modules used to
// emit Cloudflare Workers deploy bundles). The browser playground never
// deploys to Cloudflare, but esbuild walks the static import graph and
// fails the build because it can't resolve those node-only modules for
// the browser. The plain CLI form
//   npx esbuild index.js --bundle --format=esm --minify --outfile=...
// fails with "Could not resolve fs / path / url."
//
// Fix: this build script swaps the cloud-packaging module out for a tiny
// browser stub at bundle time using an esbuild plugin. The stub
// (`lib/packaging-cloudflare.browser-stub.js`) exports the same four
// symbols `compiler.js` imports, with no node-only imports. Browser-side
// code never reaches those functions; if it ever did, the stub throws a
// clear error explaining "this is a server-only path."
//
// Server-side Node code (`playground/server.js`, the CLI, the test suite)
// continues to import the REAL `lib/packaging-cloudflare.js` directly —
// only the browser bundle gets the swap.
//
// Run: `node scripts/build-playground-bundle.mjs`

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = dirname(dirname(__filename));

const STUB_PATH = resolve(REPO_ROOT, 'lib', 'packaging-cloudflare.browser-stub.js');

// Intercept any `import ... from './lib/packaging-cloudflare.js'` (or its
// resolved absolute path) and redirect to the browser stub. The plugin
// runs during the resolve phase, BEFORE esbuild reads the file, so the
// real packaging-cloudflare.js (with its node-only imports) is never
// touched in this build.
const cloudPackagingStubPlugin = {
  name: 'cloud-packaging-browser-stub',
  setup(b) {
    b.onResolve({ filter: /(^|[\\/])lib[\\/]packaging-cloudflare\.js$/ }, () => ({
      path: STUB_PATH,
    }));
  },
};

await build({
  entryPoints: [resolve(REPO_ROOT, 'index.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: resolve(REPO_ROOT, 'playground', 'clear-compiler.min.js'),
  plugins: [cloudPackagingStubPlugin],
});

console.log('Built playground/clear-compiler.min.js');
