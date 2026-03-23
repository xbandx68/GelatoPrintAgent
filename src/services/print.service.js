const printerService = require('./printer.service');
const bitmapService  = require('./bitmap.service');
const packetService  = require('./packet.service');
const { REPLAY_PACKETS } = require('../../data/replay_packets');
const config = require('../config');

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * Print the captured replay (validated, known-working label).
 * Uses REPLAY_PACKETS from data/replay_packets.js — no bitmap generation needed.
 */
async function printReplay() {
  _ensureConnected();
  console.log('[Print] Replay print (validated packets)...');
  const buffers = packetService.hexPacketsToBuffers(REPLAY_PACKETS);
  await printerService.sendReplayPackets(buffers);
}

/**
 * Print plain text rendered as a bitmap.
 * @param {string} text
 */
async function printText(text) {
  _ensureConnected();
  console.log(`[Print] Text: "${text}"`);
  const bitmap   = await bitmapService.textToBitmap(text);
  const printBuf = packetService.buildPrintBuffer(bitmap, config.LABEL_WIDTH_PX, config.LABEL_HEIGHT_PX);
  const chunks   = packetService.buildChunks(printBuf);
  await printerService.sendChunks(chunks);
}

/**
 * Print a structured gelato label.
 * @param {{ title: string, subtitle?: string, price?: string, copies?: number }} params
 */
async function printLabel({ title, subtitle, price, copies = 1 }) {
  _ensureConnected();
  console.log(`[Print] Label: "${title}" ×${copies}`);

  const bitmap   = await bitmapService.labelToBitmap({ title, subtitle, price });
  const printBuf = packetService.buildPrintBuffer(bitmap, config.LABEL_WIDTH_PX, config.LABEL_HEIGHT_PX);
  const chunks   = packetService.buildChunks(printBuf);

  for (let i = 0; i < copies; i++) {
    if (copies > 1) console.log(`[Print] Copy ${i + 1}/${copies}`);
    await printerService.sendChunks(chunks);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _ensureConnected() {
  if (!printerService.isConnected) {
    throw new Error('Printer not connected. Call POST /printer/connect first.');
  }
}

module.exports = { printReplay, printText, printLabel };
