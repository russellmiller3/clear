// Unit tests for the compiler-edit diff parser. Verifies that the post-commit
// hook captures the right changes (paired -/+ lines with quoted strings) and
// skips noise (whitespace-only diffs, short literals, etc).

import { describe, it, expect } from '../lib/testUtils.js';
import { parseDiffStringChanges, containsQuotedString } from './log-compiler-edits.mjs';

describe('compiler-edit log — diff parser', () => {
  it('captures a paired error-message rewrite', () => {
    const diff = `diff --git a/compiler.js b/compiler.js
index 1234..5678 100644
--- a/compiler.js
+++ b/compiler.js
@@ -100,5 +100,5 @@ function validateFoo() {
   if (!ok) {
-    errors.push({ message: "Expected 'send' here" });
+    errors.push({ message: "Clear expected \`send back X\` — see Endpoints" });
   }
 }
`;
    const changes = parseDiffStringChanges(diff);
    expect(changes.length).toEqual(1);
    expect(changes[0].before).toContain("Expected 'send' here");
    expect(changes[0].after).toContain('Clear expected');
    expect(changes[0].context).toContain('validateFoo');
  });

  it('skips diffs without quoted strings on either side', () => {
    const diff = `diff --git a/compiler.js b/compiler.js
@@ -10,3 +10,3 @@
-    const x = 5;
+    const x = 6;
`;
    const changes = parseDiffStringChanges(diff);
    expect(changes.length).toEqual(0);
  });

  it('captures multiple changes in one diff', () => {
    const diff = `diff --git a/validator.js b/validator.js
@@ -10,2 +10,2 @@ function validateA() {
-  errors.push({ message: 'Old message about something useful' });
+  errors.push({ message: 'Updated message with more context here' });
@@ -50,2 +50,2 @@ function validateB() {
-  intentHints.push('You probably meant to use send back');
+  intentHints.push('Clear thinks you meant: send back X');
`;
    const changes = parseDiffStringChanges(diff);
    expect(changes.length).toEqual(2);
    expect(changes[0].context).toContain('validateA');
    expect(changes[1].context).toContain('validateB');
  });

  it('handles multi-line removals paired with first added line', () => {
    const diff = `diff --git a/compiler.js b/compiler.js
@@ -10,4 +10,2 @@
-    const old1 = 'first old message text here';
-    const old2 = 'second old message text';
+    const merged = 'merged message replacing both';
`;
    const changes = parseDiffStringChanges(diff);
    expect(changes.length).toEqual(1);
    expect(changes[0].before).toContain('first old message');
    expect(changes[0].after).toContain('merged message');
  });

  it('returns empty for empty input', () => {
    expect(parseDiffStringChanges('').length).toEqual(0);
    expect(parseDiffStringChanges(null).length).toEqual(0);
  });
});

describe('compiler-edit log — containsQuotedString helper', () => {
  it('matches double-quoted strings of 8+ chars', () => {
    expect(containsQuotedString('a "long enough" b')).toEqual(true);
    expect(containsQuotedString('a "short" b')).toEqual(false); // 5 chars
  });

  it('matches single-quoted strings', () => {
    expect(containsQuotedString("'this is a long error message'")).toEqual(true);
  });

  it('matches backtick (template) strings', () => {
    expect(containsQuotedString('`a long template literal`')).toEqual(true);
  });

  it('returns false for unquoted text', () => {
    expect(containsQuotedString('const x = 5;')).toEqual(false);
    expect(containsQuotedString('plain English no quotes')).toEqual(false);
  });
});
