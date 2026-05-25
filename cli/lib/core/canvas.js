/**
 * @module canvas
 * Thin Node.js wrapper around renderer.swift for screenshot compositing.
 *
 * Builds a JSON config from the composer state, shells out to the Swift
 * CoreGraphics renderer, and returns the result as a PNG buffer or file.
 * Replaces the previous @napi-rs/canvas dependency with a zero-dependency
 * approach that leverages macOS-native CoreGraphics and CoreText.
 */

import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DEVICES, FONT_WEIGHTS } from '../shared/devices.js';

const execFileAsync = promisify(execFile);

/** Absolute path to the Swift renderer script. */
const RENDERER_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'renderer.swift'
);

/**
 * Module-level map of registered font families to file paths.
 * Passed to the Swift renderer so it can register them via CTFontManager.
 * @type {Map<string, string>}
 */
const registeredFonts = new Map();

/**
 * Build the CSS font string with optional custom font family.
 *
 * Retained for config-building compatibility. Not used by the Swift renderer
 * directly, but useful for callers that need font string metadata.
 *
 * @param {string} fontWeight - CSS font weight value (e.g. "700")
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
 * Register a font file for use by the Swift renderer.
 *
 * Stores the path in a module-level map that gets serialized into the
 * JSON config passed to renderer.swift, which registers fonts via
 * CTFontManagerRegisterFontsForURL.
 *
 * @param {string} fontPath - Absolute path to the font file (.ttf, .otf, .woff2)
 * @param {string} family - Font family name to register under
 * @returns {boolean} Always true (registration happens at render time)
 */
export function registerFont(fontPath, family) {
  registeredFonts.set(family, fontPath);
  return true;
}

/**
 * Build the JSON config object from composer state for the Swift renderer.
 *
 * Maps the internal state shape (with Image objects, device keys, etc.) to
 * the flat JSON structure that renderer.swift expects — file paths instead
 * of loaded images, resolved device dimensions, and font registrations.
 *
 * @param {Object} state - Full composer state (see drawComposite docs)
 * @param {string} [screenshotPath] - Optional override path for the screenshot file
 * @returns {Object} JSON-serializable config for renderer.swift
 */
function buildConfig(state, screenshotPath) {
  const deviceInfo = DEVICES[state.device];
  const isLandscape = state.orientation === 'landscape';
  const cw = isLandscape ? deviceInfo.height : deviceInfo.width;
  const ch = isLandscape ? deviceInfo.width : deviceInfo.height;

  const config = {
    width: cw,
    height: ch,
    device: state.device,
    bgColor: state.bgColor,
    isGradient: state.isGradient,
    gradientStart: state.gradientStart,
    gradientEnd: state.gradientEnd,
    gradientDirection: state.gradientDirection,
    textColor: state.textColor,
    textShadow: state.textShadow,
    fontWeight: state.fontWeight,
    fontSize: state.fontSize,
    textPosition: state.textPosition,
    textLine1: state.textLine1,
    textLine2: state.textLine2,
    frameLayout: state.frameLayout || 'full',
    showBezel: state.showBezel,
    orientation: state.orientation || 'portrait',
    deviceRadius: deviceInfo.radius,
    deviceBezelWidth: deviceInfo.bezelWidth,
    autoFitText: state.autoFitText !== false,
    fontFamily: state.fontFamily || '',
    layers: state.layers || { background: true, device: true, headline: true, subheadline: true }
  };

  // Screenshot — accept path string or fall back to state.screenshotPath
  if (screenshotPath) {
    config.screenshotPath = screenshotPath;
  } else if (state.screenshotPath) {
    config.screenshotPath = state.screenshotPath;
  }

  // Background image path
  if (state.bgImagePath) {
    config.bgImagePath = state.bgImagePath;
  }

  // Frame PNG path and model info
  if (state.framePath && state.frameModelInfo) {
    config.framePath = state.framePath;
    config.frameModelInfo = state.frameModelInfo;
  }

  // Registered custom fonts
  if (registeredFonts.size > 0) {
    config.registeredFonts = Object.fromEntries(registeredFonts);
  }

  return config;
}

/**
 * Execute the Swift renderer with a JSON config and return the output path.
 *
 * Writes the config to a temp file, invokes `swift renderer.swift config output`,
 * and cleans up the temp config file afterward.
 *
 * @param {Object} config - JSON config object for renderer.swift
 * @param {string} outputPath - Absolute path for the output PNG file
 * @returns {Promise<string>} The output path on success
 * @throws {Error} If the Swift process exits with a non-zero code
 */
async function runSwiftRenderer(config, outputPath) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'spyglass-'));
  const configPath = path.join(tmpDir, `${randomUUID()}.json`);

  try {
    await writeFile(configPath, JSON.stringify(config));
    await execFileAsync('swift', [RENDERER_PATH, configPath, outputPath], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024
    });
    return outputPath;
  } finally {
    try { await unlink(configPath); } catch { /* ignore */ }
    try {
      const { rmdir } = await import('node:fs/promises');
      await rmdir(tmpDir);
    } catch { /* ignore */ }
  }
}

/**
 * Render the full composite image and write it to outputPath.
 *
 * Builds a JSON config from the composer state, invokes the Swift
 * CoreGraphics renderer, and returns the output path.
 *
 * @param {Object} state - Full composer state
 * @param {string} state.device - Device key from DEVICES
 * @param {boolean} state.showBezel - Whether to draw device frame bezel
 * @param {string} [state.screenshotPath] - Path to screenshot PNG file
 * @param {string} state.textLine1 - First line of marketing text
 * @param {string} state.textLine2 - Second line of marketing text
 * @param {string} state.textPosition - "top" or "bottom"
 * @param {number} state.fontSize - Text font size
 * @param {string} state.textColor - Text color hex
 * @param {number} state.textShadow - Text shadow blur radius
 * @param {string} state.fontWeight - Font weight key from FONT_WEIGHTS
 * @param {string} state.bgColor - Background color hex
 * @param {boolean} state.isGradient - Gradient mode toggle
 * @param {string} state.gradientStart - Gradient start color
 * @param {string} state.gradientEnd - Gradient end color
 * @param {string} state.gradientDirection - Gradient direction
 * @param {string} [state.bgImagePath] - Path to background image file
 * @param {boolean} [state.autoFitText=true] - Whether to auto-shrink text to fit
 * @param {string} [state.fontFamily] - Optional custom font family name
 * @param {string} [state.framePath] - Path to device frame PNG overlay
 * @param {Object|null} [state.frameModelInfo] - Frame model info from FRAME_MODELS
 * @param {'full'|'zoomed'|'fullscreen'} [state.frameLayout='full'] - Device layout mode
 * @param {Object} [state.layers] - Layer visibility flags
 * @param {'portrait'|'landscape'} [state.orientation='portrait'] - Canvas orientation
 * @param {string} outputPath - Absolute path for the output PNG file
 * @returns {Promise<string>} The output path
 */
export async function drawComposite(state, outputPath) {
  const config = buildConfig(state);
  return runSwiftRenderer(config, outputPath);
}

/**
 * Render a composite image with locale-specific text and return as a PNG Buffer.
 *
 * Builds a config with text overrides, renders to a temp file via the Swift
 * renderer, reads the result into a Buffer, and cleans up.
 *
 * @param {Object} baseState - Base composer state (see drawComposite for shape)
 * @param {string} line1 - Headline text (possibly translated)
 * @param {string} line2 - Subtitle text (possibly translated)
 * @param {string} [deviceKey] - Optional device key override; defaults to baseState.device
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function renderForLocale(baseState, line1, line2, deviceKey) {
  const device = deviceKey || baseState.device;
  const mergedState = { ...baseState, device, textLine1: line1, textLine2: line2 };
  const config = buildConfig(mergedState);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'spyglass-render-'));
  const outputPath = path.join(tmpDir, `${randomUUID()}.png`);

  try {
    await runSwiftRenderer(config, outputPath);
    const buffer = await readFile(outputPath);
    return buffer;
  } finally {
    try { await unlink(outputPath); } catch { /* ignore */ }
    try {
      const { rmdir } = await import('node:fs/promises');
      await rmdir(tmpDir);
    } catch { /* ignore */ }
  }
}
