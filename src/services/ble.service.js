const noble = require('@abandonware/noble');
const config = require('../config');

// Track adapter state — noble fires 'stateChange' once at startup
let _adapterState = 'unknown';

noble.on('stateChange', (state) => {
  _adapterState = state;
  console.log('[BLE] Adapter state:', state);
});

/**
 * Wait until the BLE adapter is powered on.
 * @param {number} timeoutMs
 */
function waitForPower(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (_adapterState === 'poweredOn') return resolve();

    const timer = setTimeout(() => {
      noble.removeListener('stateChange', onState);
      reject(new Error(`BLE adapter not ready. State: ${_adapterState}`));
    }, timeoutMs);

    function onState(state) {
      if (state === 'poweredOn') {
        clearTimeout(timer);
        noble.removeListener('stateChange', onState);
        resolve();
      } else if (state === 'poweredOff' || state === 'unsupported') {
        clearTimeout(timer);
        noble.removeListener('stateChange', onState);
        reject(new Error(`BLE unavailable: ${state}`));
      }
    }
    noble.on('stateChange', onState);
  });
}

/**
 * Scan BLE devices for a given duration.
 * @param {number} durationMs
 * @returns {Promise<Array>}
 */
async function scan(durationMs = config.BLE_SCAN_DURATION_MS) {
  await waitForPower();

  return new Promise((resolve) => {
    const seen = new Map();

    function onDiscover(peripheral) {
      if (seen.has(peripheral.id)) return;
      const device = {
        id: peripheral.id,
        address: peripheral.address,
        name: peripheral.advertisement?.localName || '(unknown)',
        rssi: peripheral.rssi,
        connectable: peripheral.connectable,
      };
      seen.set(device.id, device);
      console.log(`[BLE] Found: ${device.name} (${device.id}) RSSI:${device.rssi}`);
    }

    noble.on('discover', onDiscover);

    noble.startScanningAsync([], true).catch((err) => {
      console.error('[BLE] Scan start error:', err.message);
    });

    setTimeout(async () => {
      noble.removeListener('discover', onDiscover);
      await noble.stopScanningAsync().catch(() => {});
      resolve([...seen.values()]);
    }, durationMs);
  });
}

/**
 * Connect to a BLE peripheral by ID.
 * Discovers service ff00 and characteristics ff02 / ff03.
 * @param {string} deviceId
 * @param {number} timeoutMs
 * @returns {Promise<{ peripheral, ff02, ff03 }>}
 */
async function connectToDevice(deviceId, timeoutMs = 15000) {
  await waitForPower();

  return new Promise((resolve, reject) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      noble.removeListener('discover', onDiscover);
      noble.stopScanningAsync().catch(() => {});
      reject(new Error(`BLE connect timeout (${timeoutMs}ms) for ${deviceId}`));
    }, timeoutMs);

    async function onDiscover(peripheral) {
      if (resolved) return;
      if (peripheral.id !== deviceId) return;
      if (!peripheral.connectable) return;

      resolved = true;
      noble.removeListener('discover', onDiscover);
      clearTimeout(timer);

      try {
        await noble.stopScanningAsync().catch(() => {});

        console.log(`[BLE] Connecting to ${deviceId}...`);
        await peripheral.connectAsync();
        console.log('[BLE] Connected');

        const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [config.BLE_SERVICE_UUID],
          [config.BLE_CHAR_WRITE_UUID, config.BLE_CHAR_NOTIFY_UUID]
        );

        const ff02 = characteristics.find((c) => c.uuid === config.BLE_CHAR_WRITE_UUID);
        const ff03 = characteristics.find((c) => c.uuid === config.BLE_CHAR_NOTIFY_UUID);

        if (!ff02 || !ff03) {
          await peripheral.disconnectAsync().catch(() => {});
          return reject(new Error('BLE characteristics ff02/ff03 not found'));
        }

        console.log('[BLE] Characteristics ff02 (write) and ff03 (notify) ready');
        resolve({ peripheral, ff02, ff03 });
      } catch (err) {
        reject(err);
      }
    }

    noble.on('discover', onDiscover);

    noble.startScanningAsync([], true).catch((err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

module.exports = { scan, connectToDevice };
