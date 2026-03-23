const express = require('express');
const config = require('./config');
const printerRoutes = require('./routes/printer.routes');
const printRoutes = require('./routes/print.routes');

const app = express();

app.use(express.json());

// CORS: allow requests from local webapp
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

// Start server
app.listen(config.PORT, '127.0.0.1', () => {
  console.log(`[Agent] Gelato Print Agent running on http://127.0.0.1:${config.PORT}`);
});
