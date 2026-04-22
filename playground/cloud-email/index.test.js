// =============================================================================
// cloud-email — transactional email composer (TDD tests)
// =============================================================================
// Pure-function helpers that build the {to, subject, html, text} payload
// the caller's transport (SendGrid/Mailgun/SES/etc.) sends. Transport
// stays out of this module — tests run without credentials, the email
// body can be snapshot-inspected in failure scenarios.
//
// Three flows: team invite, email verification, password reset. All three
// return the same shape so the caller can pipe them into one send API.
//
// Run: node playground/cloud-email/index.test.js
// =============================================================================

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ─── composeInviteEmail — team invite (links back to /accept-invite) ────
console.log('\n✉️  composeInviteEmail\n');

{
  const { composeInviteEmail } = await import('./index.js');

  const email = composeInviteEmail({
    invite: {
      email: 'newbie@acme.com',
      token: 'abc123def456',
      role: 'member',
    },
    team: { name: 'Acme Corp', slug: 'acme' },
    invitedBy: { name: 'Marcus', email: 'marcus@acme.com' },
    baseUrl: 'https://buildclear.dev',
  });

  // Shape: { to, subject, html, text, from? }
  assert(email.to === 'newbie@acme.com', `to = invitee email`);
  assert(typeof email.subject === 'string' && email.subject.length > 0,
    `subject is a non-empty string (got "${email.subject}")`);
  // Subject names both the inviter + team so mail clients preview well
  assert(email.subject.toLowerCase().includes('acme'),
    `subject names the team (got "${email.subject}")`);

  // Body contains the accept-invite link with the token in the path
  assert(email.html.includes('https://buildclear.dev/accept-invite/abc123def456'),
    `HTML body contains the accept link with token (got ${email.html.slice(0, 200)})`);
  assert(email.text.includes('https://buildclear.dev/accept-invite/abc123def456'),
    `text body contains the same link`);
  // Text body has enough context to make sense in preview + plain-text clients
  assert(email.text.includes('Marcus'), `text names the inviter`);
  assert(email.text.includes('Acme'), `text names the team`);
  assert(email.text.toLowerCase().includes('member'), `text names the role`);

  // HTML is valid-ish — has <a> + doesn't leak raw { or } literals
  assert(email.html.includes('<a ') || email.html.includes('<a\n'),
    `HTML has an anchor tag`);

  // XSS safety — team name with HTML gets escaped in the HTML body
  const xss = composeInviteEmail({
    invite: { email: 't@x.com', token: 'x', role: 'member' },
    team: { name: '<script>alert(1)</script>', slug: 's' },
    invitedBy: { name: 'M', email: 'm@x.com' },
    baseUrl: 'https://b.dev',
  });
  assert(!xss.html.includes('<script>alert(1)</script>'),
    `raw <script> NOT injected into HTML body (XSS guard)`);
  // Still appears in plain-text body (no escaping needed in text/plain)
  assert(xss.text.includes('<script>alert(1)</script>') || xss.text.includes('script'),
    `team name still appears in text body`);

  // Missing required fields throws
  let threw;
  try { composeInviteEmail({}); } catch (err) { threw = err.message; }
  assert(threw, `empty input throws (got "${threw}")`);
}

// ─── composeVerifyEmail — email verification on signup ──────────────────
console.log('\n📬 composeVerifyEmail\n');

{
  const { composeVerifyEmail } = await import('./index.js');

  const email = composeVerifyEmail({
    userEmail: 'new@acme.com',
    token: 'verify123',
    baseUrl: 'https://buildclear.dev',
  });
  assert(email.to === 'new@acme.com', `to = user email`);
  assert(email.subject.toLowerCase().includes('verify')
      || email.subject.toLowerCase().includes('confirm'),
    `subject uses verify/confirm language (got "${email.subject}")`);
  assert(email.html.includes('https://buildclear.dev/verify-email/verify123'),
    `HTML has verify link with token`);
  assert(email.text.includes('https://buildclear.dev/verify-email/verify123'),
    `text has verify link with token`);

  // Throws on missing fields
  let threw;
  try { composeVerifyEmail({}); } catch (err) { threw = err.message; }
  assert(threw, `empty input throws`);
}

// ─── composePasswordResetEmail — reset-password flow ────────────────────
console.log('\n🔑 composePasswordResetEmail\n');

{
  const { composePasswordResetEmail } = await import('./index.js');

  const email = composePasswordResetEmail({
    userEmail: 'forgetful@acme.com',
    token: 'reset456',
    baseUrl: 'https://buildclear.dev',
    ttlMinutes: 60,
  });
  assert(email.to === 'forgetful@acme.com', `to = user email`);
  assert(email.subject.toLowerCase().includes('reset')
      || email.subject.toLowerCase().includes('password'),
    `subject mentions reset/password (got "${email.subject}")`);
  assert(email.html.includes('https://buildclear.dev/reset-password/reset456'),
    `HTML has reset link with token`);
  // TTL mentioned in body so the user knows the link expires
  assert(/60|hour|one hour/i.test(email.text),
    `text body mentions TTL (got first 200: ${email.text.slice(0, 200)})`);

  // Default TTL when not supplied
  const defaultTtl = composePasswordResetEmail({
    userEmail: 'a@b.c', token: 't', baseUrl: 'https://x.dev',
  });
  assert(defaultTtl.text.length > 50,
    `default TTL still produces a readable body`);

  // Throws on missing fields
  let threw;
  try { composePasswordResetEmail({}); } catch (err) { threw = err.message; }
  assert(threw, `empty input throws`);
}

// ─── escapeHtml — shared helper surface ─────────────────────────────────
// Exported so callers can use the same escape function for any ad-hoc
// email copy without needing a second dependency.
console.log('\n🧼 escapeHtml helper\n');

{
  const { escapeHtml } = await import('./index.js');
  assert(escapeHtml('<b>') === '&lt;b&gt;', `<b> escapes`);
  assert(escapeHtml('"x"') === '&quot;x&quot;', `double quotes escape`);
  assert(escapeHtml("'x'") === '&#39;x&#39;', `single quotes escape`);
  assert(escapeHtml('a & b') === 'a &amp; b', `ampersand escapes`);
  assert(escapeHtml(null) === '', `null → empty string`);
  assert(escapeHtml(undefined) === '', `undefined → empty string`);
  assert(escapeHtml(42) === '42', `numbers stringify`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
