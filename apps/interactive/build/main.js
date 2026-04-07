document.title = "Interactive Patterns";

// --- State ---
let _state = {
};

// --- Recompute derived values and update displays ---
function _recompute() {
}

// --- Input listeners ---

// --- Button handlers ---
document.getElementById('btn_Toggle_Help').addEventListener('click', function() {
  { const _p = document.getElementById('panel-help'); if (_p) { if (_p.style.display === 'none') _p.style.display = ''; else _p.style.display = 'none'; } }
  _recompute();
});
document.getElementById('btn_Cancel').addEventListener('click', function() {
  { const _d = this.closest('dialog'); if (_d) _d.close(); }
  _recompute();
});
document.getElementById('btn_Delete_Item').addEventListener('click', function() {
  { const _p = document.getElementById('panel-confirm_delete'); if (_p) { if (_p.tagName === 'DIALOG') _p.showModal(); else _p.style.display = ''; } }
  _recompute();
});

_recompute();