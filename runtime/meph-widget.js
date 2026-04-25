// =============================================================================
// CLEAR RUNTIME — LIVE-EDITING MEPH WIDGET (browser-side)
// =============================================================================
//
// This file is served verbatim as /__meph__/widget.js by the compiled app.
// It only activates for users whose session role is 'owner'. Non-owners
// get the script tag but the IIFE exits early.
//
// The widget injects a floating badge (bottom-right) and a collapsible
// dark chat panel. Chat POSTs to /__meph__/api/propose with the user's
// prompt, shows the classifier result + diff, and on approval POSTs to
// /__meph__/api/ship. A successful ship reloads the page.
//
// Phase A is strictly additive — any proposal that isn't additive is
// rejected server-side and shown as an error.
//
// LAE Phase C cycle 5 adds the DESTRUCTIVE flow on the widget side:
// when a proposal classifies as 'destructive', the widget renders a
// typed-confirmation input + reason textarea + a clearly red
// "I understand — ship and destroy" button. The button stays disabled
// until the owner types the exact canonical phrase (e.g.
// "DELETE field email") AND fills the reason. On click it POSTs both
// fields to /__meph__/api/ship, where the cycle-4 audit-first gate
// runs the show. Long button copy IS the safety — the reading-friction
// prevents fat-finger ships. (See plan locked-in decision #3.)
// =============================================================================

(function () {
	'use strict';
	if (window.__clear_meph_widget_loaded) return;
	window.__clear_meph_widget_loaded = true;

	// Reads auth token from localStorage. Matches how compiled Clear apps
	// store the JWT after login (see runtime/auth.js createToken + the
	// auth scaffolding in compiler.js).
	function getToken() {
		try {
			return localStorage.getItem('clear_auth_token') || '';
		} catch {
			return '';
		}
	}

	function tokenClaims() {
		const t = getToken();
		if (!t) return null;
		const parts = t.split('.');
		if (parts.length !== 2) return null;
		try {
			const payload = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
			if (payload.exp && payload.exp < Date.now()) return null;
			return payload;
		} catch {
			return null;
		}
	}

	function isOwner() {
		const claims = tokenClaims();
		return claims && claims.role === 'owner';
	}

	// LAE Phase C cycle 5 — inlined copy of lib/destructive-confirm.js's
	// requiredConfirmation helper. The plan calls it "small enough to dup"
	// rather than build a runtime import path. Both copies MUST stay in
	// sync — runtime/meph-widget.test.mjs has a test that fails if they
	// diverge. If the widget renders "DELETE field email" but the API
	// expects something different, every destructive ship 400s and
	// Marcus thinks Meph is broken.
	function requiredConfirmation(classification) {
		if (!classification) return null;
		if (!Array.isArray(classification.changes) || classification.changes.length === 0) return null;
		const change = classification.changes[0];
		if (!change || !change.kind) return null;
		switch (change.kind) {
			case 'remove_field':
				if (!change.field) return null;
				return 'DELETE field ' + change.field;
			case 'remove_endpoint':
				if (!change.method || !change.path) return null;
				return 'DELETE endpoint ' + change.method + ' ' + change.path;
			case 'remove_page':
				if (!change.title) return null;
				return 'DELETE page "' + change.title + '"';
			case 'remove_table':
				if (!change.table) return null;
				return 'DELETE table ' + change.table;
			case 'change_type':
				if (!change.table || !change.field || !change.from || !change.to) return null;
				return 'COERCE ' + change.table + '.' + change.field + ' from ' + change.from + ' to ' + change.to;
			default:
				return null;
		}
	}

	// LAE Phase B: when the widget is running on a Cloudflare-deployed app,
	// a <meta name="clear-cloud" content='{"tenantSlug":"X","appSlug":"Y"}'>
	// tag tells us so. Future compiler cycle emits this tag automatically
	// on the --target=cloudflare path; until then the tag must be added
	// manually (or the widget just uses local paths, unchanged from Phase A).
	function readCloudContext() {
		try {
			const meta = document.querySelector('meta[name="clear-cloud"]');
			if (!meta) return null;
			const raw = meta.getAttribute('content') || '';
			const parsed = JSON.parse(raw);
			if (parsed && parsed.tenantSlug && parsed.appSlug) {
				return { tenantSlug: parsed.tenantSlug, appSlug: parsed.appSlug };
			}
		} catch { /* ignore malformed tag */ }
		return null;
	}
	const cloudContext = readCloudContext();
	// Remember the most-recent shipped versionId so Undo knows what to roll
	// BACK FROM. Cloud rollback rolls to the version-before-this-one, which
	// is versions[1] on the server side (versions[0] is the current live).
	let _lastShippedVersionId = null;

	function api(path, body) {
		return fetch('/__meph__/api/' + path, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer ' + getToken(),
			},
			body: JSON.stringify(body || {}),
		}).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));
	}

	// --------------------------------------------------------------------
	// DOM construction
	// --------------------------------------------------------------------

	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		if (attrs) {
			for (const k in attrs) {
				if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
				else if (k.startsWith('on') && typeof attrs[k] === 'function')
					node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
				else if (k === 'html') node.innerHTML = attrs[k];
				else node.setAttribute(k, attrs[k]);
			}
		}
		if (children) {
			for (const c of children) {
				if (c == null) continue;
				node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
			}
		}
		return node;
	}

	function injectStyles() {
		const css = `
			.clear-meph-badge {
				position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;
				background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #6366f1 100%);
				color: #fff; border-radius: 16px; padding: 10px 16px;
				font: 600 12px/1 -apple-system, system-ui, sans-serif;
				display: inline-flex; align-items: center; gap: 8px;
				box-shadow: 0 8px 24px rgba(67,97,238,.3), 0 2px 4px rgba(0,0,0,.1);
				cursor: pointer; user-select: none; border: 0;
			}
			.clear-meph-panel {
				position: fixed; bottom: 76px; right: 24px; z-index: 2147483000;
				width: 400px; max-height: 70vh; display: none;
				background: #0f172a; color: #cbd5e1; border-radius: 20px;
				border: 1px solid rgba(255,255,255,.08); overflow: hidden;
				box-shadow: 0 24px 64px rgba(15,23,42,.4), 0 8px 24px rgba(15,23,42,.2);
				font: 13px/1.6 -apple-system, system-ui, sans-serif;
				flex-direction: column;
			}
			.clear-meph-panel.open { display: flex; }
			.clear-meph-head {
				display:flex; align-items:center; justify-content:space-between;
				padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.06);
			}
			.clear-meph-title { color:#fff; font-weight:600; font-size:13px; }
			.clear-meph-owner-chip {
				font-size:10px; font-weight:600; color:#34d399;
				background: rgba(52,211,153,.1); border: 1px solid rgba(52,211,153,.2);
				padding: 2px 8px; border-radius: 999px;
			}
			.clear-meph-undo {
				font-size: 11px; font-weight: 600; color: #cbd5e1;
				background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
				padding: 4px 10px; border-radius: 8px; cursor: pointer;
				margin-left: 8px;
			}
			.clear-meph-undo:hover { background: rgba(255,255,255,.08); color: #fff; }
			.clear-meph-messages { flex:1; overflow-y:auto; padding: 14px; display:flex; flex-direction:column; gap:10px; }
			.clear-meph-msg-user {
				background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.2);
				border-radius: 12px; padding: 10px 14px; color: #e0e7ff;
			}
			.clear-meph-msg-bot {
				background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
				border-radius: 12px; padding: 12px 14px;
			}
			.clear-meph-chip {
				display:inline-flex; align-items:center; gap:6px;
				font-size:11px; font-weight:700; padding: 3px 10px; border-radius: 999px;
				margin-bottom: 8px;
			}
			.clear-meph-chip-additive { background:#ecfdf5; color:#047857; }
			.clear-meph-chip-reversible { background:#fff7ed; color:#c2410c; }
			.clear-meph-chip-destructive { background:#fef2f2; color:#b91c1c; }
			.clear-meph-diff { background:#020617; padding:10px 12px; border-radius:8px;
				font: 500 12px/1.55 "JetBrains Mono", ui-monospace, monospace; color:#86efac;
				white-space: pre; overflow-x: auto; margin-top: 6px; }
			.clear-meph-diff-dest { color:#fca5a5; }
			.clear-meph-actions { display:flex; gap:8px; margin-top: 10px; }
			.clear-meph-btn {
				border: 0; font: 600 12px/1 inherit; padding: 8px 14px; border-radius: 8px;
				cursor:pointer; background: rgba(255,255,255,.05); color: #cbd5e1;
			}
			.clear-meph-btn:hover { background: rgba(255,255,255,.1); }
			.clear-meph-btn-primary { background: #6366f1; color: white; flex: 1; }
			.clear-meph-btn-primary:hover { background: #4f46e5; }
			/* LAE Phase C cycle 5: destructive button. Red so the owner
			   cannot mistake it for a normal Ship button. The border +
			   bold weight + caps text combine to scream "this is final". */
			.clear-meph-btn-danger {
				background: #dc2626; color: white; flex: 1;
				border: 2px solid #b91c1c; font-weight: 700;
				letter-spacing: 0.02em;
			}
			.clear-meph-btn-danger:hover:not(:disabled) { background: #b91c1c; }
			.clear-meph-btn-danger:disabled {
				background: #7f1d1d; color: rgba(255,255,255,.5);
				cursor: not-allowed; border-color: #7f1d1d;
			}
			.clear-meph-confirm-input {
				width: 100%; background: rgba(255,255,255,.04);
				border: 1px solid rgba(255,255,255,.08); color: #fca5a5;
				border-radius: 8px; padding: 9px 11px;
				font: 600 13px/1.2 "JetBrains Mono", ui-monospace, monospace;
				outline: none; margin-top: 8px; box-sizing: border-box;
			}
			.clear-meph-confirm-input:focus { border-color: rgba(220,38,38,.6); }
			.clear-meph-confirm-input.mismatch { border-color: #dc2626; }
			.clear-meph-reason-input {
				width: 100%; background: rgba(255,255,255,.04);
				border: 1px solid rgba(255,255,255,.08); color: #e2e8f0;
				border-radius: 8px; padding: 9px 11px; font: inherit;
				outline: none; margin-top: 8px; resize: vertical;
				min-height: 56px; box-sizing: border-box;
			}
			.clear-meph-reason-input:focus { border-color: rgba(99,102,241,.5); }
			.clear-meph-warn {
				background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.2);
				border-radius: 8px; padding: 8px 10px; margin-top: 8px;
				color: #fca5a5; font-size: 12px;
			}
			.clear-meph-foot {
				border-top: 1px solid rgba(255,255,255,.06); padding: 10px 12px;
				display:flex; align-items:center; gap:10px;
			}
			.clear-meph-input {
				flex:1; background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
				color:#e2e8f0; border-radius: 8px; padding: 9px 11px; font: inherit; outline: none;
			}
			.clear-meph-input:focus { border-color: rgba(99,102,241,.5); }
			.clear-meph-send {
				width:34px; height:34px; border-radius: 8px; border:0; cursor:pointer;
				background: #6366f1; color:white; display:flex; align-items:center; justify-content:center;
			}
			.clear-meph-err { color:#fca5a5; font-size: 12px; }
		`;
		document.head.appendChild(el('style', { html: css }));
	}

	// --------------------------------------------------------------------
	// UI flow
	// --------------------------------------------------------------------

	function severityClass(type) {
		return type === 'additive'
			? 'clear-meph-chip-additive'
			: type === 'reversible'
				? 'clear-meph-chip-reversible'
				: 'clear-meph-chip-destructive';
	}

	function severityLabel(type) {
		return type === 'additive'
			? 'Additive · safe to ship'
			: type === 'reversible'
				? 'Reversible · Phase B only'
				: 'Destructive · Phase C only';
	}

	function renderProposal(proposal) {
		const cls = severityClass(proposal.classification.type);
		const label = severityLabel(proposal.classification.type);

		const diffNode = el('div', { class: 'clear-meph-diff' }, [proposal.diff || '']);
		const summary = el('div', {}, [
			el('div', { class: 'clear-meph-chip ' + cls }, [label]),
			el('div', {}, [proposal.summary || 'The change above will be applied.']),
			diffNode,
		]);

		if (proposal.classification.type === 'additive') {
			summary.appendChild(
				el('div', { class: 'clear-meph-actions' }, [
					el(
						'button',
						{
							class: 'clear-meph-btn clear-meph-btn-primary',
							onclick: () => shipProposal(proposal),
						},
						['Ship it'],
					),
					el(
						'button',
						{ class: 'clear-meph-btn', onclick: () => clearPending() },
						['Cancel'],
					),
				]),
			);
		} else if (proposal.classification.type === 'destructive') {
			// LAE Phase C cycle 5 — destructive branch.
			// Owner must type the canonical phrase (e.g. "DELETE field email")
			// AND fill a reason before the red button enables. We compute the
			// expected phrase once from the inlined helper so widget +
			// API agree byte-for-byte. If the helper returns null (unknown
			// destructive kind) we show the same "Phase A/B only" guard
			// rather than render a broken form.
			const expected = requiredConfirmation(proposal.classification);
			if (!expected) {
				summary.appendChild(
					el('div', { class: 'clear-meph-err' }, [
						'This destructive change has no confirmation phrase. Refusing to ship.',
					]),
				);
				return summary;
			}

			// Warning copy first — owner needs to know what survives a rollback.
			summary.appendChild(
				el('div', { class: 'clear-meph-warn' }, [
					'Permanent. Rolling back will restore the field, but not the data inside it.',
				]),
			);

			const confirmInput = el('input', {
				id: 'clear-meph-confirm',
				class: 'clear-meph-confirm-input',
				type: 'text',
				placeholder: expected,
				autocomplete: 'off',
				spellcheck: 'false',
			});
			const reasonInput = el('textarea', {
				id: 'clear-meph-reason',
				class: 'clear-meph-reason-input',
				placeholder: 'Reason for the deletion (e.g. user requested erasure under GDPR)',
			});
			const shipBtn = el(
				'button',
				{
					class: 'clear-meph-btn clear-meph-btn-danger',
					disabled: 'disabled',
					type: 'button',
				},
				['I understand — ship and destroy'],
			);
			const cancelBtn = el(
				'button',
				{ class: 'clear-meph-btn', type: 'button', onclick: () => clearPending() },
				['Cancel'],
			);

			// Re-evaluate the enable state on every keystroke. Both fields
			// must be exact-match-correct at the same time. Using both
			// 'input' and 'keyup' covers paste-from-clipboard (input fires)
			// and typed entry (keyup fires).
			function syncEnabled() {
				const phraseOk = confirmInput.value === expected;
				const reasonOk = (reasonInput.value || '').trim() !== '';
				if (phraseOk && reasonOk) {
					shipBtn.removeAttribute('disabled');
				} else {
					shipBtn.setAttribute('disabled', 'disabled');
				}
				// Visual hint: input turns red ONLY when non-empty AND mismatched.
				if (confirmInput.value && !phraseOk) confirmInput.classList.add('mismatch');
				else confirmInput.classList.remove('mismatch');
			}
			confirmInput.addEventListener('input', syncEnabled);
			confirmInput.addEventListener('keyup', syncEnabled);
			reasonInput.addEventListener('input', syncEnabled);
			reasonInput.addEventListener('keyup', syncEnabled);

			shipBtn.addEventListener('click', () => {
				if (shipBtn.hasAttribute('disabled')) return;
				shipDestructive(proposal, confirmInput, reasonInput, shipBtn);
			});

			summary.appendChild(confirmInput);
			summary.appendChild(reasonInput);
			summary.appendChild(
				el('div', { class: 'clear-meph-actions' }, [shipBtn, cancelBtn]),
			);
		} else {
			summary.appendChild(
				el('div', { class: 'clear-meph-err' }, [
					'Phase A only ships additive changes. Try rephrasing as an addition.',
				]),
			);
		}
		return summary;
	}

	let pendingProposal = null;
	let messagesEl, inputEl;

	function addBot(children) {
		const node = el('div', { class: 'clear-meph-msg-bot' }, Array.isArray(children) ? children : [children]);
		messagesEl.appendChild(node);
		messagesEl.scrollTop = messagesEl.scrollHeight;
		return node;
	}
	function addUser(text) {
		messagesEl.appendChild(el('div', { class: 'clear-meph-msg-user' }, [text]));
		messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	async function sendPrompt() {
		const prompt = inputEl.value.trim();
		if (!prompt) return;
		inputEl.value = '';
		addUser(prompt);
		const typing = addBot('Thinking...');
		try {
			const r = await api('propose', { prompt });
			typing.remove();
			if (!r.ok) {
				addBot([el('div', { class: 'clear-meph-err' }, [r.body.error || 'Request failed'])]);
				return;
			}
			pendingProposal = r.body;
			addBot([renderProposal(r.body)]);
		} catch (err) {
			typing.remove();
			addBot([el('div', { class: 'clear-meph-err' }, ['Network error: ' + err.message])]);
		}
	}

	async function shipProposal(proposal) {
		addBot('Shipping...');
		try {
			// LAE Phase B: when cloudContext is known, include tenantSlug +
			// appSlug so the backend routes to the Cloudflare incremental-
			// update path. When unset, the backend takes the local respawn
			// path (Phase A behavior, unchanged).
			const body = { newSource: proposal.newSource };
			if (cloudContext) {
				body.tenantSlug = cloudContext.tenantSlug;
				body.appSlug = cloudContext.appSlug;
			}
			const r = await api('ship', body);
			if (!r.ok) {
				addBot([el('div', { class: 'clear-meph-err' }, [r.body.error || 'Ship failed'])]);
				return;
			}
			// Remember the new versionId if the cloud path set one — used
			// by Undo so we know what to roll back FROM.
			if (r.body && r.body.versionId) _lastShippedVersionId = r.body.versionId;
			const mode = r.body && r.body.mode;
			const urlMsg = r.body && r.body.url ? ' at ' + r.body.url : '';
			const modeMsg = mode === 'update' ? ' (cloud update)' : '';
			addBot('Shipped' + modeMsg + ' in ' + (r.body.elapsed_ms || '?') + 'ms' + urlMsg + '. Reloading...');
			setTimeout(() => window.location.reload(), 1200);
		} catch (err) {
			addBot([el('div', { class: 'clear-meph-err' }, ['Ship error: ' + err.message])]);
		}
	}

	// LAE Phase C cycle 5 — destructive ship POST.
	// The cycle-4 API gate runs the show: it checks the typed phrase
	// against requiredConfirmation(), writes a 'pending' audit row,
	// runs applyShip, then marks the row 'shipped' or 'ship-failed'.
	// The widget's job here is to round-trip {confirmation, reason,
	// classification} alongside the source, then translate the four
	// possible response shapes into messages Marcus can act on:
	//   200 ok        → "Shipped. Audit ID <id>." then reload
	//   400 bad input → surface the expected phrase, re-enable input
	//   503 audit gone → "audit log unreachable, try again"
	//   500 ship-fail → "the attempt is on record (audit ID <id>)"
	async function shipDestructive(proposal, confirmInput, reasonInput, shipBtn) {
		// Disable button during the request so a double-click can't fire two ships.
		shipBtn.setAttribute('disabled', 'disabled');
		const thinking = addBot('Shipping the destructive change...');
		try {
			const body = {
				newSource: proposal.newSource,
				classification: proposal.classification,
				confirmation: confirmInput.value,
				reason: reasonInput.value,
			};
			if (cloudContext) {
				body.tenantSlug = cloudContext.tenantSlug;
				body.appSlug = cloudContext.appSlug;
			}
			const r = await api('ship', body);
			thinking.remove();
			if (r.status === 200 && r.ok) {
				if (r.body && r.body.versionId) _lastShippedVersionId = r.body.versionId;
				const auditId = r.body && r.body.audit && r.body.audit.auditId;
				const idMsg = auditId ? ' Audit ID ' + auditId + '.' : '';
				addBot('Shipped — destructive change applied.' + idMsg + ' Reloading...');
				setTimeout(() => window.location.reload(), 1200);
				return;
			}
			if (r.status === 400) {
				// Confirmation mismatch or missing reason. Re-enable so the
				// owner can fix the input. Surface the expected phrase if
				// the API returned it (cycle 4's response shape).
				const expected = r.body && r.body.expected;
				const hint = expected
					? 'The expected phrase is: ' + expected + '. Edit the input and try again.'
					: (r.body && r.body.error) || 'Confirmation rejected.';
				addBot([el('div', { class: 'clear-meph-err' }, [hint])]);
				confirmInput.classList.add('mismatch');
				// Don't auto-re-enable — the input listener will turn the
				// button on once the typed phrase matches again.
				return;
			}
			if (r.status === 503) {
				// Audit-first ordering: API refused before applyShip ran.
				// Tell Marcus this is transient — the destructive change
				// did NOT happen. He can retype and click again once the
				// audit store is back.
				addBot([
					el('div', { class: 'clear-meph-err' }, [
						'Cannot ship — audit log unreachable. The change was NOT applied. Try again in a moment, or page support.',
					]),
				]);
				shipBtn.removeAttribute('disabled');
				return;
			}
			if (r.status === 500) {
				// Ship failed AFTER pending audit row written. The row is
				// evidence of the attempt — surface the auditId so support
				// can reconcile state if needed.
				const auditId = r.body && r.body.auditId;
				const idMsg = auditId ? ' Audit ID ' + auditId + ' is on record.' : '';
				addBot([
					el('div', { class: 'clear-meph-err' }, [
						'Ship failed.' + idMsg + ' The attempt is logged. Retry once the cause is fixed.',
					]),
				]);
				shipBtn.removeAttribute('disabled');
				return;
			}
			// Catch-all for unknown statuses. Leave the button disabled —
			// owner has to tab away and back to retry, which is a tiny
			// friction stop that beats accidental retry on a confused state.
			const err = (r.body && r.body.error) || ('Unexpected status ' + r.status);
			addBot([el('div', { class: 'clear-meph-err' }, [err])]);
		} catch (err) {
			thinking.remove();
			addBot([el('div', { class: 'clear-meph-err' }, ['Ship error: ' + err.message])]);
			shipBtn.removeAttribute('disabled');
		}
	}

	function clearPending() {
		pendingProposal = null;
		addBot('Cancelled.');
	}

	// Fetch the current version history so cloud Undo knows which version
	// to target (the second-most-recent, i.e. the one before the last ship).
	async function fetchCloudVersionTarget() {
		if (!cloudContext) return null;
		try {
			const r = await fetch('/__meph__/api/deploy-history?appSlug=' + encodeURIComponent(cloudContext.appSlug), {
				headers: { Authorization: 'Bearer ' + getToken() },
			});
			if (!r.ok) return null;
			const body = await r.json();
			// versions[0] is the current live; versions[1] is the previous.
			if (body && Array.isArray(body.versions) && body.versions.length >= 2) {
				return body.versions[1].versionId;
			}
		} catch { /* fall through */ }
		return null;
	}

	async function undoLast() {
		addBot('Undoing the last change...');
		try {
			// LAE Phase B: cloud-deployed apps use the Cloudflare rollback
			// path (rollbackToVersion + recordVersion); local apps use the
			// snapshot-restore path (Phase A, unchanged).
			if (cloudContext) {
				const targetVersionId = await fetchCloudVersionTarget();
				if (!targetVersionId) {
					addBot([el('div', { class: 'clear-meph-err' }, ['No previous version to roll back to.'])]);
					return;
				}
				const r = await api('cloud-rollback', {
					tenantSlug: cloudContext.tenantSlug,
					appSlug: cloudContext.appSlug,
					targetVersionId,
				});
				if (!r.ok) {
					const msg = (r.body && r.body.code === 'VERSION_GONE')
						? 'That version has been removed from Cloudflare. History will refresh.'
						: (r.body && r.body.error) || 'Cloud rollback failed';
					addBot([el('div', { class: 'clear-meph-err' }, [msg])]);
					return;
				}
				addBot('Rolled back to the previous version. Reloading...');
				setTimeout(() => window.location.reload(), 1000);
				return;
			}
			const r = await api('rollback', { relative: -1 });
			if (!r.ok) {
				addBot([el('div', { class: 'clear-meph-err' }, [r.body.error || 'Undo failed'])]);
				return;
			}
			addBot(
				'Restored' +
					(r.body.label ? ' "' + r.body.label + '"' : '') +
					'. Reloading...',
			);
			setTimeout(() => window.location.reload(), 1000);
		} catch (err) {
			addBot([el('div', { class: 'clear-meph-err' }, ['Undo error: ' + err.message])]);
		}
	}

	// --------------------------------------------------------------------
	// Mount
	// --------------------------------------------------------------------

	function mount() {
		injectStyles();

		const panel = el('div', { class: 'clear-meph-panel' }, []);
		const head = el('div', { class: 'clear-meph-head' }, [
			el('div', { class: 'clear-meph-title' }, ['Meph · Edit this app']),
			el(
				'button',
				{
					class: 'clear-meph-undo',
					onclick: undoLast,
					title: 'Undo the last change. Source + data restored.',
				},
				['↶ Undo'],
			),
			el('div', { class: 'clear-meph-owner-chip' }, ['owner']),
		]);
		messagesEl = el('div', { class: 'clear-meph-messages' }, []);
		inputEl = el('input', {
			class: 'clear-meph-input',
			placeholder: 'Describe an additive change…',
			onkeydown: (e) => {
				if (e.key === 'Enter') sendPrompt();
			},
		});
		const foot = el('div', { class: 'clear-meph-foot' }, [
			inputEl,
			el('button', { class: 'clear-meph-send', onclick: sendPrompt, html: '→' }),
		]);
		panel.appendChild(head);
		panel.appendChild(messagesEl);
		panel.appendChild(foot);

		const badge = el(
			'button',
			{
				class: 'clear-meph-badge',
				onclick: () => panel.classList.toggle('open'),
			},
			['Edit this app'],
		);

		document.body.appendChild(panel);
		document.body.appendChild(badge);

		addBot('Hi — tell me what to add. I can add fields, endpoints, or pages. Phase A is additive-only.');
	}

	// --------------------------------------------------------------------
	// Live-reload state preservation (LAE-4)
	// --------------------------------------------------------------------
	// When the app restarts after a ship or rollback, connected clients
	// reload the page. Without preservation, every user's in-flight form
	// data would vanish. We fix that by:
	//
	//   1. Before unload, snapshotting every input/textarea/select value
	//      into sessionStorage, keyed by (path, field identifier).
	//   2. After reload, re-applying the snapshot onto matching elements
	//      and clearing it.
	//
	// This runs for EVERY session — owner and non-owner alike — because
	// Jenna needs her form back as badly as Marcus does.

	function formCacheKey() {
		return 'clear:form-cache:' + window.location.pathname;
	}

	function elemKey(el) {
		// Prefer explicit id or name; fall back to a DOM path so unnamed
		// inputs still round-trip. Path is enough because forms are stable
		// across the same-version reload.
		if (el.id) return 'id:' + el.id;
		if (el.name) return 'name:' + el.name;
		let path = el.tagName.toLowerCase();
		let node = el;
		while (node.parentElement && node !== document.body) {
			const parent = node.parentElement;
			const idx = Array.prototype.indexOf.call(parent.children, node);
			path = parent.tagName.toLowerCase() + '>' + idx + '>' + path;
			node = parent;
		}
		return 'path:' + path;
	}

	function snapshotFormState() {
		try {
			const snap = {};
			const nodes = document.querySelectorAll('input, textarea, select');
			for (const el of nodes) {
				if (el.type === 'password' || el.type === 'hidden') continue;
				if (el.type === 'checkbox' || el.type === 'radio') {
					snap[elemKey(el)] = { checked: el.checked, value: el.value };
				} else {
					if (el.value === '') continue;
					snap[elemKey(el)] = { value: el.value };
				}
			}
			if (Object.keys(snap).length > 0) {
				sessionStorage.setItem(formCacheKey(), JSON.stringify(snap));
			}
		} catch {}
	}

	function restoreFormState() {
		try {
			const raw = sessionStorage.getItem(formCacheKey());
			if (!raw) return;
			const snap = JSON.parse(raw);
			const nodes = document.querySelectorAll('input, textarea, select');
			for (const el of nodes) {
				if (el.type === 'password' || el.type === 'hidden') continue;
				const saved = snap[elemKey(el)];
				if (!saved) continue;
				if (el.type === 'checkbox' || el.type === 'radio') {
					el.checked = !!saved.checked;
					if (saved.value) el.value = saved.value;
				} else {
					el.value = saved.value;
				}
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}
			sessionStorage.removeItem(formCacheKey());
		} catch {}
	}

	// Listen for the unload that our own ship/rollback triggers. We
	// snapshot defensively on every unload so a user-initiated refresh
	// also benefits — losing a half-typed request across F5 was always
	// bad UX, not just when Marcus ships.
	window.addEventListener('beforeunload', snapshotFormState);

	function initStatePreservation() {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', restoreFormState);
		} else {
			restoreFormState();
		}
	}

	initStatePreservation();

	// --------------------------------------------------------------------
	// Bootstrap
	// --------------------------------------------------------------------

	function init() {
		if (!isOwner()) return;
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', mount);
		} else {
			mount();
		}
	}

	init();
})();
