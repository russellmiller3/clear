import { describe, it, expect, run } from '../../lib/testUtils.js';
import {
  shouldRequireApproval,
  extractRequirementsDraft,
  validateRequirements,
  requirementsId,
  buildRequirementsInstruction,
  requirementsReviewEventFromAssistantText,
} from './requirements-contract.js';

describe('requirements contract', () => {
  it('requires approval for vague app-build requests', () => {
    expect(shouldRequireApproval('build me a deal approval app')).toBe(true);
    expect(shouldRequireApproval('Build a complete Clear app for a deal approval queue. Use approved requirements and retrieved patterns before choosing syntax.')).toBe(true);
    expect(shouldRequireApproval('what syntax routes approval by amount?')).toBe(false);
  });

  it('extracts a requirements block from Meph text', () => {
    const items = extractRequirementsDraft(`requirements:
  logged-in sellers can submit deals
  deals at least 50000 route to VP approval`);

    expect(items).toEqual([
      'logged-in sellers can submit deals',
      'deals at least 50000 route to VP approval',
    ]);
  });

  it('rejects vague requirements', () => {
    const result = validateRequirements([
      'the app is robust',
      'approval queue works',
    ], 'build me a deal approval app');

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('not observable'))).toBe(true);
  });

  it('rejects compound or non-e2e requirements for complex app builds', () => {
    const result = validateRequirements([
      'sales reps can create deals with an amount and stage; managers can review, approve, or reject deals above a $10,000 threshold',
      'deals must store title, amount, status (pending, approved, rejected), and the creator_id',
      "deals over $10,000 are automatically routed to a 'Manager' role for approval",
    ], 'build me a deal approval app');

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('one observable claim'))).toBe(true);
    expect(result.errors.some(e => e.includes('read/list/detail'))).toBe(true);
    expect(result.errors.some(e => e.includes('UI evidence'))).toBe(true);
  });

  it('accepts e2e CRUD-lifecycle requirements for complex app builds', () => {
    const result = validateRequirements([
      'sales reps can create a deal with title, amount, stage, and notes from a form',
      'deals must store title, amount, stage, status, creator_id, approver_role, and notes',
      'reps can see a list of their submitted deals with current status',
      'managers can see a pending approval queue assigned to the Manager role',
      'deals over 10000 route to Manager approval before they can be approved',
      'managers can approve or reject a pending deal and update its status',
      'sales reps are notified when a deal is approved or rejected',
      'all create, approve, reject, list, and detail actions are reachable from visible pages',
    ], 'build me a deal approval app');

    expect(result.ok).toBe(true);
  });

  it('accepts broad dashboard requirements without approval-specific routing', () => {
    const result = validateRequirements([
      'logged in users can create companies, contacts, and deals via Add forms on the dashboard',
      'companies store name, industry, and website',
      'contacts store name, email, and relationship to a company',
      'deals store title, value, stage, and relationship to a company',
      'logged in users can read and list all companies, contacts, and deals',
      'logged in users can update a deal stage or delete a deal from the pipeline',
      'the dashboard aggregate pipeline value must sum all deal values and group stage counts',
      'a dashboard page shows a searchable deals table, a pipeline stage chart, and a company detail panel',
      'the company detail panel displays contacts and deals associated with the selected company record',
    ], 'Build a complete Clear app for a revenue operations dashboard with companies, contacts, and deals.');

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts support-staff role wording when the app actually has roles', () => {
    const result = validateRequirements([
      'authenticated users can create conversations and post messages from the Chat page',
      'conversations must store room name, status, handoff flag, and creator_id',
      'messages must store content, sender_name, and conversation_id',
      'support staff can read and list all conversations and their message history',
      'current conversation creator can read their own message history',
      'support staff can update conversation status to closed or toggle the agent handoff flag',
      'real-time updates must broadcast new messages to all subscribers of a conversation room',
      'the App page shows a sidebar with conversation lists and a detail view for the active chat',
    ], 'Build a complete Clear app for a logged-in support chat room with support staff.');

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts booking workflow requirements where double-booking is the domain rule', () => {
    const result = validateRequirements([
      'logged in users can create a booking for a specific room and time range from the Room Detail page',
      'the app must store Rooms with name and capacity, Customers with name and email, and Bookings with start_time, end_time, room_id, and user_id',
      'any logged in user can list all rooms, search available rooms by date, and view their own upcoming bookings',
      'any logged in user can cancel their own pending bookings via a button action on the My Bookings table',
      'the app must prevent double bookings by enforcing a rule that blocks saves if any existing booking for that room overlaps the requested time range',
      'a dashboard page shows room utilization as a chart and a table of upcoming reservations proves the workflow is reachable',
    ], 'Build a complete Clear app for a room booking workflow that prevents double booking.');

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('creates stable ids for normalized text', () => {
    const a = requirementsId([' Deal approvals route to VP  ']);
    const b = requirementsId(['deal approvals route to vp']);

    expect(a).toBe(b);
  });

  it('builds a requirements-only instruction for complex app requests', () => {
    const text = buildRequirementsInstruction('build me a deal approval app');

    expect(text).toContain('Do not write Clear source yet');
    expect(text).toContain('requirements:');
    expect(text).toContain('core lifecycle');
    expect(text).toContain('UI');
  });

  it('turns assistant requirements into a review event', () => {
    const event = requirementsReviewEventFromAssistantText(`requirements:
  logged-in sellers can submit deals
  each deal stores customer, amount, status, and approver
  deals under 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers can approve or reject pending deals`);

    expect(event.type).toBe('requirements_review');
    expect(event.needsApproval).toBe(true);
    expect(event.requirements).toHaveLength(5);
  });
});

run();
