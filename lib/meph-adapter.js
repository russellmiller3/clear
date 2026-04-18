// Anthropic adapter for widget-mode Meph.
//
// buildMephRequest     — shapes a /v1/messages body with the restricted
//                        three-tool palette and the widget-mode system prompt
// parseMephResponse    — pulls the first tool_use block out of the response,
//                        or returns {tool:null, text} if Meph answered in prose
// callMeph             — glue that actually performs the HTTP request. Used
//                        by edit-api.js when wiring a real /propose endpoint.
//
// The system prompt is intentionally narrow: Meph knows he has three tools,
// knows he must only propose additive changes, and is told in plain terms
// that remove/rename/delete belong to a later phase he shouldn't mention.

import { TOOL_DEFINITIONS } from './proposal.js';

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are Meph in widget mode — the owner is editing a running app from a floating chat widget.

You have exactly three tools:
- propose_add_field: add a new field to an existing table
- propose_add_endpoint: add a new HTTP endpoint
- propose_add_page: add a new page

Every change you propose must be ADDITIVE. You cannot remove, rename, hide,
or change the type of anything that already exists. If the owner asks for a
removal, rename, or type change, refuse in one short sentence and tell them
those changes aren't available in the current phase — don't offer a workaround.

When you do propose a change:
- Call exactly one tool per response
- Make sure a new required field has a default value (otherwise existing rows break)
- Keep field/endpoint/page names in the same style as the surrounding source

The current source of the app is included in the user message for context.
Read it carefully before proposing anything.`;

export function buildMephRequest({ prompt, source, model, maxTokens }) {
	const userContent =
		`Here is the current .clear source:\n\n${source || '(empty)'}\n\n` +
		`---\n\nOwner request: ${prompt}`;
	return {
		model: model || DEFAULT_MODEL,
		max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
		system: SYSTEM_PROMPT,
		tools: TOOL_DEFINITIONS,
		messages: [{ role: 'user', content: userContent }],
	};
}

export function parseMephResponse(apiResponse) {
	const content = apiResponse && apiResponse.content;
	if (!Array.isArray(content)) return { tool: null, text: '' };

	const toolBlock = content.find((b) => b && b.type === 'tool_use');
	if (toolBlock) {
		return {
			tool: toolBlock.name,
			args: toolBlock.input || {},
			toolUseId: toolBlock.id,
		};
	}

	const textBlock = content.find((b) => b && b.type === 'text');
	return {
		tool: null,
		text: textBlock ? textBlock.text || '' : '',
	};
}

export async function callMeph({ prompt, source, apiKey, model, fetchImpl }) {
	const body = buildMephRequest({ prompt, source, model });
	const doFetch = fetchImpl || globalThis.fetch;
	const resp = await doFetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify(body),
	});
	if (!resp.ok) {
		const errBody = await resp.text();
		throw new Error(`Anthropic API ${resp.status}: ${errBody}`);
	}
	const json = await resp.json();
	return parseMephResponse(json);
}
