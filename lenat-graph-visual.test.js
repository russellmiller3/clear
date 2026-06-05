import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('Lenat graph visual emit', () => {
  it('emits a deterministic Lenat-style SVG map instead of a generic force chart', () => {
    const result = compileProgram(`build for web
theme 'nixie'
page 'Map':
  records = [{id: 'r1', title: 'Lenat', concept_id: 'IDEA', payload_json: 'about Marcus'}, {id: 'r2', title: 'Marcus', concept_id: 'PERSON', payload_json: 'about Lenat'}]
  display records as network graph showing edges via payload_json with color by concept_id`);

    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('data-graph-stage');
    expect(result.html).toContain('data-graph-fit');
    expect(result.html).toContain('Fit view');
    expect(result.javascript).toContain('_clearRenderLenatNetworkMap(');
    expect(result.javascript).toContain('clear-network-edge');
    expect(result.javascript).toContain('clear-network-node');
    expect(result.javascript).not.toContain("type: 'graph'");
    expect(result.javascript).not.toContain("layout: 'force'");
  });

  it('emits Lenat-style map chrome and category legend outside the stage', () => {
    const result = compileProgram(`build for web
theme 'nixie'
page 'Map':
  records = [{id: 'r1', title: 'Lenat', concept_id: 'IDEA', payload_json: 'about Marcus'}]
  display records as network graph showing edges via payload_json with color by concept_id`);

    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('data-graph-legend');
    expect(result.html).toContain('data-graph-hint');
    expect(result.html).toContain('larger nodes = more links');
    expect(result.javascript).toContain('_formatGraphCategory');
    expect(result.javascript).toContain('Names link your people, companies, ideas, tasks, and notes.');
  });
});

describe('Lenat trace visual emit', () => {
  it('renders trace events as time, icon, type, and detail columns', () => {
    const result = compileProgram(`build for web
theme 'nixie'
page 'Trace':
  events = [{at: '2026-05-15T15:17:36.000Z', event_kind: 'server-started', concept_id: 'SYSTEM', payload_json: 'server started on port 50064'}]
  display events as trace timeline`);

    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('class="clear-trace-time"');
    expect(result.html).toContain('class="clear-trace-icon"');
    expect(result.html).toContain('class="clear-trace-kind"');
    expect(result.html).toContain('class="clear-trace-detail"');
    expect(result.html).toContain('_clear_trace_icon');
    expect(result.html).toContain('data-lucide');
  });
});

describe('Lenat app header polish', () => {
  it('keeps app pane subtitles visible outside the chat composer pane', () => {
    const result = compileProgram(`build for web
theme 'nixie'
app 'Lenat' at '/':
  pane 'Map' as 'map':
    page header 'How it connects':
      subtitle 'Records linked by name'
  pane 'Chat' as 'chat':
    page header 'Chat':
      subtitle 'Talk to Lenat'`);

    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('Records linked by name');
    expect(result.css).not.toContain('.clear-app-panes .clear-page-subtitle');
    expect(result.css).toContain('[data-pane="chat"] .clear-page-header');
  });
});
