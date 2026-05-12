// Build script for the in-browser Studio compiler bundle.
//
// Why this script exists: Studio (`studio/studio.html`) loads
// `studio/clear-compiler.min.js` to compile Clear source to JavaScript,
// HTML, and CSS in the browser with no server round-trip. The bundle starts
// at `index.js` and walks the import graph to gather everything the compiler
// needs.
//
// One module in that graph, `lib/packaging-cloudflare.js`, imports `fs`,
// `path`, and `url` at the top level. Those are Node-only modules used to
// emit Cloudflare Workers deploy bundles. Browser-side Studio never deploys
// to Cloudflare, but esbuild still walks the static import graph and fails the
// build because it cannot resolve those modules for the browser.
//
// Fix: this build script swaps the cloud-packaging module out for a tiny
// browser stub at bundle time. Server-side Node code continues to import the
// real module directly. Only the browser bundle gets the swap.
//
// Run: `node scripts/build-studio-bundle.mjs`

import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(__filename));

const STUB_PATH = resolve(REPO_ROOT, 'lib', 'packaging-cloudflare.browser-stub.js');

const cloudPackagingStubPlugin = {
  name: 'cloud-packaging-browser-stub',
  setup(builder) {
    builder.onResolve({ filter: /(^|[\\/])lib[\\/]packaging-cloudflare\.js$/ }, () => ({
      path: STUB_PATH,
    }));
  },
};

await build({
  entryPoints: [resolve(REPO_ROOT, 'index.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: resolve(REPO_ROOT, 'studio', 'clear-compiler.min.js'),
  plugins: [cloudPackagingStubPlugin],
});

console.log('Built studio/clear-compiler.min.js');
