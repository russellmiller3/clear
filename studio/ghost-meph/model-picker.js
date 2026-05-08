const DEFAULT_DIRECT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OPENROUTER_CHEAP_MODEL = 'deepseek/deepseek-v4-flash';

const MODEL_CHOICES = [
  {
    id: 'anthropic-haiku',
    label: 'Claude Haiku',
    backend: 'anthropic',
    anthropicModel: DEFAULT_DIRECT_MODEL,
    needs: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'openrouter-claude',
    label: 'OpenRouter Claude',
    backend: 'openrouter',
    openRouterModel: '~anthropic/claude-sonnet-latest',
    needs: 'OPENROUTER_API_KEY',
  },
  {
    id: 'openrouter-glm',
    label: 'OpenRouter GLM',
    backend: 'openrouter',
    openRouterModel: 'z-ai/glm-4.5',
    needs: 'OPENROUTER_API_KEY',
  },
  {
    id: 'openrouter-deepseek',
    label: 'OpenRouter DeepSeek',
    backend: 'openrouter',
    openRouterModel: DEFAULT_OPENROUTER_CHEAP_MODEL,
    needs: 'OPENROUTER_API_KEY',
  },
  {
    id: 'openrouter-kimi',
    label: 'OpenRouter Kimi',
    backend: 'openrouter',
    openRouterModel: '~moonshotai/kimi-latest',
    needs: 'OPENROUTER_API_KEY',
  },
];

export function publicMephModelChoices() {
  return MODEL_CHOICES.map(({ id, label, backend, needs }) => ({
    id,
    label,
    backend,
    needs,
  }));
}

export function resolveMephModelChoice(id) {
  return MODEL_CHOICES.find(choice => choice.id === id) || MODEL_CHOICES[0];
}

export function resolveDefaultMephModelChoice(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return 'anthropic-haiku';
  if (env.OPENROUTER_API_KEY) return 'openrouter-deepseek';
  return 'anthropic-haiku';
}

export function selectedModelNeedsOpenRouterKey(selectedModel, { ghostActive = false } = {}) {
  return !ghostActive && selectedModel?.backend === 'openrouter';
}

export function selectChatMessagesForModel(messages, { modelChanged = false, limit = 50 } = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (modelChanged) return safeMessages;
  return safeMessages.slice(-limit);
}
