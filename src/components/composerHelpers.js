/**
 * Canvas drawing helpers and device constants for the screenshot composer
 *
 * Provides device dimension mappings and rendering functions for drawing
 * backgrounds, device frames, screenshots, and marketing text on an
 * HTML5 canvas element.
 *
 * @module composerHelpers
 */

/** Device dimension specifications for App Store Connect screenshot sizes */
export const DEVICES = {
  'iphone-67': { label: 'iPhone 16 Pro Max (6.7")', width: 1290, height: 2796, radius: 120, bezelWidth: 18 },
  'iphone-61': { label: 'iPhone 16 Pro (6.1")', width: 1179, height: 2556, radius: 110, bezelWidth: 16 },
  'iphone-47': { label: 'iPhone SE (4.7")', width: 750, height: 1334, radius: 0, bezelWidth: 12 },
  'ipad-129': { label: 'iPad Pro 12.9"', width: 2048, height: 2732, radius: 40, bezelWidth: 20 }
};

/** Font weight label-to-CSS value mapping */
export const FONT_WEIGHTS = {
  Light: '300',
  Regular: '400',
  Bold: '700'
};

/**
 * Draw a rounded rectangle path on the canvas context
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} x - Top-left x coordinate
 * @param {number} y - Top-left y coordinate
 * @param {number} w - Rectangle width
 * @param {number} h - Rectangle height
 * @param {number} r - Corner radius in pixels
 */
export function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw the background layer on the canvas
 *
 * Supports solid color, linear gradient, or uploaded background image.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {Object} settings - Background settings
 * @param {string} settings.bgColor - Solid background color hex
 * @param {boolean} settings.isGradient - Whether gradient mode is active
 * @param {string} settings.gradientStart - Gradient start color hex
 * @param {string} settings.gradientEnd - Gradient end color hex
 * @param {string} settings.gradientDirection - Gradient direction: "top-bottom", "left-right", or "diagonal"
 * @param {HTMLImageElement|null} settings.bgImage - Optional background image element
 */
export function drawBackground(ctx, w, h, settings) {
  const { bgColor, isGradient, gradientStart, gradientEnd, gradientDirection, bgImage } = settings;

  if (bgImage) {
    const imgRatio = bgImage.width / bgImage.height;
    const canvasRatio = w / h;
    let sx = 0, sy = 0, sw = bgImage.width, sh = bgImage.height;
    if (imgRatio > canvasRatio) {
      sw = bgImage.height * canvasRatio;
      sx = (bgImage.width - sw) / 2;
    } else {
      sh = bgImage.width / canvasRatio;
      sy = (bgImage.height - sh) / 2;
    }
    ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, w, h);
    return;
  }

  if (isGradient) {
    let x0 = 0, y0 = 0, x1 = 0, y1 = h;
    if (gradientDirection === 'left-right') { x1 = w; y1 = 0; }
    if (gradientDirection === 'diagonal') { x1 = w; y1 = h; }
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, gradientStart);
    grad.addColorStop(1, gradientEnd);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bgColor;
  }
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw the device frame bezel and clip the screen area
 *
 * Draws an outer dark rounded rectangle simulating a device bezel,
 * then clips to the inner screen area for screenshot rendering.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} x - Screen area top-left x
 * @param {number} y - Screen area top-left y
 * @param {number} w - Screen area width
 * @param {number} h - Screen area height
 * @param {number} radius - Screen corner radius
 * @param {number} bezelWidth - Bezel border width in pixels
 */
export function drawDeviceFrame(ctx, x, y, w, h, radius, bezelWidth) {
  ctx.fillStyle = '#1a1a1a';
  drawRoundedRect(ctx, x - bezelWidth, y - bezelWidth, w + bezelWidth * 2, h + bezelWidth * 2, radius + bezelWidth);
  ctx.fill();

  // Clip to inner screen
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
}

/**
 * Draw word-wrapped marketing text with optional drop shadow
 *
 * Renders one or two lines of centered text at the specified position,
 * automatically wrapping words that exceed maxWidth.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {string} text - Text content to render
 * @param {number} x - Center x position
 * @param {number} y - Starting y position
 * @param {number} maxWidth - Maximum text width before wrapping
 * @param {number} fontSize - Font size in pixels
 * @param {string} color - Text fill color
 * @param {boolean} hasShadow - Whether to apply drop shadow
 * @param {string} fontWeight - CSS font weight value ("300", "400", or "700")
 */
export function drawMarketingText(ctx, text, x, y, maxWidth, fontSize, color, hasShadow, fontWeight) {
  if (!text) return;

  ctx.font = `${fontWeight} ${fontSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';

  if (hasShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  }

  const words = text.split(' ');
  let line = '';
  let lineY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, lineY);
      line = word + ' ';
      lineY += fontSize * 1.3;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, lineY);

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Render the full composite image on the canvas
 *
 * Draws all layers in order: background, device frame (optional),
 * screenshot, and marketing text. Called on every settings change.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {Object} state - Full composer state
 * @param {string} state.device - Device key from DEVICES
 * @param {boolean} state.showBezel - Whether to draw device frame
 * @param {HTMLImageElement|null} state.screenshotImage - Uploaded screenshot
 * @param {string} state.textLine1 - First line of marketing text
 * @param {string} state.textLine2 - Second line of marketing text
 * @param {string} state.textPosition - "top" or "bottom"
 * @param {number} state.fontSize - Text font size
 * @param {string} state.textColor - Text color hex
 * @param {boolean} state.textShadow - Text shadow toggle
 * @param {string} state.fontWeight - Font weight key from FONT_WEIGHTS
 * @param {string} state.bgColor - Background color hex
 * @param {boolean} state.isGradient - Gradient mode toggle
 * @param {string} state.gradientStart - Gradient start color
 * @param {string} state.gradientEnd - Gradient end color
 * @param {string} state.gradientDirection - Gradient direction
 * @param {HTMLImageElement|null} state.bgImage - Background image element
 */
export function drawComposite(canvas, state) {
  const ctx = canvas.getContext('2d');
  const deviceInfo = DEVICES[state.device];
  const { width: cw, height: ch } = deviceInfo;

  canvas.width = cw;
  canvas.height = ch;
  ctx.clearRect(0, 0, cw, ch);

  // 1. Background
  drawBackground(ctx, cw, ch, {
    bgColor: state.bgColor,
    isGradient: state.isGradient,
    gradientStart: state.gradientStart,
    gradientEnd: state.gradientEnd,
    gradientDirection: state.gradientDirection,
    bgImage: state.bgImage
  });

  // Calculate device frame area — centered, with padding for text
  const padding = ch * 0.12;
  const textAreaHeight = ch * 0.15;
  const isTop = state.textPosition === 'top';

  const frameY = isTop ? textAreaHeight + padding * 0.5 : padding * 0.5;
  const availableHeight = ch - textAreaHeight - padding;
  const screenScale = Math.min((cw * 0.85) / deviceInfo.width, availableHeight / deviceInfo.height);
  const frameW = deviceInfo.width * screenScale;
  const frameH = deviceInfo.height * screenScale;
  const frameX = (cw - frameW) / 2;
  const scaledRadius = deviceInfo.radius * screenScale;
  const scaledBezel = deviceInfo.bezelWidth * screenScale;

  // 2. Device frame
  ctx.save();
  if (state.showBezel) {
    drawDeviceFrame(ctx, frameX, frameY, frameW, frameH, scaledRadius, scaledBezel);
  } else {
    // Still clip to rounded screen shape
    drawRoundedRect(ctx, frameX, frameY, frameW, frameH, scaledRadius);
    ctx.clip();
  }

  // 3. Screenshot
  if (state.screenshotImage) {
    ctx.drawImage(state.screenshotImage, frameX, frameY, frameW, frameH);
  } else {
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(frameX, frameY, frameW, frameH);
  }
  ctx.restore();

  // 4. Marketing text
  const textMaxWidth = cw * 0.8;
  const weightValue = FONT_WEIGHTS[state.fontWeight] || '700';
  const scaledFontSize = state.fontSize * (cw / 1290);

  if (isTop) {
    const textY1 = padding * 0.6;
    drawMarketingText(ctx, state.textLine1, cw / 2, textY1, textMaxWidth, scaledFontSize, state.textColor, state.textShadow, weightValue);
    if (state.textLine2) {
      drawMarketingText(ctx, state.textLine2, cw / 2, textY1 + scaledFontSize * 1.4, textMaxWidth, scaledFontSize * 0.75, state.textColor, state.textShadow, weightValue);
    }
  } else {
    const textY1 = frameY + frameH + padding * 0.5;
    drawMarketingText(ctx, state.textLine1, cw / 2, textY1, textMaxWidth, scaledFontSize, state.textColor, state.textShadow, weightValue);
    if (state.textLine2) {
      drawMarketingText(ctx, state.textLine2, cw / 2, textY1 + scaledFontSize * 1.4, textMaxWidth, scaledFontSize * 0.75, state.textColor, state.textShadow, weightValue);
    }
  }
}

/**
 * Export the canvas content as a PNG file download
 *
 * Uses canvas.toBlob() to generate the PNG and triggers a browser download.
 *
 * @param {HTMLCanvasElement} canvas - Canvas element to export
 * @param {string} deviceKey - Device key for filename
 */
export function exportCanvasPNG(canvas, deviceKey) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screenshot-${deviceKey}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
