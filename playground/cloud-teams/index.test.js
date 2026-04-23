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
      if (/^UPDATE team_members SET role/i.test(t)) {
        const [teamId, userId, role] = params;
        const m = members.find(x => x.team_id === teamId && x.user_id === userId);
        if (!m) return { rows: [], rowCount: 0 };
        m.role = role;
        return { rows: [m], rowCount: 1 };
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
      if (/^SELECT \* FROM team_invites WHERE team_id/i.test(t)) {
        const [teamId] = params;
        const now = new Date();
        const rows = invites
          .filter(i =>
            i.team_id === teamId &&
            i.accepted_at === null &&
            i.revoked_at === null &&
            i.expires_at > now
          )
          .sort((a, b) => b.invited_at - a.invited_at);
        return { rows };
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

// ─── TDD cycle 12: listPendingInvites for admin dashboards ───────────────
console.log('\n📋 listPendingInvites\n');

{
  const { createTeam, createInvite, acceptInvite, revokeInvite, listPendingInvites } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });

  // Empty — no invites yet
  const empty = await listPendingInvites(db, team.id);
  assert(Array.isArray(empty) && empty.length === 0,
    `empty team → [] (got ${JSON.stringify(empty)})`);

  // 3 invites, 1 accepted, 1 revoked → only 1 remains pending
  const i1 = await createInvite(db, { teamId: team.id, email: 'pending@example.com', invitedBy: 1 });
  const i2 = await createInvite(db, { teamId: team.id, email: 'accepted@example.com', invitedBy: 1 });
  const i3 = await createInvite(db, { teamId: team.id, email: 'revoked@example.com', invitedBy: 1 });
  await acceptInvite(db, i2.token, 99);
  await revokeInvite(db, i3.id);

  const pending = await listPendingInvites(db, team.id);
  assert(pending.length === 1,
    `only pending invites returned (got ${pending.length} — expected 1)`);
  assert(pending[0].email === 'pending@example.com',
    `the right one came through (got ${pending[0]?.email})`);

  // Expired invites should ALSO be filtered out — stale pending invites
  // shouldn't clutter the admin UI
  const i4 = await createInvite(db, { teamId: team.id, email: 'expired@example.com', invitedBy: 1 });
  db.invites.find(x => x.id === i4.id).expires_at = new Date(Date.now() - 1000);
  const afterExpiry = await listPendingInvites(db, team.id);
  assert(afterExpiry.length === 1,
    `expired invites filtered out of pending list (got ${afterExpiry.length})`);
  assert(!afterExpiry.some(x => x.email === 'expired@example.com'),
    'expired invite NOT in the list');

  // Another team — scoped by team_id
  const team2 = await createTeam(db, { slug: 'beta', name: 'Beta', ownerUserId: 2 });
  await createInvite(db, { teamId: team2.id, email: 'beta-invitee@example.com', invitedBy: 2 });
  const acmePending = await listPendingInvites(db, team.id);
  const betaPending = await listPendingInvites(db, team2.id);
  assert(acmePending.length === 1 && betaPending.length === 1,
    'each team sees only its own pending invites (no cross-team leak)');
  assert(!acmePending.some(x => x.email.includes('beta-invitee')),
    'acme does NOT see beta\'s invite');
}

// ─── TDD cycle 13: updateMemberRole with last-owner-demote guard ─────────
console.log('\n🔄 updateMemberRole\n');

{
  const { createTeam, addMember, updateMemberRole, getMembership } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  await addMember(db, team.id, 2, 'member');

  // Promote member → admin
  const promoted = await updateMemberRole(db, team.id, 2, 'admin');
  assert(promoted.role === 'admin',
    `promotes member to admin (got ${promoted?.role})`);
  const verified = await getMembership(db, team.id, 2);
  assert(verified.role === 'admin', 'change persisted in DB');

  // Demote admin → member
  const demoted = await updateMemberRole(db, team.id, 2, 'member');
  assert(demoted.role === 'member',
    `demotes admin to member (got ${demoted?.role})`);

  // Invalid role rejected
  let threw;
  try { await updateMemberRole(db, team.id, 2, 'superadmin'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('invalid role'),
    `invalid role rejected (got "${threw}")`);

  // Non-existent membership rejected
  try { await updateMemberRole(db, team.id, 999, 'admin'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('not found'),
    `unknown user rejected (got "${threw}")`);

  // Last-owner-demote guard — can't demote the only owner
  try { await updateMemberRole(db, team.id, 1, 'admin'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('last owner'),
    `demoting the last owner rejected (got "${threw}")`);
  const ownerStill = await getMembership(db, team.id, 1);
  assert(ownerStill.role === 'owner',
    'owner is still there after the blocked demote');

  // With two owners, demoting one is fine
  await updateMemberRole(db, team.id, 2, 'owner');
  const nowDemoted = await updateMemberRole(db, team.id, 1, 'admin');
  assert(nowDemoted.role === 'admin',
    'with >1 owner, demoting one owner succeeds');

  // Promoting owner to owner is a no-op (not a "last owner" false positive)
  await addMember(db, team.id, 3, 'member');
  const againOwner = await updateMemberRole(db, team.id, 2, 'owner');
  assert(againOwner.role === 'owner',
    'promoting existing owner to owner is a no-op, not a guard-trigger');
}

// ─── TDD cycle 14: transferOwnership — atomic demote + promote ───────────
// This is the primitive that BREAKS THROUGH the last-owner guard safely.
// Sole owner wants to leave? They transfer first, then removeMember works.
// Without this, a sole owner is STUCK unless they add a second owner
// manually (which is the wrong mental model — you should TRANSFER, not
// ADD-THEN-DEMOTE).
console.log('\n👑 transferOwnership — the escape hatch from last-owner guard\n');

{
  const { createTeam, addMember, transferOwnership, getMembership, removeMember } = await import('./index.js');
  const db = makeMockDb();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 1 });
  await addMember(db, team.id, 2, 'member');

  // Happy path: sole owner transfers to a member
  const result = await transferOwnership(db, team.id, 1, 2);
  assert(result && result.fromRole === 'member' && result.toRole === 'owner',
    `transferOwnership returns {fromRole, toRole} showing the swap (got ${JSON.stringify(result)})`);

  const oldOwner = await getMembership(db, team.id, 1);
  const newOwner = await getMembership(db, team.id, 2);
  assert(oldOwner.role === 'member' && newOwner.role === 'owner',
    `old owner demoted to member, new owner promoted (got ${oldOwner.role}/${newOwner.role})`);

  // After transfer, the old owner can leave the team (no more last-owner block)
  const removed = await removeMember(db, team.id, 1);
  assert(removed === true,
    'after transfer, old owner can be removed without tripping last-owner guard');

  // Transfer to non-member rejected
  const db2 = makeMockDb();
  const team2 = await createTeam(db2, { slug: 'x', name: 'X', ownerUserId: 1 });
  let threw;
  try { await transferOwnership(db2, team2.id, 1, 999); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('not a member'),
    `can't transfer to a non-member (got "${threw}")`);

  // Transfer FROM non-owner rejected (admin can't transfer owner's status)
  const db3 = makeMockDb();
  const team3 = await createTeam(db3, { slug: 'x', name: 'X', ownerUserId: 1 });
  await addMember(db3, team3.id, 2, 'admin');
  await addMember(db3, team3.id, 3, 'member');
  try { await transferOwnership(db3, team3.id, 2, 3); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('not an owner'),
    `can only transfer FROM an owner (got "${threw}")`);

  // Transfer to self → no-op-like (but rejected as a programming error)
  const db4 = makeMockDb();
  const team4 = await createTeam(db4, { slug: 'x', name: 'X', ownerUserId: 1 });
  try { await transferOwnership(db4, team4.id, 1, 1); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('same'),
    `can't transfer to self (got "${threw}")`);

  // Atomicity — if the demote fails (e.g. membership vanishes mid-call),
  // the promote is ALSO rolled back. Simulate by deleting the "to" member
  // between the pre-check and the UPDATE via a query interceptor.
  // (Not easily testable against our mock — the in-memory mock doesn't
  // simulate concurrent deletes. Document in the impl + test post-85a.)
}

// =============================================================================
// CC-2d — getAppAccess: what role does a user have on this app?
// =============================================================================
// Closes the CC-2d enforcement story. Every Clear Cloud app belongs to
// a team (apps.team_id — migration 002 of tenants-db). A user's access to
// an app is determined by their membership in that team.
//
// Returns the role string ('owner' | 'admin' | 'member') if the user is
// a member of the app's team. Returns null if:
//   - the app doesn't exist
//   - the app has no team (pre-backfill)
//   - the user isn't a member of the app's team
//
// Combined with `can(role, action)`, this is the complete CC-2d access
// check: `can(await getAppAccess(db, userId, appId), 'app.deploy')`.
console.log('\n🛡️  getAppAccess — CC-2d app-level access control\n');

{
  // Extend the mock db with an `apps` array so we can exercise the JOIN
  // across apps → teams → team_members.
  function makeMockDbWithApps() {
    const db = makeMockDb();
    db.apps = [];
    // Add the getAppAccess SELECT handler to the mock's query switch.
    const origQuery = db.query;
    db.query = async function (text, params = []) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/SELECT tm\.role.*FROM apps.*JOIN team_members/i.test(t)) {
        const [appId, userId] = params;
        const app = db.apps.find(a => a.id === appId);
        if (!app || !app.team_id) return { rows: [] };
        const m = db.members.find(
          mm => mm.team_id === app.team_id && mm.user_id === userId
        );
        return { rows: m ? [{ role: m.role }] : [] };
      }
      return origQuery(text, params);
    };
    return db;
  }

  const { createTeam, addMember, getAppAccess } = await import('./index.js');

  // Setup: team with owner + admin + member; one app owned by that team.
  const db = makeMockDbWithApps();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 10 });
  await addMember(db, team.id, 20, 'admin');
  await addMember(db, team.id, 30, 'member');
  db.apps.push({ id: 100, team_id: team.id, slug: 'dashboard', tenant_id: 1 });
  db.apps.push({ id: 101, team_id: null,   slug: 'orphan',    tenant_id: 1 });

  // Owner sees 'owner'
  const roleOwner = await getAppAccess(db, 10, 100);
  assert(roleOwner === 'owner',
    `owner of the team sees role='owner' on its app (got ${JSON.stringify(roleOwner)})`);

  // Admin sees 'admin'
  const roleAdmin = await getAppAccess(db, 20, 100);
  assert(roleAdmin === 'admin', `admin role returned (got ${JSON.stringify(roleAdmin)})`);

  // Member sees 'member'
  const roleMember = await getAppAccess(db, 30, 100);
  assert(roleMember === 'member', `member role returned (got ${JSON.stringify(roleMember)})`);

  // Non-member sees null
  const roleStranger = await getAppAccess(db, 999, 100);
  assert(roleStranger === null,
    `non-member of the team sees null (got ${JSON.stringify(roleStranger)})`);

  // App without a team (pre-backfill) → null for everyone, including
  // users who'd otherwise be eligible
  const roleOrphan = await getAppAccess(db, 10, 101);
  assert(roleOrphan === null,
    `app with team_id=null returns null (got ${JSON.stringify(roleOrphan)})`);

  // Non-existent app → null, doesn't throw
  const roleNoApp = await getAppAccess(db, 10, 9999);
  assert(roleNoApp === null, `non-existent app returns null (got ${JSON.stringify(roleNoApp)})`);

  // Compose with can() — the full CC-2d access check
  const { can } = await import('./index.js');
  assert(can(roleOwner, 'app.delete-with-data') === true,
    'compose: can(owner, app.delete-with-data) true');
  assert(can(roleMember, 'app.delete-with-data') === false,
    'compose: can(member, app.delete-with-data) false');
  assert(can(roleStranger, 'app.deploy') === false,
    'compose: non-member → can(null, app.deploy) false');
}

// =============================================================================
// CC-2d — assertCanAccessApp: throwing wrapper around getAppAccess + can
// =============================================================================
// Endpoint-facing access check. Composes getAppAccess + can into a single
// throw-on-reject helper so handlers don't scatter four lines of boilerplate:
//
//   const role = await getAppAccess(db, userId, appId);
//   if (!can(role, 'app.deploy')) return res.status(403).json({error:'...'});
//
// becomes:
//
//   await assertCanAccessApp(db, userId, appId, 'app.deploy');
//
// Throws an Error with .status=403 (caught by Express error middleware)
// on denial. The error message names the action so logs + client
// responses are instructive, not generic "forbidden".
console.log('\n🔒 assertCanAccessApp — endpoint guard wrapper\n');

{
  function makeMockDbWithApps() {
    const db = makeMockDb();
    db.apps = [];
    const origQuery = db.query;
    db.query = async function (text, params = []) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/SELECT tm\.role.*FROM apps.*JOIN team_members/i.test(t)) {
        const [appId, userId] = params;
        const app = db.apps.find(a => a.id === appId);
        if (!app || !app.team_id) return { rows: [] };
        const m = db.members.find(
          mm => mm.team_id === app.team_id && mm.user_id === userId
        );
        return { rows: m ? [{ role: m.role }] : [] };
      }
      return origQuery(text, params);
    };
    return db;
  }

  const { createTeam, addMember, assertCanAccessApp } = await import('./index.js');

  const db = makeMockDbWithApps();
  const team = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 10 });
  await addMember(db, team.id, 20, 'admin');
  await addMember(db, team.id, 30, 'member');
  db.apps.push({ id: 100, team_id: team.id, slug: 'dashboard' });
  db.apps.push({ id: 101, team_id: null,    slug: 'orphan' });

  // Happy path — returns the role so callers can log/audit who acted
  const role = await assertCanAccessApp(db, 10, 100, 'app.deploy');
  assert(role === 'owner', `returns role on allow (got ${JSON.stringify(role)})`);

  // Member can deploy
  const r2 = await assertCanAccessApp(db, 30, 100, 'app.deploy');
  assert(r2 === 'member', `member allowed for app.deploy (got ${r2})`);

  // Member CANNOT delete-with-data (owner-only)
  let threw;
  try { await assertCanAccessApp(db, 30, 100, 'app.delete-with-data'); }
  catch (err) { threw = err; }
  assert(threw instanceof Error, 'denial throws an Error');
  assert(threw?.status === 403, `Error.status === 403 (got ${threw?.status})`);
  assert(threw?.message?.includes('app.delete-with-data'),
    `error message names the action (got "${threw?.message}")`);

  // Non-member (stranger) — throws regardless of action
  threw = null;
  try { await assertCanAccessApp(db, 999, 100, 'app.deploy'); }
  catch (err) { threw = err; }
  assert(threw?.status === 403,
    `non-member throws 403 (got ${threw?.status})`);
  // Message should note the user isn't a member, not an action problem
  assert(/member|access|team/i.test(threw?.message || ''),
    `non-member error names membership issue (got "${threw?.message}")`);

  // Orphan app (no team) — throws (no one can access it via team path)
  threw = null;
  try { await assertCanAccessApp(db, 10, 101, 'app.deploy'); }
  catch (err) { threw = err; }
  assert(threw?.status === 403,
    `orphan app throws 403 even for the would-be owner`);

  // Non-existent app — also throws 403 (not 404 — we don't leak
  // whether an app exists to someone who can't see it anyway)
  threw = null;
  try { await assertCanAccessApp(db, 10, 9999, 'app.deploy'); }
  catch (err) { threw = err; }
  assert(threw?.status === 403,
    `non-existent app throws 403 (not 404 — info leak guard)`);

  // Unknown action — throws. Better to fail fast at the caller than
  // silently grant access with a typo like 'app.deploys' vs 'app.deploy'.
  threw = null;
  try { await assertCanAccessApp(db, 10, 100, 'app.typoed-action'); }
  catch (err) { threw = err; }
  assert(threw?.status === 403,
    `unknown action throws (fail-closed on typos)`);
}

// =============================================================================
// CC-2c — listAppsForUser: the dashboard query
// =============================================================================
// buildclear.dev/dashboard needs one query: "show me every app I can
// access, grouped by team, with my role on each." listAppsForUser does it
// in a single JOIN (apps ← teams ← team_members WHERE user_id = $1).
// Each row carries `my_role` so the dashboard UI renders "Manage" vs
// "View only" buttons without a second round-trip per app.
//
// Ordered by the user's most-recent join time (recent teams first) then
// by app slug — matches "what am I working on this week" UX.
console.log('\n📋 listAppsForUser — CC-2c dashboard query\n');

{
  function makeMockDbWithApps() {
    const db = makeMockDb();
    db.apps = [];
    const origQuery = db.query;
    db.query = async function (text, params = []) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/SELECT a\.\*, tm\.role.*FROM apps.*JOIN team_members/i.test(t)) {
        const [userId] = params;
        // Only active-status apps surface in dashboards.
        const rows = [];
        for (const m of db.members) {
          if (m.user_id !== userId) continue;
          for (const a of db.apps) {
            if (a.team_id !== m.team_id) continue;
            if (a.status && a.status !== 'active') continue;
            rows.push({ ...a, my_role: m.role });
          }
        }
        // Stable sort — recent memberships first, then by slug
        rows.sort((x, y) => {
          const jx = (db.members.find(m => m.team_id === x.team_id && m.user_id === userId) || {}).joined_at || 0;
          const jy = (db.members.find(m => m.team_id === y.team_id && m.user_id === userId) || {}).joined_at || 0;
          if (jx !== jy) return jy - jx;
          return (x.slug || '').localeCompare(y.slug || '');
        });
        return { rows };
      }
      return origQuery(text, params);
    };
    return db;
  }

  const { createTeam, addMember, listAppsForUser } = await import('./index.js');

  const db = makeMockDbWithApps();

  // User 10 owns team 'acme' with 2 apps. User 20 is a member.
  const teamAcme = await createTeam(db, { slug: 'acme', name: 'Acme', ownerUserId: 10 });
  await addMember(db, teamAcme.id, 20, 'member');
  db.apps.push({ id: 1, team_id: teamAcme.id, slug: 'dashboard', status: 'active', tenant_id: 1 });
  db.apps.push({ id: 2, team_id: teamAcme.id, slug: 'reports',   status: 'active', tenant_id: 1 });
  db.apps.push({ id: 3, team_id: teamAcme.id, slug: 'archived',  status: 'deleted', tenant_id: 1 });

  // Second team user 10 also owns, with 1 app
  const teamBeta = await createTeam(db, { slug: 'beta', name: 'Beta', ownerUserId: 10 });
  db.apps.push({ id: 4, team_id: teamBeta.id, slug: 'thing', status: 'active', tenant_id: 1 });

  // Orphan app with no team — doesn't surface
  db.apps.push({ id: 5, team_id: null, slug: 'orphan', status: 'active', tenant_id: 1 });

  // User 10 sees all 3 active apps across both teams, with my_role on each
  const ownerApps = await listAppsForUser(db, 10);
  assert(ownerApps.length === 3,
    `owner sees 3 active apps across 2 teams (got ${ownerApps.length})`);
  assert(ownerApps.every(a => a.my_role === 'owner'),
    `every row carries my_role='owner' (got ${JSON.stringify(ownerApps.map(a => a.my_role))})`);
  const slugs = ownerApps.map(a => a.slug).sort();
  assert(JSON.stringify(slugs) === JSON.stringify(['dashboard', 'reports', 'thing']),
    `slugs include only active apps (got ${JSON.stringify(slugs)})`);
  // Deleted apps don't surface
  assert(!ownerApps.some(a => a.slug === 'archived'),
    'archived-status app filtered out of the dashboard list');
  // Orphan app (team_id=null) doesn't surface
  assert(!ownerApps.some(a => a.slug === 'orphan'),
    'orphan app (no team) filtered out');

  // User 20 sees only acme's apps, with my_role='member'
  const memberApps = await listAppsForUser(db, 20);
  assert(memberApps.length === 2,
    `member of one team sees that team's active apps (got ${memberApps.length})`);
  assert(memberApps.every(a => a.my_role === 'member'),
    `member role carried on every row (got ${JSON.stringify(memberApps.map(a => a.my_role))})`);

  // User 999 — not a member of any team — sees empty list, not an error
  const noApps = await listAppsForUser(db, 999);
  assert(Array.isArray(noApps) && noApps.length === 0,
    'non-member user sees empty array, not null or throw');
}

// =============================================================================
// Schema drift-guard — CC-2b migration file has to exist and carry the
// tables/columns the code above assumes. Catches the class of bug where
// someone renames a column in code but forgets to update the migration
// (or vice versa) before Phase 85a runs the SQL against real Postgres.
// =============================================================================
console.log('\n📐 Schema drift-guard — migration ↔ code alignment\n');

{
  const fs = await import('fs');
  const path = await import('path');
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
  const migrationPath = path.join(here, 'migrations', '001-teams.sql');
  const exists = fs.existsSync(migrationPath);
  assert(exists, `migration file exists at ${migrationPath}`);

  if (exists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    // Three tables the code depends on.
    assert(/CREATE TABLE\s+(IF NOT EXISTS\s+)?teams\b/i.test(sql),
      'migration creates teams table');
    assert(/CREATE TABLE\s+(IF NOT EXISTS\s+)?team_members\b/i.test(sql),
      'migration creates team_members table');
    assert(/CREATE TABLE\s+(IF NOT EXISTS\s+)?team_invites\b/i.test(sql),
      'migration creates team_invites table');

    // Columns referenced by index.js queries — each MUST appear in the SQL
    // or a real Postgres run will 42703 error at first query.
    const teamsCols = ['slug', 'name', 'tenant_id', 'status', 'created_at', 'updated_at'];
    for (const col of teamsCols) {
      assert(new RegExp('\\b' + col + '\\b', 'i').test(sql),
        `migration declares teams.${col}`);
    }
    const memberCols = ['team_id', 'user_id', 'role', 'joined_at'];
    for (const col of memberCols) {
      assert(new RegExp('\\b' + col + '\\b', 'i').test(sql),
        `migration declares team_members.${col}`);
    }
    const inviteCols = ['email', 'token', 'invited_by', 'expires_at',
      'accepted_at', 'accepted_by', 'revoked_at', 'invited_at'];
    for (const col of inviteCols) {
      assert(new RegExp('\\b' + col + '\\b', 'i').test(sql),
        `migration declares team_invites.${col}`);
    }
    // Role values enforced by can() matrix — at least one CHECK constraint
    // or enum-like CHECK listing owner|admin|member must exist on
    // team_members.role so bad inserts fail at the DB boundary too.
    assert(/\bowner\b[\s\S]*\badmin\b[\s\S]*\bmember\b|\bmember\b[\s\S]*\badmin\b[\s\S]*\bowner\b/i.test(sql),
      'migration constrains role values to owner|admin|member somewhere');
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
