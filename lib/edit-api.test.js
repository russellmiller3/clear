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
