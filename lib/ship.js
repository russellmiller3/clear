// Ship flow for live-editing Phase A.
//
// applyShip is the pure-logic core of the /__meph__/api/ship HTTP endpoint.
// It takes the new Clear source and an I/O handle whose methods are injected
// for testability. Real production wiring happens in the HTTP endpoint wrapper.
//
// Ordering is critical: we write → compile → spawn. If any step fails, we
// roll the file back to its prior contents so the app on disk never sits
// in a broken state. The old server is only stopped after the new one is
// confirmed healthy (handled by the io.spawn implementation).
//
// Phase A accepts the in-flight-state loss on respawn as a known limitation
// — that's Phase B's problem.

export async function applyShip(sourcePath, newSource, io) {
	if (!sourcePath) return { ok: false, error: 'sourcePath is required' };
	if (!newSource || typeof newSource !== 'string') {
		return { ok: false, error: 'newSource must be a non-empty string' };
	}

	const t0 = Date.now();

	// 1. Snapshot the current on-disk contents for rollback.
	const original = await io.readFile(sourcePath);

	// 1a. If a snapshot sink is provided, capture source+data BEFORE
	//     writing. This gives Marcus a "Meph, undo that" target tied
	//     to this exact pre-ship moment. Failures are logged but don't
	//     abort the ship — the in-memory rollback below still protects us.
	if (io.takeSnapshot) {
		try {
			await io.takeSnapshot({ label: io.snapshotLabel || 'pre-ship' });
		} catch (err) {
			if (io.log) io.log('snapshot failed: ' + err.message);
		}
	}

	// 2. Write new source.
	await io.writeFile(sourcePath, newSource);

	// 3. Compile.
	let compileResult;
	try {
		compileResult = await io.compile(newSource);
	} catch (err) {
		await io.writeFile(sourcePath, original);
		return {
			ok: false,
			error: `compile threw: ${err.message}`,
			elapsed_ms: Date.now() - t0,
		};
	}
	if (compileResult.errors && compileResult.errors.length > 0) {
		await io.writeFile(sourcePath, original);
		const msgs = compileResult.errors.map((e) => e.message || String(e)).join('; ');
		return {
			ok: false,
			error: `compile failed: ${msgs}`,
			elapsed_ms: Date.now() - t0,
		};
	}

	// 4. Spawn the new running process; if it fails, roll back.
	try {
		await io.spawn(compileResult);
	} catch (err) {
		await io.writeFile(sourcePath, original);
		return {
			ok: false,
			error: `spawn failed: ${err.message}`,
			elapsed_ms: Date.now() - t0,
		};
	}

	return { ok: true, elapsed_ms: Date.now() - t0 };
}
