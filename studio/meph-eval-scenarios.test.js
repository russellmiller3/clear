import { compileProgram } from '../index.js';
import { describe, expect, it, run } from '../lib/testUtils.js';
import { DEMO_SOURCE } from './eval-scenarios.js';

describe('Meph eval scenarios', () => {
  it('keeps the shared demo source compiling cleanly', () => {
    const result = compileProgram(DEMO_SOURCE);

    expect(result.errors).toEqual([]);
  });
});

run();
