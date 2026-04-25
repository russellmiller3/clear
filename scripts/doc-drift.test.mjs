#!/usr/bin/env node
// scripts/doc-drift.test.mjs
//
// Unit tests for the pure helpers in doc-drift.mjs. Run with:
//   node scripts/doc-drift.test.mjs
//
// No test runner — uses bare assert. Each block prints PASS or FAIL
// and the script exits non-zero if any assertion failed.

import {
	extractAddedLinesByFile,
	findNewNodeTypes,
	findNewSynonyms,
	detectMissingMentions,
	variantsOfItem,
	buildReport,
} from './doc-drift.mjs';

let failed = 0;

function describe(name, fn) {
	console.log(`\n${name}`);
	try {
		fn();
		console.log('  ✅ pass');
	} catch (err) {
		console.log(`  ❌ FAIL: ${err.message}`);
		failed += 1;
	}
}

function eq(actual, expected, label) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		throw new Error(`${label || ''}\n    expected: ${e}\n    actual:   ${a}`);
	}
}

// extractAddedLinesByFile

describe('extractAddedLinesByFile parses unified diff into per-file added-lines', () => {
	const diff = [
		'diff --git a/parser.js b/parser.js',
		'index abc..def 100644',
		'--- a/parser.js',
		'+++ b/parser.js',
		'@@ -100,3 +100,5 @@',
		' const x = 1;',
		'+const y = 2;',
		'+const z = 3;',
		' const w = 4;',
		'diff --git a/synonyms.js b/synonyms.js',
		'index 111..222 100644',
		'--- a/synonyms.js',
		'+++ b/synonyms.js',
		'@@ -50,1 +50,2 @@',
		'+  \'cookie\': Object.freeze([\'cookie\']),',
	].join('\n');

	const result = extractAddedLinesByFile(diff);
	eq(Object.keys(result).sort(), ['parser.js', 'synonyms.js']);
	eq(result['parser.js'], ['const y = 2;', 'const z = 3;']);
	eq(result['synonyms.js'], ["  'cookie': Object.freeze(['cookie']),"]);
});

describe('extractAddedLinesByFile ignores +++ header lines', () => {
	const diff = [
		'diff --git a/parser.js b/parser.js',
		'+++ b/parser.js',
		'@@ -1,1 +1,2 @@',
		'+real_added_line',
	].join('\n');

	const result = extractAddedLinesByFile(diff);
	eq(result['parser.js'], ['real_added_line']);
});

// findNewNodeTypes

describe('findNewNodeTypes detects new keys in NodeType freeze block', () => {
	const lines = {
		'parser.js': [
			"  SET_COOKIE: 'set_cookie',",
			"  GET_COOKIE: 'get_cookie',",
			"  // unrelated comment",
			"  some other code that doesn't match",
		],
	};
	const result = findNewNodeTypes(lines);
	eq(result.sort(), ['get_cookie', 'set_cookie']);
});

describe('findNewNodeTypes returns empty when parser.js absent', () => {
	const result = findNewNodeTypes({ 'other.js': ["  FOO: 'foo',"] });
	eq(result, []);
});

// findNewSynonyms

describe('findNewSynonyms detects new top-level synonym keys', () => {
	const lines = {
		'synonyms.js': [
			"  'cookie': Object.freeze(['cookie', 'biscuit']),",
			"  'set cookie': Object.freeze(['set cookie', 'remember']),",
			"  // not a synonym key",
			"   'indented too far': Object.freeze([]),",
		],
	};
	const result = findNewSynonyms(lines);
	eq(result.sort(), ['cookie', 'set cookie']);
});

// detectMissingMentions

describe('detectMissingMentions flags items absent from all docs', () => {
	const docs = {
		'intent.md': 'mentions set_cookie here',
		'SYNTAX.md': 'no mention of the new thing',
	};
	const result = detectMissingMentions(['set_cookie', 'get_cookie'], docs);
	const missingItems = result.map((r) => r.item).sort();
	eq(missingItems, ['get_cookie']);
	eq(
		result.find((r) => r.item === 'get_cookie').missingFrom.sort(),
		['SYNTAX.md', 'intent.md']
	);
});

describe('detectMissingMentions is case-insensitive', () => {
	const docs = { 'SYNTAX.md': 'See the COOKIE section' };
	const result = detectMissingMentions(['cookie'], docs);
	eq(result, []); // present (case-insensitive match)
});

// variantsOfItem

describe('variantsOfItem returns literal for single-word item', () => {
	eq(variantsOfItem('cookie').sort(), ['cookie']);
});

describe('variantsOfItem returns 3 variants for two-word snake_case', () => {
	eq(variantsOfItem('cookie_set').sort(), ['cookie set', 'cookie_set', 'set cookie']);
});

describe('detectMissingMentions matches reversed two-word variant', () => {
	const docs = { 'SYNTAX.md': 'use `set cookie` to remember' };
	const result = detectMissingMentions(['cookie_set'], docs);
	eq(result, []); // 'set cookie' is the reversed variant
});

describe('detectMissingMentions matches space-separated variant', () => {
	const docs = { 'SYNTAX.md': 'on scroll throttle' };
	const result = detectMissingMentions(['on_scroll'], docs);
	eq(result, []); // 'on scroll' matches
});

describe('detectMissingMentions still flags genuinely missing items', () => {
	const docs = { 'SYNTAX.md': 'totally unrelated content' };
	const result = detectMissingMentions(['mystery_thing'], docs);
	eq(result.length, 1);
	eq(result[0].item, 'mystery_thing');
});

// buildReport

describe('buildReport returns empty string when nothing missing', () => {
	const out = buildReport({ nodeTypes: [], synonyms: [] });
	eq(out, '');
});

describe('buildReport flags missing node types and synonyms separately', () => {
	const out = buildReport({
		nodeTypes: [
			{ item: 'set_cookie', missingFrom: ['intent.md', 'SYNTAX.md'] },
		],
		synonyms: [
			{ item: 'set cookie', missingFrom: ['SYNTAX.md'] },
		],
	});
	if (!out.includes('set_cookie')) throw new Error(`report missing node type name: ${out}`);
	if (!out.includes('set cookie')) throw new Error(`report missing synonym name: ${out}`);
	if (!out.includes('intent.md')) throw new Error(`report missing doc name: ${out}`);
});

// Summary

console.log('');
if (failed > 0) {
	console.log(`❌ ${failed} test(s) failed`);
	process.exit(1);
}
console.log('✅ all doc-drift helpers green');
