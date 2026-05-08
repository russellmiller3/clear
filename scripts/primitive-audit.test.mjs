import { describe, it, expect } from '../lib/testUtils.js';
import { analyzePrimitiveRows, formatPrimitiveAudit } from './primitive-audit-helpers.mjs';

describe('primitive pattern audit', () => {
  it('counts primitives by set, parent template, and kind', () => {
    const report = analyzePrimitiveRows({
      appRows: [
        { template_name: 'approval-queue', pattern_set: 'marcus' },
        { template_name: 'todo-fullstack', pattern_set: 'core' },
      ],
      primitives: [
        { template_name: 'approval-queue::queue::42::queue-for-request', parent_template_name: 'approval-queue', pattern_set: 'marcus', pattern_kind: 'queue', source: 'queue for request:\n  reviewer is approver' },
        { template_name: 'approval-queue::endpoint::55::when-user-calls-get', parent_template_name: 'approval-queue', pattern_set: 'marcus', pattern_kind: 'endpoint', source: 'when user calls GET /api/requests:\n  send back all Requests' },
        { template_name: 'todo-fullstack::data_table::3::create-a-todos-table', parent_template_name: 'todo-fullstack', pattern_set: 'core', pattern_kind: 'data_table', source: 'create a Todos table:\n  title is text' },
      ],
    });

    expect(report.totals.appRows).toEqual(2);
    expect(report.totals.primitiveRows).toEqual(3);
    expect(report.byPatternSet.marcus).toEqual(2);
    expect(report.byPatternSet.core).toEqual(1);
    expect(report.byKind.queue).toEqual(1);
    expect(report.byParent[0].parent_template_name).toEqual('approval-queue');
    expect(report.byParent[0].primitive_count).toEqual(2);
  });

  it('flags noisy primitive rows that should be reviewed before Meph sees them', () => {
    const report = analyzePrimitiveRows({
      primitives: [
        { template_name: 'good::rule', parent_template_name: 'good', pattern_set: 'core', pattern_kind: 'rule', source: "rule 'Cap':\n  enforce that amount is less than 20" },
        { template_name: 'bad::layout', parent_template_name: 'bad', pattern_set: 'reference', pattern_kind: 'page', source: 'LAYOUT:\n+----+\n| UI |' },
        { template_name: 'bad::empty', parent_template_name: 'bad', pattern_set: 'reference', pattern_kind: 'endpoint', source: '' },
      ],
    });

    expect(report.issueCounts.layoutOnly).toEqual(1);
    expect(report.issueCounts.emptySource).toEqual(1);
    expect(report.issues.length).toEqual(2);
  });

  it('formats a short human-readable report', () => {
    const report = analyzePrimitiveRows({
      appRows: [{ template_name: 'approval-queue', pattern_set: 'marcus' }],
      primitives: [
        { template_name: 'approval-queue::queue', parent_template_name: 'approval-queue', pattern_set: 'marcus', pattern_kind: 'queue', source: 'queue for request:' },
      ],
    });
    const text = formatPrimitiveAudit(report);
    expect(text).toContain('Primitive Pattern Audit');
    expect(text).toContain('primitive rows: 1');
    expect(text).toContain('queue: 1');
  });
});
