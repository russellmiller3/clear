import assert from 'assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ensureNodeDeps,
  missingDependencyDirs,
  packageDependencyNames,
} from './ensure-node-deps.mjs';

function makeTempPackage() {
  const rootDir = mkdtempSync(join(tmpdir(), 'clear-deps-'));
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
    dependencies: {
      express: '^5.2.1',
      pg: '^8.20.0',
    },
    devDependencies: {
      playwright: '^1.59.1',
    },
  }, null, 2));
  return rootDir;
}

const rootDir = makeTempPackage();
try {
  assert.deepEqual(packageDependencyNames(rootDir), ['express', 'pg', 'playwright']);
  assert.deepEqual(missingDependencyDirs(rootDir), ['express', 'pg', 'playwright']);

  mkdirSync(join(rootDir, 'node_modules', 'express'), { recursive: true });
  mkdirSync(join(rootDir, 'node_modules', 'pg'), { recursive: true });
  assert.deepEqual(missingDependencyDirs(rootDir), ['playwright']);

  const calls = [];
  const result = ensureNodeDeps({
    rootDir,
    runner(command, args, options) {
      calls.push({ command, args, cwd: options.cwd });
      mkdirSync(join(rootDir, 'node_modules', 'playwright'), { recursive: true });
      return { status: 0 };
    },
    log() {},
  });

  assert.equal(result.installed, true);
  assert.deepEqual(result.missingBeforeInstall, ['playwright']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  assert.deepEqual(calls[0].args, ['install']);
  assert.equal(calls[0].cwd, rootDir);
  assert.equal(existsSync(join(rootDir, 'node_modules', 'playwright')), true);

  const alreadyReady = ensureNodeDeps({
    rootDir,
    runner() {
      throw new Error('runner should not run when dependencies are present');
    },
    log() {},
  });
  assert.equal(alreadyReady.installed, false);
  assert.deepEqual(alreadyReady.missingBeforeInstall, []);
} finally {
  rmSync(rootDir, { recursive: true, force: true });
}

console.log('ensure-node-deps tests passed');
