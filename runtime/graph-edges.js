// =============================================================================
// CLEAR RUNTIME — NETWORK GRAPH EDGE RESOLUTION (Phase 5 of Lenat-in-Clear)
// =============================================================================
//
// PURPOSE: turn a flat list of records into the {nodes, links} shape ECharts
// wants for a force-directed graph. The edge resolution is substring-match:
// for each record, scan its `edgesField` value and find every OTHER record
// whose display label appears as a substring. This mirrors the shape Node
// Lenat's `links.js` uses, so a Lenat-in-Clear records map renders edges in
// the same places as the Node Lenat version.
//
//   buildGraphData(records, edgesField, opts) → { nodes, links }
//
// DESIGN NOTES:
//   - Display label preference order: name → what → idea → note → id. Matches
//     Node Lenat's `pickLabel` shape so visualization stays consistent across
//     the two implementations.
//   - Cap on nodes: default 200. ECharts force-layout slows visibly past
//     ~300-500 nodes; 200 is the empirically-comfortable ceiling for the
//     Lenat records map and the CRM relationship view.
//   - Edge scan is O(N²) over the capped record list. With N=200 that's
//     40K substring checks — fast enough for the in-browser path. If a
//     future app needs more, add an inverted index over labels.
//   - Color-by support: when opts.colorBy names a field on the record,
//     emit a `category` on each node so ECharts can color by it.
//
// =============================================================================

'use strict';

// =============================================================================
// CONSTANTS
// =============================================================================

// Default node-count cap. ECharts force-layout starts to feel laggy past
// ~300 nodes in a typical browser; 200 is a safe ceiling for the Lenat
// records map and the CRM relationship view.
const DEFAULT_NODE_CAP = 200;

// Field-name preference order for the display label. Matches Node Lenat's
// `pickLabel` in src/server.js so the records map looks consistent across
// the two implementations.
const LABEL_FIELDS = ['name', 'what', 'idea', 'note', 'id'];

// =============================================================================
// LABEL RESOLUTION
// =============================================================================

/**
 * Pick the display label for a record, in preference order.
 * @param {object} record
 * @returns {string} The first non-empty value from LABEL_FIELDS, or ''.
 */
function pickLabel(record) {
  if (!record || typeof record !== 'object') return '';
  for (const field of LABEL_FIELDS) {
    const value = record[field];
    if (value != null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '';
}

// =============================================================================
// EDGE BUILDING
// =============================================================================

/**
 * Build {nodes, links} from a flat record list.
 *
 * @param {Array<object>} records — flat array of plain-object records.
 * @param {string} edgesField — name of the field whose value names another
 *   record (substring-match resolves the edge).
 * @param {object} [opts]
 * @param {number} [opts.nodeCap=200] — drop records past this index.
 * @param {string} [opts.colorBy=null] — when set, each node carries a
 *   `category` value taken from this field; ECharts colors by category.
 * @returns {{nodes: Array<object>, links: Array<object>}}
 */
function buildGraphData(records, edgesField, opts) {
  const options = opts || {};
  const nodeCap = options.nodeCap || DEFAULT_NODE_CAP;
  const colorBy = options.colorBy || null;

  if (!Array.isArray(records) || records.length === 0) {
    return { nodes: [], links: [] };
  }

  // Cap node count for layout perf. Records past the cap are silently
  // dropped — the caller can pre-filter to a meaningful subset.
  const capped = records.slice(0, nodeCap);

  // Build the node list. ECharts expects {id, name, category?} per node.
  const nodes = capped.map((record) => {
    const id = String(record.id != null ? record.id : pickLabel(record));
    const node = { id, name: pickLabel(record) || id };
    if (colorBy && record[colorBy] != null) {
      node.category = String(record[colorBy]);
    }
    return node;
  });

  // Edge scan: for each record, look at its `edgesField` value (a free-form
  // string in the Lenat shape). For every OTHER record in the capped set,
  // check whether that record's label appears as a substring. Each match
  // produces one link from the scanning record to the matched record.
  //
  // Why substring match and not a foreign-key id lookup? The Lenat shape
  // stores `about` as natural English ("about Marcus and Q3 plan"), not a
  // FK reference. The substring scan is robust to comma-lists, partial
  // mentions, and reorderings. Same shape Node Lenat's links.js uses.
  const links = [];
  for (const record of capped) {
    const raw = record[edgesField];
    if (raw == null) continue;
    const aboutText = String(raw);
    if (aboutText.trim() === '') continue;

    for (const candidate of capped) {
      if (candidate === record) continue;
      const candidateLabel = pickLabel(candidate);
      if (!candidateLabel) continue;
      if (aboutText.includes(candidateLabel)) {
        const sourceId = String(record.id != null ? record.id : pickLabel(record));
        const targetId = String(candidate.id != null ? candidate.id : candidateLabel);
        links.push({ source: sourceId, target: targetId });
      }
    }
  }

  return { nodes, links };
}

// =============================================================================
// EXPORTS
// =============================================================================
//
// runtime/ is CommonJS-scoped (see runtime/package.json {"type":"commonjs"}).
// Every other runtime helper exports via module.exports — mirror that so this
// file loads via require() the same way the rest of the runtime layer does.
module.exports = { buildGraphData, pickLabel, DEFAULT_NODE_CAP };
