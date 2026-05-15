import { compileProgram } from '../index.js';
import { readFileSync } from 'fs';

const marcus_apps = ['deal-desk', 'approval-queue', 'internal-request-queue', 'onboarding-tracker', 'lead-router'];
let all_clean = true;
for (const app_name of marcus_apps) {
  const app_source = readFileSync(`apps/${app_name}/main.clear`, 'utf8');
  const compiled = compileProgram(app_source);
  const status = compiled.errors.length === 0 ? 'OK' : 'FAIL';
  console.log(`${status} ${app_name}: ${compiled.errors.length} errors, ${compiled.warnings.length} warnings`);
  if (compiled.errors.length) {
    compiled.errors.forEach(e => console.log(`   ERR [line ${e.line}]: ${e.message}`));
    all_clean = false;
  }
  if (compiled.warnings.length) {
    compiled.warnings.forEach(w => console.log(`   WARN: ${w.kind} — ${w.message || ''}`));
  }
}
console.log(all_clean ? '\nAll 5 Marcus apps compile clean.' : '\nSome apps have errors.');
