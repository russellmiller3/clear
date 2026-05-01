#!/usr/bin/env node
// Unit tests for scripts/interaction-doc-hygiene.mjs.

import {
  findDocHygieneFindings,
} from './interaction-doc-hygiene.mjs';

let failed = 0;

function describe(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

function messages(source) {
  return findDocHygieneFindings(source, 'test.md').map(f => f.message);
}

describe('flags bare buttons in Clear examples', () => {
  const out = messages("```clear\nbutton 'Refresh'\n```");
  if (!out.some(m => m.includes('button must name'))) throw new Error(out.join('\n'));
});

describe('accepts buttons with explicit data effects', () => {
  const out = messages("```clear\nbutton 'Refresh':\n  get deals from '/api/deals'\n```");
  if (out.length !== 0) throw new Error(out.join('\n'));
});

describe('allows labeled bad examples', () => {
  const out = messages("```clear\n// BAD: missing action\nbutton 'Approve'\n```");
  if (out.length !== 0) throw new Error(out.join('\n'));
});

describe('flags input controls without saved variables', () => {
  const out = messages("```clear\n'Newsletter' is a checkbox\n```");
  if (!out.some(m => m.includes('input must name'))) throw new Error(out.join('\n'));
});

describe('accepts input controls with saved variables', () => {
  const out = messages("```clear\n'Newsletter' is a checkbox saved as newsletter\n```");
  if (out.length !== 0) throw new Error(out.join('\n'));
});

describe('flags inline toast-only domain actions', () => {
  const out = messages("`button 'Approve': show toast 'Saved'`");
  if (!out.some(m => m.includes('domain action'))) throw new Error(out.join('\n'));
});

describe('accepts toast-only notification buttons', () => {
  const out = messages("```clear\nbutton 'Notify':\n  show toast 'Saved'\n```");
  if (out.length !== 0) throw new Error(out.join('\n'));
});

if (failed > 0) {
  console.error(`${failed} interaction-doc-hygiene test(s) failed`);
  process.exit(1);
}

console.log('interaction-doc-hygiene tests passed');
