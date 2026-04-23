// lib/packaging-cloudflare-workflows.test.js
// Phase 6 TDD suite — compileWorkflow() gains a target === 'cloudflare'
// branch emitting a Cloudflare Workflow class (extends WorkflowEntrypoint
// with async run(event, step)) instead of Temporal SDK code. Same AST node,
// different output.
//
// Invariants we pin here:
//   - Node/js/python targets still emit the Temporal SDK path (zero regression)
//   - target=cloudflare emits a class extending WorkflowEntrypoint
//   - Each 'step' child becomes await step.do('label', async () => {...})
//   - 'save progress to' steps still emit D1 prepare/bind/run for CF target
//   - wrangler.toml grows [[workflows]] section for every workflow
//   - src/index.js invokes workflows via env.<NAME>_WORKFLOW.create(...)
//   - Emitted class parses clean under node --check (ESM, no require)

import { describe, it, expect, testAsync } from './testUtils.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.8 — target gate: CF target does NOT emit Temporal SDK
// This is the RED test that establishes the two-path invariant. Node
// target keeps the @temporalio/workflow import; CF target must not
// ship that string anywhere in its bundle.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6 cycle 6.8 — target gate separates Temporal SDK from CF Workflows', () => {
	const WF_SRC = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
    welcome_sent (boolean), default false

  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
`;

	it('Node target (js_backend) keeps emitting Temporal SDK imports', () => {
		const src = `build for javascript backend\n${WF_SRC}`;
		const result = compileProgram(src);
		expect(result.errors).toHaveLength(0);
		expect(result.javascript).toContain('@temporalio/workflow');
		expect(result.javascript).toContain('proxyActivities');
	});

	it('Cloudflare target does NOT emit @temporalio/workflow anywhere in the bundle', () => {
		const result = compileProgram(WF_SRC, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const bundle = result.workerBundle || {};
		const all = Object.values(bundle).join('\n');
		expect(all.includes('@temporalio/workflow')).toBe(false);
		expect(all.includes('proxyActivities')).toBe(false);
	});

	it('Cloudflare target does NOT emit Temporal SDK even with runs on temporal legacy syntax', () => {
		const src = `workflow 'Legacy' with state:
  runs on temporal
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
`;
		const result = compileProgram(src, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const bundle = result.workerBundle || {};
		const all = Object.values(bundle).join('\n');
		expect(all.includes('@temporalio/workflow')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.1 — CF target emits WorkflowEntrypoint class
// The canonical Cloudflare Workflow shape: a class that extends
// WorkflowEntrypoint with an async run(event, step) method. One file per
// workflow in src/workflows/<slug>.js so the bundle stays tidy.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6 cycle 6.1 — workflow emits Cloudflare Workflow class on CF target', () => {
	const ONBOARD = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
`;

	it('bundle gains src/workflows/onboarding.js', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		expect(result.workerBundle).toBeDefined();
		expect(typeof result.workerBundle['src/workflows/onboarding.js']).toBe('string');
	});

	it('workflow class extends WorkflowEntrypoint', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf).toContain('extends WorkflowEntrypoint');
		expect(wf).toContain('export class OnboardingWorkflow');
	});

	it('workflow class has async run(event, step) method', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf).toMatch(/async\s+run\s*\(\s*event\s*,\s*step\s*\)/);
	});

	it('imports WorkflowEntrypoint from cloudflare:workers', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf).toContain("import { WorkflowEntrypoint } from 'cloudflare:workers'");
	});

	it('workflow file parses clean under node --check', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		const tmp = mkdtempSync(join(tmpdir(), 'cf-wf-'));
		const file = join(tmp, 'onboarding.mjs');
		try {
			writeFileSync(file, wf);
			execSync(`node --check "${file}"`, { stdio: 'pipe' });
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('workflow file contains no require( — ESM only', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf.includes('require(')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.2 — each 'step' child becomes step.do()
// Durable steps are the core primitive. Every Clear step gets wrapped in
// step.do('label', async () => {...}) so Cloudflare persists the result
// across Worker restarts.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6 cycle 6.2 — step: emits step.do() wrappers', () => {
	const ONBOARD = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
  step 'Tutorial' with 'Tutorial Agent'
`;

	it('emits one step.do() call per step with the step label', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		// Labels may be single- or double-quoted — JSON.stringify yields double.
		expect(wf).toMatch(/step\.do\s*\(\s*["']Welcome["']/);
		expect(wf).toMatch(/step\.do\s*\(\s*["']Profile["']/);
		expect(wf).toMatch(/step\.do\s*\(\s*["']Tutorial["']/);
	});

	it('each step.do() body is an async arrow function', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf).toMatch(/step\.do\s*\(\s*["']Welcome["']\s*,\s*async\s*\(\s*\)\s*=>/);
	});

	it('each step.do() call is awaited', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		// Every step.do should be preceded by await
		const stepCalls = wf.match(/step\.do\s*\(/g) || [];
		const awaitedCalls = wf.match(/await\s+step\.do\s*\(/g) || [];
		expect(stepCalls.length).toBe(3);
		expect(awaitedCalls.length).toBe(3);
	});

	it('agent function invocations happen inside the step.do closure', () => {
		const result = compileProgram(ONBOARD, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		// Agent calls must be inside the step.do body
		expect(wf).toContain('agent_welcome_agent');
		expect(wf).toContain('agent_profile_agent');
		expect(wf).toContain('agent_tutorial_agent');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.7 — wrangler.toml [[workflows]] bindings
// Every workflow in the app needs a [[workflows]] section declaring the
// binding name, workflow name, and class name. Without this, CF rejects
// the deploy.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6 cycle 6.7 — wrangler.toml grows [[workflows]] sections', () => {
	const ONE_WF = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
`;

	const TWO_WF = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'

workflow 'Billing' with state:
  runs durably
  state has:
    customer_id, required
  step 'Charge' with 'Billing Agent'
`;

	it('emits [[workflows]] section for single workflow', () => {
		const result = compileProgram(ONE_WF, { target: 'cloudflare' });
		const wt = result.workerBundle['wrangler.toml'];
		expect(wt).toContain('[[workflows]]');
		expect(wt).toContain('binding = "ONBOARDING_WORKFLOW"');
		expect(wt).toContain('name = "onboarding"');
		expect(wt).toContain('class_name = "OnboardingWorkflow"');
	});

	it('emits separate [[workflows]] section per workflow', () => {
		const result = compileProgram(TWO_WF, { target: 'cloudflare' });
		const wt = result.workerBundle['wrangler.toml'];
		const occurrences = (wt.match(/\[\[workflows\]\]/g) || []).length;
		expect(occurrences).toBe(2);
		expect(wt).toContain('binding = "ONBOARDING_WORKFLOW"');
		expect(wt).toContain('binding = "BILLING_WORKFLOW"');
		expect(wt).toContain('class_name = "OnboardingWorkflow"');
		expect(wt).toContain('class_name = "BillingWorkflow"');
	});

	it('does NOT emit [[workflows]] for non-durable workflows', () => {
		// A workflow without `runs durably` shouldn't produce a CF workflow binding;
		// it still compiles as a plain async function.
		const src = `workflow 'Onboarding' with state:
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
`;
		const result = compileProgram(src, { target: 'cloudflare' });
		const wt = result.workerBundle['wrangler.toml'];
		expect(wt.includes('[[workflows]]')).toBe(false);
	});

	it('does NOT emit [[workflows]] for apps with no workflows at all', () => {
		const src = `build for javascript backend
when user requests data from /api/hello:
  send back 'hi'
`;
		const result = compileProgram(src, { target: 'cloudflare' });
		const wt = result.workerBundle['wrangler.toml'];
		expect(wt.includes('[[workflows]]')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.6 — `result = run workflow 'X' with data` invokes env.<NAME>.create()
// When a Clear endpoint fires a workflow, CF target compiles that to
// env.ONBOARDING_WORKFLOW.create({ params: data }) — using the binding the
// dispatch Worker injected. Node target stays as the direct function call.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6 cycle 6.6 — run workflow invocation on CF target uses env binding', () => {
	const APP = `build for javascript backend

workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'

when user sends signup to /api/start:
  result = run workflow 'Onboarding' with signup
  send back result
`;

	it('Node target keeps the direct workflow_onboarding() call', () => {
		const result = compileProgram(APP);
		expect(result.errors).toHaveLength(0);
		expect(result.javascript).toContain('await workflow_onboarding(');
	});

	it('CF target emits env.ONBOARDING_WORKFLOW.create(...) in src/index.js', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const idx = result.workerBundle['src/index.js'];
		expect(idx).toContain('env.ONBOARDING_WORKFLOW.create');
	});

	it('CF workflow create call passes params from the receiving var', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		const idx = result.workerBundle['src/index.js'];
		// Match env.ONBOARDING_WORKFLOW.create({ params: signup })
		expect(idx).toMatch(/env\.ONBOARDING_WORKFLOW\.create\s*\(\s*\{\s*params:\s*signup/);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.9 — End-to-end against a mock WorkflowEntrypoint
// Real Cloudflare Workflows can't run in Node. Instead we mock
// WorkflowEntrypoint + step.do() and drive the compiled class through a
// multi-step workflow, asserting the step sequence + side effects.
// ─────────────────────────────────────────────────────────────────────────

await testAsync('Phase 6 cycle 6.9 — workflow class runs end-to-end against mock step', async () => {
	const src = `workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'
  step 'Tutorial' with 'Tutorial Agent'
`;
	const result = compileProgram(src, { target: 'cloudflare' });
	expect(result.errors).toHaveLength(0);
	const wfSource = result.workerBundle['src/workflows/onboarding.js'];

	// Write to a temp file and import it dynamically. We install a mock
	// WorkflowEntrypoint on globalThis BEFORE import so the class resolves
	// against the mock — Cloudflare's real class isn't available under Node.
	const tmp = mkdtempSync(join(tmpdir(), 'cf-wf-e2e-'));
	const file = join(tmp, 'onboarding.mjs');
	// Strip the `cloudflare:workers` import — Node can't resolve that spec.
	// The mock is installed on globalThis so the class has everything it needs.
	const rewritten = wfSource.replace(/^import\s+\{\s*WorkflowEntrypoint[^}]*\}\s+from\s+['"]cloudflare:workers['"]\s*;?\s*\n?/m, '');
	writeFileSync(file, rewritten);

	// Mock WorkflowEntrypoint + Step. Install stubs for the agent functions
	// the compiled workflow calls — in a real deploy they live in src/index.js
	// but the workflow file references them by name, so we supply them from the
	// module's global scope.
	globalThis.WorkflowEntrypoint = class {
		constructor(ctx, env) { this.ctx = ctx; this.env = env; }
	};
	globalThis.agent_welcome_agent = async (state) => ({ ...state, welcome_sent: true });
	globalThis.agent_profile_agent = async (state) => ({ ...state, profile_created: true });
	globalThis.agent_tutorial_agent = async (state) => ({ ...state, tutorial_shown: true });

	try {
		const mod = await import(`file://${file.replace(/\\/g, '/')}`);
		const WorkflowClass = mod.OnboardingWorkflow;
		expect(typeof WorkflowClass).toBe('function');

		// Drive the workflow through a mock step. Record the step.do label
		// sequence so we can assert the workflow ran the Welcome → Profile
		// → Tutorial chain in order.
		const stepCalls = [];
		const mockStep = {
			async do(label, fn) {
				stepCalls.push(label);
				return await fn();
			},
			async sleep() {},
			async sleepUntil() {},
		};

		const instance = new WorkflowClass({}, {});
		const finalState = await instance.run({ payload: { user_id: 42 } }, mockStep);

		expect(stepCalls).toEqual(['Welcome', 'Profile', 'Tutorial']);
		expect(finalState.welcome_sent).toBe(true);
		expect(finalState.profile_created).toBe(true);
		expect(finalState.tutorial_shown).toBe(true);
		expect(finalState.user_id).toBe(42);
	} finally {
		delete globalThis.WorkflowEntrypoint;
		delete globalThis.agent_welcome_agent;
		delete globalThis.agent_profile_agent;
		delete globalThis.agent_tutorial_agent;
		rmSync(tmp, { recursive: true, force: true });
	}
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 6.10 — Phase 6 deploy blocker: workflow modules MUST be able to
// resolve agent_<name> via import, not via globalThis.
// The prior Phase 6 e2e test works because it leans on globalThis stubs,
// but a real Cloudflare deploy has no such fallback. Each workflow file
// runs as an isolated ESM module — agent functions must come from a
// shared `src/agents.js` module that every workflow imports.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 6.10 — shared src/agents.js module for cross-module agent calls', () => {
	const APP = `build for javascript backend

create a Signups table:
  user_id, required

workflow 'Onboarding' with state:
  runs durably
  state has:
    user_id, required
  step 'Welcome' with 'Welcome Agent'
  step 'Profile' with 'Profile Agent'

agent 'Welcome Agent' receives new_user:
  knows about: Signups
  response = ask claude 'Greet the new user warmly.' with new_user
  send back response

agent 'Profile Agent' receives new_user:
  knows about: Signups
  response = ask claude 'Fill in the user profile from their details.' with new_user
  send back response
`;

	it('CF target emits src/agents.js with agent function definitions', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		expect(result.errors).toHaveLength(0);
		const agents = result.workerBundle['src/agents.js'];
		expect(typeof agents).toBe('string');
		expect(agents).toContain('export async function agent_welcome_agent');
		expect(agents).toContain('export async function agent_profile_agent');
	});

	it('src/workflows/onboarding.js imports agent functions from ../agents.js', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		const wf = result.workerBundle['src/workflows/onboarding.js'];
		expect(wf).toMatch(/import\s*\{[^}]*agent_welcome_agent[^}]*\}\s+from\s+['"]\.\.\/agents\.js['"]/);
		expect(wf).toMatch(/import\s*\{[^}]*agent_profile_agent[^}]*\}\s+from\s+['"]\.\.\/agents\.js['"]/);
	});

	it('src/index.js imports agent functions from ./agents.js (no duplicate definitions)', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		const idx = result.workerBundle['src/index.js'];
		// The agent function definition has moved to src/agents.js — src/index.js
		// should import it, not redeclare it.
		const hasImport = /import\s*\{[^}]*agent_welcome_agent[^}]*\}\s+from\s+['"]\.\/agents\.js['"]/.test(idx);
		expect(hasImport).toBe(true);
		// And it should NOT still define the function inline.
		const duplicateDef = /function\s+agent_welcome_agent\b/.test(idx)
			&& !/import\s*\{[^}]*agent_welcome_agent/.test(idx.split('\n').slice(0, 40).join('\n'));
		expect(duplicateDef).toBe(false);
	});

	it('src/agents.js parses clean under node --check', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		const agents = result.workerBundle['src/agents.js'];
		const tmp = mkdtempSync(join(tmpdir(), 'cf-agents-'));
		const file = join(tmp, 'agents.mjs');
		try {
			writeFileSync(file, agents);
			execSync(`node --check "${file}"`, { stdio: 'pipe' });
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('src/agents.js has zero Node-isms (no require, no fs., no child_process)', () => {
		const result = compileProgram(APP, { target: 'cloudflare' });
		const agents = result.workerBundle['src/agents.js'];
		expect(agents.includes('require(')).toBe(false);
		expect(/\bfs\./.test(agents)).toBe(false);
		expect(agents.includes('child_process')).toBe(false);
	});

	it('no src/agents.js when app has no agents at all', () => {
		const src = `build for javascript backend
when user requests data from /api/hello:
  send back 'hi'
`;
		const result = compileProgram(src, { target: 'cloudflare' });
		expect(result.workerBundle['src/agents.js']).toBeUndefined();
	});
});
