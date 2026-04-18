import { describe, it, expect } from './testUtils.js';
import { requireOwner } from './live-edit-auth.js';

function mockRes() {
	const res = {
		_status: 200,
		_body: null,
		_ended: false,
		status(code) {
			this._status = code;
			return this;
		},
		json(body) {
			this._body = body;
			this._ended = true;
			return this;
		},
		send(body) {
			this._body = body;
			this._ended = true;
			return this;
		},
	};
	return res;
}

describe('live-edit-auth — requireOwner', () => {
	it('403s when req.user is null', () => {
		const req = { user: null };
		const res = mockRes();
		let nextCalled = false;
		requireOwner(req, res, () => (nextCalled = true));
		expect(res._status).toBe(403);
		expect(nextCalled).toBe(false);
	});

	it('403s when req.user has role "user"', () => {
		const req = { user: { id: 1, role: 'user' } };
		const res = mockRes();
		let nextCalled = false;
		requireOwner(req, res, () => (nextCalled = true));
		expect(res._status).toBe(403);
		expect(nextCalled).toBe(false);
	});

	it('403s when req.user has role "admin" (Phase A is owner-only)', () => {
		const req = { user: { id: 1, role: 'admin' } };
		const res = mockRes();
		let nextCalled = false;
		requireOwner(req, res, () => (nextCalled = true));
		expect(res._status).toBe(403);
		expect(nextCalled).toBe(false);
	});

	it('calls next() when req.user has role "owner"', () => {
		const req = { user: { id: 1, role: 'owner' } };
		const res = mockRes();
		let nextCalled = false;
		requireOwner(req, res, () => (nextCalled = true));
		expect(nextCalled).toBe(true);
		expect(res._ended).toBe(false);
	});

	it('response body names the required role for debugging', () => {
		const req = { user: { role: 'user' } };
		const res = mockRes();
		requireOwner(req, res, () => {});
		expect(res._body && typeof res._body === 'object').toBe(true);
		expect(res._body.error.toLowerCase().includes('owner')).toBe(true);
	});

	it('treats missing role like no role (403)', () => {
		const req = { user: { id: 1 } };
		const res = mockRes();
		let nextCalled = false;
		requireOwner(req, res, () => (nextCalled = true));
		expect(res._status).toBe(403);
		expect(nextCalled).toBe(false);
	});
});
