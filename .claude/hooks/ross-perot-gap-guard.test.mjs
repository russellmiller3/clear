#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  buildBlockReason,
  findRossPerotViolations,
} from './ross-perot-gap-guard.mjs';

function expectBlocked(name, message) {
  const violations = findRossPerotViolations(message);
  assert.equal(violations.length, 1, `${name} should be blocked`);
  assert.equal(violations[0].code, 'FIXABLE_GAP_PUNT');
}

function expectAllowed(name, message) {
  const violations = findRossPerotViolations(message);
  assert.deepEqual(violations, [], `${name} should be allowed`);
}

expectBlocked('the exact fixable-gap punt Russell corrected', `
**The gap**
- API/state buttons are in the contract.
- The generated Playwright script does not yet systematically click every API/state button.

**My take**
- The next real upgrade is to make the tree-walk test click every button and verify the data changes.
- I would not claim this is 100% universal until that lands.
`);

expectAllowed('completed work with tests can summarize the gap it closed', `
**TL;DR**
- I added the missing button coverage.
- Tests passed.
- Worktree clean.
`);

expectBlocked('being on a branch is not proof the gap was fixed', `
I am on branch feature/example.
The gap is missing test coverage.
The next step should be to add the hook.
`);

expectAllowed('explicit read-only analysis can name a gap without editing', `
This is read-only analysis.
The gap is missing automated coverage.
The next move should be a hook, but you asked me not to make changes.
`);

expectAllowed('generic discussion can mention a market gap', `
The gap in the market is real.
The product should emphasize proof over polish.
`);

const reason = buildBlockReason([{
  code: 'FIXABLE_GAP_PUNT',
  message: 'Stopped with advice instead of action.',
}]);
assert.match(reason, /Continue now:/);
assert.match(reason, /Implement the obvious missing enforcement or test/);

const cli = spawnSync(process.execPath, ['.claude/hooks/ross-perot-gap-guard.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  input: JSON.stringify({
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'The gap is missing enforcement. The next move should be a hook.',
  }),
});

assert.equal(cli.status, 0);
const output = JSON.parse(cli.stdout);
assert.equal(output.decision, 'block');
assert.match(output.reason, /Ross Perot gap guard blocked this stop/);
