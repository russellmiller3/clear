// Phase B edit tools: hide + rename. Both classified as REVERSIBLE.
//
// Goes through the real parser now that `, hidden` and `, renamed to X`
// are recognized field modifiers. The round-trip matters: source →
// parse → classify must produce a reversible classification, not
// destructive, and not additive.

import { describe, it, expect } from './testUtils.js';
import { proposeHideField, proposeRenameField } from './edit-tools-phase-b.js';
import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';

function classify(beforeSrc, afterSrc) {
	return classifyChange(parse(beforeSrc), parse(afterSrc));
}

describe('edit-tools-phase-b — proposeHideField', () => {
	it('appends `, hidden` to the named field and parses as hidden: true', () => {
		const before = `create a Users table:
  name
  notes
`;
		const r = proposeHideField(before, { table: 'Users', field: 'notes' });
		expect(r.ok).toBe(true);
		expect(r.newSource.includes('notes, hidden')).toBe(true);

		const ast = parse(r.newSource);
		const notesField = ast.body[0].fields.find((f) => f.name === 'notes');
		expect(notesField.hidden).toBe(true);
	});

	it('classifier reports the hide as reversible', () => {
		const before = `create a Users table:
  name
  notes
`;
		const r = proposeHideField(before, { table: 'Users', field: 'notes' });
		const c = classify(before, r.newSource);
		expect(c.type).toBe('reversible');
		expect(c.changes[0].kind).toBe('hide_field');
	});

	it('preserves other modifiers when hiding', () => {
		const before = `create a Users table:
  email, unique
`;
		const r = proposeHideField(before, { table: 'Users', field: 'email' });
		expect(r.ok).toBe(true);
		expect(r.newSource.includes('email')).toBe(true);
		const field = parse(r.newSource).body[0].fields.find((f) => f.name === 'email');
		expect(field.hidden).toBe(true);
		expect(field.unique).toBe(true);
	});

	it('returns ok:false when the field does not exist', () => {
		const before = `create a Users table:
  name
`;
		const r = proposeHideField(before, { table: 'Users', field: 'notes' });
		expect(r.ok).toBe(false);
	});

	it('returns ok:false when the table does not exist', () => {
		const r = proposeHideField('', { table: 'Nope', field: 'x' });
		expect(r.ok).toBe(false);
	});

	it('returns ok:false if the field is already hidden', () => {
		const before = `create a Users table:
  notes, hidden
`;
		const r = proposeHideField(before, { table: 'Users', field: 'notes' });
		expect(r.ok).toBe(false);
	});
});

describe('edit-tools-phase-b — proposeRenameField', () => {
	it('adds new field, marks old as hidden+renamedTo, classifier reports reversible', () => {
		const before = `create a Users table:
  name
  notes
`;
		const r = proposeRenameField(before, {
			table: 'Users',
			from: 'notes',
			to: 'reason',
		});
		expect(r.ok).toBe(true);
		expect(r.newSource.includes('notes, hidden, renamed to reason')).toBe(true);
		expect(r.newSource.includes('reason')).toBe(true);

		const ast = parse(r.newSource);
		const notes = ast.body[0].fields.find((f) => f.name === 'notes');
		expect(notes.hidden).toBe(true);
		expect(notes.renamedTo).toBe('reason');
		const newField = ast.body[0].fields.find((f) => f.name === 'reason');
		expect(newField).toBeTruthy();

		const c = classify(before, r.newSource);
		expect(c.type).toBe('reversible');
		expect(c.changes.some((ch) => ch.kind === 'rename_field')).toBe(true);
	});

	it('returns ok:false when the source field does not exist', () => {
		const r = proposeRenameField('create a Users table:\n  name\n', {
			table: 'Users',
			from: 'notes',
			to: 'reason',
		});
		expect(r.ok).toBe(false);
	});

	it('returns ok:false when the target name already exists', () => {
		const before = `create a Users table:
  name
  notes
  reason
`;
		const r = proposeRenameField(before, {
			table: 'Users',
			from: 'notes',
			to: 'reason',
		});
		expect(r.ok).toBe(false);
	});
});
