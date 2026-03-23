const express = require('express');
const router = express.Router();
const bleService = require('../services/ble.service');
const printerService = require('../services/printer.service');

// GET /printer/devices
router.get('/devices', async (req, res) => {
  try {
    console.log('[Route] Scanning BLE devices...');
    const devices = await bleService.scan();
    res.json({ devices });
  } catch (err) {
    console.error('[Route] Scan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /printer/connect
router.post('/connect', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  try {
    console.log(`[Route] Connecting to ${deviceId}...`);
    await printerService.connect(deviceId);
    res.json({ connected: true, deviceId });
  } catch (err) {
    console.error('[Route] Connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /printer/status
router.get('/status', (req, res) => {
  const status = printerService.getStatus();
  res.json(status);
});

// POST /printer/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await printerService.disconnect();
    res.json({ connected: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
