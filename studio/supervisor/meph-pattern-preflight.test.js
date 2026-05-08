import { describe, it, expect, run } from '../../lib/testUtils.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  appendPatternPreflightToMessages,
  buildPatternPreflight,
  shouldRunPatternPreflight,
  stripPatternSearchPromptGuard,
} from './meph-pattern-preflight.js';

describe('Meph pattern preflight hook', () => {
  it('detects complex app and Clear shape requests', () => {
    expect(shouldRunPatternPreflight('Build a complex approval queue app for finance')).toEqual(true);
    expect(shouldRunPatternPreflight('What is the Clear shape for selected-row detail?')).toEqual(true);
    expect(shouldRunPatternPreflight('Change routing so enterprise approvals go to legal')).toEqual(true);
    expect(shouldRunPatternPreflight('hello')).toEqual(false);
  });

  it('builds a preflight block from syntax docs, AI instructions, and pattern search', () => {
    const root = mkdtempSync(join(tmpdir(), 'meph-preflight-'));
    try {
      writeFileSync(join(root, 'SYNTAX.md'), [
        '# Syntax',
        'approval queue syntax goes here',
        'route request by approval_tier:',
      ].join('\n'));
      writeFileSync(join(root, 'AI-INSTRUCTIONS.md'), [
        '# AI Instructions',
        'Pattern-match the retrieved snippet before writing Clear.',
      ].join('\n'));
      let querySeen = '';
      const factorDB = {
        queryProgrammingPatterns({ query, source, topK }) {
          querySeen = query;
          expect(source).toContain('Requests table');
          expect(topK).toEqual(5);
          return [{
            template_name: 'clear-language::routing::approval-threshold-routing',
            parent_template_name: 'clear-language-primitives',
            pattern_kind: 'routing',
            pattern_set: 'language',
            source_excerpt: 'route request by approval_tier:',
            source: 'route request by approval_tier:',
          }];
        },
      };

      const preflight = buildPatternPreflight({
        userText: 'Build an approval queue that routes requests over 50000 to a VP',
        currentSource: 'create a Requests table:\n  amount (number)',
        factorDB,
        rootDir: root,
      });

      expect(querySeen).toContain('approval queue');
      expect(preflight.required).toEqual(true);
      expect(preflight.patterns.length).toEqual(1);
      expect(preflight.text).toContain('Required Meph Preflight Hook');
      expect(preflight.text).toContain('SYNTAX.md');
      expect(preflight.text).toContain('AI-INSTRUCTIONS.md');
      expect(preflight.text).toContain('clear-language::routing::approval-threshold-routing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses approved requirements as the concrete pattern search query', () => {
    const root = mkdtempSync(join(tmpdir(), 'meph-preflight-requirements-'));
    try {
      writeFileSync(join(root, 'SYNTAX.md'), 'approval queue syntax\nroute request by amount:');
      writeFileSync(join(root, 'AI-INSTRUCTIONS.md'), 'Search for the exact app shape first.');
      let querySeen = '';
      const approvedRequirements = [
        'logged-in sellers can submit deals',
        'deals under 50000 route to manager approval',
        'deals at least 50000 route to VP approval',
        'approvers can approve or reject pending deals',
      ];

      buildPatternPreflight({
        userText: 'build me an app',
        approvedRequirements,
        factorDB: {
          queryProgrammingPatterns({ query }) {
            querySeen = query;
            return [];
          },
        },
        rootDir: root,
      });

      expect(querySeen).toContain('50000');
      expect(querySeen).toContain('approve or reject');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('can build a docs-only baseline without mentioning the pattern database', () => {
    const root = mkdtempSync(join(tmpdir(), 'meph-preflight-docs-'));
    try {
      writeFileSync(join(root, 'SYNTAX.md'), 'approval queue syntax\npage "Approval Queue"');
      writeFileSync(join(root, 'AI-INSTRUCTIONS.md'), 'Compile the app before calling it done.');
      let patternCalls = 0;
      const preflight = buildPatternPreflight({
        userText: 'Build a complete approval queue app',
        rootDir: root,
        mode: 'docs',
        factorDB: {
          queryProgrammingPatterns() {
            patternCalls++;
            return [];
          },
        },
      });

      expect(patternCalls).toEqual(0);
      expect(preflight.required).toEqual(true);
      expect(preflight.mode).toEqual('docs');
      expect(preflight.text).toContain('SYNTAX.md');
      expect(preflight.text).toContain('AI-INSTRUCTIONS.md');
      expect(preflight.text).not.toContain('pattern DB');
      expect(preflight.text).not.toContain('browse_templates');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('appends preflight context to the last user message', () => {
    const messages = [{ role: 'user', content: 'Build an approval queue app' }];
    const out = appendPatternPreflightToMessages(messages, '## Required Meph Preflight Hook\nsearch results');

    expect(out.length).toEqual(1);
    expect(out[0].content).toContain('Build an approval queue app');
    expect(out[0].content).toContain('Required Meph Preflight Hook');
  });

  it('can strip the prompt-only search guard for hook A/B trials', () => {
    const prompt = [
      'before',
      'For any user question asking for a Clear feature shape, syntax shape, or reusable pattern, you MUST call `browse_templates` with `action: "search"` before answering. This includes narrow approval questions such as threshold routing, selected-row detail, and approval manager gate. Reading docs is allowed after search, but not instead of search.',
      'after',
    ].join('\n');

    const stripped = stripPatternSearchPromptGuard(prompt);
    expect(stripped).toContain('before');
    expect(stripped).toContain('after');
    expect(stripped).not.toContain('MUST call `browse_templates`');

    const sectionStripped = stripPatternSearchPromptGuard([
      'before',
      '## Pattern search - fire it BEFORE writing unfamiliar syntax',
      'Use browse_templates search before answering.',
      '## Workflow',
      'after',
    ].join('\n'));
    expect(sectionStripped).not.toContain('Pattern search - fire it');
    expect(sectionStripped).not.toContain('Use browse_templates search before answering');
    expect(sectionStripped).toContain('## Workflow');
  });
});

run();
