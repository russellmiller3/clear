#!/usr/bin/env node
// UserPromptSubmit hook — nudges Claude to invoke /introspect every 20 user
// messages or 30 minutes, whichever comes first. Resets when introspect runs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const STATE_PATH = '.claude/state/introspect-state.json';
const MESSAGE_THRESHOLD = 20;
const MINUTE_THRESHOLD = 30;

function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return { messageCount: 0, lastIntrospectAt: Date.now() };
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { messageCount: 0, lastIntrospectAt: Date.now() };
  }
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
    // Silent — never crash the conversation
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try { payload = JSON.parse(input); } catch { payload = {}; }
  const userPrompt = String(payload.user_prompt || payload.prompt || '');

  const state = loadState();

  if (/\/introspect|step back|are we on (the right )?track|zoom out/i.test(userPrompt)) {
    saveState({ messageCount: 0, lastIntrospectAt: Date.now() });
    process.exit(0);
  }

  state.messageCount = (state.messageCount || 0) + 1;
  const minutesElapsed = (Date.now() - (state.lastIntrospectAt || Date.now())) / 60000;

  const overMessages = state.messageCount >= MESSAGE_THRESHOLD;
  const overMinutes = minutesElapsed >= MINUTE_THRESHOLD;

  if (overMessages || overMinutes) {
    const reason = overMessages
      ? `${state.messageCount} user messages since last step-back`
      : `${Math.round(minutesElapsed)} minutes since last step-back`;
    const note = `Long session detected (${reason}). Consider invoking /introspect to re-ground against the critical path before opening more work.`;
    process.stdout.write(JSON.stringify({
      decision: 'approve',
      additional_context: note,
    }));
  }

  saveState(state);
  process.exit(0);
}

main().catch(() => process.exit(0));
