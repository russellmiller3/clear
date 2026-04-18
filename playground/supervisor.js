// Supervisor entry point.
// Spawns N worker servers, manages session registry,
// exposes a REST/SSE API for the Supervisor panel in Studio IDE.
// Run: node playground/supervisor.js [--workers=N] [--port=3456]
//
// Does NOT modify playground/server.js.
// Each worker is a separate node process on its own port.

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';

import { SessionRegistry } from './supervisor/registry.js';
import { WorkerSpawner } from './supervisor/spawner.js';
import { SupervisorLoop } from './supervisor/loop.js';
import { FactorDB } from './supervisor/factor-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load .env
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });
}

// CLI args
const argv = process.argv.slice(2);
const workerArg = argv.find(a => a.startsWith('--workers='));
const portArg = argv.find(a => a.startsWith('--port='));
const N = parseInt(workerArg?.split('=')[1] || process.env.SUPERVISOR_WORKERS || '2');
const SUPERVISOR_PORT = parseInt(portArg?.split('=')[1] || process.env.SUPERVISOR_PORT || '3456');
const WORKER_BASE_PORT = parseInt(process.env.WORKER_BASE_PORT || '3457');
const POLL_MS = parseInt(process.env.SUPERVISOR_POLL_INTERVAL_MS || '10000');
const FACTOR_DB_PATH = process.env.FACTOR_DB_PATH || join(__dirname, 'factor-db.sqlite');
const REGISTRY_PATH = join(__dirname, 'sessions.db');

const registry = new SessionRegistry(REGISTRY_PATH);
const spawner = new WorkerSpawner(registry);
const loop = new SupervisorLoop(registry);
const factorDB = new FactorDB(FACTOR_DB_PATH);

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS for supervisor panel cross-origin requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// =============================================================================
// SUPERVISOR REST API
// =============================================================================

// Live session status stream (SSE)
app.get('/api/supervisor/status', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = () => {
    const sessions = registry.listAll();
    const dbStats = factorDB.stats();
    res.write(`data: ${JSON.stringify({ sessions, dbStats })}\n\n`);
  };

  send();
  const interval = setInterval(send, 5000);
  req.on('close', () => clearInterval(interval));
});

// Assign a task to a worker
app.post('/api/supervisor/assign', async (req, res) => {
  try {
    const { session_id, task } = req.body;
    if (!session_id || !task) return res.status(400).json({ error: 'Need session_id and task' });
    const result = await loop.assignTask(session_id, task);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kill a worker session
app.post('/api/supervisor/kill', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Need session_id' });
    await spawner.kill(session_id);
    res.json({ ok: true, session_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch a worker's current source
app.get('/api/supervisor/source/:session_id', async (req, res) => {
  try {
    const session = registry.get(req.params.session_id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const r = await fetch(`http://localhost:${session.port}/api/current-source`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Query Factor DB for similar past actions
app.get('/api/supervisor/factor-db/suggest', (req, res) => {
  try {
    const { task_type, error_sig, top_k } = req.query;
    const suggestions = factorDB.querySimilar({
      task_type: task_type || null,
      error_sig: error_sig || null,
      topK: parseInt(top_k || '5'),
    });
    const dbStats = factorDB.stats();
    res.json({ suggestions, stats: dbStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Factor DB stats
app.get('/api/supervisor/factor-db/stats', (req, res) => {
  res.json(factorDB.stats());
});

// =============================================================================
// BOOT
// =============================================================================

async function boot() {
  console.log(`[SUPERVISOR] Starting with ${N} workers on ports ${WORKER_BASE_PORT}–${WORKER_BASE_PORT + N - 1}`);
  await spawner.spawnAll(N, WORKER_BASE_PORT);
  console.log(`[SUPERVISOR] Workers ready`);

  loop.start(POLL_MS);
  console.log(`[SUPERVISOR] Poll loop started (every ${POLL_MS}ms)`);

  app.listen(SUPERVISOR_PORT, () => {
    console.log(`[SUPERVISOR] API on http://localhost:${SUPERVISOR_PORT}/api/supervisor/status`);
  });
}

boot().catch(err => {
  console.error('[SUPERVISOR] Boot failed:', err.message);
  process.exit(1);
});
