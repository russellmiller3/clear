import { describe, it, expect } from './testUtils.js';
import { createEditApi } from './edit-api.js';

function mockExpressApp() {
	const routes = {};
	return {
		post(path, ...handlers) {
			routes['POST ' + path] = handlers;
		},
		get(path, ...handlers) {
			routes['GET ' + path] = handlers;
		},
		_routes: routes,
	};
}

function mockRes() {
	return {
		_status: 200,
		_body: null,
		status(c) {
			this._status = c;
			return this;
		},
		json(b) {
			this._body = b;
			return this;
		},
		type() {
			return this;
		},
		send(b) {
			this._body = b;
			return this;
		},
	};
}

async function runMiddlewareChain(handlers, req, res) {
	let idx = 0;
	const next = async (err) => {
		if (err) return;
		if (idx >= handlers.length) return;
		const h = handlers[idx++];
		await h(req, res, next);
	};
	await next();
}

describe('edit-api — route registration', () => {
	it('registers POST /__meph__/api/propose', () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({ tool: null }),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		expect(Object.keys(app._routes).includes('POST /__meph__/api/propose')).toBe(true);
	});

	it('registers POST /__meph__/api/ship', () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		expect(Object.keys(app._routes).includes('POST /__meph__/api/ship')).toBe(true);
	});

	it('registers GET /__meph__/widget.js', () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			widgetScript: 'console.log(1)',
		});
		expect(Object.keys(app._routes).includes('GET /__meph__/widget.js')).toBe(true);
	});
});

describe('edit-api — auth gating', () => {
	it('propose 403s when caller is not owner', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({ tool: null }),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/propose'];
		const req = { user: { role: 'user' }, body: { prompt: 'hi' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(403);
	});

	it('ship 403s when caller is not owner', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/ship'];
		const req = { user: null, body: { newSource: 'x' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(403);
	});
});

describe('edit-api — propose flow', () => {
	it('returns {newSource, diff, classification} when Meph picks a valid tool', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => `create a Users table:
  name
`,
			callMeph: async () => ({
				tool: 'propose_add_field',
				args: { table: 'Users', fieldLine: 'email' },
			}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/propose'];
		const req = { user: { role: 'owner' }, body: { prompt: 'add email field' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(200);
		expect(res._body.classification.type).toBe('additive');
		expect(res._body.newSource.includes('email')).toBe(true);
		expect(typeof res._body.diff).toBe('string');
	});

	it('returns 400 when Meph returns no tool call', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({ tool: null, text: 'I refuse' }),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/propose'];
		const req = { user: { role: 'owner' }, body: { prompt: 'something' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(400);
	});

	it('returns 400 when the tool rejects the proposal (destructive, duplicate, etc.)', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => `create a Users table:
  name
`,
			callMeph: async () => ({
				tool: 'propose_add_field',
				args: { table: 'Users', fieldLine: 'name' }, // duplicate!
			}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/propose'];
		const req = { user: { role: 'owner' }, body: { prompt: 'x' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(400);
		expect(res._body.error.toLowerCase().includes('already exists')).toBe(true);
	});
});

describe('edit-api — ship flow', () => {
	it('passes newSource through to applyShip and returns the result', async () => {
		let shipCalled = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async (source) => {
				shipCalled = source;
				return { ok: true, elapsed_ms: 250 };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/ship'];
		const req = { user: { role: 'owner' }, body: { newSource: 'new code' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(200);
		expect(shipCalled).toBe('new code');
		expect(res._body.elapsed_ms).toBe(250);
	});

	it('returns 500 with the error when applyShip fails', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: false, error: 'compile failed: oops' }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/ship'];
		const req = { user: { role: 'owner' }, body: { newSource: 'broken' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(500);
		expect(res._body.error.includes('compile failed')).toBe(true);
	});

	// LAE Phase B cycle 3.4 — widget forwards (tenantSlug, appSlug) so the
	// applyShip closure can detect cloud-deployed apps and route the Ship to
	// the incremental-update path instead of local respawn.
	it('forwards tenantSlug + appSlug from POST body into applyShip as cloudContext', async () => {
		let shipArgs = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async (source, cloudContext) => {
				shipArgs = { source, cloudContext };
				return { ok: true, mode: 'update', versionId: 'v1', url: 'https://x.buildclear.dev', elapsed_ms: 800 };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/ship'];
		const req = {
			user: { role: 'owner' },
			body: { newSource: 'src', tenantSlug: 'clear-acme', appSlug: 'items' },
		};
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(shipArgs.source).toBe('src');
		expect(shipArgs.cloudContext.tenantSlug).toBe('clear-acme');
		expect(shipArgs.cloudContext.appSlug).toBe('items');
		expect(res._body.mode).toBe('update');
		expect(res._body.versionId).toBe('v1');
		expect(res._body.url).toBe('https://x.buildclear.dev');
	});

	it('passes cloudContext with null fields when POST body omits tenantSlug + appSlug', async () => {
		let shipArgs = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async (source, cloudContext) => {
				shipArgs = { source, cloudContext };
				return { ok: true, elapsed_ms: 100 };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/ship'];
		const req = { user: { role: 'owner' }, body: { newSource: 'src' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		// applyShip is still called with a cloudContext object; fields are null
		// so the closure knows "no cloud info, stay local".
		expect(shipArgs.cloudContext).toBeDefined();
		expect(shipArgs.cloudContext.tenantSlug).toBe(null);
		expect(shipArgs.cloudContext.appSlug).toBe(null);
	});
});

// LAE Phase B Phase 4 — cloud rollback endpoint. Owner clicks Undo on a
// CF-deployed app; widget sends {tenantSlug, appSlug, targetVersionId};
// backend calls rollbackToVersion on Cloudflare and records a new
// widget-undo version row. Local-app Undo still uses /__meph__/api/rollback
// (snapshot-based) \u2014 this is a SEPARATE endpoint for cloud-only.
describe('edit-api \u2014 cloud rollback flow (LAE Phase B Phase 4)', () => {
	it('registers POST /__meph__/api/cloud-rollback', () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyCloudRollback: async () => ({ ok: true }),
			widgetScript: '',
		});
		expect(Object.keys(app._routes).includes('POST /__meph__/api/cloud-rollback')).toBe(true);
	});

	it('cloud-rollback 403s non-owner callers', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyCloudRollback: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/cloud-rollback'];
		const req = { user: null, body: { tenantSlug: 't', appSlug: 'a', targetVersionId: 'v' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(403);
	});

	it('400s when required fields are missing', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyCloudRollback: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/cloud-rollback'];
		const req = { user: { role: 'owner' }, body: { tenantSlug: 't' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(400);
	});

	it('forwards {tenantSlug, appSlug, targetVersionId} to applyCloudRollback', async () => {
		let rollbackArgs = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyCloudRollback: async (args) => {
				rollbackArgs = args;
				return { ok: true, newVersionId: 'v-rolled-back' };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/cloud-rollback'];
		const req = {
			user: { role: 'owner' },
			body: { tenantSlug: 'clear-acme', appSlug: 'items', targetVersionId: 'v-old' },
		};
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(rollbackArgs.tenantSlug).toBe('clear-acme');
		expect(rollbackArgs.appSlug).toBe('items');
		expect(rollbackArgs.targetVersionId).toBe('v-old');
		expect(res._status).toBe(200);
		expect(res._body.newVersionId).toBe('v-rolled-back');
	});

	it('501s when applyCloudRollback dep is not wired', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			// no applyCloudRollback
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/cloud-rollback'];
		const req = {
			user: { role: 'owner' },
			body: { tenantSlug: 't', appSlug: 'a', targetVersionId: 'v' },
		};
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(501);
		expect(res._body.error.toLowerCase()).toMatch(/not wired|not available/);
	});

	it('surfaces VERSION_GONE error code so widget can refresh history', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyCloudRollback: async () => ({ ok: false, code: 'VERSION_GONE', error: 'version deleted from CF' }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/cloud-rollback'];
		const req = {
			user: { role: 'owner' },
			body: { tenantSlug: 't', appSlug: 'a', targetVersionId: 'v-gone' },
		};
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(400);
		expect(res._body.code).toBe('VERSION_GONE');
	});
});

describe('edit-api — rollback flow', () => {
	it('rollback 403s non-owner callers', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyRollback: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/rollback'];
		const req = { user: null, body: {} };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(403);
	});

	it('passes a snapshotId through to applyRollback', async () => {
		let called = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyRollback: async (ref) => {
				called = ref;
				return { ok: true, restoredId: ref };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/rollback'];
		const req = { user: { role: 'owner' }, body: { snapshotId: 'abc123' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(called).toBe('abc123');
		expect(res._status).toBe(200);
	});

	it('defaults to {relative: -1} when neither snapshotId nor relative is provided', async () => {
		let called = null;
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			applyRollback: async (ref) => {
				called = ref;
				return { ok: true };
			},
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/rollback'];
		const req = { user: { role: 'owner' }, body: {} };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(called && called.relative).toBe(-1);
	});

	it('returns 501 when applyRollback dep is missing', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '',
		});
		const handlers = app._routes['POST /__meph__/api/rollback'];
		const req = { user: { role: 'owner' }, body: {} };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(501);
	});
});

describe('edit-api — snapshot list', () => {
	it('GET /__meph__/api/snapshots owner-gated', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			listSnapshots: async () => [{ id: 'x', ts: 1, label: 'l' }],
			widgetScript: '',
		});
		const handlers = app._routes['GET /__meph__/api/snapshots'];
		const req = { user: null };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._status).toBe(403);
	});

	it('returns the list from deps.listSnapshots', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			listSnapshots: async () => [{ id: 'a', ts: 1, label: 'first' }],
			widgetScript: '',
		});
		const handlers = app._routes['GET /__meph__/api/snapshots'];
		const req = { user: { role: 'owner' } };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(Array.isArray(res._body)).toBe(true);
		expect(res._body[0].id).toBe('a');
	});
});

describe('edit-api — widget.js serving', () => {
	it('GET /__meph__/widget.js sends the widget source', async () => {
		const app = mockExpressApp();
		createEditApi(app, {
			readSource: () => '',
			callMeph: async () => ({}),
			applyShip: async () => ({ ok: true }),
			widgetScript: '/* widget body */',
		});
		const handlers = app._routes['GET /__meph__/widget.js'];
		const req = { user: null };
		const res = mockRes();
		await runMiddlewareChain(handlers, req, res);
		expect(res._body).toBe('/* widget body */');
	});
});
