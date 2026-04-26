function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function attrPattern(name, value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${name}="${escaped}"`);
}

export function checkSidebarNavChrome(html, opts = {}) {
  const source = String(html || '');
  const minSections = opts.minSections ?? 1;
  const minItems = opts.minItems ?? 1;
  const minCounts = opts.minCounts ?? 0;
  const minIcons = opts.minIcons ?? 0;
  const route = opts.route || '/';

  const counts = {
    sections: countMatches(source, /class="clear-nav-section-label"/g),
    items: countMatches(source, /data-nav-path="/g),
    badges: countMatches(source, /class="clear-nav-count/g),
    icons: countMatches(source, /data-lucide="/g),
  };

  const hasRoute = attrPattern('data-nav-path', route).test(source);
  const hasActiveWiring = source.includes('location.pathname') && source.includes("classList.toggle('is-active'");

  const violations = [];
  if (counts.sections < minSections) violations.push('missing nav sections');
  if (counts.items < minItems) violations.push('missing data-nav-item rows');
  if (counts.badges < minCounts) violations.push('missing nav count badges');
  if (counts.icons < minIcons) violations.push('missing nav icons');
  if (!hasRoute) violations.push(`missing active route ${route}`);
  if (!hasActiveWiring) violations.push('missing route active-state wiring');

  return {
    ok: violations.length === 0,
    counts,
    activePath: hasRoute ? route : null,
    violations,
  };
}

export function checkPageHeaderTabsChrome(html, opts = {}) {
  const source = String(html || '');
  const minTabs = opts.minTabs ?? 1;
  const minActions = opts.minActions ?? 0;
  const title = opts.title || null;
  const activePath = opts.activePath || null;

  const counts = {
    pageHeaders: countMatches(source, /data-page-header="true"/g),
    titleRows: countMatches(source, /class="clear-page-title text-2xl"/g),
    subtitles: countMatches(source, /class="clear-page-subtitle/g),
    actionSlots: countMatches(source, /data-page-header-actions="true"/g),
    actions: countMatches(source, /<button class="[^"]*" id="btn_/g),
    tabStrips: countMatches(source, /data-tab-strip="true"/g),
    tabs: countMatches(source, /data-route-tab="true"/g),
    activeTabs: countMatches(source, /class="clear-route-tab is-active"/g),
  };

  const hasTitle = !title || source.includes(`>${title}</h1>`);
  const hasActivePath = !activePath || attrPattern('data-tab-path', activePath).test(source);
  const hasActiveWiring = source.includes('location.pathname') && source.includes("classList.toggle('is-active'");

  const violations = [];
  if (counts.pageHeaders < 1) violations.push('missing page header');
  if (counts.titleRows < 1) violations.push('missing text-2xl page title');
  if (!hasTitle) violations.push(`missing page title ${title}`);
  if (counts.subtitles < 1) violations.push('missing page subtitle');
  if (counts.actionSlots < 1) violations.push('missing page header action slot');
  if (counts.actions < minActions) violations.push('missing page header actions');
  if (counts.tabStrips < 1) violations.push('missing tab strip');
  if (counts.tabs < minTabs) violations.push('missing routed tabs');
  if (counts.activeTabs < 1) violations.push('missing active tab');
  if (!hasActivePath) violations.push(`missing active tab path ${activePath}`);
  if (!hasActiveWiring) violations.push('missing tab active-state wiring');

  return {
    ok: violations.length === 0,
    counts,
    activePath: hasActivePath ? activePath : null,
    violations,
  };
}

export function checkStatCardsChrome(html, opts = {}) {
  const source = String(html || '');
  const minCards = opts.minCards ?? 1;
  const minSparklines = opts.minSparklines ?? 0;
  const minDeltas = opts.minDeltas ?? 0;
  const minIcons = opts.minIcons ?? 0;

  const counts = {
    strips: countMatches(source, /data-stat-strip="true"/g),
    cards: countMatches(source, /data-stat-card="true"/g),
    values: countMatches(source, /class="clear-stat-value tabular-nums"/g),
    positiveDeltas: countMatches(source, /clear-stat-delta-positive/g),
    negativeDeltas: countMatches(source, /clear-stat-delta-negative/g),
    sparklines: countMatches(source, /class="clear-stat-sparkline"/g),
    icons: countMatches(source, /class="clear-stat-icon" data-lucide="/g),
  };
  counts.deltas = counts.positiveDeltas + counts.negativeDeltas;

  const violations = [];
  if (counts.strips < 1) violations.push('missing stat strip');
  if (counts.cards < minCards) violations.push('missing stat cards');
  if (counts.values < minCards) violations.push('missing tabular stat values');
  if (counts.deltas < minDeltas) violations.push('missing stat deltas');
  if (counts.sparklines < minSparklines) violations.push('missing stat sparklines');
  if (counts.icons < minIcons) violations.push('missing stat icons');

  return {
    ok: violations.length === 0,
    counts,
    violations,
  };
}
