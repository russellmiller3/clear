import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'landing', 'pricing.html'), 'utf8');

function visibleText(source) {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const text = visibleText(html);

assert.match(text, /\bFree\b/, 'pricing page must include a Free tier');
assert.match(text, /\bTeam\b[\s\S]*\$99|\$99[\s\S]*\bTeam\b/, 'pricing page must include Team at $99');
assert.match(text, /\bBusiness\b[\s\S]*\$499|\$499[\s\S]*\bBusiness\b/, 'pricing page must include Business at $499');
assert.match(text, /\bEnterprise\b/, 'pricing page must include an Enterprise tier');

assert.match(
  html,
  /data-primary-sales-cta="true"[^>]*href="mailto:[^"]+"/i,
  'pricing page must mark one mailto link as the primary sales CTA'
);

assert.doesNotMatch(
  html,
  /[\u{1F300}-\u{1FAFF}]/u,
  'pricing page must not use emoji as icons'
);

console.log('landing pricing static check passed');
