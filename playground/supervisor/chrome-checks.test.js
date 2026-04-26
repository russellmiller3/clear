import { describe, it, expect, run } from '../../lib/testUtils.js';
import { compileProgram } from '../../index.js';
import { checkSidebarNavChrome } from './chrome-checks.js';

const NAV_SOURCE = `build for web
pending_count = 5
approved_count = 12
escalated_count = 2
page 'Deals' at '/cro':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      heading 'Deal Desk'
      nav section 'Approvals':
        nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'
        nav item 'Approved' to '/approved' with count approved_count with icon 'check-circle-2'
      nav section 'Teams':
        nav item 'CRO' to '/cro/team' with count escalated_count with icon 'users'
        nav item 'Finance' to '/finance' with icon 'badge-dollar-sign'
      nav section 'System':
        nav item 'Settings' to '/settings' with icon 'settings'
        nav item 'Audit log' to '/audit' with icon 'history'
    section 'Main' with style app_main:
      section 'Header' with style app_header:
        heading 'Deals'
      section 'Body' with style app_content:
        text 'Queue'`;

describe('chrome checks', () => {
  it('recognizes sidebar nav with sections, items, counts, icons, and active-state wiring', () => {
    const result = compileProgram(NAV_SOURCE);
    expect(result.errors).toHaveLength(0);

    const check = checkSidebarNavChrome(result.html, { route: '/cro', minSections: 3, minItems: 6, minCounts: 3, minIcons: 4 });
    expect(check.ok).toEqual(true);
    expect(check.violations).toEqual([]);
    expect(check.counts.items).toEqual(6);
    expect(check.activePath).toEqual('/cro');
  });

  it('rejects legacy text-only sidebar rows', () => {
    const legacy = compileProgram(`build for web
page 'Legacy' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      heading 'Legacy'
      section 'Main':
        text 'Dashboard'
        text 'Projects'
    section 'Main' with style app_main:
      text 'Body'`);

    const check = checkSidebarNavChrome(legacy.html, { route: '/', minSections: 1, minItems: 2, minCounts: 1, minIcons: 1 });
    expect(check.ok).toEqual(false);
    expect(check.violations).toContain('missing data-nav-item rows');
  });
});

run();
