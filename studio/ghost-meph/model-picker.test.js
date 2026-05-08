// =============================================================================
// Ghost Meph Model Picker Tests
// =============================================================================
// Run: node studio/ghost-meph/model-picker.test.js
// =============================================================================

import {
  publicMephModelChoices,
  resolveDefaultMephModelChoice,
  resolveMephModelChoice,
  selectedModelNeedsOpenRouterKey,
  selectChatMessagesForModel,
} from './model-picker.js';

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

console.log('\nGhost Meph model picker');

{
  const choices = publicMephModelChoices();
  assert(choices.some(choice => choice.id === 'anthropic-haiku'), 'direct Anthropic Haiku option is exposed');
  assert(choices.some(choice => choice.id === 'openrouter-claude'), 'OpenRouter Claude fallback option is exposed');
  assert(choices.some(choice => choice.id === 'openrouter-glm'), 'OpenRouter GLM option is exposed');
  assert(choices.some(choice => choice.id === 'openrouter-deepseek'), 'OpenRouter DeepSeek option is exposed');
  assert(choices.some(choice => choice.id === 'openrouter-kimi'), 'OpenRouter Kimi option is exposed');
  assert(!choices.some(choice => choice.openRouterModel), 'public choices do not leak internal routing fields');
}

{
  const direct = resolveMephModelChoice('anthropic-haiku');
  assert(direct.backend === 'anthropic', 'anthropic-haiku routes to direct Anthropic');
  assert(direct.anthropicModel === 'claude-haiku-4-5-20251001', 'anthropic-haiku pins the existing direct model');

  const claude = resolveMephModelChoice('openrouter-claude');
  assert(claude.backend === 'openrouter', 'openrouter-claude routes through OpenRouter');
  assert(claude.openRouterModel === '~anthropic/claude-sonnet-latest', 'openrouter-claude uses OpenRouter Claude latest');

  const glm = resolveMephModelChoice('openrouter-glm');
  assert(glm.openRouterModel === 'z-ai/glm-4.5', 'openrouter-glm uses GLM 4.5');

  const deepseek = resolveMephModelChoice('openrouter-deepseek');
  assert(deepseek.openRouterModel === 'deepseek/deepseek-v4-flash', 'openrouter-deepseek uses DeepSeek V4 Flash');

  const kimi = resolveMephModelChoice('openrouter-kimi');
  assert(kimi.openRouterModel === '~moonshotai/kimi-latest', 'openrouter-kimi uses Kimi latest');
}

{
  assert(
    resolveDefaultMephModelChoice({ ANTHROPIC_API_KEY: 'sk-ant' }) === 'anthropic-haiku',
    'default stays direct Anthropic when Anthropic key exists',
  );
  assert(
    resolveDefaultMephModelChoice({ OPENROUTER_API_KEY: 'sk-or' }) === 'openrouter-deepseek',
    'default switches to cheap OpenRouter DeepSeek when only OpenRouter key exists',
  );
  assert(
    resolveMephModelChoice('not-a-choice').id === 'anthropic-haiku',
    'unknown picker value falls back to safe direct Anthropic default',
  );
  assert(
    selectedModelNeedsOpenRouterKey(resolveMephModelChoice('openrouter-glm'), { ghostActive: false }),
    'OpenRouter picker choice requires OpenRouter key when Ghost Meph is not forcing a backend',
  );
  assert(
    !selectedModelNeedsOpenRouterKey(resolveMephModelChoice('openrouter-glm'), { ghostActive: true }),
    'Ghost Meph env override wins over saved OpenRouter picker choice',
  );
}

{
  const messages = Array.from({ length: 75 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i + 1}`,
  }));

  const normal = selectChatMessagesForModel(messages, { modelChanged: false, limit: 50 });
  assert(normal.length === 50, 'unchanged model keeps normal bounded history');
  assert(normal[0].content === 'message 26', 'unchanged model keeps the newest bounded window');

  const changed = selectChatMessagesForModel(messages, { modelChanged: true, limit: 50 });
  assert(changed.length === 75, 'changed model keeps the full chat history');
  assert(changed[0].content === 'message 1', 'changed model includes the oldest message too');
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
