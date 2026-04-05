document.title = "Team Dashboard";

// --- State ---
let _state = {
  project_name: "",
  project_owner: "",
  task_title: "",
  task_project: "",
  task_assignee: "",
  projects: null,
  tasks: null
};

// --- Recompute derived values and update displays ---
function _recompute() {
  // Database: local memory (JSON file backup)
  {
    const _tableEl = document.getElementById('output_Projects_table');
    const _data = _state.projects;
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
    const _tableEl = document.getElementById('output_Projects_table');
    const _data = _state.projects;
    if (_tableEl && Array.isArray(_data) && _data.length > 0) {
      const _keys = ["name","owner","status"];
      _tableEl.querySelector('thead tr').innerHTML = _keys.map(k => '<th>' + _esc(k) + '</th>').join('');
      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr>' + _keys.map(k => '<td>' + _esc(row[k] != null ? row[k] : '') + '</td>').join('') + '</tr>').join('');
    } else if (_tableEl) {
      _tableEl.querySelector('thead tr').innerHTML = '';
      _tableEl.querySelector('tbody').innerHTML = '';
    }
  }
  {
    const _tableEl = document.getElementById('output_Tasks_table');
    const _data = _state.tasks;
    if (_tableEl && Array.isArray(_data) && _data.length > 0) {
      const _keys = ["title","project","assignee","status"];
      _tableEl.querySelector('thead tr').innerHTML = _keys.map(k => '<th>' + _esc(k) + '</th>').join('');
      _tableEl.querySelector('tbody').innerHTML = _data.map(row => '<tr>' + _keys.map(k => '<td>' + _esc(row[k] != null ? row[k] : '') + '</td>').join('') + '</tr>').join('');
    } else if (_tableEl) {
      _tableEl.querySelector('thead tr').innerHTML = '';
      _tableEl.querySelector('tbody').innerHTML = '';
    }
  }
  document.getElementById('input_project_name').value = _state.project_name;
  document.getElementById('input_project_owner').value = _state.project_owner;
  document.getElementById('input_task_title').value = _state.task_title;
  document.getElementById('input_task_project').value = _state.task_project;
  document.getElementById('input_task_assignee').value = _state.task_assignee;
}

// --- Input listeners ---
document.getElementById('input_project_name').addEventListener('input', function(e) {
  _state.project_name = e.target.value;
  _recompute();
});
document.getElementById('input_project_owner').addEventListener('input', function(e) {
  _state.project_owner = e.target.value;
  _recompute();
});
document.getElementById('input_task_title').addEventListener('input', function(e) {
  _state.task_title = e.target.value;
  _recompute();
});
document.getElementById('input_task_project').addEventListener('input', function(e) {
  _state.task_project = e.target.value;
  _recompute();
});
document.getElementById('input_task_assignee').addEventListener('input', function(e) {
  _state.task_assignee = e.target.value;
  _recompute();
});

// --- Button handlers ---
document.getElementById('btn_Add_Project').addEventListener('click', async function() {
  await fetch("/api/projects", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_name: _state.project_name, project_owner: _state.project_owner }) }).catch(e => console.error(e));
  _state.projects = await fetch("/api/projects").then(r => r.json()).catch(e => { console.error(e); return _state.projects; });
  _state.project_name = "";
  _state.project_owner = "";
  _recompute();
});
document.getElementById('btn_Add_Task').addEventListener('click', async function() {
  await fetch("/api/tasks", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_title: _state.task_title, task_project: _state.task_project, task_assignee: _state.task_assignee }) }).catch(e => console.error(e));
  _state.tasks = await fetch("/api/tasks").then(r => r.json()).catch(e => { console.error(e); return _state.tasks; });
  _state.task_title = "";
  _state.task_project = "";
  _state.task_assignee = "";
  _recompute();
});

// --- On Page Load ---
(async () => {
  _state.projects = await fetch("/api/projects").then(r => r.json()).catch(e => { console.error(e); return _state.projects; });
  _state.tasks = await fetch("/api/tasks").then(r => r.json()).catch(e => { console.error(e); return _state.tasks; });
  _recompute();
})();