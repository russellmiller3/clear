import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('Lenat graph visual emit', () => {
  it('keeps dark-theme graph labels readable and spaced like Lenat', () => {
    const result = compileProgram(`build for web
theme 'nixie'
page 'Map':
  records = [{id: 'r1', title: 'Lenat', concept_id: 'IDEA', payload_json: 'about Marcus'}, {id: 'r2', title: 'Marcus', concept_id: 'PERSON', payload_json: 'about Lenat'}]
  display records as network graph showing edges via payload_json with color by concept_id`);

    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("color: '#f4e8d8'");
    expect(result.javascript).toContain('repulsion: 220');
    expect(result.javascript).toContain('edgeLength: 150');
    expect(result.javascript).toContain("fontWeight: 700");
  });
});
