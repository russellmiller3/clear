// =============================================================================
// CLEAR LANGUAGE — WEB RUNTIME
// =============================================================================
//
// PURPOSE: This small runtime ships with every compiled Clear web app.
// It provides reactive state (when inputs change, outputs update),
// DOM rendering helpers, and built-in function implementations.
//
// Size target: < 200 lines. No dependencies. Plain vanilla JS.
//
// =============================================================================

// =============================================================================
// REACTIVE STATE
// =============================================================================

/**
 * Create a reactive state object. When any property changes,
 * the recompute function is called to update derived values and the DOM.
 */
function _clear_state(initial, onUpdate) {
  return new Proxy(initial, {
    set(target, prop, value) {
      target[prop] = value;
      if (onUpdate) onUpdate();
      return true;
    }
  });
}

// =============================================================================
// DOM HELPERS
// =============================================================================

/**
 * Set the text content of an element by ID.
 * Silently does nothing if the element doesn't exist (safe for SSR/testing).
 */
function _clear_set(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Get the value of an input element by ID.
 * Returns the appropriate type based on the input type attribute.
 */
function _clear_get_input(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.type === 'number' || el.type === 'range') return Number(el.value) || 0;
  return el.value;
}

/**
 * Format a value for display based on its format type.
 */
function _clear_format(value, format) {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'dollars': return '$' + Number(value).toFixed(2);
    case 'percent': return (Number(value) * 100).toFixed(1) + '%';
    case 'number': return String(Number(value));
    case 'whole': return String(Math.round(Number(value)));
    default: return String(value);
  }
}

// =============================================================================
// BUILT-IN FUNCTIONS
// =============================================================================

function _clear_sum(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce(function(a, b) { return a + b; }, 0);
}

function _clear_avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return _clear_sum(arr) / arr.length;
}

function _clear_len(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'string' || Array.isArray(val)) return val.length;
  if (typeof val === 'object') return Object.keys(val).length;
  return 0;
}

function _clear_uppercase(str) { return String(str).toUpperCase(); }
function _clear_lowercase(str) { return String(str).toLowerCase(); }
function _clear_trim(str) { return String(str).trim(); }

function _clear_contains(str, search) {
  return String(str).includes(String(search));
}

function _clear_starts_with(str, prefix) {
  return String(str).startsWith(String(prefix));
}

function _clear_ends_with(str, suffix) {
  return String(str).endsWith(String(suffix));
}

function _clear_replace(str, find, replacement) {
  return String(str).split(String(find)).join(String(replacement));
}

function _clear_split(str, delimiter) {
  return String(str).split(String(delimiter));
}

function _clear_join(arr, delimiter) {
  if (!Array.isArray(arr)) return String(arr);
  return arr.join(delimiter === undefined ? ', ' : String(delimiter));
}

function _clear_char_at(str, index) {
  return String(str).charAt(index);
}

// =============================================================================
// DATA FETCHING
// =============================================================================

/**
 * Fetch data from a URL (async). Used in Clear as: result is fetch_data(url)
 */
async function _clear_fetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load data from ' + url + ' (status ' + response.status + ')');
  }
  return await response.json();
}

// =============================================================================
// DEFAULT STYLES
// =============================================================================

const _CLEAR_DEFAULT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background: #f8f9fa;
    padding: 2rem;
    max-width: 720px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    color: #111;
  }

  .clear-input-group {
    margin-bottom: 1rem;
  }

  .clear-input-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #555;
    margin-bottom: 0.25rem;
  }

  .clear-input-group input,
  .clear-input-group select,
  .clear-input-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    transition: border-color 0.15s;
  }

  .clear-input-group input:focus,
  .clear-input-group select:focus,
  .clear-input-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .clear-output {
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
  }

  .clear-output-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.125rem;
  }

  .clear-output-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111;
  }

  .clear-button {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
    font-weight: 500;
    color: #fff;
    background: #2563eb;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin-right: 0.5rem;
    margin-bottom: 0.75rem;
    transition: background-color 0.15s;
  }

  .clear-button:hover {
    background: #1d4ed8;
  }

  .clear-button:active {
    background: #1e40af;
  }
`;
