import { describe, it, expect } from './testUtils.js';
import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';

const ast = (src) => parse(src);

describe('change-classifier — additive', () => {
	it('classifies a new field on an existing table as additive', () => {
		const before = ast(`create a Users table:
  name, required
  email, unique
`);
		const after = ast(`create a Users table:
  name, required
  email, unique
  role
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('additive');
		expect(result.changes.length).toBe(1);
		expect(result.changes[0].kind).toBe('add_field');
		expect(result.changes[0].table).toBe('Users');
		expect(result.changes[0].field).toBe('role');
	});

	it('classifies a new endpoint as additive', () => {
		const before = ast(`when user sends data to /api/a:
  send back 'a'
`);
		const after = ast(`when user sends data to /api/a:
  send back 'a'

when user sends data to /api/b:
  send back 'b'
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('additive');
		expect(result.changes[0].kind).toBe('add_endpoint');
		expect(result.changes[0].path).toBe('/api/b');
	});

	it('classifies a new page as additive', () => {
		const before = ast(`page 'Home' at '/':
  show 'hi'
`);
		const after = ast(`page 'Home' at '/':
  show 'hi'

page 'Stats' at '/stats':
  show 'counts'
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('additive');
		expect(result.changes[0].kind).toBe('add_page');
		expect(result.changes[0].title).toBe('Stats');
	});

	it('returns empty changes for identical ASTs', () => {
		const src = `create a Users table:
  name, required
`;
		expect(classifyChange(ast(src), ast(src)).changes.length).toBe(0);
	});

	it('classifies a new table as additive', () => {
		const before = ast(`create a Users table:
  name
`);
		const after = ast(`create a Users table:
  name

create a Posts table:
  title
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('additive');
		expect(result.changes[0].kind).toBe('add_table');
		expect(result.changes[0].table).toBe('Posts');
	});
});

describe('change-classifier — reversible', () => {
	it('classifies a hidden field (hidden: true on after AST) as reversible', () => {
		const before = ast(`create a Users table:
  name
  notes
`);
		// Phase A doesn't have parser support for `hidden` yet;
		// simulate the Phase B edit-tool by mutating the AST directly.
		const after = ast(`create a Users table:
  name
  notes
`);
		const notesField = after.body[0].fields.find((f) => f.name === 'notes');
		notesField.hidden = true;
		const result = classifyChange(before, after);
		expect(result.type).toBe('reversible');
		expect(result.changes[0].kind).toBe('hide_field');
		expect(result.changes[0].field).toBe('notes');
	});

	it('classifies a field rename (new field + hide old with renamedTo) as reversible', () => {
		const before = ast(`create a Users table:
  name
  notes
`);
		const after = ast(`create a Users table:
  name
  notes
  reason
`);
		const notes = after.body[0].fields.find((f) => f.name === 'notes');
		notes.hidden = true;
		notes.renamedTo = 'reason';
		const result = classifyChange(before, after);
		expect(result.type).toBe('reversible');
		expect(result.changes.some((c) => c.kind === 'rename_field')).toBe(true);
	});
});

describe('change-classifier — destructive', () => {
	it('classifies a physical field removal (no hidden marker) as destructive', () => {
		const before = ast(`create a Users table:
  name
  notes
`);
		const after = ast(`create a Users table:
  name
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('destructive');
		expect(result.changes[0].kind).toBe('remove_field');
		expect(result.changes[0].field).toBe('notes');
	});

	it('classifies a field type change as destructive', () => {
		const before = ast(`create a Users table:
  age (number)
`);
		const after = ast(`create a Users table:
  age (text)
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('destructive');
		expect(result.changes[0].kind).toBe('change_type');
	});

	it('classifies required-without-default as destructive', () => {
		const before = ast(`create a Users table:
  name
`);
		const after = ast(`create a Users table:
  name
  email, required
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('destructive');
		expect(result.changes[0].kind).toBe('require_without_default');
	});

	it('classifies a removed endpoint as destructive', () => {
		const before = ast(`when user sends data to /api/a:
  send back 'a'
`);
		const after = ast(``);
		const result = classifyChange(before, after);
		expect(result.type).toBe('destructive');
		expect(result.changes[0].kind).toBe('remove_endpoint');
	});
});

describe('change-classifier — severity ordering', () => {
	it('returns destructive if any change is destructive', () => {
		const before = ast(`create a Users table:
  age (number)
`);
		const after = ast(`create a Users table:
  age (text)
  email
`);
		const result = classifyChange(before, after);
		expect(result.type).toBe('destructive');
	});

	it('returns reversible if changes are additive + reversible (no destructive)', () => {
		const before = ast(`create a Users table:
  name
  notes
`);
		const after = ast(`create a Users table:
  name
  notes
  email
`);
		after.body[0].fields.find((f) => f.name === 'notes').hidden = true;
		const result = classifyChange(before, after);
		expect(result.type).toBe('reversible');
	});
});
