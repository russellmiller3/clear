import { describe, it, expect, run } from '../../lib/testUtils.js';
import { compileProgram } from '../../index.js';
import { auditRequirements } from './requirements-audit.js';

describe('requirements audit', () => {
  it('passes data-shape and approval-routing evidence', () => {
    const source = `
requirements:
  each deal stores customer, amount, status, and approver
  deals at least 50000 route to VP approval

build for javascript backend
create a Deals table:
  customer, required
  amount, number, required
  status, required
  approver, required

when user sends deal to /api/deals:
  if deal's amount is at least 50000:
    set deal's approver to 'VP'
  otherwise:
    set deal's approver to 'Manager'
  saved = save deal as new Deal
  send back saved

test:
  deals at least 50000 route to VP approval
`;
    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: compiled.requirements,
    });

    expect(audit.ok).toBe(true);
    expect(audit.items.every(item => item.status === 'passed')).toBe(true);
  });

  it('marks optimistic lock as unverified when approval action lacks stale-update evidence', () => {
    const source = `
requirements:
  approval actions use optimistic lock protection

build for javascript backend
when user sends decision to /api/approve:
  set decision's status to 'approved'
  send back decision
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'approval actions use optimistic lock protection' }],
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).toBe('unverified');
    expect(audit.items[0].reason).toContain('optimistic');
  });

  it('does not treat the requirements block itself as implementation evidence', () => {
    const source = `
requirements:
  deals at least 50000 route to VP approval

build for javascript backend
when user requests data from /api/health:
  send back 'ok'
`;

    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: compiled.requirements,
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).not.toBe('passed');
  });

  it('does not treat approved/rejected status values as approve/reject row actions', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  status, required

when user sends deal to /api/deals:
  set deal's status to 'approved'
  saved = save deal as new Deal
  send back saved

when user sends update to /api/deals/status:
  set update's status to 'rejected'
  send back update
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'managers can approve or reject pending deals' }],
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).toBe('missing');
    expect(audit.items[0].reason).toContain('approve and reject');
  });

  it('verifies must-store data-shape requirements without falling through to row actions', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  amount, number, required
  close_date, required
  status, required

when user sends decision to /api/deals/decision:
  set decision's status to 'approved'
  send back decision
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'deals must store: name, amount, close_date, and status' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('Deals stores name, amount, close_date, and status');
  });

  it('treats parenthesized status examples as examples, not required table fields', () => {
    const source = `
build for javascript backend
create a Deals table:
  title, required
  amount (number), required
  status, default 'pending'
  creator_id, required
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'deals must store title, amount, status (pending, approved, rejected), and the creator_id' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
  });

  it('verifies k-suffix approval routing like deals over $50k route to VP', () => {
    const source = `
build for javascript backend
when user sends deal to /api/deals:
  if deal's amount is greater than 50000:
    set deal's approver to 'VP'
  otherwise:
    set deal's approver to 'Sales Manager'
  saved = save deal as new Deal
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'auto-route deals for approval: deals > $50k route to a VP, others route to a Sales Manager' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('50000');
  });

  it('verifies email notification requirements from concrete send-email evidence', () => {
    const source = `
build for javascript backend
when user sends decision to /api/deals/decision:
  set decision's status to 'approved'
  send email to decision's rep_email with subject 'Deal approved'
  send back decision
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "notify the rep via email when a deal status changes to 'approved' or 'rejected'" }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('email');
  });

  it('verifies dashboard queue/list requirements from page and display evidence', () => {
    const source = `
build for web
page 'Manager Dashboard':
  heading 'Deals Queue'
  display pending_deals as table

page 'Rep Dashboard':
  heading 'My Deals'
  display my_deals as table
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "show a dashboard with a 'Deals Queue' for managers and a 'My Deals' list for reps" }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('dashboard');
  });

  it('verifies sales-rep deal creation requirements from table and create endpoint evidence', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  amount (number), required
  status, default 'draft'
  owner_email, required

when user sends deal to /api/deals:
  requires login
  deal's owner_email is caller's email
  deal's status is 'pending'
  saved = save deal as new Deal
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'sales reps can create deals with an amount, name, and status (draft/pending)' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('create');
  });

  it('verifies VP approval requirements from threshold flag evidence', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  amount (number), required
  is_vp_approval, boolean, default false

when user sends deal to /api/deals:
  if deal's amount is greater than 50000:
    deal's is_vp_approval is true
  saved = save deal as new Deal
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'deals over 50000 require vice president (VP) approval' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('50000');
  });

  it('marks manager-threshold approval missing when source only sets pending status', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  amount (number), required
  stage, default 'Draft'

rule high-value-approval:
  enforce that every deal with amount greater than 50000 has stage 'Pending', or fail with error message: 'High value deals require manager approval'

when user sends deal to /api/deals:
  if deal's amount is greater than 50000:
    set deal's stage is 'Pending'
  saved = save deal as new Deal
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "deals over 50000 are automatically routed to 'Pending' and require manager approval" }],
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).toBe('missing');
    expect(audit.items[0].reason).toContain('manager');
  });

  it('verifies manager-threshold approval when source assigns an approver role', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  amount (number), required
  stage, default 'Draft'
  approver_role, required

when user sends deal to /api/deals:
  if deal's amount is greater than 50000:
    set deal's stage is 'Pending'
    set deal's approver_role to 'Manager'
  saved = save deal as new Deal
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "deals over 50000 are automatically routed to 'Pending' and require manager approval" }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
  });

  it('does not treat email notifications as audit-trail storage', () => {
    const source = `
build for javascript backend
create a Deals table:
  name, required
  status, default 'pending'
  finance_email, required

email finance when deal's status changes to 'approved':
  subject is 'Approved'
  body is 'Approved deal'
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "an audit trail must store every status change with the actor's email and timestamp" }],
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).toBe('missing');
    expect(audit.items[0].reason).toContain('audit');
  });

  it('verifies audit-trail storage with actor email and timestamp evidence', () => {
    const source = `
build for javascript backend
create an AuditLogs table:
  deal_id, required
  actor_email, required
  old_status, required
  new_status, required
  changed_at, required

when user sends decision to /api/deals/:id/approve:
  create audit:
    actor_email is caller's email
    new_status is 'approved'
    changed_at is now
  save audit as new AuditLog
  send back decision
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "an audit trail must store every status change with the actor's email and timestamp" }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('audit');
  });

  it('uses typed facts to verify booking overlap rejection without exact requirement wording', () => {
    const source = `
build for javascript backend
create a Bookings table:
  room_id, required
  start_time, required
  end_time, required
  status, default 'active'

when user sends reservation to /api/bookings:
  existing_booking = look up Booking where room_id is reservation's room_id
  if existing_booking's start_time is before reservation's end_time and existing_booking's end_time is after reservation's start_time:
    fail with error message 'Room is unavailable'
  saved = save reservation as new Booking
  send back saved
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'calling POST /api/bookings with an overlapping room reservation returns a 400 error' }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('domain rule');
  });

  // STORAGE PATTERN GAPS — red-first TDD (2026-05-11)
  // Proven miss: "booking data must be stored with room_id, start_time, end_time" → unverified
  it('verifies "X data must be stored with fields" storage requirement pattern', () => {
    const source = `
build for javascript backend
create a Bookings table:
  room_id, required
  start_time, required
  end_time, required
`;
    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'booking data must be stored with room_id, start_time, and end_time' }],
    });
    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('room_id');
  });

  it('verifies "X records must store fields" storage requirement and does not misroute to notification', () => {
    const source = `
build for javascript backend
create a Customers table:
  name, required
  email, required
  company, required
`;
    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'customer records must store name, email, and company' }],
    });
    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).not.toContain('notification');
  });

  it('verifies named agent requirements from agent declaration evidence', () => {
    const source = `
build for javascript backend
agent 'Deal Drafter' receives notes:
  description = ask claude 'Write a deal description' with notes
  send back description

when user sends draft_req to /api/draft:
  description = ask agent 'Deal Drafter' with draft_req's notes
  send back { description: description }
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: "an automated agent 'Deal Drafter' can help reps generate deal descriptions from raw notes" }],
    });

    expect(audit.ok).toBe(true);
    expect(audit.items[0].status).toBe('passed');
    expect(audit.items[0].reason).toContain('agent');
  });
});

run();
