// VSCode extension entry — spawns clear-lsp over stdio and registers it
// for the "clear" language. The LSP itself does all the work; this file
// is glue.

const path = require('path');
const { workspace } = require('vscode');
const {
  LanguageClient,
  TransportKind,
} = require('vscode-languageclient/node');

let client;

function activate(context) {
  const config = workspace.getConfiguration('clear');
  const compilerApi = config.get('compilerApi');
  const debounceMs = config.get('debounceMs');

  // Resolve the LSP server. We bundle clear-lsp/server.mjs alongside the
  // extension when packaging — for local development, point at the sibling
  // workspace folder via CLEAR_LSP_PATH.
  const lspPath = process.env.CLEAR_LSP_PATH ||
    context.asAbsolutePath(path.join('node_modules', '@clearlang', 'lsp', 'server.mjs'));

  const serverOptions = {
    run: {
      command: 'node',
      args: [lspPath],
      transport: TransportKind.stdio,
    },
    debug: {
      command: 'node',
      args: ['--inspect=6009', lspPath],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'clear' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.clear'),
    },
    initializationOptions: {
      compilerApi,
      debounceMs,
    },
  };

  client = new LanguageClient(
    'clearLanguageServer',
    'Clear Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

function deactivate() {
  if (client) return client.stop();
  return undefined;
}

module.exports = { activate, deactivate };
