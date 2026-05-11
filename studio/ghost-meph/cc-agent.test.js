import {
  buildClaudeStreamJsonSpawnArgs,
  formatClaudeCliExitError,
} from './cc-agent.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ok ${message}`);
  } else {
    failed++;
    console.error(`  FAIL ${message}`);
  }
}

console.log('\nGhost Meph cc-agent backend');

{
  const args = buildClaudeStreamJsonSpawnArgs(
    'C:\\temp\\meph-mcp.json',
    'Say exactly OK.',
    'C:\\temp\\system-prompt.txt',
    '',
  );
  const promptIndex = args.indexOf('Say exactly OK.');
  const separatorIndex = args.indexOf('--');
  const toolsIndex = args.indexOf('--tools');

  assert(promptIndex === args.length - 1, 'prompt is the final argv item');
  assert(separatorIndex === promptIndex - 1, 'argv separator sits immediately before the prompt');
  assert(toolsIndex !== -1 && args[toolsIndex + 1] === '', 'built-in tools are still disabled');
  assert(separatorIndex > toolsIndex, 'separator prevents the tools flag from consuming the prompt');
}

{
  const message = formatClaudeCliExitError(1, 'Not logged in. Please run /login\n', '');

  assert(
    message.includes('Not logged in'),
    'nonzero CLI exits surface stdout auth failures',
  );
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
