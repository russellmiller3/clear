import { readFileSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ide = readFileSync(join(__dirname, 'studio.html'), 'utf8');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ok - ${message}`);
  } else {
    failed++;
    console.log(`  not ok - ${message}`);
  }
}

console.log('Studio onboarding static contract');

assert(
  /const\s+STUDIO_MODE_DEFAULT\s*=\s*['"]builder['"]/.test(ide),
  'new users default to Builder Mode'
);

assert(
  /What do you want to build/.test(ide),
  'Meph chat carries the onboarding build prompt'
);

assert(
  !/shipCount\s*<\s*3[\s\S]{0,160}body\.classList\.add\(['"]show-source['"]\)/.test(ide),
  'new users do not auto-open the raw source editor before their first publish'
);

assert(
  /id=['"]source-toggle-btn['"][\s\S]{0,220}onclick=['"]toggleSource\(\)['"]/.test(ide),
  'source editor remains reachable from the onboarding screen'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
