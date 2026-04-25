// Phase C edit tool: remove a field. Classified as DESTRUCTIVE.
//
// Cycle 1 of the LAE Phase C plan (plans/plan-lae-phase-c-04-25-2026.md):
// pure-function string manipulation that proposes a "remove field" change.
// No destruction yet — that lands at the ship endpoint with the typed-
// confirmation gate (cycle 4). This file just verifies the proposal shape.

import { describe, it, expect } from './testUtils.js';
import { proposeRemoveField } from './edit-tools-phase-c.js';

describe('edit-tools-phase-c — proposeRemoveField', () => {
	it('on a Users table with `notes` field returns ok:true, destructive, single remove_field change', () => {
		const before = `create a Users table:
  name
  notes
`;
		const r = proposeRemoveField(before, { table: 'Users', field: 'notes' });
		expect(r.ok).toBe(true);
		expect(r.classification.type).toBe('destructive');
		expect(r.classification.changes.length).toBe(1);
		expect(r.classification.changes[0].kind).toBe('remove_field');
		expect(r.classification.changes[0].table).toBe('Users');
		expect(r.classification.changes[0].field).toBe('notes');
		// The notes line should be gone from the new source
		expect(r.newSource.includes('notes')).toBe(false);
		// The other field should remain
		expect(r.newSource.includes('name')).toBe(true);
	});

	it('on an unknown field returns ok:false with a "not found" error', () => {
		const before = `create a Users table:
  name
`;
		const r = proposeRemoveField(before, { table: 'Users', field: 'notes' });
		expect(r.ok).toBe(false);
		expect(/not found/i.test(r.error)).toBe(true);
	});

	it('on the only PK-like field (id) returns ok:false with "cannot remove" error', () => {
		const before = `create a Users table:
  id
`;
		const r = proposeRemoveField(before, { table: 'Users', field: 'id' });
		expect(r.ok).toBe(false);
		expect(/cannot remove/i.test(r.error)).toBe(true);
	});
});
