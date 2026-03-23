const config = require('../config');

/**
 * Build the complete print buffer for the P15 BLE printer.
 *
 * Format (reverse-engineered from HCI log capture):
 *
 *  [4 bytes]  Proprietary wrapper:  1f 70 02 06
 *  [16 bytes] Zero padding
 *  [4 bytes]  Job start marker:     10 ff f1 02
 *  [4 bytes]  ESC/POS raster cmd:   1d 76 30 00   (GS v 0, mode normal)
 *  [2 bytes]  Bytes per line:       xL xH          (12, 0  →  96 pixels)
 *  [2 bytes]  Number of lines:      yL yH          (lo-byte, hi-byte)
 *  [N bytes]  Bitmap data           (bytesPerLine × height)
 *  [2 bytes]  Page end:             1d 0c
 *  [4 bytes]  Job end marker:       10 ff f1 45
 *
 * The whole buffer is then split into 95-byte chunks; the last chunk is
 * zero-padded to exactly 95 bytes.
 *
 * @param {Buffer} bitmapBuffer  1bpp packed bitmap (MSB first, row-major)
 * @param {number} width         label width in pixels  (must be multiple of 8)
 * @param {number} height        label height in lines
 * @returns {Buffer}
 */
function buildPrintBuffer(bitmapBuffer, width, height) {
  if (width % 8 !== 0) {
    throw new Error(`Label width must be a multiple of 8 (got ${width})`);
  }

  const bytesPerLine = width / 8;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const header = Buffer.concat([
    Buffer.from([0x1f, 0x70, 0x02, 0x06]),  // proprietary wrapper
    Buffer.alloc(16),                          // 16-byte zero padding
    Buffer.from([0x10, 0xff, 0xf1, 0x02]),   // job start
    Buffer.from([0x1d, 0x76, 0x30, 0x00]),   // ESC/POS GS v 0
    Buffer.from([bytesPerLine, 0x00]),         // xL, xH
    Buffer.from([yL, yH]),                     // yL, yH
  ]);

  const footer = Buffer.concat([
    Buffer.from([0x1d, 0x0c]),               // page end
    Buffer.from([0x10, 0xff, 0xf1, 0x45]),   // job end
  ]);

  return Buffer.concat([header, bitmapBuffer, footer]);
}

/**
 * Split a buffer into fixed-size BLE chunks.
 * The last chunk is zero-padded to exactly CHUNK_SIZE bytes.
 * @param {Buffer} data
 * @returns {Buffer[]}
 */
function buildChunks(data) {
  const chunkSize = config.CHUNK_SIZE;
  const chunks = [];

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const slice = data.slice(offset, offset + chunkSize);
    if (slice.length < chunkSize) {
      // Pad last chunk
      const padded = Buffer.alloc(chunkSize, 0);
      slice.copy(padded);
      chunks.push(padded);
    } else {
      chunks.push(slice);
    }
  }

  console.log(`[Packet] ${chunks.length} chunks × ${chunkSize}B = ${data.length} bytes payload`);
  return chunks;
}

/**
 * Convert an array of hex strings (REPLAY_PACKETS format) to Buffers.
 * @param {string[]} hexPackets
 * @returns {Buffer[]}
 */
function hexPacketsToBuffers(hexPackets) {
  return hexPackets.map((hex) => Buffer.from(hex.replace(/\s+/g, ''), 'hex'));
}

module.exports = { buildPrintBuffer, buildChunks, hexPacketsToBuffers };
