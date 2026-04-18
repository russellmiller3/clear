// playground/builder/tarExtract.js
// Path-safe tarball extractor. A hostile customer tarball would otherwise
// let them escape the build dir — write to /etc, overwrite the builder's
// own server.js — so every entry is validated before we touch the disk.
// We reject absolute paths, any path with '..' segments, symlinks, hard
// links, and anything that isn't a plain file or directory. Gzipped input
// is auto-detected by the magic bytes so callers can hand us either form.

import { createWriteStream, mkdirSync } from 'fs';
import { dirname, resolve, normalize, isAbsolute, join } from 'path';
import { createGunzip } from 'zlib';
import { Transform } from 'stream';

const BLOCK = 512;

function parseHeader(buf) {
	let name = buf.toString('utf8', 0, 100).replace(/\0.*$/, '');
	const sizeStr = buf.toString('utf8', 124, 136).replace(/\0.*$/, '').trim();
	const size = parseInt(sizeStr, 8) || 0;
	const typeflag = buf.toString('utf8', 156, 157) || '0';
	const prefix = buf.toString('utf8', 345, 500).replace(/\0.*$/, '');
	if (prefix) name = prefix + '/' + name;
	return { name, size, typeflag };
}

function validateEntryPath(name, destDir) {
	if (!name) return { ok: false, reason: 'empty name' };
	if (isAbsolute(name)) return { ok: false, reason: `absolute path: ${name}` };
	const norm = normalize(name);
	if (norm.startsWith('..') || norm.split(/[\\\/]/).includes('..')) {
		return { ok: false, reason: `path escape: ${name}` };
	}
	const full = resolve(destDir, norm);
	if (!full.startsWith(resolve(destDir) + (process.platform === 'win32' ? '\\' : '/')) && full !== resolve(destDir)) {
		return { ok: false, reason: `outside dest: ${name}` };
	}
	return { ok: true, full };
}

export async function extractTarToDir(buffer, destDir, opts = {}) {
	const { maxBytes = 50 * 1024 * 1024 } = opts;
	if (buffer.length > maxBytes) {
		return { ok: false, reason: `tarball too large: ${buffer.length} > ${maxBytes}` };
	}

	let input = buffer;
	if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
		input = await new Promise((res, rej) => {
			const chunks = [];
			const gz = createGunzip();
			gz.on('data', c => chunks.push(c));
			gz.on('end', () => res(Buffer.concat(chunks)));
			gz.on('error', rej);
			gz.end(buffer);
		});
	}

	mkdirSync(destDir, { recursive: true });
	const written = [];

	let pos = 0;
	while (pos + BLOCK <= input.length) {
		const header = input.slice(pos, pos + BLOCK);
		if (header.every(b => b === 0)) { pos += BLOCK; continue; }
		const { name, size, typeflag } = parseHeader(header);
		pos += BLOCK;

		if (!name) break;

		if (typeflag === '2' || typeflag === '1' || typeflag === 'L' || typeflag === 'K') {
			return { ok: false, reason: `disallowed tar entry type ${typeflag} in ${name}` };
		}

		const check = validateEntryPath(name, destDir);
		if (!check.ok) return { ok: false, reason: check.reason };

		if (typeflag === '5') {
			mkdirSync(check.full, { recursive: true });
		} else if (typeflag === '0' || typeflag === '' || typeflag === '\0') {
			mkdirSync(dirname(check.full), { recursive: true });
			const body = input.slice(pos, pos + size);
			await new Promise((res, rej) => {
				const ws = createWriteStream(check.full);
				ws.on('finish', res);
				ws.on('error', rej);
				ws.end(body);
			});
			written.push(name);
		} else {
			return { ok: false, reason: `unknown tar entry type ${typeflag} in ${name}` };
		}

		pos += Math.ceil(size / BLOCK) * BLOCK;
	}

	return { ok: true, files: written };
}
