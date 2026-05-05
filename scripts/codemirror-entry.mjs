// Entry file for the playground's CodeMirror bundle.
//
// Why this file exists: `playground/codemirror.bundle.js` is a pre-built
// bundle that ships with the repo (no @codemirror/* in node_modules at
// runtime). It was vendored once long ago, and the exports it offers are
// frozen at whatever was bundled then. Adding new editor features that
// need additional CodeMirror exports (e.g. inline editor-margin marks
// for proved/disproved/unverifiable rules — Studio Prove redesign 4(a)
// v1) requires rebuilding the bundle from npm packages.
//
// This entry file re-exports every symbol `playground/ide.html` imports
// plus the new ones needed for the Prove inline-gutter feature. It is
// the single source of truth for "what's in the playground's CodeMirror
// bundle." Adding a new editor feature that needs another CodeMirror
// export means: add it here, re-run `node scripts/build-codemirror-bundle.mjs`,
// commit the regenerated bundle. Dropping an unused export is a follow-up
// (run `git grep "from './codemirror.bundle.js'"` first to confirm no
// caller still imports it).
//
// Imports below mirror the package boundaries CodeMirror itself uses,
// so when one package version bumps and the others don't, the regen
// stays predictable.

// @codemirror/view — editor surface and gutter primitives.
// gutter / GutterMarker are NEW (2026-05-04) for the Prove inline-margin
// verdicts feature; everything else was already in the old bundle.
export {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  drawSelection,
  gutter,
  GutterMarker,
} from '@codemirror/view';

// @codemirror/state — state container and the StateField/StateEffect
// system used by extensions to hold per-editor data (e.g. the current
// set of rule verdicts indexed by line). Both NEW (2026-05-04).
export {
  EditorState,
  StateField,
  StateEffect,
  RangeSet,
  RangeSetBuilder,
} from '@codemirror/state';

// @codemirror/language — syntax highlighting plumbing.
export {
  syntaxHighlighting,
  StreamLanguage,
  HighlightStyle,
  defaultHighlightStyle,
} from '@codemirror/language';

// @codemirror/commands — default keybindings and history.
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';

// @codemirror/lang-javascript — JS language support for the compiled
// preview pane (Studio uses it to highlight the generated server.js).
export { javascript } from '@codemirror/lang-javascript';

// @lezer/highlight — tag definitions for HighlightStyle rules.
export { tags } from '@lezer/highlight';
