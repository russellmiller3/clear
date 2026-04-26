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
