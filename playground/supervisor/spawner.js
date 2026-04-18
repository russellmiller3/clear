import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server.js');

// Check that a port is not already in use before spawning
function isPortFree(port) {
  return new Promise(resolve => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

export class WorkerSpawner {
  constructor(registry) {
    this._registry = registry;
    this._workers = new Map(); // sessionId → child process
  }

  async spawn(port, sessionId) {
    const free = await isPortFree(port);
    if (!free) throw new Error(`Port ${port} is already in use`);

    const child = spawn('node', [SERVER_PATH, `--port=${port}`, `--session-id=${sessionId}`], {
      stdio: 'pipe',
      env: { ...process.env, PORT: String(port), SESSION_ID: sessionId },
    });

    child.stderr.on('data', () => {}); // suppress — worker logs to its own terminal
    child.stdout.on('data', () => {});

    this._workers.set(sessionId, { child, port });

    // Register in session registry
    this._registry.create({ id: sessionId, port, state: 'idle', pid: child.pid });

    return child;
  }

  // Spawn N workers starting at basePort (default 3457)
  async spawnAll(n, basePort = 3457) {
    const promises = [];
    for (let i = 0; i < n; i++) {
      const port = basePort + i;
      const sessionId = `worker-${i + 1}`;
      promises.push(this.spawn(port, sessionId));
    }
    await Promise.all(promises);
  }

  async killAll() {
    for (const [sessionId, { child }] of this._workers) {
      try { child.kill('SIGTERM'); } catch {}
      this._registry.update(sessionId, { state: 'crashed' });
    }
    this._workers.clear();
    // Brief wait to let OS reclaim ports
    await new Promise(r => setTimeout(r, 200));
  }
}
