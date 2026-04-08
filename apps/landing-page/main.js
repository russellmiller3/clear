document.title = "Clear Language";

// --- State ---
let _state = {
  email: "",
  password: "",
  name: ""
};

// --- Recompute derived values and update displays ---
function _recompute() {
  document.getElementById('input_email').value = _state.email;
  document.getElementById('input_password').value = _state.password;
  document.getElementById('input_name').value = _state.name;
}

// --- Input listeners ---
document.getElementById('input_email').addEventListener('input', function(e) {
  _state.email = e.target.value;
  _recompute();
});
document.getElementById('input_password').addEventListener('input', function(e) {
  _state.password = e.target.value;
  _recompute();
});
document.getElementById('input_name').addEventListener('input', function(e) {
  _state.name = e.target.value;
  _recompute();
});

// --- Button handlers ---
document.getElementById('btn_Sign_Up').addEventListener('click', function() {
  console.log("Signing up...");
  _recompute();
});

_recompute();