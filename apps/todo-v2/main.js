document.title = "Todo App";

// --- State ---
let _state = {
  todo: "",
  todos: null
};

// --- Recompute derived values and update displays ---
function _recompute() {
  {
    const _tableEl = document.getElementById('output_Todos_table');
    const _data = _state.todos;
    if (_tableEl && Array.isArray(_data) && _data.length > 0) {
      const _keys = ["todo","completed"];
      _tableEl.querySelector('thead tr').innerHTML = _keys.map(k => '<th>' + _esc(k) + '</th>').join('');
      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr>' + _keys.map(k => '<td>' + _esc(row[k] != null ? row[k] : '') + '</td>').join('') + '</tr>').join('');
    } else if (_tableEl) {
      _tableEl.querySelector('thead tr').innerHTML = '';
      _tableEl.querySelector('tbody').innerHTML = '';
    }
  }
  document.getElementById('input_todo').value = _state.todo;
}

// --- Input listeners ---
document.getElementById('input_todo').addEventListener('input', function(e) {
  _state.todo = e.target.value;
  _recompute();
});

// --- Button handlers ---
document.getElementById('btn_Add').addEventListener('click', async function() {
  await fetch("/api/todos", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todo: _state.todo }) }).catch(e => console.error(e));
  _state.todos = await fetch("/api/todos").then(r => r.json()).catch(e => { console.error(e); return _state.todos; });
  _state.todo = "";
  _recompute();
});
document.getElementById('btn_Refresh').addEventListener('click', async function() {
  _state.todos = await fetch("/api/todos").then(r => r.json()).catch(e => { console.error(e); return _state.todos; });
  _recompute();
});

// --- On Page Load ---
(async () => {
  _state.todos = await fetch("/api/todos").then(r => r.json()).catch(e => { console.error(e); return _state.todos; });
  _recompute();
})();