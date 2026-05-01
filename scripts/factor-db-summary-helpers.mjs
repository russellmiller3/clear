export const HELPFUL_HINT_VALUES = ['yes', 'partial', 'inferred'];

export function isHelpfulHintValue(value) {
  return HELPFUL_HINT_VALUES.includes(String(value || '').toLowerCase());
}

export function hintHelpfulSql(column = 'hint_helpful') {
  const quoted = HELPFUL_HINT_VALUES.map((value) => `'${value}'`).join(', ');
  return `${column} IN (${quoted})`;
}
