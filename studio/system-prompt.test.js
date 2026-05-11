import { readFileSync } from 'node:fs';
import { describe, expect, it, run } from '../lib/testUtils.js';

const prompt = readFileSync(new URL('./system-prompt.md', import.meta.url), 'utf8');

describe('Meph system prompt source hygiene', () => {
  it('teaches stable saved-as input variables before payloads use form values', () => {
    expect(prompt).toContain("'Post Content' is a text area saved as post_content");
    expect(prompt).toContain("'Schedule For (YYYY-MM-DD HH:MM)' is a text input saved as scheduled_time");
    expect(prompt).toContain('never send human field labels as payload values');
  });

  it('teaches request logging whenever auth is enabled', () => {
    expect(prompt).toContain('allow signup and login');
    expect(prompt).toContain('log every request');
  });
});

run();
