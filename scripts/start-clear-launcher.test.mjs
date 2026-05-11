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
const envLoad = 'for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"';

assert(
  launcher.includes(dependencyGuard),
  'start-clear.bat must repair missing Node packages before starting Studio',
);
assert(
  launcher.indexOf(dependencyGuard) < launcher.indexOf(serverStart),
  'dependency repair must happen before the hidden Studio server starts',
);
assert(
  launcher.includes(envLoad),
  'start-clear.bat must load .env provider keys before starting Studio',
);
assert(
  !launcher.includes('set MEPH_BRAIN=cc-agent &&'),
  'start-clear.bat must not hardwire cc-agent and bypass the model picker',
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
