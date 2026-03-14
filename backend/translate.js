// ==== LIBRETRANSLATE API MODULE ====
// Hono sub-app for text translation via LibreTranslate.
// Mount on the main app via: app.route('/api', translateApp)

import { Hono } from 'hono';

const app = new Hono();

const LIBRE_TRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';
const LIBRE_TRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || '';

/** Maps Apple App Store Connect locale codes to LibreTranslate language codes. */
const LOCALE_MAP = {
  'da-DK': 'da',
  'de-DE': 'de',
  'el-GR': 'el',
  'en-AU': 'en',
  'en-CA': 'en',
  'en-GB': 'en',
  'en-US': 'en',
  'es-ES': 'es',
  'es-MX': 'es',
  'fi-FI': 'fi',
  'fr-CA': 'fr',
  'fr-FR': 'fr',
  'id-ID': 'id',
  'it-IT': 'it',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'ms-MY': 'ms',
  'nl-NL': 'nl',
  'no-NO': 'nb',
  'pt-BR': 'pt',
  'pt-PT': 'pt',
  'ru-RU': 'ru',
  'sv-SE': 'sv',
  'th-TH': 'th',
  'tr-TR': 'tr',
  'cmn-Hans': 'zh',
  'cmn-Hant': 'zt',
  'vi-VI': 'vi'
};

/** Rate-limit delay in ms between sequential LibreTranslate requests. */
const BATCH_DELAY_MS = 500;

/**
 * Translate a single text string via LibreTranslate.
 *
 * @param {string} text - Source text to translate
 * @param {string} source - Source language code (e.g. 'en')
 * @param {string} target - Target language code (e.g. 'es')
 * @returns {Promise<string>} Translated text
 * @throws {Error} On non-OK HTTP response from LibreTranslate
 */
async function translateText(text, source, target) {
  const response = await fetch(LIBRE_TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source,
      target,
      api_key: LIBRE_TRANSLATE_API_KEY
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
 * @param {string} sourceLanguage - Source language code to skip (e.g. 'en')
 * @returns {{ uniqueLangs: Map<string, string>, langToLocales: Map<string, string[]> }}
 *   uniqueLangs maps one representative locale per unique target language,
 *   langToLocales maps each language code to all locales that use it.
 */
function buildLanguageGroups(sourceLanguage) {
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

// ============================================================
// Routes
// ============================================================

/**
 * POST /translate/text - Translate a single text string.
 *
 * @param {string} text - Text to translate
 * @param {string} source - Source language code
 * @param {string} target - Target language code
 * @returns {{ translatedText: string }}
 */
app.post('/translate/text', async (c) => {
  try {
    const { text, source, target } = await c.req.json();

    if (!text || !source || !target) {
      return c.json({ error: 'text, source, and target are required' }, 400);
    }

    const translatedText = await translateText(text, source, target);
    return c.json({ translatedText });
  } catch (e) {
    console.error('Translate /text error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /translate/batch - Translate texts to all App Store Connect locales.
 *
 * Translates each unique language once, then fans the result out to all
 * locales that share that language code. Source-language locales receive
 * the original texts unchanged. Failures for individual languages are
 * reported inline without blocking the rest.
 *
 * @param {string[]} texts - Array of source texts
 * @param {string} source - Source language code (e.g. 'en')
 * @returns {{ translations: Object<string, string[]> }}
 */
app.post('/translate/batch', async (c) => {
  try {
    const { texts, source } = await c.req.json();

    if (!Array.isArray(texts) || !texts.length || !source) {
      return c.json({ error: 'texts (non-empty array) and source are required' }, 400);
    }

    const { uniqueLangs, langToLocales } = buildLanguageGroups(source);
    const translations = {};

    // Fill source-language locales with original texts
    for (const [locale, langCode] of Object.entries(LOCALE_MAP)) {
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
        // Record error for all locales of this language, continue with others
        for (const locale of langToLocales.get(langCode)) {
          translations[locale] = { error: langErr.message };
        }
      }
    }

    return c.json({ translations });
  } catch (e) {
    console.error('Translate /batch error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /translate/languages - Return supported languages from LibreTranslate.
 *
 * @returns {{ languages: Object[] }} Array of language objects from LibreTranslate
 */
app.get('/translate/languages', async (c) => {
  try {
    const baseUrl = LIBRE_TRANSLATE_URL.replace(/\/translate$/, '');
    const response = await fetch(`${baseUrl}/languages`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LibreTranslate languages ${response.status}: ${body}`);
    }

    const languages = await response.json();
    return c.json({ languages });
  } catch (e) {
    console.error('Translate /languages error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/** @type {Hono} */
export default app;
