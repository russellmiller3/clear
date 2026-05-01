// Static contract for CC-4b/CC-4c publish modal UX.
// Run: node playground/ide-deploy-modal-static.test.js

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'ide.html'), 'utf8');

let failed = 0;
function expectIncludes(needle, label) {
  if (html.includes(needle)) {
    console.log(`  ok ${label}`);
    return;
  }
  failed++;
  console.log(`  fail ${label}`);
}

for (const stage of ['compiling', 'packaging', 'uploading', 'provisioning-db', 'live']) {
  expectIncludes(`id: '${stage}'`, `progress stage exists: ${stage}`);
}

expectIncludes("renderDeployProgress('compiling')", 'modal opens with progress rail');
expectIncludes("renderDeployProgress('packaging')", 'submit moves to packaging');
expectIncludes("renderDeployProgress('uploading')", 'submit moves to uploading');
expectIncludes("renderDeployProgress('provisioning-db')", 'polling moves to DB provisioning');
expectIncludes("renderDeployProgress('live', 'done')", 'success marks live');

for (const id of ['deploy-copy-link-btn', 'deploy-open-live-btn', 'deploy-share-team-btn', 'deploy-live-url']) {
  expectIncludes(`id="${id}"`, `live confirmation exposes ${id}`);
}

process.exit(failed > 0 ? 1 : 0);
