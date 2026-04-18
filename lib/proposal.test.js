import { describe, it, expect } from './testUtils.js';
import { applyProposal, TOOL_DEFINITIONS } from './proposal.js';

describe('proposal — applyProposal dispatcher', () => {
	it('routes propose_add_field to the add_field tool', () => {
		const before = `create a Users table:
  name
`;
		const result = applyProposal(before, 'propose_add_field', {
			table: 'Users',
			fieldLine: 'email',
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('email')).toBe(true);
		expect(result.classification.type).toBe('additive');
	});

	it('routes propose_add_endpoint to the add_endpoint tool', () => {
		const before = ``;
		const result = applyProposal(before, 'propose_add_endpoint', {
			block: `when user sends data to /api/a:
  send back 'a'
`,
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('/api/a')).toBe(true);
	});

	it('routes propose_add_page to the add_page tool', () => {
		const before = ``;
		const result = applyProposal(before, 'propose_add_page', {
			block: `page 'Stats' at '/stats':
  show 'hi'
`,
		});
		expect(result.ok).toBe(true);
		expect(result.newSource.includes('Stats')).toBe(true);
	});

	it('returns ok:false for an unknown tool name', () => {
		const result = applyProposal('', 'propose_delete_field', { anything: true });
		expect(result.ok).toBe(false);
		expect(result.error.toLowerCase().includes('unknown tool')).toBe(true);
	});

	it('includes a list of valid tool names in the error for unknown tools', () => {
		const result = applyProposal('', 'nonsense', {});
		expect(result.error.includes('propose_add_field')).toBe(true);
	});
});

describe('proposal — TOOL_DEFINITIONS (Anthropic tool schema)', () => {
	it('exports exactly five tools (Phase A + Phase B)', () => {
		expect(TOOL_DEFINITIONS.length).toBe(5);
	});

	it('each tool has a name starting with propose_', () => {
		for (const tool of TOOL_DEFINITIONS) {
			expect(tool.name.startsWith('propose_')).toBe(true);
		}
	});

	it('additive tools mention additive; reversible tools mention reversible', () => {
		const additive = ['propose_add_field', 'propose_add_endpoint', 'propose_add_page'];
		const reversible = ['propose_hide_field', 'propose_rename_field'];
		for (const tool of TOOL_DEFINITIONS) {
			const desc = tool.description.toLowerCase();
			if (additive.includes(tool.name)) expect(desc.includes('additive')).toBe(true);
			if (reversible.includes(tool.name)) expect(desc.includes('reversible')).toBe(true);
		}
	});

	it('each tool has an input_schema with type:object', () => {
		for (const tool of TOOL_DEFINITIONS) {
			expect(tool.input_schema.type).toBe('object');
			expect(typeof tool.input_schema.properties).toBe('object');
		}
	});

	it('no tool name exposes a permanent-delete or rewrite capability', () => {
		// Tool NAMES are the hard safety surface — names must not suggest
		// destruction. Descriptions may mention 'remove' as routing guidance
		// (e.g. "use this when the owner says remove") because the tool
		// behavior is still hide-not-delete.
		const forbidden = ['delete', 'destroy', 'rewrite', 'drop', 'wipe', 'write_file', 'edit_code'];
		for (const tool of TOOL_DEFINITIONS) {
			const name = tool.name.toLowerCase();
			for (const f of forbidden) {
				expect(name.includes(f)).toBe(false);
			}
		}
	});
});
