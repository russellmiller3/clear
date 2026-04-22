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
      if (/^SELECT \* FROM teams WHERE slug/i.test(t)) {
        const [slug] = params;
        const row = teams.find(x => x.slug === slug);
        return { rows: row ? [row] : [] };
      }
      if (/^SELECT \* FROM team_members WHERE team_id/i.test(t)) {
        const [teamId, userId] = params;
        const row = members.find(m => m.team_id === teamId && m.user_id === userId);
        return { rows: row ? [row] : [] };
      }
      if (/SELECT t\.\*, tm\.role AS my_role/i.test(t)) {
        const [userId] = params;
        const list = [];
        for (const m of members) {
          if (m.user_id !== userId) continue;
          const team = teams.find(x => x.id === m.team_id);
          if (!team || team.status !== 'active') continue;
          list.push({ ...team, my_role: m.role });
        }
        return { rows: list };
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

// ─── TDD cycle 3: getTeamBySlug returns the team or null ─────────────────
console.log('\n🔎 getTeamBySlug\n');

{
  const { createTeam, getTeamBySlug } = await import('./index.js');
  const db = makeMockDb();
  await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });

  const found = await getTeamBySlug(db, 'acme');
  assert(found && found.slug === 'acme',
    `getTeamBySlug returns the team row (got ${JSON.stringify(found)?.slice(0, 100)})`);
  assert(found.name === 'Acme', 'getTeamBySlug returns name on the row');

  const missing = await getTeamBySlug(db, 'nonexistent');
  assert(missing === null,
    `getTeamBySlug returns null for unknown slug (got ${JSON.stringify(missing)})`);
}

// ─── TDD cycle 4: listTeamsForUser returns the user's teams + their role ─
console.log('\n📋 listTeamsForUser\n');

{
  const { createTeam, listTeamsForUser } = await import('./index.js');
  const db = makeMockDb();
  await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  await createTeam(db, { slug: 'beta', name: 'Beta', ownerUserId: 2 });

  const mine = await listTeamsForUser(db, 1);
  assert(Array.isArray(mine) && mine.length === 1,
    `listTeamsForUser returns an array with the user's 1 team (got ${mine?.length})`);
  assert(mine[0].slug === 'acme', 'returns the right team (slug matches)');
  assert(mine[0].my_role === 'owner',
    `row carries the user's role as my_role (got ${mine[0].my_role})`);

  const nobody = await listTeamsForUser(db, 999);
  assert(Array.isArray(nobody) && nobody.length === 0,
    `unknown user returns empty array, not null (got ${JSON.stringify(nobody)})`);
}

// ─── TDD cycle 5: getMembership returns the row or null ──────────────────
console.log('\n🎫 getMembership\n');

{
  const { createTeam, getMembership } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 42 });

  const owner = await getMembership(db, team.id, 42);
  assert(owner && owner.role === 'owner',
    `owner membership returns row with role=owner (got ${JSON.stringify(owner)?.slice(0, 80)})`);

  const nope = await getMembership(db, team.id, 999);
  assert(nope === null,
    `non-member returns null (got ${JSON.stringify(nope)})`);

  const wrongTeam = await getMembership(db, 99, 42);
  assert(wrongTeam === null,
    `unknown team returns null (got ${JSON.stringify(wrongTeam)})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
