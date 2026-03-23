const Jimp = require('jimp');
const config = require('../config');

/**
 * Render plain text into a 1bpp bitmap buffer.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
async function textToBitmap(text) {
  const { LABEL_WIDTH_PX, LABEL_HEIGHT_PX } = config;

  const image = await Jimp.create(LABEL_WIDTH_PX, LABEL_HEIGHT_PX, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  image.print(
    font,
    2,
    2,
    { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: Jimp.VERTICAL_ALIGN_TOP },
    LABEL_WIDTH_PX - 4,
    LABEL_HEIGHT_PX - 4
  );

  return imageTo1bpp(image);
}

/**
 * Render a structured gelato label (title / subtitle / price) into a 1bpp bitmap.
 *
 * Label is 96 × 320 pixels (portrait).
 * Layout:
 *   - Separator line at top
 *   - Title (bold look with FONT_SANS_16)
 *   - Subtitle (FONT_SANS_8)
 *   - Separator line
 *   - Price (FONT_SANS_16, bottom area)
 *
 * @param {{ title: string, subtitle?: string, price?: string }} params
 * @returns {Promise<Buffer>}
 */
async function labelToBitmap({ title, subtitle, price }) {
  const W = config.LABEL_WIDTH_PX;    // 96
  const H = config.LABEL_HEIGHT_PX;   // 320

  const image = await Jimp.create(W, H, 0xffffffff);

  const fontMid = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const fontSm  = await Jimp.loadFont(Jimp.FONT_SANS_8_BLACK);

  let y = 4;

  // Top border line (2px)
  for (let x = 0; x < W; x++) {
    image.setPixelColor(0x000000ff, x, 2);
    image.setPixelColor(0x000000ff, x, 3);
  }
  y = 8;

  // Title
  image.print(
    fontMid,
    2,
    y,
    { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
    W - 4
  );
  y += 22;

  // Subtitle
  if (subtitle) {
    image.print(
      fontSm,
      2,
      y,
      { text: subtitle, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
      W - 4
    );
    y += 12 * Math.ceil(subtitle.length / 14); // rough multi-line estimate
    y += 4;
  }

  // Middle separator
  for (let x = 0; x < W; x++) {
    image.setPixelColor(0x000000ff, x, y);
    image.setPixelColor(0x000000ff, x, y + 1);
  }
  y += 6;

  // Price
  if (price) {
    image.print(
      fontMid,
      2,
      y,
      { text: price, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
      W - 4
    );
  }

  return imageTo1bpp(image);
}

/**
 * Convert a Jimp image to 1bpp packed bitmap (MSB first, row-major).
 * Black pixels (brightness < 128) → bit 1.
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
      const brightness = (rgba.r + rgba.g + rgba.b) / 3;

      if (brightness < 128) {
        const byteIdx = row * bytesPerRow + Math.floor(col / 8);
        const bitIdx  = 7 - (col % 8);
        buf[byteIdx] |= 1 << bitIdx;
      }
    }
  }

  console.log(`[Bitmap] ${width}×${height} → ${buf.length} bytes (1bpp)`);
  return buf;
}

module.exports = { textToBitmap, labelToBitmap, imageTo1bpp };
