// testUtils.js - Simple test helpers
// WHY: Clean test assertions without importing heavy test frameworks

import { strict as assert } from 'node:assert';
import { deepEqual } from 'node:assert/strict';

let passed = 0;
let failed = 0;
let currentDescribe = '';

/**
 * Group tests under a label (like vitest describe)
 */
export function describe(name, fn) {
	currentDescribe = name;
	console.log(`\n📦 ${name}\n`);
	fn();
	currentDescribe = '';
}

/**
 * Define a test (works as both `test` and `it`)
 */
export function test(name, fn) {
	try {
		fn();
		console.log(`✅ ${name}`);
		passed++;
	} catch (e) {
		console.log(`❌ ${name}`);
		console.log(`   ${e.message}`);
		failed++;
	}
}

// Alias for describe/it style
export { test as it };

/**
 * Async test support — sync describe + sync it() can't safely run async
 * tests because describe() doesn't await its body and it() doesn't await
 * its callback. Using async test functions with the sync helpers prints
 * ✅ before any awaits resolve, so failures become unhandled rejections
 * AFTER the runner already counted the test as passing.
 *
 * To run real-I/O async tests (spawn, fetch, sleep), use this paired
 * shape — describeAsync awaits its body, itAsync awaits its callback,
 * each itAsync() inside the describeAsync body must be `await`ed:
 *
 *   await describeAsync('suite', async () => {
 *     await itAsync('case 1', async () => { ... });
 *     await itAsync('case 2', async () => { ... });
 *   });
 *
 * Each itAsync() runs sequentially, so the pass/fail count is correct
 * by the time describeAsync resolves.
 *
 * `testAsync` is the legacy single-callback form — same body as itAsync
 * but the runtime-witness harness shape is paired-with-describeAsync, so
 * itAsync is the recommended export for new tests.
 */
export async function describeAsync(name, fn) {
	currentDescribe = name;
	console.log(`\n📦 ${name}\n`);
	await fn();
	currentDescribe = '';
}

export async function itAsync(name, fn) {
	try {
		await fn();
		console.log(`✅ ${name}`);
		passed++;
	} catch (e) {
		console.log(`❌ ${name}`);
		console.log(`   ${e.message}`);
		failed++;
	}
}

export async function testAsync(name, fn) {
	try {
		await fn();
		console.log(`✅ ${name}`);
		passed++;
	} catch (e) {
		console.log(`❌ ${name}`);
		console.log(`   ${e.message}`);
		failed++;
	}
}

/**
 * expect(value) — chainable assertion builder (vitest-compatible subset)
 */
export function expect(actual) {
	return {
		toBe(expected) {
			assert.strictEqual(actual, expected);
		},
		toEqual(expected) {
			assert.deepStrictEqual(actual, expected);
		},
		toBeNull() {
			assert.strictEqual(actual, null);
		},
		toBeTruthy() {
			if (!actual) throw new Error(`Expected truthy, got ${actual}`);
		},
		toBeFalsy() {
			if (actual) throw new Error(`Expected falsy, got ${actual}`);
		},
		toBeDefined() {
			if (actual === undefined) throw new Error(`Expected defined, got undefined`);
		},
		toBeUndefined() {
			assert.strictEqual(actual, undefined);
		},
		toContain(item) {
			if (typeof actual === 'string') {
				if (!actual.includes(item)) throw new Error(`Expected "${actual}" to contain "${item}"`);
			} else if (Array.isArray(actual)) {
				if (!actual.includes(item)) throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
			} else {
				throw new Error(`toContain requires string or array, got ${typeof actual}`);
			}
		},
		toHaveLength(len) {
			if (actual == null || actual.length === undefined) throw new Error(`Expected value with length, got ${actual}`);
			assert.strictEqual(actual.length, len, `Expected length ${len}, got ${actual.length}`);
		},
		toHaveProperty(prop) {
			if (actual == null || !(prop in actual)) {
				throw new Error(`Expected object to have property "${prop}"`);
			}
		},
		toBeGreaterThan(expected) {
			if (actual <= expected) throw new Error(`Expected ${actual} to be greater than ${expected}`);
		},
		toBeLessThan(expected) {
			if (actual >= expected) throw new Error(`Expected ${actual} to be less than ${expected}`);
		},
		toMatch(pattern) {
			if (!pattern.test(actual)) throw new Error(`Expected "${actual}" to match ${pattern}`);
		},
		not: {
			toBe(expected) {
				assert.notStrictEqual(actual, expected);
			},
			toEqual(expected) {
				assert.notDeepStrictEqual(actual, expected);
			},
			toBeNull() {
				assert.notStrictEqual(actual, null);
			},
			toContain(item) {
				if (typeof actual === 'string' && actual.includes(item)) {
					throw new Error(`Expected "${actual}" NOT to contain "${item}"`);
				} else if (Array.isArray(actual) && actual.includes(item)) {
					throw new Error(`Expected array NOT to contain ${JSON.stringify(item)}`);
				}
			},
			toMatch(pattern) {
				if (pattern.test(actual)) {
					const preview = typeof actual === 'string' && actual.length > 400
						? actual.slice(0, 400) + '... (truncated)'
						: actual;
					throw new Error(`Expected value NOT to match ${pattern}\nActual: ${preview}`);
				}
			},
		},
	};
}

/**
 * Assert two values are equal
 */
export function assertEquals(actual, expected, message) {
	assert.equal(actual, expected, message);
}

/**
 * Assert a number is close to expected (within tolerance)
 * WHY: Floating point math isn't exact (0.1 + 0.2 !== 0.3)
 */
export function assertClose(actual, expected, tolerance = 0.01) {
	const diff = Math.abs(actual - expected);
	if (diff > tolerance) {
		throw new Error(`Expected ${actual} to be close to ${expected} (within ${tolerance}), but diff was ${diff}`);
	}
}

/**
 * Run all tests and exit with proper code
 */
export function run() {
	console.log('\n' + '='.repeat(40));
	console.log(`✅ Passed: ${passed}`);
	console.log(`❌ Failed: ${failed}`);
	console.log('='.repeat(40) + '\n');

	process.exit(failed > 0 ? 1 : 0);
}
