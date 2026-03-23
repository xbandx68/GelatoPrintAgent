const express = require('express');
const router = express.Router();
const queueService = require('../services/queue.service');
const printService = require('../services/print.service');

// POST /print/test  — replay catturato (garantito funzionante)
router.post('/test', async (req, res) => {
  try {
    const jobId = await queueService.enqueue(() => printService.printReplay());
    res.json({ queued: true, jobId });
  } catch (err) {
    console.error('[Route] Print test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /print/text  — testo libero → bitmap → stampa
router.post('/text', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const jobId = await queueService.enqueue(() => printService.printText(text));
    res.json({ queued: true, jobId });
  } catch (err) {
    console.error('[Route] Print text error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /print/label  — etichetta strutturata → bitmap → stampa
router.post('/label', async (req, res) => {
  const { title, subtitle, price, copies = 1 } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const jobId = await queueService.enqueue(() =>
      printService.printLabel({ title, subtitle, price, copies })
    );
    res.json({ queued: true, jobId });
  } catch (err) {
    console.error('[Route] Print label error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /print/image  — base64 PNG/JPG dal frontend → stampa diretta
// Body: { image: "base64...", rotate?: true, threshold?: 128, copies?: 1 }
router.post('/image', async (req, res) => {
  const { image, rotate = true, threshold = 128, copies = 1 } = req.body;
  if (!image) return res.status(400).json({ error: 'image (base64) required' });

  try {
    const jobId = await queueService.enqueue(() =>
      printService.printImage({ image, rotate, threshold, copies })
    );
    res.json({ queued: true, jobId });
  } catch (err) {
    console.error('[Route] Print image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /print/queue  — stato coda
router.get('/queue', (req, res) => {
  res.json({ pending: queueService.getQueueLength() });
});

module.exports = router;
