export class SupervisorLoop {
  constructor(registry) {
    this._registry = registry;
    this._interval = null;
  }

  // Poll a single worker session — fetch heartbeat + terminal log, update registry
  async pollOne(sessionId) {
    const session = this._registry?.get(sessionId);
    if (!session) return null;

    let heartbeat = null;
    let terminalLines = [];

    try {
      const hbRes = await fetch(`http://localhost:${session.port}/api/worker-heartbeat`);
      if (hbRes.ok) heartbeat = await hbRes.json();
    } catch { /* worker not reachable — may be starting */ }

    try {
      const termRes = await fetch(`http://localhost:${session.port}/api/terminal-log`);
      if (termRes.ok) {
        const data = await termRes.json();
        terminalLines = data.lines || [];
      }
    } catch { /* ignore */ }

    // State machine transitions
    if (heartbeat && this._registry) {
      const updates = { updated_at: Date.now() };

      if (this.detectComplete(terminalLines)) {
        updates.state = 'completed';
        updates.completed_at = Date.now();
      } else if (this.detectStuck(terminalLines)) {
        const current = this._registry.get(sessionId);
        const stall = (current?.stall_count || 0) + 1;
        updates.stall_count = stall;
        updates.state = stall >= 3 ? 'stalled' : session.state;
      }

      if (Object.keys(updates).length > 0) {
        this._registry.update(sessionId, updates);
      }
    }

    return { heartbeat, terminalLines };
  }

  // Detect "TASK COMPLETE" signal in terminal output
  detectComplete(lines) {
    return lines.some(l => l.includes('TASK COMPLETE'));
  }

  // Detect "STUCK:" signal in terminal output
  detectStuck(lines) {
    return lines.some(l => l.includes('STUCK:'));
  }

  // Poll all active sessions on a recurring interval
  start(intervalMs = 10000) {
    if (this._interval) return;
    this._interval = setInterval(async () => {
      if (!this._registry) return;
      const active = this._registry.listActive();
      await Promise.allSettled(active.map(s => this.pollOne(s.id)));
    }, intervalMs);
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  // Assign a task to a worker session by POSTing to its /api/chat
  async assignTask(sessionId, task) {
    const session = this._registry?.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    this._registry.update(sessionId, { state: 'running', task, assigned_at: Date.now() });
    this._registry.log(sessionId, 'assign', `Assigned task: ${task.slice(0, 100)}`);

    // Fire-and-forget: POST to worker chat (SSE response — we don't wait for completion)
    fetch(`http://localhost:${session.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: task }] }),
    }).catch(() => {}); // supervisor will observe progress via polling

    return { ok: true, sessionId, task };
  }

  // Send a hint to a stuck worker by adding a message to its chat
  async nudge(sessionId, hint) {
    const session = this._registry?.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    this._registry.log(sessionId, 'nudge', hint);

    fetch(`http://localhost:${session.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: hint }] }),
    }).catch(() => {});

    return { ok: true };
  }

  // SSE status stream — sends registry snapshot every 5s
  statusSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = () => {
      const sessions = this._registry?.listAll() || [];
      res.write(`data: ${JSON.stringify({ sessions })}\n\n`);
    };

    send();
    const interval = setInterval(send, 5000);
    req.on('close', () => clearInterval(interval));
  }
}
