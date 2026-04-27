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
import { requiredConfirmation } from './destructive-confirm.js';

function buildProposalSummary(classification) {
	const kinds = classification.changes.map((c) => c.kind);
	const counts = {};
	for (const k of kinds) counts[k] = (counts[k] || 0) + 1;
	return Object.entries(counts)
		.map(([k, n]) => `${n}× ${k.replace(/_/g, ' ')}`)
		.join(', ');
}

// LAE Phase C cycle 4 — tiny human-readable snippets for the audit row.
// Intentionally bounded to a single line each — the audit log is the
// accountability surface, NOT a full source snapshot. The full diff lives
// in the versioned bundle that cloud rollback can restore.
function buildBeforeSnippet(change) {
	if (!change || !change.kind) return '(unknown)';
	switch (change.kind) {
		case 'remove_field':
			return change.fieldType
				? `- ${change.field} (${change.fieldType})`
				: `- ${change.field}`;
		case 'remove_endpoint':
			return `- ${change.method || ''} ${change.path || ''}`.trim();
		case 'remove_page':
			return `- page "${change.title || ''}"`;
		case 'remove_table':
			return `- table ${change.table || ''}`;
		case 'change_type':
			return `- ${change.table || ''}.${change.field || ''} (${change.from || '?'})`;
		default:
			return `(${change.kind})`;
	}
}

function buildAfterSnippet(change) {
	if (!change || !change.kind) return '(unknown)';
	switch (change.kind) {
		case 'remove_field':
		case 'remove_endpoint':
		case 'remove_page':
		case 'remove_table':
			return '(removed)';
		case 'change_type':
			return `+ ${change.table || ''}.${change.field || ''} (${change.to || '?'})`;
		default:
			return '(changed)';
	}
}

function normalizeDeployHistoryVersions(versions) {
	return (Array.isArray(versions) ? versions : []).map((version) => {
		if (!version || typeof version !== 'object') return version;
		const id = version.id || version.versionId || null;
		return {
			...version,
			id: version.id || id,
			versionId: version.versionId || id,
		};
	});
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

	// 2. Ship endpoint — write, compile, respawn (or for cloud-deployed apps,
	// push an incremental update to Cloudflare). The widget POSTs
	// {newSource, tenantSlug?, appSlug?, classification?, confirmation?, reason?}.
	// When tenantSlug + appSlug are present AND the Studio-side applyShip
	// closure has cloud deps wired, the ship routes to the incremental-update
	// path (LAE Phase B). Otherwise it runs the local write/compile/respawn
	// path (Phase A, unchanged).
	//
	// LAE Phase C cycle 4 — destructive ship gate:
	// When classification.type === 'destructive', the request must include a
	// reason AND a confirmation phrase that exactly matches what
	// requiredConfirmation(classification) produces. Server then writes a
	// PENDING audit row FIRST, runs applyShip, then marks the row 'shipped'
	// (with versionId) or 'ship-failed' (with error message). If the audit
	// store is unreachable (throws or returns ok:false), the destructive
	// change is REFUSED with 503 — no row, no ship. This is locked-in
	// decision #4 from the Phase C plan: an audit log with holes can't prove
	// anything to a regulator, so a missing row IS the bug signal.
	app.post('/__meph__/api/ship', requireOwner, async (req, res) => {
		const newSource = req.body && req.body.newSource;
		if (!newSource) {
			res.status(400).json({ error: 'newSource is required' });
			return;
		}
		const cloudContext = {
			tenantSlug: (req.body && req.body.tenantSlug) || null,
			appSlug: (req.body && req.body.appSlug) || null,
		};

		const classification = (req.body && req.body.classification) || null;
		const isDestructive = classification && classification.type === 'destructive';

		// Non-destructive ship: unchanged Phase A/B path.
		if (!isDestructive) {
			try {
				const result = await deps.applyShip(newSource, cloudContext);
				if (!result.ok) {
					res.status(500).json({
						error: result.error,
						stage: result.stage,
						elapsed_ms: result.elapsed_ms,
					});
					return;
				}
				res.status(200).json({ ...result, ok: true });
			} catch (err) {
				res.status(500).json({ error: `ship threw: ${err.message}` });
			}
			return;
		}

		// Destructive ship — gate on confirmation + reason FIRST. Cheap checks
		// happen before we touch the audit store; no point spending an audit
		// row on a request that's going to 400 on a missing field.
		const expected = requiredConfirmation(classification);
		const confirmation = req.body && req.body.confirmation;
		if (!confirmation) {
			res.status(400).json({ error: 'confirmation required', expected });
			return;
		}
		if (confirmation !== expected) {
			// Case-sensitive exact match — locked-in decision #1 + #3 (reading
			// friction is the safety feature; "delete" must not satisfy "DELETE").
			res.status(400).json({ error: 'confirmation mismatch', expected });
			return;
		}
		const reason = req.body && req.body.reason;
		if (!reason || (typeof reason === 'string' && reason.trim() === '')) {
			res.status(400).json({ error: 'reason is required for destructive ships' });
			return;
		}

		// Defense in depth: if a server forgot to wire the audit deps but
		// destructive ships still route here, refuse loudly. We don't ship
		// destructive without a paper trail.
		if (typeof deps.appendAuditEntry !== 'function') {
			res.status(503).json({ error: 'audit unavailable: appendAuditEntry not wired' });
			return;
		}

		// Build the diff snippets shown in the audit row. Tiny on purpose —
		// the audit row replaces the data snapshot, not the source-of-truth
		// (which lives in the versioned bundle the widget can roll back to).
		const firstChange = (Array.isArray(classification.changes) && classification.changes[0]) || {};
		const auditKind = firstChange.kind || 'unknown';
		const before = buildBeforeSnippet(firstChange);
		const after = buildAfterSnippet(firstChange);

		const actor = (req.user && (req.user.email || req.user.id)) || 'unknown';
		const ip = (req.ip || (req.headers && req.headers['x-forwarded-for'])) || null;
		const userAgent = (req.headers && req.headers['user-agent']) || null;

		// Step 1: write the PENDING audit row. If this throws or comes back
		// ok:false, the ship is REFUSED with 503 — applyShip never runs.
		let auditId = null;
		try {
			const auditResult = await deps.appendAuditEntry({
				tenantSlug: cloudContext.tenantSlug,
				appSlug: cloudContext.appSlug,
				actor,
				action: 'ship',
				verdict: 'destructive',
				kind: auditKind,
				before,
				after,
				reason,
				ip,
				userAgent,
				status: 'pending',
			});
			if (!auditResult || !auditResult.ok) {
				res.status(503).json({
					error: 'audit unavailable',
					code: (auditResult && auditResult.code) || 'AUDIT_APPEND_FAILED',
				});
				return;
			}
			auditId = auditResult.auditId;
		} catch (err) {
			res.status(503).json({ error: `audit unavailable: ${err.message}` });
			return;
		}

		// Step 2: run the actual ship. Wrap in try/catch so we always reach
		// the markAuditEntry call below — a thrown applyShip must STILL flip
		// the pending row to ship-failed, otherwise the row stays "pending"
		// forever and we lose the failure signal.
		let result;
		let shipError = null;
		try {
			result = await deps.applyShip(newSource, cloudContext);
		} catch (err) {
			shipError = err;
		}

		// Step 3: mark the audit row with the final status.
		if (shipError || !result || !result.ok) {
			const errorMessage = shipError ? shipError.message
				: (result && result.error) || 'ship returned not-ok with no error message';
			if (typeof deps.markAuditEntry === 'function') {
				try {
					await deps.markAuditEntry({ auditId, status: 'ship-failed', error: errorMessage });
				} catch (markErr) {
					// Best-effort: if marking fails, the pending row stays as evidence.
					// Log to stderr so operators can see it without crashing the request.
					console.error('[edit-api] markAuditEntry threw on ship-failed path:', markErr.message);
				}
			}
			res.status(500).json({ error: `ship failed: ${errorMessage}`, auditId });
			return;
		}

		if (typeof deps.markAuditEntry === 'function') {
			try {
				await deps.markAuditEntry({
					auditId,
					status: 'shipped',
					versionId: result.versionId || null,
				});
			} catch (markErr) {
				// The ship succeeded but we couldn't mark the row. Don't fail
				// the user-visible request — the row is still 'pending' which
				// is recoverable. Just log it.
				console.error('[edit-api] markAuditEntry threw on success path:', markErr.message);
			}
		}

		res.status(200).json({ ...result, ok: true, audit: { ok: true, auditId } });
	});

	// 3b. Cloud rollback — for CF-deployed apps, the widget Undo routes here
	// instead of the snapshot-based /rollback. Calls rollbackToVersion on
	// Cloudflare and records a new "widget-undo-v<N>" version row in
	// tenants-db so the version history stays linear.
	app.post('/__meph__/api/cloud-rollback', requireOwner, async (req, res) => {
		const body = req.body || {};
		const tenantSlug = body.tenantSlug;
		const appSlug = body.appSlug;
		const targetVersionId = body.targetVersionId;
		if (!tenantSlug || !appSlug || !targetVersionId) {
			res.status(400).json({ error: 'tenantSlug, appSlug, and targetVersionId are required' });
			return;
		}
		if (!deps.applyCloudRollback) {
			res.status(501).json({ error: 'cloud rollback not wired on this server' });
			return;
		}
		try {
			const result = await deps.applyCloudRollback({ tenantSlug, appSlug, targetVersionId });
			if (!result.ok) {
				// VERSION_GONE + any other structured error bubbles up with 400
				// so the widget can refresh its version-history list.
				res.status(400).json(result);
				return;
			}
			res.status(200).json(result);
		} catch (err) {
			res.status(500).json({ error: `cloud-rollback threw: ${err.message}` });
		}
	});

	// 3. Rollback — restore a prior snapshot. "Meph, undo that."
	app.post('/__meph__/api/rollback', requireOwner, async (req, res) => {
		const body = req.body || {};
		// Accept either { snapshotId: 'abc123' } or { relative: -1 }
		const ref = body.snapshotId || { relative: body.relative || -1 };
		try {
			if (!deps.applyRollback) {
				res.status(501).json({ error: 'rollback not wired' });
				return;
			}
			const result = await deps.applyRollback(ref);
			if (!result.ok) {
				res.status(400).json(result);
				return;
			}
			res.status(200).json(result);
		} catch (err) {
			res.status(500).json({ error: `rollback threw: ${err.message}` });
		}
	});

	// 4. List snapshots — for the widget's "undo history" dropdown.
	app.get('/__meph__/api/snapshots', requireOwner, async (req, res) => {
		try {
			if (!deps.listSnapshots) {
				res.status(200).json([]);
				return;
			}
			const list = await deps.listSnapshots();
			res.status(200).json(list);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	// 5. Widget bundle — served to all, role-checks inside the script.
	app.get('/__meph__/api/deploy-history', requireOwner, async (req, res) => {
		const tenantSlug = req.query && req.query.tenantSlug;
		const appSlug = req.query && req.query.appSlug;
		if (!tenantSlug) {
			res.status(400).json({ error: 'tenantSlug is required' });
			return;
		}
		if (!appSlug) {
			res.status(400).json({ error: 'appSlug is required' });
			return;
		}
		if (typeof deps.listDeployHistory !== 'function') {
			res.status(501).json({ error: 'deploy history not wired on this server' });
			return;
		}
		try {
			const result = await deps.listDeployHistory({ tenantSlug, appSlug, req });
			const versions = normalizeDeployHistoryVersions(result && result.versions);
			res.status(200).json({ ...(result || {}), versions });
		} catch (err) {
			res.status(500).json({ error: `deploy-history threw: ${err.message}` });
		}
	});

	app.get('/__meph__/widget.js', (req, res) => {
		res.type('application/javascript').send(deps.widgetScript || '');
	});
}
