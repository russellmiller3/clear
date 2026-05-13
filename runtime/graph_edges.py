# =============================================================================
# CLEAR RUNTIME -- NETWORK GRAPH EDGE RESOLUTION (Phase 5 of Lenat-in-Clear)
# =============================================================================
#
# Python parity port of runtime/graph-edges.js. Same shape, same semantics --
# turns a flat list of record dicts into the {nodes, links} structure ECharts
# wants for a force-directed graph. Substring-match edge resolution mirrors
# Node Lenat's links.js so a Python-target Clear app produces the same graph
# the JS-target version produces from the same records.
#
# Public API:
#   build_graph_data(records, edges_field, opts=None) -> {"nodes": [...], "links": [...]}
#
# =============================================================================

# Default node-count cap. ECharts force-layout starts to feel laggy past
# ~300 nodes in a typical browser; 200 is a safe ceiling for the Lenat
# records map and the CRM relationship view.
DEFAULT_NODE_CAP = 200

# Field-name preference order for the display label. Matches Node Lenat's
# pickLabel in src/server.js so the records map looks consistent across
# the two implementations.
_LABEL_FIELDS = ("name", "what", "idea", "note", "id")


def pick_label(record):
    """Pick the display label for a record, in preference order.

    Returns the first non-empty value from _LABEL_FIELDS, or '' if none.
    """
    if not isinstance(record, dict):
        return ""
    for field in _LABEL_FIELDS:
        value = record.get(field)
        if value is not None and str(value).strip() != "":
            return str(value)
    return ""


def build_graph_data(records, edges_field, opts=None):
    """Build {"nodes": [...], "links": [...]} from a flat record list.

    Arguments:
      records: list of dict records.
      edges_field: name of the field whose value names another record
        (substring-match resolves the edge).
      opts: optional dict.
        - 'nodeCap' (int, default 200): drop records past this index.
        - 'colorBy' (str|None): when set, each node carries a 'category'
          value taken from this field; ECharts colors by category.

    Returns a dict with 'nodes' and 'links' lists in ECharts shape.
    """
    options = opts or {}
    node_cap = options.get("nodeCap") or DEFAULT_NODE_CAP
    color_by = options.get("colorBy") or None

    if not isinstance(records, list) or len(records) == 0:
        return {"nodes": [], "links": []}

    # Cap node count for layout perf. Records past the cap are silently
    # dropped -- the caller can pre-filter to a meaningful subset.
    capped = records[:node_cap]

    # Build the node list. ECharts expects {id, name, category?} per node.
    nodes = []
    for record in capped:
        rec_id = record.get("id") if record.get("id") is not None else pick_label(record)
        node = {"id": str(rec_id), "name": pick_label(record) or str(rec_id)}
        if color_by and record.get(color_by) is not None:
            node["category"] = str(record.get(color_by))
        nodes.append(node)

    # Edge scan: for each record, look at its edges_field value. For every
    # OTHER record in the capped set, check whether that record's label
    # appears as a substring. Each match produces one link from the
    # scanning record to the matched record.
    #
    # Why substring match and not a foreign-key id lookup? The Lenat shape
    # stores 'about' as natural English ("about Marcus and Q3 plan"), not a
    # FK reference. The substring scan is robust to comma-lists, partial
    # mentions, and reorderings. Same shape Node Lenat's links.js uses.
    links = []
    for record in capped:
        raw = record.get(edges_field)
        if raw is None:
            continue
        about_text = str(raw)
        if about_text.strip() == "":
            continue

        for candidate in capped:
            if candidate is record:
                continue
            candidate_label = pick_label(candidate)
            if not candidate_label:
                continue
            if candidate_label in about_text:
                source_id = record.get("id") if record.get("id") is not None else pick_label(record)
                target_id = (
                    candidate.get("id") if candidate.get("id") is not None else candidate_label
                )
                links.append({"source": str(source_id), "target": str(target_id)})

    return {"nodes": nodes, "links": links}
