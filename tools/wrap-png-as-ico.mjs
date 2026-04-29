// Wrap clear-icon-256.png into a valid Windows ICO file (single PNG-embedded
// entry). ICO supports PNG payloads since Vista — modern Windows shortcut
// icons use this. No image-library dep needed; just hand-rolled bytes.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PNG_PATH = join(__dirname, '..', 'clear-icon-256.png');
const ICO_PATH = join(__dirname, '..', 'clear-icon.ico');

const png = readFileSync(PNG_PATH);
const headerLen = 6;       // ICO file header
const dirEntryLen = 16;    // one directory entry
const offset = headerLen + dirEntryLen;
const buf = Buffer.alloc(offset + png.length);

// Header: reserved(2)=0, type(2)=1 (icon), count(2)=1
buf.writeUInt16LE(0, 0);
buf.writeUInt16LE(1, 2);
buf.writeUInt16LE(1, 4);

// Directory entry for the single PNG payload
buf.writeUInt8(0, 6);                  // width: 0 means 256
buf.writeUInt8(0, 7);                  // height: 0 means 256
buf.writeUInt8(0, 8);                  // colors in palette (0 = none)
buf.writeUInt8(0, 9);                  // reserved
buf.writeUInt16LE(1, 10);              // color planes
buf.writeUInt16LE(32, 12);             // bits per pixel
buf.writeUInt32LE(png.length, 14);     // payload size
buf.writeUInt32LE(offset, 18);         // payload offset

png.copy(buf, offset);
writeFileSync(ICO_PATH, buf);
console.log('ICO written: ' + ICO_PATH + ' (' + buf.length + ' bytes, embedded PNG ' + png.length + ' bytes)');
