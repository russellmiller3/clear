document.title = "Results Dashboard";

// --- State ---
let _state = {
  search: "",
  model_name: "",
  models: null
};

// --- Recompute derived values and update displays ---
function _recompute() {
  // clear:4
  // Database: local memory (JSON file backup)
  {
    const _tableEl = document.getElementById('output_Models_table');
    const _data = _state.models;
    if (_tableEl && Array.isArray(_data) && _data.length > 0) {
      const _keys = ["name","status"];
      _tableEl.querySelector('thead tr').innerHTML = _keys.map(k => '<th>' + _esc(k) + '</th>').join('');
      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr>' + _keys.map(k => '<td>' + _esc(row[k] != null ? row[k] : '') + '</td>').join('') + '</tr>').join('');
    } else if (_tableEl) {
      _tableEl.querySelector('thead tr').innerHTML = '';
      _tableEl.querySelector('tbody').innerHTML = '';
    }
  }
  {
    const _tableEl = document.getElementById('output_Models_table');
    const _data = _state.models;
    if (_tableEl && Array.isArray(_data) && _data.length > 0) {
      const _keys = ["name","accuracy","status"];
      _tableEl.querySelector('thead tr').innerHTML = _keys.map(k => '<th>' + _esc(k) + '</th>').join('');
      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr>' + _keys.map(k => '<td>' + _esc(row[k] != null ? row[k] : '') + '</td>').join('') + '</tr>').join('');
    } else if (_tableEl) {
      _tableEl.querySelector('thead tr').innerHTML = '';
      _tableEl.querySelector('tbody').innerHTML = '';
    }
  }
  document.getElementById('input_search').value = _state.search;
  document.getElementById('input_model_name').value = _state.model_name;
}

// --- Input listeners ---
document.getElementById('input_search').addEventListener('input', function(e) {
  _state.search = e.target.value;
  _recompute();
});
document.getElementById('input_model_name').addEventListener('input', function(e) {
  _state.model_name = e.target.value;
  _recompute();
});

// --- Button handlers ---
document.getElementById('btn_Overview').addEventListener('click', async function() {
  _state.models = await fetch("/api/models").then(r => r.json()).catch(e => { console.error(e); return _state.models; });
  _recompute();
});
document.getElementById('btn_Add_Model').addEventListener('click', async function() {
  await fetch("/api/models", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_name: _state.model_name }) }).catch(e => console.error(e));
  _state.models = await fetch("/api/models").then(r => r.json()).catch(e => { console.error(e); return _state.models; });
  _state.model_name = "";
  _recompute();
});
document.getElementById('btn_Refresh').addEventListener('click', async function() {
  _state.models = await fetch("/api/models").then(r => r.json()).catch(e => { console.error(e); return _state.models; });
  _recompute();
});

// --- On Page Load ---
(async () => {
  _state.models = await fetch("/api/models").then(r => r.json()).catch(e => { console.error(e); return _state.models; });
  _recompute();
})();