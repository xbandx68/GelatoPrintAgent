'use strict';

const { app, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const os   = require('os');
const http = require('http');
const Jimp = require('jimp');

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── Boot Express server ───────────────────────────────────────────────────────
require('../src/server.js');
const printerService = require('../src/services/printer.service');
const config         = require('../src/config');

// ── Icon builder — Jimp PNG (works reliably as Windows tray icon) ─────────────
async function buildCircleIcon(r, g, b) {
  const size = 32, cx = 16, cy = 16, radius = 13;
  const image = await Jimp.create(size, size, 0x00000000); // transparent
  const color = Jimp.rgbaToInt(r, g, b, 255);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2)
        image.setPixelColor(color, x, y);
    }
  }
  const buf = await image.getBufferAsync(Jimp.MIME_PNG);
  return nativeImage.createFromBuffer(buf);
}

// Icons are built async in app.whenReady()
let ICON_DISCONNECTED, ICON_CONNECTED;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLocalIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request(
      { hostname: '127.0.0.1', port: config.PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: config.PORT, path }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    }).on('error', reject);
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
let tray = null;

async function buildMenu() {
  const connected = printerService.isConnected;
  const ip        = getLocalIp();

  return Menu.buildFromTemplate([
    { label: 'Gelato Print Agent', enabled: false },
    { type: 'separator' },
    { label: connected ? '● Stampante: Connessa' : '○ Stampante: Non connessa', enabled: false },
    { label: `Rete: ${ip}:${config.PORT}`, enabled: false },
    { label: `mDNS: ${config.MDNS_NAME}.local`, enabled: false },
    { type: 'separator' },
    {
      label: 'Scansiona e connetti…',
      enabled: !connected,
      click: scanAndConnect,
    },
    {
      label: 'Disconnetti',
      enabled: connected,
      click: async () => {
        try {
          await httpPost('/printer/disconnect', {});
        } catch {}
        refreshTray();
      },
    },
    { type: 'separator' },
    {
      label: 'Apri webapp nel browser',
      click: () => shell.openExternal(`http://localhost:4200`),
    },
    { type: 'separator' },
    {
      label: 'Avvia con Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Esci',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);
}

async function refreshTray() {
  if (!tray) return;
  const connected = printerService.isConnected;
  tray.setImage(connected ? ICON_CONNECTED : ICON_DISCONNECTED);
  tray.setToolTip(connected
    ? `Gelato Print Agent — Connesso  |  ${config.MDNS_NAME}.local:${config.PORT}`
    : `Gelato Print Agent — Non connesso  |  ${config.MDNS_NAME}.local:${config.PORT}`
  );
  tray.setContextMenu(await buildMenu());
}

// ── Scan & connect ────────────────────────────────────────────────────────────
async function scanAndConnect() {
  try {
    tray.setToolTip('Gelato Print Agent — Scansione in corso…');
    const { devices } = await httpGet('/printer/devices');
    if (!devices || devices.length === 0) {
      await refreshTray();
      dialog.showMessageBox({ type: 'info', title: 'Gelato Print Agent', message: 'Nessuna stampante trovata.' });
      return;
    }
    const target = devices.find(d => d.name?.toUpperCase().includes('P15')) || devices[0];
    const result = await httpPost('/printer/connect', { deviceId: target.id });
    // Small delay to let printerService.isConnected update before reading it
    await new Promise(r => setTimeout(r, 500));
    refreshTray();
    if (result.connected) {
      dialog.showMessageBox({ type: 'info', title: 'Gelato Print Agent', message: `Connesso a ${target.name || target.id}` });
    } else {
      dialog.showErrorBox('Connessione fallita', result.error || 'Errore sconosciuto');
    }
  } catch (err) {
    dialog.showErrorBox('Errore', err.message);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (app.dock) app.dock.hide(); // macOS: no dock icon

  // Build PNG icons now (async, Jimp — works on Windows tray)
  ICON_DISCONNECTED = await buildCircleIcon(239, 68,  68); // red-500
  ICON_CONNECTED    = await buildCircleIcon(34,  197, 94); // green-500

  tray = new Tray(ICON_DISCONNECTED);
  await refreshTray();

  // Poll printer status every 2s to keep tray in sync
  setInterval(refreshTray, 2000);
});

app.on('window-all-closed', () => {}); // keep alive when no windows open
