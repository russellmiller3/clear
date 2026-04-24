// VSCode extension structural tests.
//
// We can't run the extension itself in this environment (it requires a
// running VSCode host). What we CAN check is that everything the marketplace
// + the extension host depend on is structurally well-formed:
//
//   - package.json is valid JSON, declares the right activation events,
//     points at the right grammar + language config, registers the LSP
//     dependency.
//   - language-configuration.json is valid JSON.
//   - The TextMate grammar is valid JSON, has scopeName + patterns,
//     declares all repository keys used by `include` directives.
//
// The "does it actually highlight code correctly?" test happens when
// Russell hits F5 in VSCode locally — that's D-4's gate.
//
// Run: node vscode-extension/test/structural.test.mjs

import { describe, it, expect, run } from '../../lib/testUtils.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readJSON(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

describe('vscode-extension/package.json', () => {
  const pkg = readJSON('package.json');

  it('declares clear language with .clear file extension', () => {
    const lang = pkg.contributes.languages.find((l) => l.id === 'clear');
    expect(lang).toBeTruthy();
    expect(lang.extensions).toContain('.clear');
  });

  it('points at the grammar file', () => {
    const g = pkg.contributes.grammars.find((g) => g.language === 'clear');
    expect(g).toBeTruthy();
    expect(g.path).toBe('./syntaxes/clear.tmLanguage.json');
    expect(g.scopeName).toBe('source.clear');
  });

  it('points at the language-configuration file', () => {
    const lang = pkg.contributes.languages.find((l) => l.id === 'clear');
    expect(lang.configuration).toBe('./language-configuration.json');
  });

  it('activates on clear language only (not "*")', () => {
    expect(pkg.activationEvents).toContain('onLanguage:clear');
    expect(pkg.activationEvents).not.toContain('*');
  });

  it('declares vscode-languageclient as a dependency', () => {
    expect(pkg.dependencies['vscode-languageclient']).toBeTruthy();
  });

  it('exposes user settings for compilerApi + debounceMs', () => {
    const props = pkg.contributes.configuration.properties;
    expect(props['clear.compilerApi']).toBeTruthy();
    expect(props['clear.compilerApi'].default).toBe('https://compile.clearlang.dev');
    expect(props['clear.debounceMs']).toBeTruthy();
    expect(props['clear.debounceMs'].default).toBe(400);
  });

  it('main entry exists', () => {
    expect(pkg.main).toBe('./extension.js');
  });
});

describe('vscode-extension/language-configuration.json', () => {
  const cfg = readJSON('language-configuration.json');

  it('uses # for line comments (matches Clear)', () => {
    expect(cfg.comments.lineComment).toBe('#');
  });

  it('declares single-quote autoClose pairs', () => {
    const pair = cfg.autoClosingPairs.find((p) => p.open === "'");
    expect(pair).toBeTruthy();
    expect(pair.close).toBe("'");
  });

  it('increases indent on trailing colon (Clear block syntax)', () => {
    expect(cfg.indentationRules.increaseIndentPattern).toContain(':');
  });
});

describe('vscode-extension/syntaxes/clear.tmLanguage.json', () => {
  const grammar = readJSON('syntaxes/clear.tmLanguage.json');

  it('has scopeName matching the grammar contribution', () => {
    expect(grammar.scopeName).toBe('source.clear');
  });

  it('declares top-level patterns array', () => {
    expect(Array.isArray(grammar.patterns)).toBe(true);
    expect(grammar.patterns.length).toBeGreaterThan(0);
  });

  it('every #include reference resolves to a repository key', () => {
    const repo = grammar.repository || {};
    function check(patterns) {
      for (const p of patterns || []) {
        if (p.include && p.include.startsWith('#')) {
          const key = p.include.slice(1);
          expect(repo[key]).toBeTruthy();
        }
        if (p.patterns) check(p.patterns);
      }
    }
    check(grammar.patterns);
    for (const key of Object.keys(repo)) {
      check(repo[key].patterns);
    }
  });

  it('has comment + string + keyword + identifier rules', () => {
    expect(grammar.repository.comments).toBeTruthy();
    expect(grammar.repository.strings).toBeTruthy();
    expect(grammar.repository.keywords).toBeTruthy();
    expect(grammar.repository.identifiers).toBeTruthy();
  });

  it('component-call rule highlights uppercase identifiers followed by paren', () => {
    const rule = grammar.repository['component-call'];
    expect(rule).toBeTruthy();
    const re = new RegExp(rule.patterns[0].match);
    expect(re.test('Card(')).toBe(true);
    expect(re.test('myFunction(')).toBe(false);
  });

  it("possessive operator 's is highlighted", () => {
    const rule = grammar.repository.operators;
    const possessive = rule.patterns.find((p) => p.match.includes("'s"));
    expect(possessive).toBeTruthy();
  });
});

run();
