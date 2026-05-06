/*
 * cloud-email — transactional email composer.
 *
 * Three pure helpers for the three Clear Cloud transactional email
 * flows: team invite, email verification, password reset. Each returns
 * the same {to, subject, html, text} shape so a single transport
 * wrapper (SendGrid / Mailgun / SES — picked post-85a) can dispatch
 * them uniformly.
 *
 * The transport itself stays OUT of this module. Tests run without
 * credentials and without any network; the HTML body can be inspected
 * in failure scenarios.
 *
 * All HTML bodies HTML-escape user-supplied strings (team name,
 * inviter name) to prevent stored-XSS via a hostile invite payload.
 * Plain-text bodies emit the same strings verbatim (text/plain is
 * inert, no escaping needed).
 */

// =============================================================================
// escapeHtml — shared XSS guard
// =============================================================================
/**
 * Minimal HTML entity escaper for email bodies. Covers the five
 * characters that let an attacker inject markup (<, >, ", ', &).
 *
 * @param {any} s
 * @returns {string}
 */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function required(obj, keys, fnName) {
  for (const k of keys) {
    if (obj == null || obj[k] === undefined || obj[k] === null || obj[k] === '') {
      throw new Error(`${fnName}: ${k} is required.`);
    }
  }
}

// Sender is configurable — defaults to a reasonable value for dev.
// Production picks the from address Russell verifies with SendGrid/SES
// via `CLEAR_CLOUD_FROM_EMAIL`.
const FROM_EMAIL = process.env.CLEAR_CLOUD_FROM_EMAIL || 'noreply@buildclear.dev';

// =============================================================================
// composeInviteEmail — team invite to accept link
// =============================================================================
/**
 * Build the transactional email for a team invite. Includes the
 * accept-invite deep link with the token in the path so the recipient
 * clicks once to land on /accept-invite/<token> on buildclear.dev.
 *
 * @param {object} input
 * @param {{email:string, token:string, role:string}} input.invite
 * @param {{name:string, slug?:string}} input.team
 * @param {{name?:string, email?:string}} input.invitedBy
 * @param {string} input.baseUrl - e.g. "https://buildclear.dev"
 * @returns {{from:string, to:string, subject:string, html:string, text:string}}
 */
export function composeInviteEmail(input) {
  required(input, ['invite', 'team', 'invitedBy', 'baseUrl'], 'composeInviteEmail');
  required(input.invite, ['email', 'token', 'role'], 'composeInviteEmail.invite');
  required(input.team, ['name'], 'composeInviteEmail.team');

  const { invite, team, invitedBy, baseUrl } = input;
  const acceptUrl = `${baseUrl}/accept-invite/${invite.token}`;
  const inviterName = invitedBy.name || invitedBy.email || 'A teammate';

  const subject = `${inviterName} invited you to ${team.name} on Clear Cloud`;

  const html = [
    '<!DOCTYPE html>',
    '<html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">',
    `<h1 style="font-size:20px;margin:0 0 16px;">You're invited to ${escapeHtml(team.name)}</h1>`,
    `<p>${escapeHtml(inviterName)} added you to <strong>${escapeHtml(team.name)}</strong> as a <strong>${escapeHtml(invite.role)}</strong>.</p>`,
    `<p><a href="${acceptUrl}" style="display:inline-block;padding:10px 20px;background:#0066ff;color:#fff;text-decoration:none;border-radius:6px;">Accept invite</a></p>`,
    `<p style="font-size:13px;color:#666;">Or paste this link: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
    '</body></html>',
  ].join('\n');

  const text = [
    `You're invited to ${team.name} on Clear Cloud.`,
    '',
    `${inviterName} added you as a ${invite.role}.`,
    '',
    `Accept: ${acceptUrl}`,
  ].join('\n');

  return { from: FROM_EMAIL, to: invite.email, subject, html, text };
}

// =============================================================================
// composeVerifyEmail — email verification on signup
// =============================================================================
/**
 * Build the verify-your-email message. Link points at
 * /verify-email/<token> on the given baseUrl.
 *
 * @param {object} input
 * @param {string} input.userEmail
 * @param {string} input.token
 * @param {string} input.baseUrl
 */
export function composeVerifyEmail(input) {
  required(input, ['userEmail', 'token', 'baseUrl'], 'composeVerifyEmail');
  const verifyUrl = `${input.baseUrl}/verify-email/${input.token}`;
  const subject = 'Verify your Clear Cloud email';
  const html = [
    '<!DOCTYPE html>',
    '<html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">',
    '<h1 style="font-size:20px;margin:0 0 16px;">Confirm your email</h1>',
    "<p>You're almost set up on Clear Cloud. Click the button below to confirm this email address.</p>",
    `<p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#0066ff;color:#fff;text-decoration:none;border-radius:6px;">Verify email</a></p>`,
    `<p style="font-size:13px;color:#666;">Or paste this link: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    '<p style="font-size:12px;color:#999;">Didn\'t sign up? You can safely ignore this email.</p>',
    '</body></html>',
  ].join('\n');
  const text = [
    'Verify your Clear Cloud email.',
    '',
    `Confirm: ${verifyUrl}`,
    '',
    "Didn't sign up? Ignore this email.",
  ].join('\n');
  return { from: FROM_EMAIL, to: input.userEmail, subject, html, text };
}

// =============================================================================
// composePasswordResetEmail — forgot-password flow
// =============================================================================
/**
 * Build the reset-password message. Link points at
 * /reset-password/<token> on the given baseUrl. The TTL is mentioned
 * in the body so the user knows the link expires.
 *
 * @param {object} input
 * @param {string} input.userEmail
 * @param {string} input.token
 * @param {string} input.baseUrl
 * @param {number} [input.ttlMinutes=60] - mentioned in body copy
 */
export function composePasswordResetEmail(input) {
  required(input, ['userEmail', 'token', 'baseUrl'], 'composePasswordResetEmail');
  const ttlMinutes = Number(input.ttlMinutes) || 60;
  const resetUrl = `${input.baseUrl}/reset-password/${input.token}`;
  const ttlHuman = ttlMinutes === 60
    ? '1 hour'
    : (ttlMinutes < 60 ? `${ttlMinutes} minutes` : `${Math.round(ttlMinutes / 60)} hours`);
  const subject = 'Reset your Clear Cloud password';
  const html = [
    '<!DOCTYPE html>',
    '<html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">',
    '<h1 style="font-size:20px;margin:0 0 16px;">Reset your password</h1>',
    `<p>Someone asked to reset the password for this Clear Cloud account. The link expires in ${ttlHuman} (${ttlMinutes} minutes).</p>`,
    `<p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#0066ff;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>`,
    `<p style="font-size:13px;color:#666;">Or paste this link: <a href="${resetUrl}">${resetUrl}</a></p>`,
    '<p style="font-size:12px;color:#999;">Didn\'t request this? You can safely ignore this email — your password stays the same.</p>',
    '</body></html>',
  ].join('\n');
  const text = [
    'Reset your Clear Cloud password.',
    '',
    `The link expires in ${ttlHuman} (${ttlMinutes} minutes).`,
    '',
    `Reset: ${resetUrl}`,
    '',
    "Didn't request this? Ignore — your password stays the same.",
  ].join('\n');
  return { from: FROM_EMAIL, to: input.userEmail, subject, html, text };
}
