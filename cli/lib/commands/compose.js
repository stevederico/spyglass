/**
 * @module commands/compose
 * Composites App Store screenshots by combining device frames, background
 * templates, and optional translated text overlays. Produces per-locale,
 * per-device PNG files ready for App Store Connect upload.
 *
 * Supports developer-provided translations via --translations flag,
 * falling back to LibreTranslate for any missing locales.
 */

import { readdir, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { renderForLocale, registerFont } from '../core/canvas.js';
import { translateBatch } from '../core/translate.js';
import { DEVICES, STARTER_TEMPLATES } from '../shared/devices.js';
import { FRAME_MODELS } from '../shared/frames.js';
import { loadConfig } from '../core/config.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Resolve a template by name from the STARTER_TEMPLATES list, or return
 * the config's template block if `name` is "config" or not found.
 *
 * @param {string} name - Template name or "config"
 * @param {Object} [configTemplate] - Template settings from spyglass.config.json
 * @returns {Object} Merged template settings
 */
function resolveTemplate(name, configTemplate) {
  if (name && name !== 'config') {
    const starter = STARTER_TEMPLATES.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (starter) return { ...starter.settings, ...configTemplate };
  }
  return configTemplate || STARTER_TEMPLATES[1].settings;
}

/**
 * Resolve the file path to a device frame PNG for the given model and color.
 *
 * @param {string} modelSlug - Frame model key from FRAME_MODELS
 * @param {string} colorSlug - Color variant slug
 * @returns {Promise<string|null>} Absolute frame PNG path or null
 */
async function resolveFramePath(modelSlug, colorSlug) {
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const framePath = path.resolve(
    cliDir,
    '..', '..', '..', 'public', 'frames',
    modelSlug,
    `${colorSlug}-portrait.png`
  );

  try {
    await access(framePath);
    return framePath;
  } catch {
    return null;
  }
}

/**
 * List PNG files in a directory, sorted alphabetically.
 *
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Sorted array of absolute file paths
 */
async function listScreenshots(dir) {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Load developer-provided translations from a JSON file.
 *
 * Expected format:
 * {
 *   "home": {
 *     "en-US": { "line1": "Track Fitness", "line2": "Reach Goals" },
 *     "ja-JP": { "line1": "...", "line2": "..." }
 *   }
 * }
 *
 * @param {string} filePath - Absolute path to translations JSON
 * @returns {Promise<Object>} Parsed translations object
 */
async function loadTranslations(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Get translated text for a screen+locale, checking provided translations
 * first, then falling back to auto-translation via LibreTranslate.
 *
 * @param {string} screenName - Screenshot name (without extension)
 * @param {string} line1 - Default headline text
 * @param {string} line2 - Default subtitle text
 * @param {string[]} locales - Target locales
 * @param {Object|null} providedTranslations - Developer-provided translations keyed by screen name
 * @returns {Promise<Object<string, { line1: string, line2: string }>>} Translations keyed by locale
 */
async function resolveTranslations(screenName, line1, line2, locales, providedTranslations) {
  const result = {};
  const missingLocales = [];

  for (const locale of locales) {
    const provided = providedTranslations?.[screenName]?.[locale];
    if (provided) {
      result[locale] = {
        line1: provided.line1 ?? line1,
        line2: provided.line2 ?? line2
      };
    } else {
      missingLocales.push(locale);
    }
  }

  // Auto-translate missing locales via LibreTranslate
  if (missingLocales.length > 0 && (line1 || line2)) {
    try {
      const textsToTranslate = [line1, line2].filter(Boolean);
      const translated = await translateBatch(textsToTranslate, 'en', missingLocales);

      for (const locale of missingLocales) {
        const localeResult = translated[locale];
        if (Array.isArray(localeResult)) {
          result[locale] = {
            line1: localeResult[0] || line1,
            line2: textsToTranslate.length > 1 ? (localeResult[1] || line2) : line2
          };
        } else {
          // Translation failed for this locale, use original
          result[locale] = { line1, line2 };
        }
      }
    } catch {
      // LibreTranslate unavailable — use original text for all missing
      for (const locale of missingLocales) {
        result[locale] = { line1, line2 };
      }
    }
  } else {
    // No text to translate — fill missing with originals
    for (const locale of missingLocales) {
      result[locale] = { line1, line2 };
    }
  }

  return result;
}

/**
 * Composite App Store screenshots from raw captures, templates, and device specs.
 *
 * For each screenshot file and each target device, renders a composited image
 * with background, optional device frame, and text overlay. Supports developer-
 * provided translations via --translations flag; falls back to LibreTranslate
 * for any locales not covered in the translations file.
 *
 * @param {Object} args - CLI arguments
 * @param {string} args.screenshots - Directory containing raw screenshot PNGs
 * @param {string} [args.template="config"] - Template name or "config" to use project config
 * @param {string} [args.locales="en-US"] - Comma-separated locale codes
 * @param {string} [args.devices] - Comma-separated device tier keys (e.g. "iphone-69,ipad-13")
 * @param {string} [args.output="./output"] - Output directory path
 * @param {string} [args.translations] - Path to translations JSON file
 * @param {string} [args['line1']] - Inline headline text (single-screen shortcut)
 * @param {string} [args['line2']] - Inline subtitle text (single-screen shortcut)
 * @returns {Promise<void>}
 */
export async function compose(args) {
  try {
    const outputDir = path.resolve(args.output || './output');
    const locales = (args.locales || 'en-US').split(',').map((l) => l.trim()).filter(Boolean);
    const templateName = args.template || 'config';

    // Load project config if available
    let config = {};
    try {
      config = await loadConfig(process.cwd());
    } catch {
      // No config file, use defaults
    }

    const template = resolveTemplate(templateName, config.template);

    // Resolve target devices from args or config
    const deviceKeys = args.devices
      ? args.devices.split(',').map((d) => d.trim()).filter(Boolean)
      : config.devices || ['iphone-69'];

    // Load developer-provided translations if specified
    let providedTranslations = null;
    if (args.translations) {
      try {
        const translationsPath = path.resolve(args.translations);
        providedTranslations = await loadTranslations(translationsPath);
        console.log(`${CYAN}Loaded translations from ${translationsPath}${RESET}`);
      } catch (err) {
        console.error(`${RED}Failed to load translations: ${err.message}${RESET}`);
        process.exitCode = 1;
        return;
      }
    }

    // Resolve frame PNG path if template specifies a frame model
    let framePath = null;
    let frameSpec = null;
    if (template.frameModel && FRAME_MODELS[template.frameModel]) {
      frameSpec = FRAME_MODELS[template.frameModel];
      const colorSlug = template.frameColor || frameSpec.defaultColor;
      framePath = await resolveFramePath(template.frameModel, colorSlug);
      if (framePath) {
        console.log(`${CYAN}Loaded frame: ${BOLD}${frameSpec.label}${RESET}${CYAN} (${colorSlug})${RESET}`);
      }
    }

    // Gather screenshot files
    const screenshotDir = args.screenshots ? path.resolve(args.screenshots) : null;
    const screenshotFiles = screenshotDir ? await listScreenshots(screenshotDir) : [];

    if (screenshotFiles.length === 0) {
      console.log(`${CYAN}No screenshots found — rendering with placeholder backgrounds.${RESET}`);
    }

    // Use at least one entry so we produce output even without screenshots
    const screens = screenshotFiles.length > 0 ? screenshotFiles : [null];
    let totalRendered = 0;

    for (let i = 0; i < screens.length; i++) {
      const screenshotFile = screens[i];

      if (screenshotFile) {
        try {
          await access(screenshotFile);
        } catch (err) {
          console.error(`${RED}Failed to access ${screenshotFile}: ${err.message}${RESET}`);
          continue;
        }
      }

      const screenName = screenshotFile
        ? path.basename(screenshotFile, '.png')
        : `placeholder_${i}`;

      // Resolve screen text: CLI args > config screens > empty
      const screenConfig = config.screens?.[i] || {};
      const line1 = args.line1 || screenConfig.line1 || '';
      const line2 = args.line2 || screenConfig.line2 || '';

      // Get translations for all locales (provided + auto-translated)
      const translations = await resolveTranslations(
        screenName, line1, line2, locales, providedTranslations
      );

      for (const deviceKey of deviceKeys) {
        const deviceSpec = DEVICES[deviceKey];
        if (!deviceSpec) {
          console.log(`${RED}Unknown device tier "${deviceKey}", skipping.${RESET}`);
          continue;
        }

        const frameModelInfo = frameSpec ? {
          screenWidth: frameSpec.screenWidth,
          screenHeight: frameSpec.screenHeight,
          frameWidth: frameSpec.frameWidth,
          frameHeight: frameSpec.frameHeight
        } : null;

        for (const locale of locales) {
          const localeText = translations[locale] || { line1, line2 };

          const state = {
            ...template,
            device: deviceKey,
            screenshotPath: screenshotFile || '',
            framePath: framePath || '',
            frameModelInfo,
            textLine1: localeText.line1,
            textLine2: localeText.line2
          };

          try {
            const buffer = await renderForLocale(state, localeText.line1, localeText.line2, deviceKey);
            const localeDir = path.join(outputDir, locale);
            await mkdir(localeDir, { recursive: true });

            const filename = `screenshot-${deviceKey}-${i}.png`;
            const outPath = path.join(localeDir, filename);
            await writeFile(outPath, buffer);

            totalRendered++;
            console.log(`${GREEN}  Rendered: ${outPath}${RESET}`);
          } catch (err) {
            console.error(`${RED}  Render failed (${locale}/${deviceKey}/${screenName}): ${err.message}${RESET}`);
          }
        }
      }
    }

    console.log(`\n${CYAN}${'─'.repeat(50)}${RESET}`);
    console.log(`${GREEN}${BOLD}Compose complete:${RESET}${GREEN} ${totalRendered} image(s) rendered${RESET}`);
    console.log(`${CYAN}Output: ${outputDir}${RESET}`);
  } catch (err) {
    console.error(`${RED}Compose failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}
