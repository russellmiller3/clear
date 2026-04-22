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

// ─── TDD cycle 1: createTeam inserts a row and returns it ────────────────
console.log('\n🏢 createTeam — first case\n');

{
  const { createTeam } = await import('./index.js');

  // Minimum mock: accepts the insert, returns the row.
  const teams = [];
  let nextId = 1;
  const db = {
    async query(text, params) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(t)) return { rows: [] };
      if (t.startsWith('INSERT INTO teams')) {
        const [slug, name] = params;
        const row = { id: nextId++, slug, name, status: 'active' };
        teams.push(row);
        return { rows: [row] };
      }
      if (t.startsWith('INSERT INTO team_members')) return { rows: [] };
      throw new Error('unhandled query: ' + t.slice(0, 80));
    },
  };
  const team = await createTeam(db, { slug: 'acme', name: 'Acme Corp', ownerUserId: 1 });
  assert(team && team.slug === 'acme', `createTeam returns row with slug (got ${JSON.stringify(team)})`);
  assert(team.id === 1, `createTeam returns row with id (got ${team.id})`);
  assert(team.name === 'Acme Corp', `createTeam returns row with name (got ${team.name})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
