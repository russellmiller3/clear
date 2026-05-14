// =============================================================================
// CLEAR LANGUAGE — convention-over-config field types
// =============================================================================
//
// New primitive 2026-05-14 (P6): when a field is declared by name alone
// (no `is text` / `is number` / etc.), the parser infers the type from
// a convention table on the name. DHH-style win: zero boilerplate for
// the common case, explicit override always available.
//
// Examples:
//   phrase                  -> text     (matches: phrase, name, address, ...)
//   age                     -> number   (matches: age, count, quantity, ...)
//   price                   -> number   (matches: price, cost, amount, ...)
//   created_at              -> timestamp (matches: *_at suffix, already supported)
//   is_active               -> boolean  (matches: is_*, enabled, disabled)
//
// Explicit override always wins:
//   phrase is number        -> number (override, not text)
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('field-type conventions (P6, 2026-05-14)', () => {
  it('infers text for `phrase`, `name`, `email`, `address`, `title`, `description`', () => {
    const source = [
      "target: backend",
      "",
      "create a Commands table:",
      "  phrase",
      "  name",
      "  email",
      "  address",
      "  title",
      "  description",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    expect(table_node).toBeTruthy();
    for (const field_name of ['phrase', 'name', 'email', 'address', 'title', 'description']) {
      const field = table_node.fields.find(f => f.name === field_name);
      expect(field).toBeTruthy();
      expect(field.fieldType).toBe('text');
    }
  });

  it('infers number for `age`, `count`, `quantity`, `zip`', () => {
    const source = [
      "target: backend",
      "",
      "create a Records table:",
      "  age",
      "  count",
      "  quantity",
      "  zip",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    for (const field_name of ['age', 'count', 'quantity', 'zip']) {
      const field = table_node.fields.find(f => f.name === field_name);
      expect(field).toBeTruthy();
      expect(field.fieldType).toBe('number');
    }
  });

  it('infers number for money-shaped names (price, cost, amount, total)', () => {
    const source = [
      "target: backend",
      "",
      "create a Orders table:",
      "  price",
      "  cost",
      "  amount",
      "  total",
      "  discount",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    for (const field_name of ['price', 'cost', 'amount', 'total', 'discount']) {
      const field = table_node.fields.find(f => f.name === field_name);
      expect(field).toBeTruthy();
      expect(field.fieldType).toBe('number');
    }
  });

  it('infers boolean for `is_*`, `enabled`, `disabled` shaped names', () => {
    const source = [
      "target: backend",
      "",
      "create a Toggles table:",
      "  is_active",
      "  is_done",
      "  enabled",
      "  disabled",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    for (const field_name of ['is_active', 'is_done', 'enabled', 'disabled']) {
      const field = table_node.fields.find(f => f.name === field_name);
      expect(field).toBeTruthy();
      expect(field.fieldType).toBe('boolean');
    }
  });

  it('explicit `is text` overrides the convention', () => {
    const source = [
      "target: backend",
      "",
      "create a Items table:",
      "  price is text",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    const field = table_node.fields.find(f => f.name === 'price');
    expect(field.fieldType).toBe('text');
  });

  it('unknown name falls back to text (no regression)', () => {
    const source = [
      "target: backend",
      "",
      "create a Things table:",
      "  weirdname_xyz",
    ].join('\n');
    const compile_result = compileProgram(source);
    expect(compile_result.errors).toEqual([]);
    const table_node = compile_result.ast.body.find(n => n.type === 'data_shape');
    const field = table_node.fields.find(f => f.name === 'weirdname_xyz');
    expect(field.fieldType).toBe('text');
  });
});
