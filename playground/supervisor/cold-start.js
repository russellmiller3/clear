// Cold-start the Factor DB.
//
// Two passes:
//   1. Core templates — compile each, infer task_type, log as compile_ok=1.
//      These are the gold rows: known-good Clear code for common archetypes.
//   2. Curriculum skeletons — compile each skeleton, log errors as error_sig.
//      These capture common failure patterns before Meph has seen them.
//
// Run: node playground/supervisor/cold-start.js

import { compileProgram } from '../../index.js';
import { parse } from '../../parser.js';
import { FactorDB } from './factor-db.js';
import { classifyArchetype } from './archetype.js';
import { tasks } from '../../curriculum/index.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const APPS_DIR = join(ROOT, 'apps');
const DB_PATH = join(__dirname, '..', 'factor-db.sqlite');

function sha1(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// Infer task_type from app name — maps to the error categories the re-ranker will use
function inferTaskType(appName) {
  const map = {
    // Marcus 5
    'approval-queue': 'add_approval_flow',
    'lead-router': 'add_routing_rules',
    'onboarding-tracker': 'add_multistep_workflow',
    'support-triage': 'add_ai_classification',
    'internal-request-queue': 'add_request_triage',
    // Core 8
    'todo-fullstack': 'add_crud',
    'crm-pro': 'add_dashboard',
    'blog-fullstack': 'add_content_app',
    'live-chat': 'add_realtime',
    'helpdesk-agent': 'add_agent',
    'booking': 'add_workflow',
    'expense-tracker': 'add_personal_crud',
    'ecom-agent': 'add_ecommerce',
  };
  return map[appName] || 'general';
}

function inferTaskTypeFromLevel(level) {
  if (level <= 2) return 'add_endpoint';
  if (level <= 4) return 'add_crud';
  if (level <= 6) return 'add_auth';
  if (level <= 8) return 'add_validation';
  return 'add_agent';
}

async function run() {
  const db = new FactorDB(DB_PATH);
  let inserted = 0;

  // =========================================================================
  // Pass 1: Core templates (compile_ok=1 gold rows)
  // =========================================================================
  console.log('\n=== Pass 1: Core templates ===\n');

  const templateNames = [
    // Marcus 5 — business ops
    'approval-queue', 'lead-router', 'onboarding-tracker',
    'support-triage', 'internal-request-queue',
    // Core 8
    'todo-fullstack', 'crm-pro', 'blog-fullstack', 'live-chat',
    'helpdesk-agent', 'booking', 'expense-tracker', 'ecom-agent',
  ];

  for (const name of templateNames) {
    const clearPath = join(APPS_DIR, name, 'main.clear');
    let source;
    try {
      source = readFileSync(clearPath, 'utf8');
    } catch {
      console.log(`  SKIP ${name} — main.clear not found`);
      continue;
    }

    const result = compileProgram(source);
    const compileOk = result.errors.length === 0 ? 1 : 0;
    const errorSig = result.errors.length > 0
      ? sha1(result.errors.map(e => e.message).join('\n') + '\x00' + sha1(source))
      : null;

    let archetype = 'general';
    try { archetype = classifyArchetype(parse(source)); } catch {}

    const id = db.logAction({
      session_id: 'cold-start',
      task_type: inferTaskType(name),
      archetype,
      error_sig: errorSig,
      file_state_hash: sha1(source),
      source_before: source.slice(0, 5000),
      patch_ops: [],
      patch_summary: `Cold-start seed: ${name} template (${source.split('\n').length} lines)`,
      compile_ok: compileOk,
      test_pass: compileOk,
      test_score: compileOk ? 1.0 : 0.0,
      score_delta: 0.0,
    });

    const errStr = result.errors.length > 0 ? ` — ${result.errors.length} errors` : ' — clean';
    console.log(`  ${compileOk ? '✅' : '❌'} ${name} [${archetype}]${errStr} (row ${id})`);
    inserted++;
  }

  // =========================================================================
  // Pass 2: Curriculum skeletons (compile attempts — mostly partial/failing)
  // =========================================================================
  console.log('\n=== Pass 2: Curriculum skeletons ===\n');

  for (const task of tasks) {
    const source = task.skeleton || `build for javascript backend\n\n# ${task.title}\n`;
    const result = compileProgram(source);
    const compileOk = result.errors.length === 0 ? 1 : 0;
    const errorSig = result.errors.length > 0
      ? sha1(result.errors.map(e => e.message).join('\n') + '\x00' + sha1(source))
      : null;

    let archetype = 'general';
    try { archetype = classifyArchetype(parse(source)); } catch {}

    const id = db.logAction({
      session_id: 'cold-start',
      task_type: inferTaskTypeFromLevel(task.level),
      archetype,
      error_sig: errorSig,
      file_state_hash: sha1(source),
      source_before: source,
      patch_ops: [],
      patch_summary: `Cold-start seed: L${task.level} skeleton — ${task.title}`,
      compile_ok: compileOk,
      test_pass: 0,
      test_score: 0.0,
      score_delta: 0.0,
    });

    const errStr = result.errors.length > 0 ? ` — ${result.errors.length} errors` : ' — clean skeleton';
    console.log(`  ${compileOk ? '✅' : '⚠️ '} L${task.level} ${task.id} [${archetype}]${errStr} (row ${id})`);
    inserted++;
  }

  // =========================================================================
  // Summary
  // =========================================================================
  const stats = db.stats();
  console.log('\n=== Factor DB stats ===\n');
  console.log(`  Total rows:   ${stats.total}`);
  console.log(`  Passing rows: ${stats.passing}  (compile_ok=1 AND test_pass=1)`);
  console.log(`  Inserted:     ${inserted}`);
  console.log(`  DB path:      ${DB_PATH}`);
  console.log('\nCold start complete. BM25 retrieval available immediately.');
  console.log(`Re-ranker training unlocks at 200 passing rows (have ${stats.passing}).`);

  db.close();
}

run().catch(err => {
  console.error('Cold start failed:', err.message);
  process.exit(1);
});
