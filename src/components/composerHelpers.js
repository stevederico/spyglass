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
  'iphone-69':  { label: 'iPhone 6.9"', width: 1320, height: 2868, radius: 125, bezelWidth: 18 },
  'iphone-67':  { label: 'iPhone 6.7"', width: 1290, height: 2796, radius: 120, bezelWidth: 18 },
  'iphone-65':  { label: 'iPhone 6.3"', width: 1206, height: 2622, radius: 115, bezelWidth: 16 },
  'iphone-61':  { label: 'iPhone 6.1"', width: 1179, height: 2556, radius: 110, bezelWidth: 16 },
  'ipad-13':    { label: 'iPad 13"', width: 2064, height: 2752, radius: 50, bezelWidth: 22 },
  'ipad-129':   { label: 'iPad 12.9"', width: 2048, height: 2732, radius: 40, bezelWidth: 20 },
  'ipad-11':    { label: 'iPad 11"', width: 1668, height: 2388, radius: 40, bezelWidth: 18 },
  'ipad-105':   { label: 'iPad 10.5"', width: 1668, height: 2224, radius: 0, bezelWidth: 16 }
};

/** Font weight label-to-CSS value mapping */
export const FONT_WEIGHTS = {
  Light: '300',
  Regular: '400',
  Bold: '700'
};

/**
 * Build the CSS font string with optional custom font family
 *
 * @param {string} fontWeight - CSS font weight value
 * @param {number} fontSize - Font size in pixels
 * @param {string} [fontFamily] - Optional custom font family name
 * @returns {string} CSS font shorthand string
 */
export function buildFontString(fontWeight, fontSize, fontFamily) {
  return fontFamily
    ? `${fontWeight} ${fontSize}px "${fontFamily}", -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`
    : `${fontWeight} ${fontSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
}

/**
 * Calculate the largest font size that fits text within given bounds
 *
 * Starts at initialFontSize and shrinks by 2px until text fits within
 * maxWidth and maxHeight constraints. Floors at 16px minimum.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {string} text - Text to measure
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} maxHeight - Maximum height in pixels
 * @param {number} initialFontSize - Starting font size in pixels
 * @param {string} fontWeight - CSS font weight value
 * @param {string} [fontFamily] - Optional custom font family name
 * @returns {{ fontSize: number, lines: string[] }} Fitted font size and wrapped lines
 */
export function fitTextToBox(ctx, text, maxWidth, maxHeight, initialFontSize, fontWeight, fontFamily) {
  const MIN_FONT_SIZE = 16;
  let fontSize = initialFontSize;

  while (fontSize > MIN_FONT_SIZE) {
    ctx.font = buildFontString(fontWeight, fontSize, fontFamily);
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());

    const totalHeight = lines.length * fontSize * 1.3;
    if (totalHeight <= maxHeight) {
      return { fontSize, lines };
    }
    fontSize -= 2;
  }

  // Floor: return at minimum size
  ctx.font = buildFontString(fontWeight, MIN_FONT_SIZE, fontFamily);
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine.trim());
  return { fontSize: MIN_FONT_SIZE, lines };
}

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
function drawRoundedRect(ctx, x, y, w, h, r) {
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
function drawBackground(ctx, w, h, settings) {
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
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {number} x - Screen area top-left x
 * @param {number} y - Screen area top-left y
 * @param {number} w - Screen area width
 * @param {number} h - Screen area height
 * @param {number} radius - Screen corner radius
 * @param {number} bezelWidth - Bezel border width in pixels
 */
function drawDeviceFrame(ctx, x, y, w, h, radius, bezelWidth) {
  ctx.fillStyle = '#1a1a1a';
  drawRoundedRect(ctx, x - bezelWidth, y - bezelWidth, w + bezelWidth * 2, h + bezelWidth * 2, radius + bezelWidth);
  ctx.fill();

  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
}

/**
 * Draw word-wrapped marketing text with optional drop shadow
 *
 * Renders centered text at the specified position, automatically wrapping
 * words that exceed maxWidth. When maxHeight is provided, uses fitTextToBox
 * to auto-shrink font size. Supports custom font families.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @param {string} text - Text content to render
 * @param {number} x - Center x position
 * @param {number} y - Starting y position
 * @param {number} maxWidth - Maximum text width before wrapping
 * @param {number} fontSize - Font size in pixels
 * @param {string} color - Text fill color
 * @param {number} shadowBlur - Shadow blur radius (0 = no shadow)
 * @param {string} fontWeight - CSS font weight value ("300", "400", or "700")
 * @param {number} [maxHeight] - Optional max height to auto-fit text into
 * @param {string} [fontFamily] - Optional custom font family name
 */
function drawMarketingText(ctx, text, x, y, maxWidth, fontSize, color, shadowBlur, fontWeight, maxHeight, fontFamily) {
  if (!text) return;

  ctx.fillStyle = color;
  ctx.textAlign = 'center';

  if (shadowBlur > 0) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(shadowBlur / 2);
  }

  if (maxHeight) {
    const { fontSize: fittedSize, lines } = fitTextToBox(ctx, text, maxWidth, maxHeight, fontSize, fontWeight, fontFamily);
    ctx.font = buildFontString(fontWeight, fittedSize, fontFamily);
    let lineY = y;
    for (const line of lines) {
      ctx.fillText(line, x, lineY);
      lineY += fittedSize * 1.3;
    }
  } else {
    ctx.font = buildFontString(fontWeight, fontSize, fontFamily);
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
  }

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
 * @param {boolean} [state.autoFitText=true] - Whether to auto-shrink text to fit
 * @param {string} [state.fontFamily] - Optional custom font family name
 * @param {number} [state.editingLine] - Line number being inline-edited (1 or 2); skipped during draw
 * @param {HTMLImageElement|null} [state.frameImage] - Loaded device frame PNG overlay
 * @param {Object|null} [state.frameModelInfo] - Frame model info from FRAME_MODELS
 * @param {'full'|'zoomed'} [state.frameLayout='full'] - Device layout: "full" fits entire device, "zoomed" scales wider and clips bottom
 * @param {Object} [state.layers] - Layer visibility flags { background, device, headline, subheadline }
 * @param {'portrait'|'landscape'} [state.orientation='portrait'] - Canvas orientation
 */
export function drawComposite(canvas, state) {
  const ctx = canvas.getContext('2d');
  const deviceInfo = DEVICES[state.device];
  const isLandscape = state.orientation === 'landscape';
  const cw = isLandscape ? deviceInfo.height : deviceInfo.width;
  const ch = isLandscape ? deviceInfo.width : deviceInfo.height;

  canvas.width = cw;
  canvas.height = ch;
  ctx.clearRect(0, 0, cw, ch);

  const vis = state.layers || { background: true, device: true, headline: true, subheadline: true };

  if (vis.background) {
    drawBackground(ctx, cw, ch, {
      bgColor: state.bgColor,
      isGradient: state.isGradient,
      gradientStart: state.gradientStart,
      gradientEnd: state.gradientEnd,
      gradientDirection: state.gradientDirection,
      bgImage: state.bgImage
    });
  }

  const layout = state.frameLayout || 'full';
  const isFullscreen = layout === 'fullscreen';
  const isZoomed = layout === 'zoomed';
  const isTop = state.textPosition === 'top';

  // --- Text area layout ---
  // Canvas fillText uses textBaseline='alphabetic' by default.
  // y = baseline position. Ascenders extend ~0.8× fontSize above baseline.
  // So to place text with its visual top at Y, set baseline = Y + fontSize * 0.8.
  //
  // Layout (text on top):
  //   topMargin -> headline baseline -> gap -> subtitle baseline -> bottomGap -> device
  //
  const fontRef = Math.min(cw, ch);
  const scaledFont = state.fontSize * (fontRef / 1290);
  const hasHeadline = vis.headline !== false && state.textLine1;
  const hasSubtitle = state.textLine2;

  // Equal margin above headline visual top and below subtitle visual bottom.
  // Canvas fillText baseline='alphabetic': ascenders ~0.8× font, descenders ~0.4× font.
  const textMargin = scaledFont * 0.9;

  // Headline baseline Y (visual top = textMargin, baseline = visual top + ascender)
  const headlineBaselineY = textMargin + scaledFont * 0.8;
  // Subtitle baseline Y
  const subtitleBaselineY = headlineBaselineY + scaledFont * 1.4;

  // Visual bottom of the last text line
  const textVisualBottom = hasSubtitle
    ? subtitleBaselineY + scaledFont * 0.75 * 0.4
    : hasHeadline
      ? headlineBaselineY + scaledFont * 0.4
      : 0;

  // textAreaHeight = visual bottom + same margin as top (symmetric)
  const textAreaHeight = isFullscreen ? 0 : textVisualBottom + textMargin;

  // Device screen dimensions, swapped for landscape
  const devW = isLandscape ? deviceInfo.height : deviceInfo.width;
  const devH = isLandscape ? deviceInfo.width : deviceInfo.height;

  let screenScale, frameX, frameY, frameW, frameH;
  if (isFullscreen) {
    screenScale = 1;
    frameX = 0;
    frameY = 0;
    frameW = cw;
    frameH = ch;
  } else if (isLandscape && !isFullscreen) {
    // Landscape: device centered, text above or below, fit device to ~85% height
    const devicePadding = ch * 0.05;
    const availH = ch - textAreaHeight - devicePadding;
    const availW = cw * 0.85;
    screenScale = Math.min(availW / devW, availH / devH);
    frameW = devW * screenScale;
    frameH = devH * screenScale;
    frameX = (cw - frameW) / 2;
    frameY = isTop
      ? textAreaHeight + (availH - frameH) / 2
      : devicePadding + (availH - frameH) / 2;
    if (isZoomed) {
      screenScale = Math.min((cw * 0.95) / devW, (ch * 0.7) / devH);
      frameW = devW * screenScale;
      frameH = devH * screenScale;
      frameX = (cw - frameW) / 2;
      frameY = isTop ? textAreaHeight : ch * 0.05;
    }
  } else if (isZoomed) {
    screenScale = (cw * 0.90) / devW;
    frameW = devW * screenScale;
    frameH = devH * screenScale;
    frameX = (cw - frameW) / 2;
    frameY = isTop ? textAreaHeight : scaledFont * 0.5;
  } else {
    // Portrait normal: fit entire device within available space
    frameY = isTop ? textAreaHeight : scaledFont * 0.5;
    const availableHeight = ch - textAreaHeight - scaledFont * 0.5;
    screenScale = Math.min((cw * 0.85) / devW, availableHeight / devH);
    frameW = devW * screenScale;
    frameH = devH * screenScale;
    frameX = (cw - frameW) / 2;
  }
  const scaledRadius = deviceInfo.radius * screenScale;
  const scaledBezel = deviceInfo.bezelWidth * screenScale;

  if (vis.device && isFullscreen) {
    // Fullscreen: screenshot fills entire canvas, no frame or bezel
    if (state.screenshotImage) {
      ctx.drawImage(state.screenshotImage, 0, 0, cw, ch);
    } else {
      ctx.fillStyle = '#2a2a3e';
      ctx.fillRect(0, 0, cw, ch);
    }
  } else if (vis.device) {
    const hasFramePNG = state.frameImage && state.frameModelInfo;

    if (hasFramePNG) {
      const model = state.frameModelInfo;
      const mScreenW = isLandscape ? model.screenHeight : model.screenWidth;
      const mScreenH = isLandscape ? model.screenWidth : model.screenHeight;
      const mFrameW = isLandscape ? model.frameHeight : model.frameWidth;
      const mFrameH = isLandscape ? model.frameWidth : model.frameHeight;
      const screenInsetX = (mFrameW - mScreenW) / 2;
      const screenInsetY = (mFrameH - mScreenH) / 2;
      const pngScale = frameW / mScreenW;

      // Draw screenshot clipped to screen area
      ctx.save();
      drawRoundedRect(ctx, frameX, frameY, frameW, frameH, scaledRadius);
      ctx.clip();
      if (state.screenshotImage) {
        ctx.drawImage(state.screenshotImage, frameX, frameY, frameW, frameH);
      } else {
        ctx.fillStyle = '#2a2a3e';
        ctx.fillRect(frameX, frameY, frameW, frameH);
      }
      ctx.restore();

      // Overlay frame PNG on top
      const framePngX = frameX - screenInsetX * pngScale;
      const framePngY = frameY - screenInsetY * pngScale;
      const framePngW = mFrameW * pngScale;
      const framePngH = mFrameH * pngScale;
      ctx.drawImage(state.frameImage, framePngX, framePngY, framePngW, framePngH);
    } else {
      ctx.save();
      if (state.showBezel) {
        drawDeviceFrame(ctx, frameX, frameY, frameW, frameH, scaledRadius, scaledBezel);
      } else {
        drawRoundedRect(ctx, frameX, frameY, frameW, frameH, scaledRadius);
        ctx.clip();
      }

      if (state.screenshotImage) {
        ctx.drawImage(state.screenshotImage, frameX, frameY, frameW, frameH);
      } else {
        ctx.fillStyle = '#2a2a3e';
        ctx.fillRect(frameX, frameY, frameW, frameH);
      }
      ctx.restore();
    }
  }

  if (isFullscreen) return;

  const textMaxWidth = cw * 0.8;
  const weightValue = FONT_WEIGHTS[state.fontWeight] || '700';
  const autoFitMaxHeight = state.autoFitText !== false ? textAreaHeight : undefined;
  const fontFamily = state.fontFamily || '';

  const showHeadline = vis.headline && state.editingLine !== 1;
  const showSubheadline = vis.subheadline && state.editingLine !== 2;

  if (isTop) {
    // When subtitle is hidden, center headline vertically in the text area
    const headlineOnly = showHeadline && !showSubheadline;
    const drawHeadlineY = headlineOnly
      ? textAreaHeight / 2 - scaledFont * 0.6 + scaledFont * 0.8
      : headlineBaselineY;
    const drawSubtitleY = headlineOnly
      ? 0
      : subtitleBaselineY;

    if (showHeadline) {
      drawMarketingText(ctx, state.textLine1, cw / 2, drawHeadlineY, textMaxWidth, scaledFont, state.textColor, state.textShadow, weightValue, autoFitMaxHeight, fontFamily);
    }
    if (state.textLine2 && showSubheadline) {
      drawMarketingText(ctx, state.textLine2, cw / 2, drawSubtitleY, textMaxWidth, scaledFont * 0.75, state.textColor, state.textShadow, weightValue, autoFitMaxHeight, fontFamily);
    }
  } else {
    // Text below device
    const bottomHeadlineOnly = showHeadline && !showSubheadline;
    const bottomAreaTop = frameY + frameH;
    const bottomAreaHeight = ch - bottomAreaTop;
    const bottomTextY1 = bottomHeadlineOnly
      ? bottomAreaTop + bottomAreaHeight / 2 - scaledFont * 0.6 + scaledFont * 0.8
      : frameY + frameH + textMargin + scaledFont * 0.8;

    if (showHeadline) {
      drawMarketingText(ctx, state.textLine1, cw / 2, bottomTextY1, textMaxWidth, scaledFont, state.textColor, state.textShadow, weightValue, autoFitMaxHeight, fontFamily);
    }
    if (state.textLine2 && showSubheadline) {
      drawMarketingText(ctx, state.textLine2, cw / 2, bottomTextY1 + scaledFont * 1.4, textMaxWidth, scaledFont * 0.75, state.textColor, state.textShadow, weightValue, autoFitMaxHeight, fontFamily);
    }
  }
}

/** Built-in starter template presets */
export const STARTER_TEMPLATES = [
  {
    name: 'Minimal',
    settings: {
      bgColor: '#ffffff', isGradient: false, gradientStart: '#ffffff', gradientEnd: '#f0f0f0', gradientDirection: 'top-bottom',
      textColor: '#000000', textShadow: 0, fontWeight: 'Regular', textPosition: 'top', fontSize: 100
    }
  },
  {
    name: 'Bold',
    settings: {
      bgColor: '#1a1a2e', isGradient: true, gradientStart: '#1a1a2e', gradientEnd: '#16213e', gradientDirection: 'top-bottom',
      textColor: '#ffffff', textShadow: 8, fontWeight: 'Bold', textPosition: 'top', fontSize: 100
    }
  },
  {
    name: 'Gradient',
    settings: {
      bgColor: '#ff6b6b', isGradient: true, gradientStart: '#ff6b6b', gradientEnd: '#ffa502', gradientDirection: 'diagonal',
      textColor: '#ffffff', textShadow: 8, fontWeight: 'Bold', textPosition: 'bottom', fontSize: 100
    }
  }
];

/**
 * Render a composite image with locale-specific text
 *
 * Creates an offscreen canvas, calls drawComposite with translated text,
 * and returns the result as a PNG Blob.
 *
 * @param {HTMLCanvasElement} referenceCanvas - Canvas for dimension reference
 * @param {Object} baseState - Base composer state
 * @param {string} localeCode - Locale code for filename
 * @param {string} line1 - Translated line 1 text
 * @param {string} line2 - Translated line 2 text
 * @returns {Promise<Blob>} PNG blob of the rendered composition
 */
export function renderForLocale(referenceCanvas, baseState, localeCode, line1, line2) {
  return new Promise((resolve) => {
    const offscreen = document.createElement('canvas');
    drawComposite(offscreen, { ...baseState, textLine1: line1, textLine2: line2 });
    offscreen.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Export the canvas content as a PNG file download
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
