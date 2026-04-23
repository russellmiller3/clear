import { spawn, execFileSync } from 'child_process';
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

    // Forward observability lines to the parent's stdout with a worker prefix.
    // Without this, worker [cache]/[hints]/[hint-usage] telemetry vanished —
    // making sweeps invisible to anyone grading retrieval behavior at scale.
    // Rest of the worker's chatter is dropped so sweep logs stay scannable.
    let _buf = '';
    child.stdout.on('data', (chunk) => {
      _buf += chunk.toString();
      const lines = _buf.split('\n');
      _buf = lines.pop();
      for (const line of lines) {
        if (/\[cache\]|\[hints\]|\[hint-usage\]/.test(line)) {
          process.stdout.write(`[${sessionId}] ${line}\n`);
        }
      }
    });
    child.stderr.on('data', () => {}); // stderr stays suppressed

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
      // On Windows, child.kill('SIGTERM') is a no-op for native .exe
      // processes — the signal doesn't propagate and grandchild
      // processes (the claude.exe subprocesses each worker spawns via
      // cc-agent) keep running indefinitely. Use `taskkill /F /T /PID`
      // to forcibly kill the whole process tree rooted at the worker.
      //
      // On POSIX, SIGTERM cascades to children if they're in the same
      // process group — keep the existing behavior.
      try {
        if (process.platform === 'win32' && child.pid) {
          try {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
              stdio: 'ignore',
              timeout: 5000,
            });
          } catch {
            // taskkill throws if the process already exited — safe to ignore.
            // Fall back to child.kill() in case taskkill itself is missing.
            try { child.kill('SIGTERM'); } catch {}
          }
        } else {
          child.kill('SIGTERM');
        }
      } catch {}
      this._registry.update(sessionId, { state: 'crashed' });
    }
    this._workers.clear();
    // Brief wait to let OS reclaim ports
    await new Promise(r => setTimeout(r, 200));
  }
}
