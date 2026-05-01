export function serverInjectedHints(hintLine) {
  if (!hintLine || hintLine === '(no hints injected)') return false;
  const retrieved = hintLine.match(/retrieved=(\d+)/);
  return !!(retrieved && Number(retrieved[1]) > 0);
}

export function serverHintTier(hintLine) {
  if (!serverInjectedHints(hintLine)) return 'none';

  const exactTier = hintLine.match(/top_tier=(\S+)/);
  if (exactTier) return exactTier[1];

  const shapeTier = hintLine.match(/shape_match\b.*?top_archetype=(\S+)/);
  if (shapeTier) return `shape_match:${shapeTier[1]}`;

  return 'unknown';
}
