// The compiler must make Live App Editing work in any compiled Clear app,
// not just in Studio. That means:
//
//   1. HTML emits `<script src="/__meph__/widget.js" defer>` whenever the
//      app has auth scaffolding (login means "there's an owner to gate to")
//   2. The generated server.js exposes GET /__meph__/widget.js, serving
//      the widget bundle from clear-runtime/meph-widget.js
//   3. The generated server.js proxies POST /__meph__/api/* to
//      process.env.STUDIO_PORT so the widget can talk to Meph via the
//      same origin as the app (no CORS, no hardcoded ports)
//   4. Non-auth apps get none of the above — no silent bloat

import { describe, it, expect } from './testUtils.js';
import { compileProgram } from '../index.js';

const AUTH_APP = `build for web and javascript backend
database is local memory

create a Users table:
  email, required, unique
  name

allow signup and login

when user requests data from /api/me:
  requires login
  send back current user

page 'Home' at '/':
  show 'hi'
`;

const NOAUTH_APP = `build for web and javascript backend
database is local memory

create a Posts table:
  title

when user requests data from /api/posts:
  all = get all Posts
  send back all

page 'Home' at '/':
  show 'hi'
`;

describe('widget injection — HTML emits widget script tag when auth scaffold present', () => {
	it('auth-enabled app HTML contains <script src="/__meph__/widget.js">', () => {
		const r = compileProgram(AUTH_APP);
		expect(r.errors).toEqual([]);
		expect(r.html.includes('/__meph__/widget.js')).toBe(true);
	});

	it('non-auth app HTML does NOT contain the widget script', () => {
		const r = compileProgram(NOAUTH_APP);
		expect(r.errors).toEqual([]);
		expect(r.html.includes('/__meph__/widget.js')).toBe(false);
	});

	it('widget script tag uses defer so it never blocks first paint', () => {
		const r = compileProgram(AUTH_APP);
		expect(/<script[^>]+src=["']\/__meph__\/widget\.js["'][^>]+defer/.test(r.html)).toBe(true);
	});
});

describe('widget injection — server.js exposes /__meph__/widget.js route', () => {
	it('auth-enabled app serverJS has a route that serves the widget', () => {
		const r = compileProgram(AUTH_APP);
		expect(r.errors).toEqual([]);
		expect(r.serverJS.includes('/__meph__/widget.js')).toBe(true);
	});

	it('non-auth app has no such route', () => {
		const r = compileProgram(NOAUTH_APP);
		expect(r.serverJS.includes('/__meph__')).toBe(false);
	});
});

describe('widget injection — server.js proxies /__meph__/api/* to Studio', () => {
	it('auth-enabled app serverJS has a proxy handler keyed on STUDIO_PORT', () => {
		const r = compileProgram(AUTH_APP);
		expect(r.serverJS.includes('/__meph__/api/')).toBe(true);
		expect(r.serverJS.includes('STUDIO_PORT')).toBe(true);
	});

	it('the proxy 503s cleanly when STUDIO_PORT is not set', () => {
		const r = compileProgram(AUTH_APP);
		// We expect some guard against missing STUDIO_PORT that returns a
		// helpful 503 rather than hanging or crashing.
		expect(/503/.test(r.serverJS)).toBe(true);
	});
});
