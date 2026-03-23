module.exports = {
  PORT: process.env.PORT || 3001,

  // BLE UUIDs
  BLE_SERVICE_UUID: 'ff00',
  BLE_CHAR_WRITE_UUID: 'ff02',
  BLE_CHAR_NOTIFY_UUID: 'ff03',
  BLE_SCAN_DURATION_MS: 8000,

  // Printing timing
  CHUNK_SIZE: 95,           // bytes per BLE write (reverse-engineered from P15)
  CHUNK_DELAY_MS: 50,       // delay between chunks (spec: 30-80ms)
  INIT_DELAY_MS: 200,       // delay after init command
  PREPRINT_DELAY_MS: 100,   // delay after pre-print command
  JOB_SETTLE_MS: 3000,      // wait after last chunk for printer to finish

  // Label dimensions — P15: 96px wide (12 bytes/line), variable height
  LABEL_WIDTH_PX: 96,
  LABEL_HEIGHT_PX: 320,
  LABEL_BYTES_PER_LINE: 12, // 96 / 8 = 12

  // Protocol byte sequences (reverse-engineered from HCI log)
  CMD_INIT: [0x10, 0xff, 0x50, 0xf1],       // init / status query
  CMD_PREPRINT: [0x10, 0xff, 0x40],          // pre-print trigger
  CMD_JOB_START: [0x10, 0xff, 0xf1, 0x02],  // job start marker
  CMD_JOB_END: [0x10, 0xff, 0xf1, 0x45],    // job end marker
  CMD_RASTER: [0x1d, 0x76, 0x30, 0x00],     // ESC/POS GS v 0 raster image
  CMD_PAGE_END: [0x1d, 0x0c],               // page end / partial cut

  // Notify responses
  NOTIFY_ACK: [0x01, 0x01],  // per-chunk ack
  NOTIFY_OK: [0x4f, 0x4b],   // job complete "OK"
};
