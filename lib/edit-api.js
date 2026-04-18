// HTTP surface for Live-Editing Phase A.
//
// createEditApi(app, deps) registers the three /__meph__ routes on an
// Express app. Dependencies are injected so the logic can be unit-tested
// without hitting disk, the Anthropic API, or a live compiler:
//
//   deps.readSource()         — return current .clear source as a string
//   deps.callMeph(ctx)        — {prompt, source} → {tool, args, text?}
//   deps.applyShip(newSource) — run the ship flow; return {ok, elapsed_ms, error?}
//   deps.widgetScript         — the browser-side widget.js contents
//
// The widget.js endpoint is intentionally NOT owner-gated — the script
// itself checks the session role before mounting any UI, so serving it
// to everyone is safe (and simpler to cache).

import { requireOwner } from './live-edit-auth.js';
import { applyProposal } from './proposal.js';

function buildProposalSummary(classification) {
	const kinds = classification.changes.map((c) => c.kind);
	const counts = {};
	for (const k of kinds) counts[k] = (counts[k] || 0) + 1;
	return Object.entries(counts)
		.map(([k, n]) => `${n}× ${k.replace(/_/g, ' ')}`)
		.join(', ');
}

export function createEditApi(app, deps) {
	// 1. Meph's propose endpoint.
	app.post('/__meph__/api/propose', requireOwner, async (req, res) => {
		const prompt = (req.body && req.body.prompt) || '';
		if (!prompt) {
			res.status(400).json({ error: 'prompt is required' });
			return;
		}
		const source = await deps.readSource(req);
		let mephResult;
		try {
			mephResult = await deps.callMeph({ prompt, source });
		} catch (err) {
			res.status(502).json({ error: `Meph call failed: ${err.message}` });
			return;
		}

		if (!mephResult || !mephResult.tool) {
			res.status(400).json({
				error:
					'Meph did not call a tool. Text response was: ' +
					(mephResult && mephResult.text ? mephResult.text : '(none)'),
			});
			return;
		}

		const proposal = applyProposal(source, mephResult.tool, mephResult.args || {});
		if (!proposal.ok) {
			res.status(400).json({ error: proposal.error });
			return;
		}

		res.status(200).json({
			newSource: proposal.newSource,
			diff: proposal.diff,
			classification: proposal.classification,
			summary: buildProposalSummary(proposal.classification),
		});
	});

	// 2. Ship endpoint — write, compile, respawn.
	app.post('/__meph__/api/ship', requireOwner, async (req, res) => {
		const newSource = req.body && req.body.newSource;
		if (!newSource) {
			res.status(400).json({ error: 'newSource is required' });
			return;
		}
		try {
			const result = await deps.applyShip(newSource);
			if (!result.ok) {
				res.status(500).json({ error: result.error, elapsed_ms: result.elapsed_ms });
				return;
			}
			res.status(200).json({ ok: true, elapsed_ms: result.elapsed_ms });
		} catch (err) {
			res.status(500).json({ error: `ship threw: ${err.message}` });
		}
	});

	// 3. Widget bundle — served to all, role-checks inside the script.
	app.get('/__meph__/widget.js', (req, res) => {
		res.type('application/javascript').send(deps.widgetScript || '');
	});
}
