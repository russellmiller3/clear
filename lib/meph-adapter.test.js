import { describe, it, expect } from './testUtils.js';
import { buildMephRequest, parseMephResponse } from './meph-adapter.js';

describe('meph-adapter — buildMephRequest', () => {
	it('builds an Anthropic /v1/messages body with the widget-mode system prompt', () => {
		const req = buildMephRequest({
			prompt: 'add an email field to Users',
			source: `create a Users table:
  name
`,
			model: 'claude-sonnet-4-5',
		});
		expect(req.model).toBe('claude-sonnet-4-5');
		expect(req.system.toLowerCase().includes('additive')).toBe(true);
		expect(req.messages[0].role).toBe('user');
		expect(req.messages[0].content.includes('add an email field to Users')).toBe(true);
	});

	it('includes all three propose_ tools in the tool list', () => {
		const req = buildMephRequest({ prompt: 'x', source: '' });
		const names = req.tools.map((t) => t.name).sort();
		expect(names).toEqual(['propose_add_endpoint', 'propose_add_field', 'propose_add_page']);
	});

	it('includes the full current source in the user message so Meph sees it', () => {
		const src = `create a Todos table:
  title, required
`;
		const req = buildMephRequest({ prompt: 'x', source: src });
		expect(req.messages[0].content.includes('create a Todos table:')).toBe(true);
	});

	it('defaults to a reasonable max_tokens', () => {
		const req = buildMephRequest({ prompt: 'x', source: '' });
		expect(typeof req.max_tokens).toBe('number');
		expect(req.max_tokens > 0).toBe(true);
	});
});

describe('meph-adapter — parseMephResponse', () => {
	it('extracts tool name and args from a tool_use content block', () => {
		const apiResponse = {
			content: [
				{ type: 'text', text: "I'll add the field." },
				{
					type: 'tool_use',
					id: 'toolu_1',
					name: 'propose_add_field',
					input: { table: 'Users', fieldLine: 'email' },
				},
			],
		};
		const parsed = parseMephResponse(apiResponse);
		expect(parsed.tool).toBe('propose_add_field');
		expect(parsed.args.table).toBe('Users');
	});

	it('returns {tool:null, text} when Meph responded with text only', () => {
		const apiResponse = {
			content: [{ type: 'text', text: "I can't do that in widget mode." }],
		};
		const parsed = parseMephResponse(apiResponse);
		expect(parsed.tool).toBe(null);
		expect(parsed.text.includes("can't do that")).toBe(true);
	});

	it('returns the FIRST tool_use if there are multiple (one proposal per turn)', () => {
		const apiResponse = {
			content: [
				{ type: 'tool_use', id: '1', name: 'propose_add_field', input: { table: 'A', fieldLine: 'x' } },
				{ type: 'tool_use', id: '2', name: 'propose_add_field', input: { table: 'B', fieldLine: 'y' } },
			],
		};
		const parsed = parseMephResponse(apiResponse);
		expect(parsed.args.table).toBe('A');
	});

	it('handles an empty/malformed content array gracefully', () => {
		expect(parseMephResponse({ content: [] }).tool).toBe(null);
		expect(parseMephResponse({}).tool).toBe(null);
		expect(parseMephResponse(null).tool).toBe(null);
	});
});
