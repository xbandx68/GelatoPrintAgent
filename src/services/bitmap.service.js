const Jimp = require('jimp');
const config = require('../config');

// Print dimensions (what the printer receives): 96px wide × 320px tall
const PRINT_W = config.LABEL_WIDTH_PX;    // 96  (= 12mm)
const PRINT_H = config.LABEL_HEIGHT_PX;   // 320 (= 40mm)

// Render canvas — LANDSCAPE: wide × short, then rotated 90° CW → 96×320
const RENDER_W = PRINT_H;  // 320px  (40mm, horizontal)
const RENDER_H = PRINT_W;  //  96px  (12mm, vertical)

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
    font, 5, 5,
    { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
    RENDER_W - 10
  );
  return _rotateTo1bpp(image);
}

/**
 * Render a structured gelato label into a 1bpp bitmap.
 *
 * Landscape canvas (320×96px):
 *
 *  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Banana Breeze (FONT_16, left)   3,50 EUR (FONT_32, right)
 *  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Sorbetto banana, calamansi e cocco (FONT_8)
 *
 * Then rotated 90° CW → 96×320 for the printer.
 *
 * @param {{ title: string, subtitle?: string, price?: string }} params
 * @returns {Promise<Buffer>}
 */
async function labelToBitmap({ title, subtitle, price }) {
  const image = await Jimp.create(RENDER_W, RENDER_H, 0xffffffff);

  // FONT_SANS_32 = 32px tall  (~19px per avg char)
  // FONT_SANS_16 = 16px tall  (~10px per avg char)
  // FONT_SANS_8  =  8px tall  ( ~5px per avg char)
  const fontLg = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const fontMd = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const fontSm = await Jimp.loadFont(Jimp.FONT_SANS_8_BLACK);

  // ── Top border ──
  _hline(image, 2);
  _hline(image, 3);

  // ── Row 1: Title (FONT_16, left) + Price (FONT_32, right) ──
  //   canvas height = 96px
  //   price 32px tall: centered in y → y = (96-32)/2 = 32, but
  //   we want title+separator+subtitle, so use y=8 for title row
  //
  //   title area:  x=5,   maxW=180px  (fits "Banana Breeze" in FONT_16 ≈ 120px)
  //   price area:  x=190, maxW=125px, right-aligned
  //                "3,50 EUR" in FONT_32 ≈ 8chars × ~19px = ~152px → too wide
  //                "3,50 EUR" in FONT_16 ≈ 8chars × ~10px =  ~80px → fits ✓
  //
  //   Use FONT_32 for price only, but keep text short (pass "3,50 €" not "3,50 EUR")
  //   The user passes whatever price string — keep FONT_16 to be safe.

  // Title — FONT_16, vertically centered in top half (~y=16 to center 16px in 40px)
  const titleY = 12;
  image.print(fontMd, 5, titleY, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, 180);

  // Price — FONT_32, right side, starts at x=190
  const priceY = 6;
  if (price) {
    image.print(fontLg, 190, priceY,
      { text: price, alignmentX: Jimp.HORIZONTAL_ALIGN_RIGHT }, 125
    );
  }

  // ── Middle separator ──
  const sepY = 44;
  _hline(image, sepY);
  _hline(image, sepY + 1);

  // ── Row 2: Subtitle ── FONT_8, full width
  if (subtitle) {
    image.print(fontSm, 5, sepY + 5,
      { text: subtitle, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, RENDER_W - 10
    );
  }

  return _rotateTo1bpp(image);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _hline(image, y) {
  for (let x = 0; x < RENDER_W; x++) image.setPixelColor(0x000000ff, x, y);
}

/**
 * Rotate 90° CW, then convert to 1bpp.
 * 320×96 → (after rotate) 96×320 → 3840 bytes
 */
function _rotateTo1bpp(image) {
  image.rotate(-90); // Jimp: negative = clockwise
  return imageTo1bpp(image);
}

/**
 * Convert a Jimp image to 1bpp packed bitmap (MSB-first, row-major).
 * @param {Jimp} image
 * @returns {Buffer}
 */
function imageTo1bpp(image, threshold = 128) {
  const { width, height } = image.bitmap;
  const bytesPerRow = Math.ceil(width / 8);
  const buf = Buffer.alloc(bytesPerRow * height, 0);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const rgba = Jimp.intToRGBA(image.getPixelColor(col, row));
      if ((rgba.r + rgba.g + rgba.b) / 3 < threshold) {
        buf[row * bytesPerRow + Math.floor(col / 8)] |= 1 << (7 - (col % 8));
      }
    }
  }

  console.log(`[Bitmap] ${width}×${height} → ${buf.length} bytes (1bpp, threshold:${threshold})`);
  return buf;
}

/**
 * Convert a base64 image (PNG/JPG) to a 1bpp printer bitmap.
 *
 * The image is resized to fit the printer dimensions using CONTAIN
 * (white letterboxing), then optionally rotated 90° CW.
 *
 * @param {string} base64  Raw base64 or data-URL (data:image/png;base64,...)
 * @param {object} opts
 * @param {boolean} [opts.rotate=true]     Rotate 90° CW (use true for landscape images)
 * @param {number}  [opts.threshold=128]   Brightness threshold for black pixel
 * @returns {Promise<Buffer>}
 */
async function base64ToBitmap(base64, { rotate = true, threshold = 128 } = {}) {
  // Strip data-URL prefix if present
  const raw = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');

  const image = await Jimp.read(buf);

  if (rotate) {
    // Frontend sends landscape (wide) image → resize to 320×96 → rotate → 96×320
    image.contain(RENDER_W, RENDER_H, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
    image.background(0xffffffff);
    image.rotate(-90);
  } else {
    // Frontend sends portrait (tall) image → resize directly to 96×320
    image.contain(PRINT_W, PRINT_H, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
    image.background(0xffffffff);
  }

  return imageTo1bpp(image, threshold);
}

module.exports = { textToBitmap, labelToBitmap, base64ToBitmap, imageTo1bpp };
