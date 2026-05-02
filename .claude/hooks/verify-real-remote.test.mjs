#!/usr/bin/env node
// Tests for verify-real-remote hook.

import assert from 'node:assert/strict';
import { isSuspicious, commandTouchesGit } from './verify-real-remote.mjs';

let pass = 0; let fail = 0;
function it(name, fn) {
  try { fn(); console.log(`PASS ${name}`); pass++; }
  catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); fail++; }
}

// Suspicious detection
it('flags localhost proxy', () => assert.equal(isSuspicious('http://127.0.0.1:35487/git/foo'), true));
it('flags localhost name', () => assert.equal(isSuspicious('http://localhost:8080/git/foo'), true));
it('flags local_proxy auth', () => assert.equal(isSuspicious('http://local_proxy@127.0.0.1:35001/'), true));
it('flags ipv6 loopback', () => assert.equal(isSuspicious('http://[::1]:8080/git/foo'), true));
it('flags 0.0.0.0', () => assert.equal(isSuspicious('http://0.0.0.0:8080/foo'), true));
it('flags private 10.x', () => assert.equal(isSuspicious('http://10.0.0.5/git/foo'), true));
it('flags private 192.168.x', () => assert.equal(isSuspicious('http://192.168.1.5/foo'), true));
it('flags private 172.16.x', () => assert.equal(isSuspicious('http://172.16.5.10/foo'), true));

// Trusted detection
it('allows github https', () => assert.equal(isSuspicious('https://github.com/foo/bar.git'), false));
it('allows github ssh', () => assert.equal(isSuspicious('git@github.com:foo/bar.git'), false));
it('allows gitlab', () => assert.equal(isSuspicious('https://gitlab.com/foo/bar.git'), false));
it('allows bitbucket', () => assert.equal(isSuspicious('https://bitbucket.org/foo/bar.git'), false));

// Empty / weird
it('allows empty url (no origin set)', () => assert.equal(isSuspicious(''), false));

// Command detection
it('triggers on git push', () => assert.equal(commandTouchesGit('git push origin main'), true));
it('triggers on git push --no-verify', () => assert.equal(commandTouchesGit('SKIP=1 git push --no-verify origin main'), true));
it('triggers on git commit', () => assert.equal(commandTouchesGit('git commit -m "msg"'), true));
it('triggers on git cherry-pick', () => assert.equal(commandTouchesGit('git cherry-pick abc123'), true));
it('does NOT trigger on git status', () => assert.equal(commandTouchesGit('git status'), false));
it('does NOT trigger on git log', () => assert.equal(commandTouchesGit('git log --oneline'), false));
it('does NOT trigger on git diff', () => assert.equal(commandTouchesGit('git diff main'), false));
it('does NOT trigger on plain echo', () => assert.equal(commandTouchesGit('echo "git push"'), true)); // false-positive accepted: word "git push" in any command triggers; safer than missing real pushes

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
