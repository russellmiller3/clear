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
	it('exports exactly six tools (Phase A + Phase B + Phase C destructive)', () => {
		expect(TOOL_DEFINITIONS.length).toBe(6);
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
		// destruction in a way that could be confused with file/code rewriting.
		// `propose_remove_field` is allowed because "remove" is the literal
		// English verb owners use; the destructive intent is gated server-side
		// by the typed-confirmation phrase, not by the tool name.
		const forbidden = ['delete', 'destroy', 'rewrite', 'drop', 'wipe', 'write_file', 'edit_code'];
		for (const tool of TOOL_DEFINITIONS) {
			const name = tool.name.toLowerCase();
			for (const f of forbidden) {
				expect(name.includes(f)).toBe(false);
			}
		}
	});
});

describe('proposal — Phase C destructive tools', () => {
	const sourceWithNotes = `create a Users table:
  name
  notes
`;

	it('routes propose_remove_field to the remove_field tool with destructive classification', () => {
		const result = applyProposal(sourceWithNotes, 'propose_remove_field', {
			table: 'Users',
			field: 'notes',
		});
		expect(result.ok).toBe(true);
		expect(result.classification.type).toBe('destructive');
		expect(result.newSource.includes('notes')).toBe(false);
	});

	it('propose_remove_field reports the single remove_field change kind', () => {
		const result = applyProposal(sourceWithNotes, 'propose_remove_field', {
			table: 'Users',
			field: 'notes',
		});
		expect(result.classification.changes.length).toBe(1);
		expect(result.classification.changes[0].kind).toBe('remove_field');
	});

	it('propose_remove_field on an unknown field returns ok:false', () => {
		const result = applyProposal(sourceWithNotes, 'propose_remove_field', {
			table: 'Users',
			field: 'doesNotExist',
		});
		expect(result.ok).toBe(false);
	});

	it('TOOL_DEFINITIONS includes propose_remove_field with the steering description', () => {
		const tool = TOOL_DEFINITIONS.find((t) => t.name === 'propose_remove_field');
		expect(tool !== undefined).toBe(true);
		const desc = tool.description;
		// Required steering signals — these words make the AI assistant
		// (and any code review of the schema) understand the destructive
		// nature and the typed-confirmation gate.
		expect(desc.includes('PERMANENT')).toBe(true);
		expect(desc.includes('data loss')).toBe(true);
		expect(desc.includes('requires typed confirmation')).toBe(true);
	});

	it('propose_remove_field description steers the assistant toward propose_hide_field by default', () => {
		const tool = TOOL_DEFINITIONS.find((t) => t.name === 'propose_remove_field');
		const desc = tool.description;
		// The steering hint must name the safer alternative AND the trigger
		// words that justify reaching for the destructive tool. Without this
		// text, Meph reaches for remove on plain "delete the X" requests
		// where hide is the right call.
		expect(desc.includes('propose_hide_field')).toBe(true);
		expect(desc.includes('permanently')).toBe(true);
		expect(desc.includes('forever')).toBe(true);
		expect(desc.includes('wipe')).toBe(true);
	});

	it('propose_remove_field input_schema requires table and field', () => {
		const tool = TOOL_DEFINITIONS.find((t) => t.name === 'propose_remove_field');
		expect(tool.input_schema.required.includes('table')).toBe(true);
		expect(tool.input_schema.required.includes('field')).toBe(true);
	});
});

describe('proposal — unknown-tool regression (still works after Phase C)', () => {
	// Belt-and-suspenders: cycle 2 added a new TOOL_IMPLS entry; the unknown
	// tool path must still return the not-found shape unchanged. Catches a
	// regression where someone accidentally adds a default impl or changes
	// the error shape.
	it('returns ok:false with unknown tool error for a name not in TOOL_IMPLS', () => {
		const result = applyProposal('', 'propose_nuke_database', { anything: true });
		expect(result.ok).toBe(false);
		expect(result.error.toLowerCase().includes('unknown tool')).toBe(true);
	});

	it('lists propose_remove_field as a valid tool in the unknown-tool error', () => {
		const result = applyProposal('', 'propose_nuke_database', {});
		expect(result.error.includes('propose_remove_field')).toBe(true);
	});
});
