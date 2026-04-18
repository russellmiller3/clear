// Tool dispatcher for widget-mode Meph.
//
// Meph's Anthropic tool-use loop returns a tool name + args. applyProposal
// routes that to one of the three propose_* tools. The tool generates a
// new source string and runs the classifier. If the result isn't purely
// additive, the tool itself returns ok:false — the dispatcher never
// ships anything that wasn't confirmed safe by the tool.
//
// TOOL_DEFINITIONS is the Anthropic tool-schema array that gets passed
// into the /v1/messages request. The descriptions are intentionally
// repetitive about "additive" and "safe" because Meph needs to understand
// he cannot propose destructive or reversible changes in widget mode.

import { proposeAddField, proposeAddEndpoint, proposeAddPage } from './edit-tools.js';

const TOOL_IMPLS = {
	propose_add_field: proposeAddField,
	propose_add_endpoint: proposeAddEndpoint,
	propose_add_page: proposeAddPage,
};

export function applyProposal(source, toolName, toolArgs) {
	const impl = TOOL_IMPLS[toolName];
	if (!impl) {
		const valid = Object.keys(TOOL_IMPLS).join(', ');
		return {
			ok: false,
			error: `unknown tool: ${toolName}. Valid tools: ${valid}`,
		};
	}
	return impl(source, toolArgs);
}

export const TOOL_DEFINITIONS = [
	{
		name: 'propose_add_field',
		description:
			'Propose an additive change: add a new field to an existing table. ' +
			'Only use this for purely additive changes — the new field must not ' +
			'be required-without-default (that would break existing rows). ' +
			'The tool will insert the field line into the table block, parse ' +
			'the result, and run the change classifier. If the result is not ' +
			'additive, the tool will return an error without shipping.',
		input_schema: {
			type: 'object',
			properties: {
				table: {
					type: 'string',
					description: 'The exact table name (case-sensitive), e.g. "Users".',
				},
				fieldLine: {
					type: 'string',
					description:
						'The Clear field definition as a single line, exactly as it ' +
						'would appear in the .clear source. Examples: "priority (number)", ' +
						'"region from \'NA\', \'EMEA\', \'APAC\', default \'NA\'", ' +
						'"archived (boolean), default false".',
				},
			},
			required: ['table', 'fieldLine'],
		},
	},
	{
		name: 'propose_add_endpoint',
		description:
			'Propose an additive change: add a brand-new HTTP endpoint. ' +
			'Only use this for purely additive changes — the endpoint path and ' +
			'method must not already exist. The tool will append the block to ' +
			'the end of the source, parse, and run the classifier. If the result ' +
			'is not additive the tool returns an error.',
		input_schema: {
			type: 'object',
			properties: {
				block: {
					type: 'string',
					description:
						'The complete endpoint block as Clear source, starting with ' +
						'"when user sends to /api/..." and including the body. ' +
						'Must be valid, self-contained Clear code.',
				},
			},
			required: ['block'],
		},
	},
	{
		name: 'propose_add_page',
		description:
			'Propose an additive change: add a brand-new page. Only use this ' +
			'for purely additive changes — the page title must not already exist. ' +
			'The tool will append the block to the end of the source and run the ' +
			'classifier to confirm the change is additive.',
		input_schema: {
			type: 'object',
			properties: {
				block: {
					type: 'string',
					description:
						'The complete page block as Clear source, starting with ' +
						"\"page 'Title' at '/route':\" and including the body.",
				},
			},
			required: ['block'],
		},
	},
];
