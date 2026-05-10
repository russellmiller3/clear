// Migration planner — rename detection (LAE Phase C cycle 7).
//
// Pure function: given a before/after program AST pair, look at the
// classifier's changes and surface a rename candidate when the user
// removed one field and added another of the same type on the same
// table. Returns option data; the widget renders. Wider negotiation
// (split / coerce / archive) is Phase D-or-later expansion.

import { describe, it, expect, run } from './testUtils.js';
import { parse } from '../parser.js';
import { planRename } from './migration-planner.js';

function program(source) {
	return parse(source);
}

describe('migration-planner — planRename', () => {
	it('detects a rename when one field is removed and another of the same type is added on the same table', () => {
		const before = program(`create a Users table:
  name
  email
`);
		const after = program(`create a Users table:
  name
  contact_email
`);

		const result = planRename({ beforeProgram: before, afterProgram: after });

		expect(result.detected).toBe('rename');
		expect(result.from).toBe('email');
		expect(result.to).toBe('contact_email');
		expect(result.table).toBe('Users');
		expect(Array.isArray(result.options)).toBe(true);
		expect(result.options.length).toBe(2);
		const keep = result.options.find((o) => o.id === 'keep');
		const discard = result.options.find((o) => o.id === 'discard');
		expect(!!keep).toBe(true);
		expect(!!discard).toBe(true);
		expect(/copy.*email.*into.*contact_email/i.test(keep.label)).toBe(true);
		expect(/drop.*email.*leave.*contact_email/i.test(discard.label)).toBe(true);
		expect(result.warning == null).toBe(true);
	});

	it('returns detected:null when a field is removed with no plausible new field on the same table', () => {
		const before = program(`create a Users table:
  name
  notes
`);
		const after = program(`create a Users table:
  name
`);

		const result = planRename({ beforeProgram: before, afterProgram: after });

		expect(result.detected).toBe(null);
	});

	it('returns detected:null when there is an add but no remove', () => {
		const before = program(`create a Users table:
  name
`);
		const after = program(`create a Users table:
  name
  contact_email
`);

		const result = planRename({ beforeProgram: before, afterProgram: after });

		expect(result.detected).toBe(null);
	});

	it('returns detected:null when remove and add are on different tables', () => {
		const before = program(`create a Users table:
  name
  email
create a Companies table:
  title
`);
		const after = program(`create a Users table:
  name
create a Companies table:
  title
  contact_email
`);

		const result = planRename({ beforeProgram: before, afterProgram: after });

		expect(result.detected).toBe(null);
	});

	it('flags a type mismatch when the removed and added fields disagree on type', () => {
		const before = program(`create a Users table:
  name
  age (number)
`);
		const after = program(`create a Users table:
  name
  age_label (text)
`);

		const result = planRename({ beforeProgram: before, afterProgram: after });

		expect(result.detected).toBe('rename');
		expect(result.from).toBe('age');
		expect(result.to).toBe('age_label');
		expect(/type mismatch/i.test(result.warning || '')).toBe(true);
	});

	it('handles empty / null inputs gracefully', () => {
		expect(planRename({}).detected).toBe(null);
		expect(planRename({ beforeProgram: null, afterProgram: null }).detected).toBe(null);
		expect(planRename({ beforeProgram: { body: [] }, afterProgram: { body: [] } }).detected).toBe(null);
	});
});

run();
