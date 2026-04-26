import { describe, it, expect, run } from '../../lib/testUtils.js';
import { compileProgram } from '../../index.js';
import { checkPageHeaderTabsChrome, checkSidebarNavChrome, checkStatCardsChrome } from './chrome-checks.js';

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

const PAGE_HEADER_TABS_SOURCE = `build for web
page 'Deals' at '/cro':
  section 'Layout' with style app_layout:
    section 'Main' with style app_main:
      section 'Body' with style app_content:
        page header 'CRO Review':
          subtitle '5 deals waiting'
          actions:
            button 'Refresh'
            button 'Export'
        tab strip:
          active tab is 'Pending'
          tab 'Pending' to '/cro'
          tab 'Approved' to '/approved'
          tab 'Escalated' to '/escalated'`;

const STAT_CARDS_SOURCE = `build for web
pending_count = 5
avg_discount = 12
value_at_stake = 890000
approval_rate = 72
page 'Deals' at '/cro':
  section 'Layout' with style app_layout:
    section 'Main' with style app_main:
      section 'Body' with style app_content:
        stat strip:
          stat card 'Pending Count':
            value pending_count
            delta '+1.8 pts vs last week'
            sparkline [3, 4, 6, 5, 8]
            icon 'inbox'
          stat card 'Avg Discount':
            value avg_discount
            delta '-2 pts'
            sparkline [10, 9, 8, 7]
            icon 'percent'
          stat card 'Value At Stake':
            value value_at_stake
            delta '+$120k'
            icon 'badge-dollar-sign'
          stat card '7-day Approvals':
            value approval_rate
            sparkline [40, 45, 55, 72]
            icon 'trending-up'`;

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

  it('recognizes page headers with subtitles, action slots, and routed tab strips', () => {
    const result = compileProgram(PAGE_HEADER_TABS_SOURCE);
    expect(result.errors).toHaveLength(0);

    const check = checkPageHeaderTabsChrome(result.html, { title: 'CRO Review', activePath: '/cro', minTabs: 3, minActions: 2 });
    expect(check.ok).toEqual(true);
    expect(check.violations).toEqual([]);
    expect(check.counts.pageHeaders).toEqual(1);
    expect(check.counts.tabs).toEqual(3);
    expect(check.activePath).toEqual('/cro');
  });

  it('recognizes stat strips with cards, values, deltas, icons, and sparklines', () => {
    const result = compileProgram(STAT_CARDS_SOURCE);
    expect(result.errors).toHaveLength(0);

    const check = checkStatCardsChrome(result.html, { minCards: 4, minDeltas: 3, minSparklines: 3, minIcons: 4 });
    expect(check.ok).toEqual(true);
    expect(check.violations).toEqual([]);
    expect(check.counts.cards).toEqual(4);
    expect(check.counts.values).toEqual(4);
  });
});

run();
