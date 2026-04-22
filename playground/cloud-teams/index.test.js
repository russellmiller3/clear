// =============================================================================
// CC-2b — Teams + memberships tests (TDD)
// =============================================================================
// Kent Beck cycle: one failing test → minimal code → green → next test.
// Each commit is one full red→green→refactor loop. Tests get added in
// the order a real user workflow would exercise the code.
//
// Run: node playground/cloud-teams/index.test.js
// =============================================================================

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// Shared mock DB — grows as each TDD cycle adds a new query pattern.
// When a helper emits a SQL shape the mock doesn't know, it throws with
// the exact unhandled text so the RED phase of the next cycle is obvious.
function makeMockDb() {
  const teams = [];
  const members = [];
  let nextTeamId = 1, nextMemberId = 1;
  return {
    teams, members,
    async query(text, params = []) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(t)) return { rows: [] };
      if (t.startsWith('INSERT INTO teams')) {
        const [slug, name, tenantId] = params;
        if (teams.find(x => x.slug === slug)) {
          const err = new Error('duplicate key value violates unique constraint "teams_slug_key"');
          err.code = '23505';
          throw err;
        }
        const row = {
          id: nextTeamId++, slug, name, tenant_id: tenantId || null,
          status: 'active',
          created_at: new Date(), updated_at: new Date(),
        };
        teams.push(row);
        return { rows: [row] };
      }
      if (t.startsWith('INSERT INTO team_members')) {
        const [team_id, user_id, role] = params;
        const row = {
          id: nextMemberId++, team_id, user_id, role: role || 'member',
          joined_at: new Date(),
        };
        members.push(row);
        return { rows: [row] };
      }
      throw new Error('MockDb: unhandled query — ' + t.slice(0, 100));
    },
  };
}

// ─── TDD cycle 1: createTeam inserts a row and returns it ────────────────
console.log('\n🏢 createTeam — first case\n');

{
  const { createTeam } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme Corp', ownerUserId: 1 });
  assert(team && team.slug === 'acme', `createTeam returns row with slug (got ${JSON.stringify(team)})`);
  assert(team.id === 1, `createTeam returns row with id (got ${team.id})`);
  assert(team.name === 'Acme Corp', `createTeam returns row with name (got ${team.name})`);
}

// ─── TDD cycle 2: duplicate slug surfaces a readable error ───────────────
console.log('\n🚫 createTeam — duplicate slug\n');

{
  const { createTeam } = await import('./index.js');
  const db = makeMockDb();
  await createTeam(db, { slug: 'acme', name: 'Acme Corp', ownerUserId: 1 });
  let threw;
  try {
    await createTeam(db, { slug: 'acme', name: 'Acme Two', ownerUserId: 2 });
  } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('already exists'),
    `duplicate slug surfaces "already exists" error, not raw Postgres noise (got "${threw}")`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
