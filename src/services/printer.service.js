const bleService = require('./ble.service');
const config = require('../config');

const state = {
  connected: false,
  deviceId: null,
  peripheral: null,
  ff02: null,
  ff03: null,
};

// ─── Public API ──────────────────────────────────────────────────────────────

function getStatus() {
  return { connected: state.connected, deviceId: state.deviceId };
}

/**
 * Connect to the printer via BLE, subscribe to notify (ff03).
 * Does NOT send init — init is sent per-job in sendChunks / sendReplayPackets.
 */
async function connect(deviceId) {
  if (state.connected) {
    console.log('[Printer] Already connected — disconnecting first');
    await disconnect();
  }

  const { peripheral, ff02, ff03 } = await bleService.connectToDevice(deviceId);

  state.peripheral = peripheral;
  state.ff02 = ff02;
  state.ff03 = ff03;
  state.deviceId = deviceId;
  state.connected = true;

  peripheral.on('disconnect', _onDisconnect);

  await ff03.subscribeAsync();
  console.log('[Printer] Subscribed to ff03 notifications');

  // Passive notify logger (non-blocking)
  ff03.on('data', (data) => {
    console.log('[Printer] NOTIFY ff03:', data.toString('hex'), '|', data.toString().trim());
  });
}

async function disconnect() {
  if (state.peripheral) {
    try { await state.peripheral.disconnectAsync(); } catch {}
  }
  _clearState();
}

/**
 * Send the captured REPLAY_PACKETS directly (includes init + pre-print).
 * This is the validated, known-working print path.
 * @param {Buffer[]} buffers  output of packetService.hexPacketsToBuffers()
 */
async function sendReplayPackets(buffers) {
  _ensureConnected();
  console.log(`[Printer] Replay: sending ${buffers.length} packets`);

  for (let i = 0; i < buffers.length; i++) {
    console.log(`[Printer] [${i + 1}/${buffers.length}] ${buffers[i].toString('hex').slice(0, 20)}...`);
    await _write(buffers[i]);
    await _sleep(30);
  }

  console.log('[Printer] Replay sent — settling...');
  await _sleep(config.JOB_SETTLE_MS);
  console.log('[Printer] Replay complete');
}

/**
 * Send a generated print job.
 * Sends: init → pre-print → data chunks → settle
 * @param {Buffer[]} chunks  output of packetService.buildChunks()
 */
async function sendChunks(chunks) {
  _ensureConnected();

  // Init
  console.log('[Printer] Init...');
  await _write(Buffer.from(config.CMD_INIT));
  await _sleep(config.INIT_DELAY_MS);

  // Pre-print
  console.log('[Printer] Pre-print...');
  await _write(Buffer.from(config.CMD_PREPRINT));
  await _sleep(config.PREPRINT_DELAY_MS);

  // Data chunks
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Printer] Chunk ${i + 1}/${chunks.length} (${chunks[i].length}B)`);
    await _write(chunks[i]);
    await _sleep(config.CHUNK_DELAY_MS);
  }

  // Wait for printer to finish
  console.log('[Printer] Waiting for job to settle...');
  await _sleep(config.JOB_SETTLE_MS);
  console.log('[Printer] Job complete');
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function _write(buffer) {
  if (!state.ff02) throw new Error('Printer not connected');
  await state.ff02.writeAsync(buffer, false);
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _ensureConnected() {
  if (!state.connected) throw new Error('Printer not connected. Call POST /printer/connect first.');
}

function _onDisconnect() {
  console.log('[Printer] Disconnected');
  _clearState();
}

function _clearState() {
  state.connected = false;
  state.deviceId = null;
  state.peripheral = null;
  state.ff02 = null;
  state.ff03 = null;
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  sendChunks,
  sendReplayPackets,
  get isConnected() { return state.connected; },
};
