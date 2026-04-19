// `owner is 'email'` — declares who the app owner is. Compiler pins that
// email's signup to role:'owner' instead of role:'user', unlocking the
// Live App Editing widget for them. Everyone else signs up as role:'user'
// as before.
//
// Syntax mirrors `database is local memory` — top-level, declarative,
// plain English. Matches how Clear expresses every other "this is the
// config" fact.

import { describe, it, expect } from './testUtils.js';
import { parse } from '../parser.js';
import { compileProgram } from '../index.js';

const OWNER_APP = `build for web and javascript backend
database is local memory
owner is 'marcus@acme.com'

allow signup and login

page 'Home' at '/':
  show 'hi'
`;

const NO_OWNER_APP = `build for web and javascript backend
database is local memory

allow signup and login

page 'Home' at '/':
  show 'hi'
`;

describe('parser — owner is "email"', () => {
	it('emits an OWNER_DECL node at the top level', () => {
		const ast = parse(OWNER_APP);
		const node = ast.body.find((n) => n.type === 'owner_decl');
		expect(node).toBeTruthy();
		expect(node.email).toBe('marcus@acme.com');
	});

	it('is absent when source does not declare an owner', () => {
		const ast = parse(NO_OWNER_APP);
		expect(ast.body.find((n) => n.type === 'owner_decl')).toBe(undefined);
	});

	it('does not conflict with the RLS `owner can read` syntax inside policies', () => {
		// Quick smoke — policy-level `owner` still parses
		const ast = parse(`create a Posts table:
  title
  policy: owner can read
`);
		expect(ast.errors.length).toBe(0);
	});
});

describe('compiler — owner email pins signup role', () => {
	it('emits a constant for the owner email', () => {
		const r = compileProgram(OWNER_APP);
		expect(r.errors).toEqual([]);
		expect(r.serverJS.includes('marcus@acme.com')).toBe(true);
		expect(/CLEAR_OWNER_EMAIL|_OWNER_EMAIL/.test(r.serverJS)).toBe(true);
	});

	it('assigns role:"owner" when signup email matches', () => {
		const r = compileProgram(OWNER_APP);
		// The signup path must check email === owner email and set role accordingly
		expect(r.serverJS.includes("role: email === ")).toBe(true);
	});

	it('does NOT pin any owner when source has no owner declaration', () => {
		const r = compileProgram(NO_OWNER_APP);
		expect(r.serverJS.includes('_OWNER_EMAIL')).toBe(false);
		// Fallback is the old hardcoded 'user' role — nobody becomes owner
		expect(r.serverJS.includes("role: 'user'")).toBe(true);
	});
});
