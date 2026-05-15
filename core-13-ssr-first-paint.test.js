import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

const canonicalApps = [
  'todo-fullstack',
  'crm-pro',
  'blog-fullstack',
  'live-chat',
  'helpdesk-agent',
  'booking',
  'expense-tracker',
  'ecom-agent',
  'deal-desk',
  'approval-queue',
  'internal-request-queue',
  'onboarding-tracker',
  'lead-router',
];

function collectStaticPageLoadReads(bodyNodes) {
  const pageLoadReads = [];

  function visit(clearNodes) {
    for (const clearNode of clearNodes || []) {
      if (clearNode.type === 'on_page_load') {
        for (const loadAction of clearNode.body || []) {
          const isStaticSameAppRead =
            loadAction.type === 'api_call' &&
            loadAction.method === 'GET' &&
            loadAction.targetVar &&
            typeof loadAction.url === 'string' &&
            loadAction.url.startsWith('/api/') &&
            !loadAction.url.includes('{') &&
            !loadAction.url.includes(':');

          if (isStaticSameAppRead) {
            pageLoadReads.push({
              targetName: loadAction.targetVar,
              urlPath: loadAction.url,
            });
          }
        }
      }

      if (clearNode.body) visit(clearNode.body);
      if (clearNode.panes) {
        for (const appPane of clearNode.panes) visit(appPane.body || []);
      }
    }
  }

  visit(bodyNodes);
  return pageLoadReads;
}

describe('Core 13 first-paint data', () => {
  it('prefetches same-app page-load reads before sending the page', () => {
    const appSource = [
      'build for web and javascript backend',
      'create a Products table:',
      '  name is text',
      '',
      'when user requests data from /api/products:',
      '  products = get all Products',
      '  send back products',
      '',
      "page 'Shop' at '/shop':",
      "  on page load get products from '/api/products'",
      '  display products as table showing name',
    ].join('\n');

    const compileOutput = compileProgram(appSource);
    const serverSource = compileOutput.serverJS || compileOutput.javascript || '';

    expect(compileOutput.errors).toHaveLength(0);
    expect(serverSource).toContain('__CLEAR_INITIAL_STATE__');
    expect(serverSource).toContain('_ssrState["products"]');
    expect(serverSource).toContain('"/api/products"');
  });

  it('all 13 canonical apps include first-paint state for static same-app page-load reads', () => {
    for (const appName of canonicalApps) {
      const appSource = readFileSync(join('apps', appName, 'main.clear'), 'utf8');
      const compileOutput = compileProgram(appSource);
      const serverSource = compileOutput.serverJS || compileOutput.javascript || '';
      const pageLoadReads = collectStaticPageLoadReads(compileOutput.ast?.body || []);

      expect(compileOutput.errors).toHaveLength(0);
      expect(pageLoadReads.length).toBeGreaterThan(0);

      for (const readTarget of pageLoadReads) {
        expect(serverSource).toContain(`_ssrState[${JSON.stringify(readTarget.targetName)}]`);
        expect(serverSource).toContain(JSON.stringify(readTarget.urlPath));
      }
    }
  });

  it('does not prefetch browser-state reads on the server', () => {
    const appSource = [
      'build for web and javascript backend',
      "page 'Search' at '/':",
      "  'Search' is a text input saved as query",
      "  on page load get matches from '/api/search?q={query}'",
      '  display matches as table showing name',
    ].join('\n');

    const compileOutput = compileProgram(appSource);
    const serverSource = compileOutput.serverJS || compileOutput.javascript || '';

    expect(compileOutput.errors).toHaveLength(0);
    expect(serverSource).not.toContain('_ssrState["matches"]');
  });
});
