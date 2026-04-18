import { describe, it, expect } from './testUtils.js';
import { proposeAddField, proposeAddEndpoint, proposeAddPage } from './edit-tools.js';
import { parse } from '../parser.js';
import { classifyChange } from './change-classifier.js';

function assertAdditive(before, after) {
	const classification = classifyChange(parse(before), parse(after));
	expect(classification.type).toBe('additive');
	return classification;
}

describe('edit-tools — proposeAddField', () => {
	it('inserts a new field at the end of the table block', () => {
		const before = `create a Users table:
  name, required
  email
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: 'role',
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('role')).toBe(true);
		assertAdditive(before, result.newSource);
	});

	it('preserves the original indent of the table block', () => {
		const before = `create a Users table:
    name, required
    email
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: 'role',
		});
		expect(result.newSource.includes('    role')).toBe(true);
	});

	it('returns ok: false when the table is not found', () => {
		const before = `create a Users table:
  name
`;
		const result = proposeAddField(before, {
			table: 'Posts',
			fieldLine: 'title',
		});
		expect(result.ok).toBe(false);
		expect(result.error.toLowerCase().includes('not found')).toBe(true);
	});

	it('returns ok: false when the new field would duplicate an existing one', () => {
		const before = `create a Users table:
  name
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: 'name',
		});
		expect(result.ok).toBe(false);
		expect(result.error.toLowerCase().includes('already exists')).toBe(true);
	});

	it('rejects a required field without a default (destructive per classifier)', () => {
		const before = `create a Users table:
  name
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: 'email, required',
		});
		expect(result.ok).toBe(false);
		expect(result.error.toLowerCase().includes('require')).toBe(true);
	});

	it('accepts a required field with a default (still additive)', () => {
		const before = `create a Users table:
  name
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: "region, required, default 'NA'",
		});
		expect(result.ok).toBe(true);
	});

	it('handles a table that appears mid-file with code after it', () => {
		const before = `create a Users table:
  name
  email

when user sends data to /api/a:
  send back 'a'
`;
		const result = proposeAddField(before, {
			table: 'Users',
			fieldLine: 'role',
		});
		expect(result.ok).toBe(true);
		// The new field must be inside the table block, before the endpoint
		const roleIdx = result.newSource.indexOf('role');
		const endpointIdx = result.newSource.indexOf('when user sends');
		expect(roleIdx < endpointIdx).toBe(true);
		assertAdditive(before, result.newSource);
	});
});

describe('edit-tools — proposeAddEndpoint', () => {
	it('appends a new endpoint block to the end of the source', () => {
		const before = `when user sends data to /api/a:
  send back 'a'
`;
		const result = proposeAddEndpoint(before, {
			block: `when user sends data to /api/b:
  send back 'b'
`,
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('/api/b')).toBe(true);
		assertAdditive(before, result.newSource);
	});

	it('rejects a block whose endpoint already exists', () => {
		const before = `when user sends data to /api/a:
  send back 'a'
`;
		const result = proposeAddEndpoint(before, {
			block: `when user sends data to /api/a:
  send back 'different'
`,
		});
		expect(result.ok).toBe(false);
	});

	it('rejects a block that is not parseable as an endpoint', () => {
		const result = proposeAddEndpoint('', {
			block: 'this is not an endpoint',
		});
		expect(result.ok).toBe(false);
	});
});

describe('edit-tools — proposeAddPage', () => {
	it('appends a new page block to the end of the source', () => {
		const before = `page 'Home' at '/':
  show 'hi'
`;
		const result = proposeAddPage(before, {
			block: `page 'Stats' at '/stats':
  show 'stats here'
`,
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('Stats')).toBe(true);
		assertAdditive(before, result.newSource);
	});

	it('rejects a page whose title already exists', () => {
		const before = `page 'Home' at '/':
  show 'hi'
`;
		const result = proposeAddPage(before, {
			block: `page 'Home' at '/home':
  show 'different'
`,
		});
		expect(result.ok).toBe(false);
	});
});
