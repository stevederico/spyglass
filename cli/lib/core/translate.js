/**
 * @module translate
 * LibreTranslate client for batch-translating App Store metadata.
 *
 * Extracted from the Spyglass web backend translate module. Provides a
 * single-text translation function, language group deduplication, and a
 * batch translation function optimized for CLI use.
 */

import { LOCALE_MAP } from '../shared/locales.js';

/** Rate-limit delay in ms between sequential LibreTranslate requests. */
export const BATCH_DELAY_MS = 500;

/**
 * Translate a single text string via LibreTranslate.
 *
 * Reads `LIBRETRANSLATE_URL` (default: `https://libretranslate.com/translate`)
 * and `LIBRETRANSLATE_API_KEY` from `process.env`.
 *
 * @param {string} text - Source text to translate
 * @param {string} source - Source language code (e.g. "en")
 * @param {string} target - Target language code (e.g. "es")
 * @returns {Promise<string>} Translated text
 * @throws {Error} On non-OK HTTP response from LibreTranslate
 */
export async function translateText(text, source, target) {
  const url = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';
  const apiKey = process.env.LIBRETRANSLATE_API_KEY || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source,
      target,
      api_key: apiKey
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LibreTranslate ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.translatedText;
}

/**
 * Deduplicate locale-to-language mappings and identify which locales
 * share the same language code so translations can be reused.
 *
 * @param {string} sourceLanguage - Source language code to skip (e.g. "en")
 * @returns {{ uniqueLangs: Map<string, string>, langToLocales: Map<string, string[]> }}
 *   `uniqueLangs` maps one representative locale per unique target language;
 *   `langToLocales` maps each language code to all locales that use it.
 */
export function buildLanguageGroups(sourceLanguage) {
  const langToLocales = new Map();
  const uniqueLangs = new Map();

  for (const [locale, langCode] of Object.entries(LOCALE_MAP)) {
    if (langCode === sourceLanguage) {
      continue;
    }
    if (!langToLocales.has(langCode)) {
      langToLocales.set(langCode, []);
      uniqueLangs.set(locale, langCode);
    }
    langToLocales.get(langCode).push(locale);
  }

  return { uniqueLangs, langToLocales };
}

/**
 * Translate an array of texts to multiple App Store Connect locales.
 *
 * Translates each unique target language once, then fans the result out
 * to all locales that share that language code. Source-language locales
 * receive the original texts unchanged. Individual language failures are
 * recorded inline as `{ error: string }` without blocking the rest.
 *
 * @param {string[]} texts - Array of source text strings to translate
 * @param {string} source - Source language code (e.g. "en")
 * @param {string[]} [locales] - Optional subset of ASC locale codes to target;
 *   defaults to all locales in LOCALE_MAP
 * @returns {Promise<Object<string, string[]|{error: string}>>}
 *   Object mapping locale code to translated texts array (or error object)
 */
export async function translateBatch(texts, source, locales) {
  const targetLocaleMap = locales
    ? Object.fromEntries(
        locales
          .filter((l) => LOCALE_MAP[l] !== undefined)
          .map((l) => [l, LOCALE_MAP[l]])
      )
    : LOCALE_MAP;

  const langToLocales = new Map();
  const uniqueLangs = new Map();

  for (const [locale, langCode] of Object.entries(targetLocaleMap)) {
    if (langCode === source) continue;
    if (!langToLocales.has(langCode)) {
      langToLocales.set(langCode, []);
      uniqueLangs.set(locale, langCode);
    }
    langToLocales.get(langCode).push(locale);
  }

  const translations = {};

  // Fill source-language locales with original texts
  for (const [locale, langCode] of Object.entries(targetLocaleMap)) {
    if (langCode === source) {
      translations[locale] = [...texts];
    }
  }

  // Translate each unique target language sequentially with rate-limit delay
  let isFirst = true;
  for (const [, langCode] of uniqueLangs) {
    if (!isFirst) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    isFirst = false;

    try {
      const translated = [];
      for (const text of texts) {
        const result = await translateText(text, source, langCode);
        translated.push(result);
      }

      // Fan out to all locales sharing this language code
      for (const locale of langToLocales.get(langCode)) {
        translations[locale] = [...translated];
      }
    } catch (langErr) {
      for (const locale of langToLocales.get(langCode)) {
        translations[locale] = { error: langErr.message };
      }
    }
  }

  return translations;
}
