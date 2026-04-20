// Hint-flow verification across 5 archetypes. Spawns a server, feeds Meph
// intentionally-broken Clear code for each scenario, and asks him to BOTH
// announce hint tier + reflect on usefulness. Cross-checks his self-report
// against the [hints] server log so we can spot silent disagreements.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node playground/supervisor/verify-hint-flow.js
//
// Cost: ~$0.25-0.35 on Haiku 4.5. Time: ~3-5 min.

import { spawn } from 'child_process';
import { appendFileSync, writeFileSync, readFileSync } from 'fs';

const PORT = 3489;
const BASE = `http://localhost:${PORT}`;
const LOG = '/tmp/verify-hint-flow.log';

// Scenarios: each aims at a specific archetype with a realistic compile error.
// We don't require an exact classifier match — we capture whatever tier fires
// and let Meph report on what he saw.
const SCENARIOS = [
  {
    name: 'api_service: missing body decl',
    source: `build for javascript backend

when user calls POST /api/todo:
  create a todo:
    title is body's title
  send back 'saved'
`,
  },
  {
    name: 'crud_app: bad field access',
    source: `build for javascript backend with html frontend

table Notes:
  title is text
  body is text

when user calls GET /api/notes:
  list = all Notes
  send back list

when user calls POST /api/notes:
  note_data is the request data
  save note_data to Notes
  send back note_data

page Home:
  show Notes's titles for every row
`,
  },
  {
    name: 'agent_workflow: undefined skill',
    source: `build for javascript backend

agent Helper:
  can use weather_tool
  remember conversation

when user calls POST /api/ask:
  question is the request data
  answer = ask Helper question
  send back answer
`,
  },
  {
    name: 'dashboard: aggregate without table',
    source: `build for javascript backend with html frontend

table Sales:
  amount is number
  region is text

page Overview:
  show bar chart of Sales grouped by region as revenue_chart
  show pie chart of Sales grouped by region as region_chart
  total_rev = sum of amounts where amount > 100
  show total_rev
`,
  },
  {
    name: 'queue_workflow: bad subscribe target',
    source: `build for javascript backend

when user calls POST /api/broadcast:
  message is the request data
  broadcast message to all
  send back 'sent'

when user subscribes to updates:
  send last 10 messages from undefined_log
`,
  },
];

const PROMPT_TEMPLATE = (source) => `I wrote this Clear code and it has a compile error. Please:

1. Call the compile tool to see the error.
2. If the compile result includes a 'hints' field with past-fix references, ANNOUNCE what you saw using this exact format before fixing:
   HINTS: saw <N> references, top tier=<tier label>, <one-sentence opinion on whether they look useful>
3. If hints were NOT included, say: HINTS: none
4. Then fix the code and show me the corrected version.
5. Finish with: WAS_HINT_HELPFUL: yes / no / partial  —  <one-sentence reason>

Be honest. If the hints were irrelevant, misleading, or pointed at the wrong problem, say so.

Code:
\`\`\`clear
${source}
\`\`\`
`;

async function waitForServer(maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/templates`, { signal: AbortSignal.timeout(800) });
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server did not come up in 15s');
}

async function askMeph(userPrompt, editorContent) {
  const body = JSON.stringify({
    messages: [{ role: 'user', content: userPrompt }],
    apiKey: process.env.ANTHROPIC_API_KEY,
    personality: '',
    editorContent,
    errors: [],
    webTools: false,
  });
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);

  let finalText = '';
  const toolCalls = [];
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === 'tool_start' && ev.name) {
        toolCalls.push(ev.name);
      } else if (ev.type === 'text' && typeof ev.delta === 'string') {
        finalText += ev.delta;
      } else if (ev.type === 'text' && typeof ev.text === 'string') {
        finalText += ev.text;
      }
    }
  }
  return { finalText, toolCalls };
}

// Parse the structured self-report out of Meph's text
function parseSelfReport(text) {
  const announced = text.match(/HINTS:\s*([^\n]+)/i);
  const opinion = text.match(/WAS_HINT_HELPFUL:\s*([^\n]+)/i);
  return {
    announced: announced ? announced[1].trim() : null,
    opinion: opinion ? opinion[1].trim() : null,
    sawHintsSelf: !!(announced && !/^none/i.test(announced[1].trim())),
  };
}

// Read the LAST [hints] log line emitted during this scenario.
// Each scenario is serial, so after its turn completes the newest [hints]
// entry (if any) belongs to it.
function readLastHintsLine(logContentAtScenarioStart, fullLog) {
  const delta = fullLog.slice(logContentAtScenarioStart.length);
  const hintLines = delta.split('\n').filter(l => l.includes('[hints]'));
  return hintLines.length > 0 ? hintLines[hintLines.length - 1].trim() : null;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }
  try { writeFileSync(LOG, ''); } catch {}
  console.log(`Starting server on :${PORT}...`);
  const server = spawn('node', ['playground/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { try { appendFileSync(LOG, d); } catch {} });
  server.stderr.on('data', d => { try { appendFileSync(LOG, d); } catch {} });

  const results = [];
  let anyWeirdness = false;

  try {
    await waitForServer();
    console.log('Server ready.\n');

    for (let i = 0; i < SCENARIOS.length; i++) {
      const scn = SCENARIOS[i];
      console.log(`[${i + 1}/${SCENARIOS.length}] ${scn.name}`);
      const logBefore = readFileSync(LOG, 'utf8');
      const t0 = Date.now();
      let outcome;
      try {
        const { finalText, toolCalls } = await askMeph(PROMPT_TEMPLATE(scn.source), scn.source);
        const dur = ((Date.now() - t0) / 1000).toFixed(1);

        // Let server flush
        await new Promise(r => setTimeout(r, 400));
        const logNow = readFileSync(LOG, 'utf8');
        const hintLine = readLastHintsLine(logBefore, logNow);
        const selfReport = parseSelfReport(finalText);

        // Compute agreement: did Meph self-report hints iff server actually injected them?
        // A log line with retrieved=0 is NOT injection — nothing reaches Meph's tool result.
        const retrievedMatch = hintLine && hintLine.match(/retrieved=(\d+)/);
        const serverInjected = !!(retrievedMatch && Number(retrievedMatch[1]) > 0);
        const agreement = serverInjected === selfReport.sawHintsSelf ? 'ok' : 'MISMATCH';
        const weird = serverInjected !== selfReport.sawHintsSelf;
        if (weird) anyWeirdness = true;

        outcome = {
          name: scn.name,
          dur,
          serverHint: hintLine || '(no hints injected)',
          announced: selfReport.announced || '(no announcement parsed)',
          opinion: selfReport.opinion || '(no opinion parsed)',
          agreement,
          toolCalls: toolCalls.join(', ') || '(none)',
          responseSample: finalText.slice(0, 300).replace(/\n/g, ' '),
          errorBail: null,
        };
        console.log(`   server says: ${outcome.serverHint}`);
        console.log(`   meph says:   ${outcome.announced}`);
        console.log(`   was helpful: ${outcome.opinion}`);
        console.log(`   consistency: ${outcome.agreement}  (${dur}s, tools=[${outcome.toolCalls}])`);
      } catch (err) {
        anyWeirdness = true;
        outcome = { name: scn.name, errorBail: err.message };
        console.log(`   threw: ${err.message}`);
      }
      results.push(outcome);
      console.log('');
    }

    // Summary
    console.log('═'.repeat(72));
    console.log('SUMMARY');
    console.log('═'.repeat(72));
    for (const r of results) {
      const tier = r.serverHint ? (r.serverHint.match(/top_tier=(\S+)/)?.[1] || 'none') : 'bail';
      const announce = (r.announced || '-').replace(/\s+/g, ' ').slice(0, 45);
      console.log(`  ${r.name.padEnd(38)} tier=${tier.padEnd(26)} [${r.agreement}]`);
      console.log(`    announce: "${announce}"`);
      console.log(`    helpful:  "${(r.opinion || '-').replace(/\s+/g, ' ').slice(0, 60)}"`);
    }
    console.log('═'.repeat(72));

    // Cache hit rate during this broader run
    const fullLog = readFileSync(LOG, 'utf8');
    const cacheLines = fullLog.split('\n').filter(l => l.includes('[cache]'));
    let totalRead = 0, totalWrite = 0, totalFresh = 0;
    for (const line of cacheLines) {
      const m = line.match(/read=(\d+) write=(\d+) fresh=(\d+)/);
      if (m) { totalRead += +m[1]; totalWrite += +m[2]; totalFresh += +m[3]; }
    }
    const totalInput = totalRead + totalWrite + totalFresh;
    console.log(`\nCache across ${cacheLines.length} turns: ${totalRead.toLocaleString()} read, ${totalWrite.toLocaleString()} write, ${totalFresh.toLocaleString()} fresh. Hit rate: ${totalInput ? ((totalRead / totalInput) * 100).toFixed(1) : 0}%`);

    console.log(`\nAny weirdness: ${anyWeirdness ? 'YES — review per-scenario above' : 'none'}`);
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  process.exit(anyWeirdness ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
