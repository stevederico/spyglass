/**
 * @module commands/metadata
 * Generates App Store metadata (name, subtitle, description, keywords,
 * release notes) by scanning an Xcode project and feeding context to the
 * Grok AI model. Optionally translates generated text into target locales.
 */

import { scanProject } from '../core/scanner.js';
import { callGrok, SYSTEM_PROMPTS, safeParseJSON } from '../core/grok.js';
import { translateBatch } from '../core/translate.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** @type {string[]} Default metadata fields to generate */
const DEFAULT_FIELDS = ['name', 'subtitle', 'description', 'keywords', 'whatsNew'];

/**
 * Build a context prompt string from scan results for the AI model.
 *
 * @param {Object} scanResult - Output from scanProject
 * @param {string} [scanResult.appName] - Detected app name
 * @param {string[]} [scanResult.frameworks] - Linked frameworks
 * @param {string[]} [scanResult.swiftUIViews] - Detected SwiftUI views
 * @param {string[]} [scanResult.uiKitControllers] - Detected UIKit controllers
 * @param {string[]} [scanResult.targets] - Build targets
 * @returns {string} Formatted context string
 */
function buildContextPrompt(scanResult) {
  const parts = [];

  if (scanResult.appName) {
    parts.push(`App Name: ${scanResult.appName}`);
  }
  if (scanResult.frameworks?.length) {
    parts.push(`Frameworks: ${scanResult.frameworks.join(', ')}`);
  }
  if (scanResult.swiftUIViews?.length) {
    parts.push(`SwiftUI Views: ${scanResult.swiftUIViews.join(', ')}`);
  }
  if (scanResult.uikitControllers?.length) {
    parts.push(`UIKit Controllers: ${scanResult.uikitControllers.join(', ')}`);
  }
  if (scanResult.targets?.length) {
    parts.push(`Targets: ${scanResult.targets.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Generate App Store metadata using AI, informed by an Xcode project scan.
 *
 * Scans the project for app info and code structure, sends the context to
 * the Grok model with the metadata system prompt, then prints each field.
 * If `--locales` is provided, translates the generated text into each
 * specified locale and outputs per-locale JSON.
 *
 * @param {Object} args - CLI arguments
 * @param {string} args.path - Path to the `.xcodeproj` directory
 * @param {string} [args.fields] - Comma-separated field names to generate (default: name,subtitle,description,keywords,whatsNew)
 * @param {string} [args.tone="Professional"] - Writing tone for generated copy
 * @param {string} [args.locales] - Comma-separated locale codes for translation
 * @returns {Promise<void>}
 */
export async function metadata(args) {
  try {
    if (!args.path) {
      console.error(`${RED}Missing required argument: --path <path to .xcodeproj>${RESET}`);
      process.exitCode = 1;
      return;
    }

    const fields = args.fields
      ? args.fields.split(',').map((f) => f.trim()).filter(Boolean)
      : DEFAULT_FIELDS;

    const tone = args.tone || 'Professional';

    console.log(`${CYAN}Scanning project for context...${RESET}`);
    const scanResult = await scanProject(args.path);
    const context = buildContextPrompt(scanResult);

    console.log(`${CYAN}Generating metadata with ${BOLD}${tone}${RESET}${CYAN} tone...${RESET}\n`);

    const userPrompt = [
      `Generate App Store metadata for this app.`,
      `Tone: ${tone}`,
      `Fields: ${fields.join(', ')}`,
      ``,
      `App context:`,
      context,
      ``,
      `Respond with a JSON object where keys are the field names and values are the generated text.`
    ].join('\n');

    const response = await callGrok(SYSTEM_PROMPTS.metadata, userPrompt);
    const parsed = safeParseJSON(response);

    if (!parsed) {
      console.error(`${RED}Failed to parse AI response as JSON.${RESET}`);
      console.log(`${CYAN}Raw response:${RESET}\n${response}`);
      process.exitCode = 1;
      return;
    }

    // Print each field
    console.log(`${GREEN}${BOLD}Generated Metadata${RESET}`);
    console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);

    for (const field of fields) {
      const value = parsed[field];
      if (value !== undefined) {
        console.log(`${BOLD}${field}:${RESET}`);
        console.log(`  ${value}\n`);
      } else {
        console.log(`${RED}${field}: (not generated)${RESET}\n`);
      }
    }

    // Translate if locales specified
    if (args.locales) {
      const locales = args.locales.split(',').map((l) => l.trim()).filter(Boolean);

      if (locales.length > 0) {
        console.log(`${CYAN}Translating to ${locales.length} locale(s)...${RESET}\n`);

        const localized = {};

        for (const field of fields) {
          const value = parsed[field];
          if (!value) continue;

          try {
            const translationResult = await translateBatch([value], 'en', locales);
            for (const locale of locales) {
              if (!localized[locale]) localized[locale] = {};
              const result = translationResult[locale];
              localized[locale][field] = Array.isArray(result) ? result[0] : (result || value);
            }
          } catch (err) {
            console.error(`${RED}Translation failed for "${field}": ${err.message}${RESET}`);
          }
        }

        for (const locale of locales) {
          console.log(`${GREEN}${BOLD}${locale}:${RESET}`);
          console.log(JSON.stringify(localized[locale] || {}, null, 2));
          console.log('');
        }
      }
    }
  } catch (err) {
    console.error(`${RED}Metadata generation failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}
