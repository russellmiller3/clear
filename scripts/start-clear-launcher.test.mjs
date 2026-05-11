import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = process.cwd();
const launcherPath = join(rootDir, 'start-clear.bat');
const launcherBytes = readFileSync(launcherPath);
const launcher = launcherBytes.toString('utf8');
const gitAttributes = readFileSync(join(rootDir, '.gitattributes'), 'utf8');

const dependencyGuard = 'node scripts\\ensure-node-deps.mjs';
const serverStart = 'node studio\\server.js';

assert(
  launcher.includes(dependencyGuard),
  'start-clear.bat must repair missing Node packages before starting Studio',
);
assert(
  launcher.indexOf(dependencyGuard) < launcher.indexOf(serverStart),
  'dependency repair must happen before the hidden Studio server starts',
);

for (let i = 0; i < launcherBytes.length; i += 1) {
  if (launcherBytes[i] === 10) {
    assert.equal(
      launcherBytes[i - 1],
      13,
      'start-clear.bat must use CRLF line endings so Windows cmd.exe runs it correctly',
    );
  }
}

assert(
  gitAttributes.includes('*.bat text eol=crlf'),
  '.gitattributes must keep Windows batch launchers in CRLF form',
);

console.log('start-clear launcher tests passed');
