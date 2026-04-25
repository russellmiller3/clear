# Clear Language

VSCode + Cursor extension for the [Clear](https://clearlang.dev) language.

Adds:
- Syntax highlighting for `.clear` files
- IntelliSense (autocomplete + diagnostics) via the Clear Language Server
- Inline error messages from the Clear compiler

## Setup

1. Install the extension.
2. Open any `.clear` file. The Language Server starts automatically and connects to `https://compile.clearlang.dev` for diagnostics.

## Settings

- `clear.compilerApi` — override the Compiler API URL. Use `http://localhost:8787` when running `wrangler dev` against the `compiler-api/` worker locally.
- `clear.debounceMs` — milliseconds to wait after the last keystroke before re-validating (default `400`).

## What gets validated

Diagnostics come from the same compiler that ships in the [Clear CLI](https://www.npmjs.com/package/clear-cli) and Clear Studio. Errors and warnings are streamed back over LSP and shown inline in the editor.

## License

UNLICENSED — internal preview.
