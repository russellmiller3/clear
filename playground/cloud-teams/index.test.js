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
  const invites = [];
  let nextTeamId = 1, nextMemberId = 1, nextInviteId = 1;
  return {
    teams, members, invites,
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
      if (/^SELECT COUNT\(\*\)::integer AS n FROM team_members WHERE team_id/i.test(t)) {
        const [teamId] = params;
        const n = members.filter(m => m.team_id === teamId && m.role === 'owner').length;
        return { rows: [{ n }] };
      }
      if (/^DELETE FROM team_members/i.test(t)) {
        const [teamId, userId] = params;
        const idx = members.findIndex(m => m.team_id === teamId && m.user_id === userId);
        if (idx < 0) return { rows: [], rowCount: 0 };
        members.splice(idx, 1);
        return { rows: [], rowCount: 1 };
      }
      if (t.startsWith('INSERT INTO team_invites')) {
        const [team_id, email, role, token, invited_by, expires_at] = params;
        const row = {
          id: nextInviteId++, team_id, email, role, token,
          invited_by: invited_by || null,
          invited_at: new Date(),
          expires_at: new Date(expires_at),
          accepted_at: null, accepted_by: null, revoked_at: null,
        };
        invites.push(row);
        return { rows: [row] };
      }
      if (/^SELECT \* FROM team_invites WHERE token/i.test(t)) {
        const [token] = params;
        const row = invites.find(i =>
          i.token === token &&
          i.accepted_at === null &&
          i.revoked_at === null &&
          i.expires_at > new Date()
        );
        return { rows: row ? [row] : [] };
      }
      if (/^UPDATE team_invites SET accepted_at/i.test(t)) {
        const [userId, id] = params;
        const i = invites.find(x => x.id === id);
        if (!i) return { rows: [], rowCount: 0 };
        i.accepted_at = new Date();
        i.accepted_by = userId;
        return { rows: [i], rowCount: 1 };
      }
      if (/^UPDATE team_invites SET revoked_at/i.test(t)) {
        const [id] = params;
        const i = invites.find(x =>
          x.id === id && x.accepted_at === null && x.revoked_at === null);
        if (!i) return { rows: [], rowCount: 0 };
        i.revoked_at = new Date();
        return { rows: [i], rowCount: 1 };
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

// ─── TDD cycle 6: can(role, action) pure permission check ────────────────
console.log('\n🔐 can() — permission matrix\n');

{
  const { can } = await import('./index.js');

  // Owner can everything defined in the matrix
  assert(can('owner', 'team.delete'), 'owner can team.delete');
  assert(can('owner', 'billing.manage'), 'owner can billing.manage');
  assert(can('owner', 'team.invite'), 'owner can team.invite');

  // Admin can invite + remove + view, NOT billing.manage or team.delete
  assert(can('admin', 'team.invite'), 'admin can team.invite');
  assert(can('admin', 'team.remove-member'), 'admin can team.remove-member');
  assert(!can('admin', 'billing.manage'),
    'admin CANNOT billing.manage (owner-only)');
  assert(!can('admin', 'team.delete'),
    'admin CANNOT team.delete (owner-only, dangerous)');

  // Member can deploy + read, not manage team
  assert(can('member', 'app.deploy'), 'member can app.deploy');
  assert(!can('member', 'team.invite'),
    'member CANNOT team.invite');
  assert(!can('member', 'team.remove-member'),
    'member CANNOT team.remove-member');

  // Defensive
  assert(!can(null, 'app.deploy'), 'null role → deny everything');
  assert(!can('owner', 'made.up.action'),
    'unknown action → deny for every role (fail closed)');
  assert(!can('superadmin', 'team.delete'),
    'unknown role → deny (no privilege escalation via typo)');
}

// ─── TDD cycle 7: addMember inserts a row, refuses invalid role ──────────
console.log('\n➕ addMember\n');

{
  const { createTeam, addMember, getMembership } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });

  const added = await addMember(db, team.id, 7, 'admin');
  assert(added.user_id === 7 && added.role === 'admin',
    `addMember returns the inserted row (got ${JSON.stringify(added)?.slice(0, 80)})`);

  const verified = await getMembership(db, team.id, 7);
  assert(verified && verified.role === 'admin',
    'getMembership confirms the new admin');

  // Invalid role rejected
  let threw;
  try { await addMember(db, team.id, 8, 'superadmin'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid role'),
    `invalid role rejected (got "${threw}")`);

  // Default role is member when unspecified
  const defaulted = await addMember(db, team.id, 9);
  assert(defaulted.role === 'member',
    `unspecified role defaults to member (got ${defaulted.role})`);
}

// ─── TDD cycle 8: removeMember with last-owner guard ─────────────────────
console.log('\n➖ removeMember — last-owner guard is security-critical\n');

{
  const { createTeam, addMember, removeMember, getMembership } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  await addMember(db, team.id, 2, 'member');

  // Can remove non-owner
  assert(await removeMember(db, team.id, 2) === true,
    'removeMember returns true on success');
  assert(await getMembership(db, team.id, 2) === null,
    'member was actually removed');

  // Idempotent — removing non-member returns false, doesn't throw
  assert(await removeMember(db, team.id, 2) === false,
    `removing non-member returns false (not a throw) — idempotent`);

  // Can NOT remove the last owner
  let threw;
  try { await removeMember(db, team.id, 1); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('last owner'),
    `removing the last owner throws "last owner" error (got "${threw}")`);
  const still = await getMembership(db, team.id, 1);
  assert(still && still.role === 'owner',
    'owner is still there after the blocked remove');

  // With two owners, can remove one
  await addMember(db, team.id, 3, 'owner');
  const removed = await removeMember(db, team.id, 1);
  assert(removed === true,
    'with >1 owner, removing one owner succeeds');
  const remaining = await getMembership(db, team.id, 3);
  assert(remaining && remaining.role === 'owner',
    'other owner still present');
}

// ─── TDD cycle 9: createInvite generates a 64-hex token + expiry ─────────
console.log('\n📨 createInvite\n');

{
  const { createTeam, createInvite } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });

  const invite = await createInvite(db, {
    teamId: team.id,
    email: 'NEW@example.com',
    role: 'admin',
    invitedBy: 1,
  });
  assert(invite.email === 'new@example.com',
    `email lowercased at the boundary (got "${invite.email}")`);
  assert(invite.role === 'admin', 'role stored as provided');
  assert(typeof invite.token === 'string' && invite.token.length === 64,
    `token is 64-char hex (got length ${invite.token?.length})`);
  assert(/^[0-9a-f]+$/.test(invite.token),
    'token is hex (no non-hex chars)');
  assert(invite.expires_at instanceof Date && invite.expires_at > new Date(),
    `expires_at is a future Date (got ${invite.expires_at})`);

  // Invalid email rejected
  let threw;
  try { await createInvite(db, { teamId: team.id, email: 'not-an-email', invitedBy: 1 }); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('email'),
    `bad email rejected (got "${threw}")`);

  // Invalid role rejected
  try { await createInvite(db, { teamId: team.id, email: 'x@y.co', role: 'god', invitedBy: 1 }); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid role'),
    `bad role rejected (got "${threw}")`);

  // Two invites get different tokens
  const a = await createInvite(db, { teamId: team.id, email: 'a@b.co', invitedBy: 1 });
  const b = await createInvite(db, { teamId: team.id, email: 'c@d.co', invitedBy: 1 });
  assert(a.token !== b.token, 'each invite gets a unique token');
}

// ─── TDD cycle 10: acceptInvite consumes token + adds user ───────────────
console.log('\n✅ acceptInvite — single-use + adds member\n');

{
  const { createTeam, createInvite, acceptInvite, getMembership } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  const invite = await createInvite(db, {
    teamId: team.id, email: 'new@example.com', role: 'admin', invitedBy: 1,
  });

  const result = await acceptInvite(db, invite.token, 99);
  assert(result.teamId === team.id && result.role === 'admin',
    `acceptInvite returns {teamId, role} for the caller (got ${JSON.stringify(result)})`);
  const m = await getMembership(db, team.id, 99);
  assert(m && m.role === 'admin',
    'accepting user is added to team with the invite\'s role');

  // Second accept with same token is rejected (single-use)
  let threw;
  try { await acceptInvite(db, invite.token, 100); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid'),
    `second accept of same token rejected (got "${threw}")`);

  // Bogus token rejected
  try { await acceptInvite(db, 'not-a-real-token', 99); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid'),
    'bogus token rejected');

  // Expired invite rejected
  const db2 = makeMockDb();
  const team2 = await createTeam(db2, { slug: 't2', name: 'T2', ownerUserId: 1 });
  const invite2 = await createInvite(db2, {
    teamId: team2.id, email: 'x@y.co', invitedBy: 1,
  });
  // Mutate the stored invite to be expired
  db2.invites[0].expires_at = new Date(Date.now() - 1000);
  try { await acceptInvite(db2, invite2.token, 50); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid'),
    `expired token rejected (got "${threw}")`);
}

// ─── TDD cycle 11: revokeInvite cancels a pending invite ─────────────────
console.log('\n🗑  revokeInvite\n');

{
  const { createTeam, createInvite, revokeInvite, acceptInvite } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  const invite = await createInvite(db, {
    teamId: team.id, email: 'changed-our-mind@example.com', invitedBy: 1,
  });

  const ok = await revokeInvite(db, invite.id);
  assert(ok === true, 'revokeInvite returns true on success');

  // Revoked invite can no longer be accepted
  let threw;
  try { await acceptInvite(db, invite.token, 42); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid'),
    `revoked invite → acceptInvite rejects (got "${threw}")`);

  // Second revoke → false (idempotent — don't throw on no-op)
  const second = await revokeInvite(db, invite.id);
  assert(second === false,
    `second revoke returns false — idempotent (got ${second})`);

  // Revoking non-existent invite returns false, not a throw
  const ghost = await revokeInvite(db, 99999);
  assert(ghost === false,
    `revoking a non-existent invite returns false (got ${ghost})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
