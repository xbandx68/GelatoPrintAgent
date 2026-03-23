const Jimp = require('jimp');
const config = require('../config');

// Print dimensions (what the printer receives): 96px wide × 320px tall
const PRINT_W = config.LABEL_WIDTH_PX;    // 96  (= 12mm @ 8dpi/mm)
const PRINT_H = config.LABEL_HEIGHT_PX;   // 320 (= 40mm @ 8dpi/mm)

// Render canvas for LANDSCAPE layout: wide × short, then rotated 90° CW
const RENDER_W = PRINT_H;  // 320px wide (= 40mm)
const RENDER_H = PRINT_W;  //  96px tall (= 12mm)

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Render plain text into a 1bpp bitmap (landscape, rotated for printer).
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function textToBitmap(text) {
  const image = await Jimp.create(RENDER_W, RENDER_H, 0xffffffff);
  const font  = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  image.print(
    font, 4, 4,
    { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: Jimp.VERTICAL_ALIGN_TOP },
    RENDER_W - 8, RENDER_H - 8
  );

  return _rotateTo1bpp(image);
}

/**
 * Render a structured gelato label (title / subtitle / price) into a 1bpp bitmap.
 *
 * Landscape canvas: 320×96px
 *   ┌──────────────────────────────────────────────┐
 *   │ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │ ← border top
 *   │ Title (32px)                  Price (32px)  │
 *   │ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │ ← separator
 *   │ Subtitle (16px)                              │
 *   └──────────────────────────────────────────────┘
 *
 * Then rotated 90° CW → 96×320 sent to printer.
 *
 * @param {{ title: string, subtitle?: string, price?: string }} params
 * @returns {Promise<Buffer>}
 */
async function labelToBitmap({ title, subtitle, price }) {
  const image = await Jimp.create(RENDER_W, RENDER_H, 0xffffffff);

  const fontLg = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const fontSm = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  // Top border
  _hline(image, 2);
  _hline(image, 3);

  // Title — left-aligned, max 60% width
  const titleMaxW = Math.floor(RENDER_W * 0.6);
  image.print(fontLg, 5, 6, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, titleMaxW);

  // Price — right side, right-aligned
  if (price) {
    const priceX = RENDER_W - 5 - 120; // 120px reserved for price
    image.print(fontLg, priceX, 6, { text: price, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT }, 120);
  }

  // Middle separator (below 32px title + 6px top margin + 2px padding)
  const sepY = 42;
  _hline(image, sepY);
  _hline(image, sepY + 1);

  // Subtitle — below separator
  if (subtitle) {
    image.print(fontSm, 5, sepY + 4, { text: subtitle, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, RENDER_W - 10);
  }

  return _rotateTo1bpp(image);
}

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * Draw a horizontal line across the full canvas width.
 */
function _hline(image, y) {
  for (let x = 0; x < RENDER_W; x++) {
    image.setPixelColor(0x000000ff, x, y);
  }
}

/**
 * Rotate image 90° clockwise, then convert to 1bpp bitmap.
 * Input: RENDER_W × RENDER_H (320×96)
 * Output buffer: PRINT_W × PRINT_H (96×320) = 12 bytes/line × 320 lines
 */
function _rotateTo1bpp(image) {
  // Jimp rotate() is counter-clockwise; use -90 for clockwise
  image.rotate(-90);
  // After rotate: image is now PRINT_W × PRINT_H (96 × 320)
  return imageTo1bpp(image);
}

/**
 * Convert a Jimp image to 1bpp packed bitmap (MSB-first, row-major).
 * Dark pixels (brightness < 128) → bit 1 (printed black).
 * @param {Jimp} image
 * @returns {Buffer}
 */
function imageTo1bpp(image) {
  const { width, height } = image.bitmap;
  const bytesPerRow = Math.ceil(width / 8);
  const buf = Buffer.alloc(bytesPerRow * height, 0);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const rgba = Jimp.intToRGBA(image.getPixelColor(col, row));
      if ((rgba.r + rgba.g + rgba.b) / 3 < 128) {
        buf[row * bytesPerRow + Math.floor(col / 8)] |= 1 << (7 - (col % 8));
      }
    }
  }

  console.log(`[Bitmap] ${width}×${height} → ${buf.length} bytes (1bpp)`);
  return buf;
}

module.exports = { textToBitmap, labelToBitmap, imageTo1bpp };
