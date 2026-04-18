// Parser support for `hidden` field modifier (Phase B foundation).
//
// When the source says `notes, hidden`, the parser must emit the field
// with `hidden: true`. Same grammar slot as `required` / `unique` /
// `auto` / `default`. Lets Phase B's edit tools produce `.clear` source
// that round-trips through parse → classify → compile without state loss.

import { describe, it, expect } from './testUtils.js';
import { parse } from '../parser.js';

describe('parser — hidden field modifier', () => {
	it('parses `name, hidden` as { hidden: true }', () => {
		const ast = parse(`create a Users table:
  name, hidden
`);
		expect(ast.body[0].fields[0].hidden).toBe(true);
	});

	it('parses `notes, required, hidden` as hidden=true AND required=true', () => {
		const ast = parse(`create a Users table:
  notes, required, hidden
`);
		const f = ast.body[0].fields[0];
		expect(f.hidden).toBe(true);
		expect(f.required).toBe(true);
	});

	it('unhidden fields do not get hidden: true', () => {
		const ast = parse(`create a Users table:
  name
  email, unique
`);
		expect(ast.body[0].fields[0].hidden).toBe(undefined);
		expect(ast.body[0].fields[1].hidden).toBe(undefined);
	});

	it('parses `notes, hidden, renamed to reason` and records renamedTo', () => {
		const ast = parse(`create a Users table:
  notes, hidden, renamed to reason
  reason
`);
		const notes = ast.body[0].fields[0];
		expect(notes.hidden).toBe(true);
		expect(notes.renamedTo).toBe('reason');
	});
});
