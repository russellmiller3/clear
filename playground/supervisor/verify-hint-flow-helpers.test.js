import { describe, it, expect } from '../../lib/testUtils.js';
import { serverHintTier } from './verify-hint-flow-helpers.js';

describe('verify-hint-flow summary helpers', () => {
  it('reports exact Factor DB hint tiers from server logs', () => {
    const tier = serverHintTier('[hints] archetype=api_service retrieved=1 reranked_by=pairwise top_tier=exact_error_same_archetype');
    expect(tier).toBe('exact_error_same_archetype');
  });

  it('reports shape-match hint delivery instead of hiding it as none', () => {
    const tier = serverHintTier('[hints] shape_match retrieved=2 top_archetype=api_service top_score=1.500');
    expect(tier).toBe('shape_match:api_service');
  });

  it('reports none when no hint reached the tool result', () => {
    expect(serverHintTier(null)).toBe('none');
    expect(serverHintTier('[hints] archetype=general retrieved=0 reranked_by=bm25')).toBe('none');
  });
});
