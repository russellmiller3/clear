import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

export function packageDependencyNames(rootDir = ROOT_DIR) {
  const packagePath = join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  const seen = new Set();
  const names = [];
  for (const group of [pkg.dependencies, pkg.devDependencies]) {
    for (const name of Object.keys(group || {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function missingDependencyDirs(rootDir = ROOT_DIR) {
  return packageDependencyNames(rootDir).filter((name) => {
    return !existsSync(join(rootDir, 'node_modules', ...name.split('/')));
  });
}

export function ensureNodeDeps({
  rootDir = ROOT_DIR,
  runner = spawnSync,
  log = (message) => console.log(message),
} = {}) {
  const missingBeforeInstall = missingDependencyDirs(rootDir);
  if (missingBeforeInstall.length === 0) {
    log('      Node packages present.');
    return { installed: false, missingBeforeInstall };
  }

  const preview = missingBeforeInstall.slice(0, 6).join(', ');
  const suffix = missingBeforeInstall.length > 6 ? `, plus ${missingBeforeInstall.length - 6} more` : '';
  log(`      Missing Node packages: ${preview}${suffix}`);
  log('      Running npm install...');

  const result = runner(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm install failed with exit code ${result.status}`);
  }

  const stillMissing = missingDependencyDirs(rootDir);
  if (stillMissing.length > 0) {
    throw new Error(`npm install finished but packages are still missing: ${stillMissing.join(', ')}`);
  }

  log('      Node packages installed.');
  return { installed: true, missingBeforeInstall };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    ensureNodeDeps();
  } catch (err) {
    console.error(`      Node package check failed: ${err.message}`);
    process.exit(1);
  }
}
