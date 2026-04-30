// Build a copy-pasteable failure packet for Clear compile errors.
// The trace is deterministic so tests, users, and agents all see the same shape.

const DEFAULT_CONTEXT_RADIUS = 2;
const DEFAULT_MAX_SOURCE_CHARS = 20000;
const DEFAULT_MAX_SOURCE_LINES = 300;

function sourceLines(source) {
  return String(source || '').split(/\r?\n/);
}

function formatSourceLine(lineNumber, text, selected = false) {
  const marker = selected ? '>' : ' ';
  return `${marker} ${String(lineNumber).padStart(4, ' ')} | ${text}`;
}

function contextForLine(lines, lineNumber, radius) {
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) {
    return [];
  }
  const start = Math.max(1, lineNumber - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  const context = [];
  for (let n = start; n <= end; n++) {
    context.push({
      line: n,
      text: lines[n - 1],
      selected: n === lineNumber,
    });
  }
  return context;
}

function normalizeMessage(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value.message || value);
}

function normalizeError(error, index, lines, radius) {
  const rawLine = Number(error?.line);
  const line = Number.isInteger(rawLine) && rawLine > 0 ? rawLine : null;
  return {
    index: index + 1,
    line,
    message: normalizeMessage(error),
    sourceLine: line ? (lines[line - 1] || '') : '',
    context: contextForLine(lines, line, radius),
  };
}

function formatContexts(errors) {
  const seen = new Set();
  const chunks = [];
  for (const error of errors) {
    if (!error.context.length) continue;
    const key = error.context.map(line => line.line).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push(error.context.map(line => formatSourceLine(line.line, line.text, line.selected)).join('\n'));
  }
  return chunks.join('\n\n');
}

function formatFullSource(lines) {
  return lines.map((text, idx) => formatSourceLine(idx + 1, text, false)).join('\n');
}

function buildPasteText(trace) {
  const parts = [
    'CLEAR COMPILE TRACE v1',
    'Please fix this Clear compilation failure. Decide whether the fix belongs in the Clear source or the compiler.',
    '',
    'Repair instructions:',
    '- If the Clear source is wrong, return corrected Clear source.',
    '- If the compiler/parser/validator is wrong, fix that layer and add a regression test.',
    '- Do not edit generated output directly. Recompile after the fix.',
    '',
    `Source: ${trace.sourceName}`,
    `Target: ${trace.target}`,
    `Source lines: ${trace.sourceLineCount}`,
    `Errors: ${trace.errorCount}`,
    '',
    'Errors:',
    ...trace.errors.map(error => `${error.index}. Line ${error.line || '?'}: ${error.message}`),
  ];

  const contexts = formatContexts(trace.errors);
  if (contexts) {
    parts.push('', 'Error context:', '~~~clear', contexts, '~~~');
  }

  if (trace.fullSourceIncluded) {
    parts.push('', 'Full Clear source:', '~~~clear', trace.fullSource, '~~~');
  } else {
    parts.push('', `Full source omitted: ${trace.sourceLineCount} lines / ${trace.sourceCharCount} chars. Attach the .clear file if the context above is not enough.`);
  }

  if (trace.warnings.length) {
    parts.push('', 'Warnings:', ...trace.warnings.map((warning, idx) => `${idx + 1}. ${warning}`));
  }

  parts.push('', 'END CLEAR COMPILE TRACE');
  return parts.join('\n');
}

export function buildCompileTrace(source, compileResult = {}, options = {}) {
  const errors = compileResult.errors || [];
  if (!errors.length) return null;

  const lines = sourceLines(source);
  const radius = options.traceContextRadius ?? DEFAULT_CONTEXT_RADIUS;
  const maxChars = options.traceMaxSourceChars ?? DEFAULT_MAX_SOURCE_CHARS;
  const maxLines = options.traceMaxSourceLines ?? DEFAULT_MAX_SOURCE_LINES;
  const fullSourceIncluded = String(source || '').length <= maxChars && lines.length <= maxLines;

  const trace = {
    version: 1,
    ok: false,
    sourceName: options.sourceName || options.filePath || options.filename || 'unsaved Clear program',
    target: options.target || 'auto',
    sourceLineCount: lines.length,
    sourceCharCount: String(source || '').length,
    errorCount: errors.length,
    warningCount: (compileResult.warnings || []).length,
    errors: errors.map((error, index) => normalizeError(error, index, lines, radius)),
    warnings: (compileResult.warnings || []).map(normalizeMessage),
    fullSourceIncluded,
    fullSource: fullSourceIncluded ? formatFullSource(lines) : '',
  };

  trace.pasteText = buildPasteText(trace);
  return trace;
}
