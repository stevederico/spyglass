/**
 * Minimal ZIP archive builder using node:zlib.
 *
 * Implements the ZIP file format (PKZIP APPNOTE) with DEFLATE compression.
 * No external dependencies -- uses node:zlib for compression.
 *
 * @module core/zip
 */

import { deflateRawSync } from 'node:zlib';

/**
 * Create a ZIP archive from a map of filenames to file contents.
 *
 * @param {Object<string, Buffer>} files - Map of archive paths to file data
 * @returns {Buffer} Complete ZIP file as a Buffer
 */
export function createZip(files) {
  const entries = [];
  const centralDir = [];
  let offset = 0;

  for (const [name, data] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const storedData = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0; // 8 = DEFLATE, 0 = STORE

    const crc = crc32(data);

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);         // signature
    local.writeUInt16LE(20, 4);                  // version needed
    local.writeUInt16LE(0, 6);                   // flags
    local.writeUInt16LE(method, 8);              // compression method
    local.writeUInt16LE(0, 10);                  // mod time
    local.writeUInt16LE(0, 12);                  // mod date
    local.writeUInt32LE(crc, 14);                // crc-32
    local.writeUInt32LE(storedData.length, 18);  // compressed size
    local.writeUInt32LE(data.length, 22);        // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26);  // name length
    local.writeUInt16LE(0, 28);                  // extra length
    nameBuffer.copy(local, 30);

    entries.push(local, storedData);

    // Central directory entry (46 bytes + name)
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);        // signature
    central.writeUInt16LE(20, 4);                 // version made by
    central.writeUInt16LE(20, 6);                 // version needed
    central.writeUInt16LE(0, 8);                  // flags
    central.writeUInt16LE(method, 10);            // compression method
    central.writeUInt16LE(0, 12);                 // mod time
    central.writeUInt16LE(0, 14);                 // mod date
    central.writeUInt32LE(crc, 16);               // crc-32
    central.writeUInt32LE(storedData.length, 20); // compressed size
    central.writeUInt32LE(data.length, 24);       // uncompressed size
    central.writeUInt16LE(nameBuffer.length, 28); // name length
    central.writeUInt16LE(0, 30);                 // extra length
    central.writeUInt16LE(0, 32);                 // comment length
    central.writeUInt16LE(0, 34);                 // disk start
    central.writeUInt16LE(0, 36);                 // internal attrs
    central.writeUInt32LE(0, 38);                 // external attrs
    central.writeUInt32LE(offset, 42);            // local header offset
    nameBuffer.copy(central, 46);

    centralDir.push(central);
    offset += local.length + storedData.length;
  }

  // End of central directory (22 bytes)
  const centralDirSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);             // signature
  eocd.writeUInt16LE(0, 4);                      // disk number
  eocd.writeUInt16LE(0, 6);                      // central dir disk
  eocd.writeUInt16LE(centralDir.length, 8);      // entries on disk
  eocd.writeUInt16LE(centralDir.length, 10);     // total entries
  eocd.writeUInt32LE(centralDirSize, 12);        // central dir size
  eocd.writeUInt32LE(offset, 16);                // central dir offset
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...entries, ...centralDir, eocd]);
}

/** CRC-32 lookup table */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

/**
 * Calculate CRC-32 checksum of a buffer.
 *
 * @param {Buffer} buf - Input data
 * @returns {number} CRC-32 value as unsigned 32-bit integer
 */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
