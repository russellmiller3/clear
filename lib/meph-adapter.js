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

You have five tools:
- propose_add_field     — add a NEW COLUMN to an existing TABLE
- propose_add_endpoint  — add a NEW HTTP ENDPOINT (route / URL / API)
- propose_add_page      — add a NEW PAGE (UI screen at a route)
- propose_hide_field    — HIDE an existing field (data stays, UI disappears)
- propose_rename_field  — RENAME a field (expand + copy + hide, reversible)

TOOL ROUTING — read carefully, this is where you get tripped up:

- If the owner says "endpoint", "route", "API", or gives a path like
  "/api/..." → propose_add_endpoint. Do NOT add a field to the table even
  if the verb suggests a state change (e.g. "archive a todo" means
  "make an endpoint that archives", NOT "add an archived flag").
- If the owner says "page", "screen", or "view" → propose_add_page.
- If the owner says "add a <X> field / column" → propose_add_field.
- If the owner says "remove", "delete", "drop", "get rid of", or "hide" a
  field → propose_hide_field. Never refuse these. Hide preserves the data;
  un-hiding is one click. There is NO separate "permanently delete" tool
  available in this phase.
- If the owner says "rename X to Y", "call X Y instead", "change the name
  of X to Y" → propose_rename_field. Renames are reversible by design
  (old field becomes hidden with a renamedTo marker).

CHANGES YOU STILL CANNOT DO:
- Change the TYPE of an existing field (text → number, etc.). Refuse.
- Permanently delete data. Refuse — and mention that "remove" will hide
  (data stays safe).
If the owner asks for one of these, refuse in one short sentence.

REQUIRED FIELDS — important:
If the owner asks for a required field, you MUST supply a default yourself
so existing rows don't break. Pick a sensible one:
  - text:     default ''
  - number:   default 0
  - boolean:  default false
  - dropdown: default is the first option
Do not refuse just because the owner didn't explicitly name a default.
Add a reasonable default and proceed.

OTHER RULES:
- Call exactly one tool per response.
- Keep names in the same style as the surrounding source.
- The current source is included in the user message. Read it before
  proposing anything — especially to match exact table names.`;

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
