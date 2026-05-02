#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'landing', 'marcus.html');
const html = fs.readFileSync(pagePath, 'utf8');

const checks = [
  {
    name: 'headline promises the first one this Friday',
    pass: /Clear builds Marcus's Deal Desk\.\s*<br>\s*<span[^>]*>Ship the first one this Friday\./i.test(html),
  },
  {
    name: 'live Deal Desk CTA points at the publish URL',
    pass: /<a\s+[^>]*href="https:\/\/deals\.demo\.buildclear\.dev"[^>]*>\s*See Deal Desk live/i.test(html),
  },
  {
    name: 'live demo section embeds the Deal Desk preview surface',
    pass: /<iframe\s+[^>]*data-publish-url="https:\/\/deals\.demo\.buildclear\.dev"[^>]*srcdoc=/i.test(html),
  },
  {
    name: 'demo section does not ship a TODO screenshot placeholder',
    pass: !/TODO|screenshot-placeholder|Drop image at/i.test(html),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  for (const check of failed) {
    console.error(`FAIL: ${check.name}`);
  }
  process.exit(1);
}

console.log(`marcus landing checks passed (${checks.length})`);
