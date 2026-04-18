// Owner-only middleware for live-editing endpoints (/__meph__/*).
//
// Runs AFTER the standard auth middleware (runtime/auth.js), which populates
// req.user from the Bearer token. This middleware checks that the logged-in
// user has role 'owner' — the single user authorized to modify the running
// app. Non-owners get 403.
//
// Phase A is strictly owner-only. Admin-role support is deferred to Phase B.

export function requireOwner(req, res, next) {
	const role = req.user && req.user.role;
	if (role !== 'owner') {
		res.status(403).json({
			error: 'owner role required',
			hint: 'Only the app owner can modify a running app. Ask your admin to grant owner role.',
		});
		return;
	}
	next();
}
