function increment(map, key, by = 1) {
  const k = String(key || 'unknown');
  map[k] = (map[k] || 0) + by;
}

function sortedEntriesObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function previewSource(source) {
  return String(source || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ')
    .slice(0, 160);
}

function issueForPrimitive(row) {
  const source = String(row.source || '');
  const trimmed = source.trim();
  if (!trimmed) return 'emptySource';
  const nonblank = trimmed.split(/\r?\n/).filter(line => line.trim());
  if (/^layout:/i.test(nonblank[0] || '') || /^\+[-+]+\+/.test(nonblank[0] || '')) return 'layoutOnly';
  if (nonblank.length > 40) return 'tooLong';
  if (String(row.pattern_kind || '') === 'page' && nonblank.length <= 1) return 'thinPage';
  return null;
}

export function analyzePrimitiveRows({ appRows = [], primitives = [] } = {}) {
  const byPatternSet = {};
  const byKind = {};
  const parentMap = new Map();
  const examplesByKind = {};
  const issueCounts = {};
  const issues = [];

  for (const row of primitives) {
    increment(byPatternSet, row.pattern_set);
    increment(byKind, row.pattern_kind);

    const parent = String(row.parent_template_name || row.template_name || 'unknown');
    if (!parentMap.has(parent)) {
      parentMap.set(parent, {
        parent_template_name: parent,
        pattern_set: row.pattern_set || 'unknown',
        primitive_count: 0,
        by_kind: {},
      });
    }
    const parentRecord = parentMap.get(parent);
    parentRecord.primitive_count += 1;
    increment(parentRecord.by_kind, row.pattern_kind);

    const kind = String(row.pattern_kind || 'unknown');
    if (!examplesByKind[kind]) examplesByKind[kind] = [];
    if (examplesByKind[kind].length < 3) {
      examplesByKind[kind].push({
        template_name: row.template_name,
        parent_template_name: row.parent_template_name || null,
        source_start_line: row.source_start_line || null,
        preview: previewSource(row.source),
      });
    }

    const issue = issueForPrimitive(row);
    if (issue) {
      increment(issueCounts, issue);
      issues.push({
        issue,
        template_name: row.template_name,
        parent_template_name: row.parent_template_name || null,
        pattern_set: row.pattern_set || 'unknown',
        pattern_kind: row.pattern_kind || 'unknown',
        source_start_line: row.source_start_line || null,
        preview: previewSource(row.source),
      });
    }
  }

  const byParent = [...parentMap.values()]
    .map(row => ({ ...row, by_kind: sortedEntriesObject(row.by_kind) }))
    .sort((a, b) => {
      if (b.primitive_count !== a.primitive_count) return b.primitive_count - a.primitive_count;
      return a.parent_template_name.localeCompare(b.parent_template_name);
    });

  return {
    totals: {
      appRows: appRows.length,
      primitiveRows: primitives.length,
      parents: byParent.length,
      kinds: Object.keys(byKind).length,
      issues: issues.length,
    },
    byPatternSet: sortedEntriesObject(byPatternSet),
    byKind: sortedEntriesObject(byKind),
    byParent,
    issueCounts: sortedEntriesObject(issueCounts),
    issues,
    examplesByKind: Object.fromEntries(
      Object.entries(examplesByKind).sort((a, b) => a[0].localeCompare(b[0]))
    ),
  };
}

export function formatPrimitiveAudit(report) {
  const lines = [];
  lines.push('Primitive Pattern Audit');
  lines.push('');
  lines.push(`app rows: ${report.totals.appRows}`);
  lines.push(`primitive rows: ${report.totals.primitiveRows}`);
  lines.push(`parents: ${report.totals.parents}`);
  lines.push(`kinds: ${report.totals.kinds}`);
  lines.push(`issues: ${report.totals.issues}`);

  lines.push('');
  lines.push('By pattern set:');
  for (const [set, count] of Object.entries(report.byPatternSet)) {
    lines.push(`- ${set}: ${count}`);
  }

  lines.push('');
  lines.push('By primitive kind:');
  for (const [kind, count] of Object.entries(report.byKind)) {
    lines.push(`- ${kind}: ${count}`);
  }

  lines.push('');
  lines.push('Top parents:');
  for (const parent of report.byParent.slice(0, 12)) {
    lines.push(`- ${parent.parent_template_name}: ${parent.primitive_count}`);
  }

  if (report.issues.length > 0) {
    lines.push('');
    lines.push('Review flags:');
    for (const [issue, count] of Object.entries(report.issueCounts)) {
      lines.push(`- ${issue}: ${count}`);
    }
    for (const issue of report.issues.slice(0, 12)) {
      lines.push(`  - ${issue.issue}: ${issue.template_name} (${issue.preview || 'no preview'})`);
    }
  }

  return lines.join('\n');
}
