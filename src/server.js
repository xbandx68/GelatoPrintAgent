const express = require('express');
const os = require('os');
const { Bonjour } = require('bonjour-service');
const config = require('./config');
const printerRoutes = require('./routes/printer.routes');
const printRoutes = require('./routes/print.routes');

const app = express();

app.use(express.json({ limit: '5mb' })); // base64 images can be large

// CORS: allow requests from any device on local network
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Routes
app.use('/printer', printerRoutes);
app.use('/print', printRoutes);

// Start server on all interfaces so LAN devices can reach it
app.listen(config.PORT, '0.0.0.0', () => {
  const localIp = _getLocalIp();
  console.log(`[Agent] Gelato Print Agent running on http://${localIp}:${config.PORT}`);
  console.log(`[Agent] mDNS: http://${config.MDNS_NAME}.local:${config.PORT}`);

  // Announce via mDNS so any device on the same network can discover the agent
  const bonjour = new Bonjour();
  bonjour.publish({ name: config.MDNS_NAME, type: 'http', port: config.PORT });
});

function _getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '0.0.0.0';
}
