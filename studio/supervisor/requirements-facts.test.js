import { describe, it, expect, run } from '../../lib/testUtils.js';
import {
  compareRequirementFacts,
  extractAppFacts,
  normalizeRequirementFacts,
} from './requirements-facts.js';

describe('requirements facts', () => {
  it('normalizes different overlap phrases into the same domain-rule fact', () => {
    const [doubleBooking] = normalizeRequirementFacts([
      { id: 'req_1', text: 'the app must prevent double bookings for the same room and time range' },
    ]);
    const [overlapPost] = normalizeRequirementFacts([
      { id: 'req_2', text: 'calling POST /api/bookings with an overlapping room reservation returns a 400 error' },
    ]);
    const [conflictBlock] = normalizeRequirementFacts([
      { id: 'req_3', text: 'the booking workflow blocks same-room time conflicts before saving' },
    ]);

    for (const fact of [doubleBooking, overlapPost, conflictBlock]) {
      expect(fact.kind).toEqual('domain_rule');
      expect(fact.object).toEqual('booking');
      expect(fact.condition).toEqual('overlap');
      expect(fact.expected).toEqual('reject');
    }
  });

  it('extracts app facts that satisfy a domain rule without matching exact words', () => {
    const requirementFacts = normalizeRequirementFacts([
      { id: 'req_1', text: 'the app must prevent double bookings for the same room and time range' },
    ]);
    const appFacts = extractAppFacts({
      source: `
build for javascript backend
create a Bookings table:
  room_id, required
  start_time, required
  end_time, required

when user sends reservation to /api/bookings:
  existing_booking = look up Booking where room_id is reservation's room_id
  if existing_booking's start_time is before reservation's end_time and existing_booking's end_time is after reservation's start_time:
    fail with error message 'Room is unavailable'
  saved = save reservation as new Booking
  send back saved
`,
    });
    const [comparison] = compareRequirementFacts(requirementFacts, appFacts);

    expect(comparison.status).toEqual('passed');
    expect(comparison.requirement.kind).toEqual('domain_rule');
    expect(comparison.evidence.some(item => item.text.includes('fail with error message'))).toEqual(true);
  });

  it('extracts UI evidence facts separately from source facts', () => {
    const appFacts = extractAppFacts({
      source: `
build for web
page 'Bookings' at '/bookings':
  button 'Cancel':
    update selected_booking at /api/bookings/:id/cancel
  accordion 'Filters':
    display booking_filters
`,
      runtimeEvidence: {
        tools: ['run_app', 'click_element', 'read_dom', 'screenshot_output'],
      },
    });

    expect(appFacts.some(fact => fact.kind === 'ui_reachability' && fact.action === 'button')).toEqual(true);
    expect(appFacts.some(fact => fact.kind === 'ui_reachability' && fact.action === 'accordion')).toEqual(true);
    expect(appFacts.some(fact => fact.kind === 'browser_evidence' && fact.action === 'screenshot')).toEqual(true);
  });

  // READ VOCABULARY — red-first TDD (2026-05-11)
  // Proven miss: "reps can view deals" returns 0 facts from normalizeRequirementFacts
  it('normalizes view/list/see phrases into read facts', () => {
    const phrases = [
      { id: 'r1', text: 'sales reps can view all deals' },
      { id: 'r2', text: 'managers can list pending requests' },
      { id: 'r3', text: 'admins can see every submitted expense' },
    ];
    for (const phrase of phrases) {
      const facts = normalizeRequirementFacts([phrase]);
      const readFact = facts.find(f => f.kind === 'read');
      if (!readFact) throw new Error(`Expected read fact from "${phrase.text}" — got ${JSON.stringify(facts)}`);
    }
  });

  it('extracts read facts from "when user requests data from" source lines', () => {
    const appFacts = extractAppFacts({
      source: `
build for javascript backend
create a Deals table:
  title, required

when user requests data from /api/deals:
  requires login
  found = look up all Deals
  send back found
`,
    });
    const readFact = appFacts.find(f => f.kind === 'read');
    if (!readFact) throw new Error(`Expected read fact from "when user requests data from" — got ${JSON.stringify(appFacts)}`);
    expect(readFact.endpoint).toContain('/api/deals');
  });

  it('read requirement fact matches read app fact via compareRequirementFacts', () => {
    const requirementFacts = normalizeRequirementFacts([{ id: 'r1', text: 'sales reps can view all deals' }]);
    const appFacts = extractAppFacts({
      source: `
build for javascript backend
create a Deals table:
  title, required

when user requests data from /api/deals:
  requires login
  found = look up all Deals
  send back found
`,
    });
    const readReq = requirementFacts.find(f => f.kind === 'read');
    if (!readReq) throw new Error('normalizer did not emit read fact');
    const comparisons = compareRequirementFacts([readReq], appFacts);
    expect(comparisons[0].status).toEqual('passed');
  });
});

run();
