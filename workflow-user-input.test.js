// =============================================================================
// CLEAR LANGUAGE — WORKFLOW USER-INPUT TEST SUITE
// =============================================================================
//
// Extends the existing WORKFLOW primitive with one new step kind:
//
//   step 'Ask name' awaits user input as state's response_field
//
// Today's WORKFLOW supports agent-driven steps, conditionals, parallel-steps,
// repeat-until, save-progress-to-table. It does NOT support pausing for a
// user message mid-flow. This extension adds that one capability — a step
// that ends the workflow's current run, persists state, and resumes when
// the user posts the next message.
//
// Three things land in this phase:
//
//   1. Parser: recognize `awaits user input as <field>` (or `saves to state's <field>`)
//      as a step variant. step.kind === 'user_input'.
//   2. Validator: an `awaits user input` step must name a destination field —
//      `as state's <field>` or `saves to state's <field>` — and that field
//      must exist in `state has:`.
//   3. Compile (JS + Python): when a WORKFLOW contains any user_input step,
//      emit a session-scoped table (named `<workflow>_sessions`) + two
//      HTTP endpoints (POST /api/workflow/<name>/start, POST /api/workflow/<name>/respond)
//      + a switch over the current step. user_input steps END the current
//      response with the awaiting-step name; /respond resumes from there.
//
// This is the Phase 4 work from plan-lenat-in-clear-2026-05-13.md, but
// implemented as an EXTENSION to WORKFLOW rather than a parallel
// RUNTIME_DIALOG primitive (DRY check, 2026-05-14).
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

// =============================================================================
// CYCLE 4.1 — parser: `awaits user input as state's X` parses to user_input step
// =============================================================================
describe('workflow user-input step — parse baseline (Cycle 4.1)', () => {
  it('parses `step X awaits user input as state\'s field` to a user_input step', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    awaiting is text, default ''",
      "    last_response is text, default ''",
      "  step 'Ask question' awaits user input as state's last_response",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const workflow = result.ast.body.find(n => n.type === 'workflow');
    expect(workflow).toBeTruthy();
    expect(workflow.steps.length).toBe(1);
    const step = workflow.steps[0];
    expect(step.kind).toBe('user_input');
    expect(step.name).toBe('Ask question');
    expect(step.savesTo).toBe('last_response');
  });

  it('parses `step X awaits user input saves to state\'s field` (saves-to synonym)', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input saves to state's reply",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const workflow = result.ast.body.find(n => n.type === 'workflow');
    const step = workflow.steps[0];
    expect(step.kind).toBe('user_input');
    expect(step.savesTo).toBe('reply');
  });

  it('user_input steps can sit alongside agent-driven steps in the same workflow', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    user_answer is text, default ''",
      "    greeting is text, default ''",
      "  step 'Ask name' awaits user input as state's user_answer",
      "  step 'Build greeting' with 'Greeter Agent' saves to state's greeting",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const workflow = result.ast.body.find(n => n.type === 'workflow');
    expect(workflow.steps.length).toBe(2);
    expect(workflow.steps[0].kind).toBe('user_input');
    expect(workflow.steps[1].kind).toBe('step');
    expect(workflow.steps[1].agentName).toBe('Greeter Agent');
  });
});

// =============================================================================
// CYCLE 4.2 — validator: user_input step must name a destination field
// =============================================================================
describe('workflow user-input step — validator (Cycle 4.2)', () => {
  it('errors when `awaits user input` has no destination field', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors.length).toBeGreaterThan(0);
    const msg = result.errors[0].message;
    expect(msg).toContain('awaits user input');
    expect(msg).toContain("destination field");
  });

  it('errors when `awaits user input as state\'s <field>` references an undeclared state field', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's missing_field",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors.length).toBeGreaterThan(0);
    const msg = result.errors[0].message;
    expect(msg).toContain('missing_field');
  });

  it('does NOT error when destination field exists in state has:', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's reply",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
  });
});

// =============================================================================
// CYCLE 4.3 — JS emit: session table + start/respond endpoints + step switch
// =============================================================================
describe('workflow user-input step — JS emit (Cycle 4.3)', () => {
  it('emits a session-scoped table when workflow has a user_input step', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's reply",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.serverJS || '';
    // Session table holds workflow state across HTTP requests
    expect(js).toContain("'mainflow_sessions'");
  });

  it('emits POST /api/workflow/<name>/start and /respond endpoints', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's reply",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.serverJS || '';
    expect(js).toContain('/api/workflow/main-flow/start');
    expect(js).toContain('/api/workflow/main-flow/respond');
  });

  it('emits a step switch that pauses on user_input and resumes on /respond', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's reply",
    ].join('\n');
    const result = compileProgram(source);
    const js = result.serverJS || '';
    // The switch labels each step by name. On user_input, the response
    // names the awaiting step so /respond knows where to resume.
    expect(js).toContain('Ask name');
    expect(js).toContain('awaiting_step');
  });
});

// =============================================================================
// CYCLE 4.4 — Python parity emit
// =============================================================================
describe('workflow user-input step — Python emit (Cycle 4.4)', () => {
  it('emits parallel Python session table + endpoints', () => {
    const source = [
      "workflow 'main flow' with state:",
      "  state has:",
      "    reply is text, default ''",
      "  step 'Ask name' awaits user input as state's reply",
    ].join('\n');
    const result = compileProgram(source);
    const py = result.python || '';
    expect(py).toContain('mainflow_sessions');
    expect(py).toContain('/api/workflow/main-flow/start');
    expect(py).toContain('/api/workflow/main-flow/respond');
  });
});
