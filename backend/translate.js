// ==== MYMEMORY TRANSLATION API MODULE ====
// Hono sub-app for text translation via MyMemory API.
// Free tier: 5000 chars/day (anonymous), 50000 chars/day (with email).
// Mount on the main app via: app.route('/api', translateApp)

import { Hono } from 'hono';

const app = new Hono();

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Optional email for higher rate limit (50k chars/day instead of 5k) */
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || '';

/** Maps Apple App Store Connect locale codes to MyMemory language codes. */
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
  'no-NO': 'no',
  'pt-BR': 'pt',
  'pt-PT': 'pt',
  'ru-RU': 'ru',
  'sv-SE': 'sv',
  'th-TH': 'th',
  'tr-TR': 'tr',
  'cmn-Hans': 'zh-CN',
  'cmn-Hant': 'zh-TW',
  'vi-VI': 'vi'
};

/**
 * Delay between requests in ms. MyMemory doesn't publish strict rate limits
 * but we stay conservative to avoid getting blocked.
 */
const REQUEST_DELAY_MS = 1000;

/** Max retry attempts on 429/5xx before giving up on a request */
const MAX_RETRIES = 3;

/** Consecutive failures before the circuit breaker trips */
const CIRCUIT_BREAKER_THRESHOLD = 3;

/** Daily character limit — 5000 anonymous, 50000 with email */
const DAILY_CHAR_LIMIT = MYMEMORY_EMAIL ? 50000 : 5000;

/** In-memory character usage tracker, resets daily */
const quota = {
  charsUsed: 0,
  date: new Date().toISOString().slice(0, 10)
};

/**
 * Track characters used and check if quota is exhausted.
 * Resets at midnight (by date string comparison).
 *
 * @param {number} chars - Number of characters to add
 * @returns {{ charsUsed: number, charsRemaining: number, limit: number, exhausted: boolean }}
 */
function trackUsage(chars) {
  const today = new Date().toISOString().slice(0, 10);
  if (quota.date !== today) {
    quota.charsUsed = 0;
    quota.date = today;
  }
  quota.charsUsed += chars;
  return {
    charsUsed: quota.charsUsed,
    charsRemaining: Math.max(0, DAILY_CHAR_LIMIT - quota.charsUsed),
    limit: DAILY_CHAR_LIMIT,
    exhausted: quota.charsUsed >= DAILY_CHAR_LIMIT
  };
}

/**
 * Get current quota status without adding characters.
 *
 * @returns {{ charsUsed: number, charsRemaining: number, limit: number, exhausted: boolean }}
 */
function getQuotaStatus() {
  const today = new Date().toISOString().slice(0, 10);
  if (quota.date !== today) {
    quota.charsUsed = 0;
    quota.date = today;
  }
  return {
    charsUsed: quota.charsUsed,
    charsRemaining: Math.max(0, DAILY_CHAR_LIMIT - quota.charsUsed),
    limit: DAILY_CHAR_LIMIT,
    exhausted: quota.charsUsed >= DAILY_CHAR_LIMIT
  };
}

/**
 * Sleep for the given number of milliseconds
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Translate a single text string via MyMemory with exponential backoff.
 *
 * Retries on 429 (rate limit) and 5xx (server error) responses up to
 * MAX_RETRIES times with exponential delay (2s, 4s, 8s).
 * Throws immediately on 4xx errors other than 429.
 *
 * @param {string} text - Source text to translate
 * @param {string} source - Source language code (e.g. 'en')
 * @param {string} target - Target language code (e.g. 'de')
 * @returns {Promise<string>} Translated text
 * @throws {Error} On non-retryable HTTP errors, quota exhaustion, or after exhausting retries
 */
async function translateText(text, source, target) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const params = new URLSearchParams({
      q: text,
      langpair: `${source}|${target}`
    });
    if (MYMEMORY_EMAIL) params.set('de', MYMEMORY_EMAIL);

    const response = await fetch(`${MYMEMORY_URL}?${params}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000)
    });

    if (response.ok) {
      const data = await response.json();

      if (data.quotaFinished) {
        throw new Error('Daily translation quota reached — try again tomorrow');
      }

      if (data.responseStatus !== 200) {
        throw new Error(data.responseDetails || `MyMemory error ${data.responseStatus}`);
      }

      trackUsage(text.length);
      return data.responseData.translatedText;
    }

    const isRetryable = response.status === 429 || response.status >= 500;

    if (!isRetryable || attempt === MAX_RETRIES) {
      const body = await response.text();
      throw new Error(`MyMemory ${response.status}: ${body}`);
    }

    // Exponential backoff: 2s, 4s, 8s
    const backoffMs = 2000 * Math.pow(2, attempt);
    console.warn(`[Translate] ${response.status} on attempt ${attempt + 1}, retrying in ${backoffMs}ms...`);
    await sleep(backoffMs);
  }
}

/**
 * Deduplicate locale-to-language mappings and identify which locales
 * share the same language code so translations can be reused.
 *
 * @param {string} sourceLanguage - Source language code to skip (e.g. 'en')
 * @param {string[]} [filterLocales] - Optional list of locale codes to include. If omitted, all locales are included.
 * @returns {{ uniqueLangs: Map<string, string>, langToLocales: Map<string, string[]> }}
 *   uniqueLangs maps one representative locale per unique target language,
 *   langToLocales maps each language code to all locales that use it.
 */
function buildLanguageGroups(sourceLanguage, filterLocales) {
  const filterSet = filterLocales ? new Set(filterLocales) : null;
  const langToLocales = new Map();
  const uniqueLangs = new Map();

  for (const [locale, langCode] of Object.entries(LOCALE_MAP)) {
    if (langCode === sourceLanguage) continue;
    if (filterSet && !filterSet.has(locale)) continue;

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
 * POST /translate/batch - Translate texts to App Store Connect locales.
 *
 * Translates each unique language once, then fans the result out to all
 * locales that share that language code. Source-language locales receive
 * the original texts unchanged. Failures for individual languages are
 * reported inline without blocking the rest.
 *
 * Uses exponential backoff on rate-limit errors and a circuit breaker
 * that stops after CIRCUIT_BREAKER_THRESHOLD consecutive failures.
 *
 * @param {string[]} texts - Array of source texts
 * @param {string} source - Source language code (e.g. 'en')
 * @param {string[]} [locales] - Optional locale codes to translate. If omitted, translates all.
 * @returns {{ translations: Object<string, string[]> }}
 */
app.post('/translate/batch', async (c) => {
  try {
    const { texts, source, locales } = await c.req.json();

    if (!Array.isArray(texts) || !texts.length || !source) {
      return c.json({ error: 'texts (non-empty array) and source are required' }, 400);
    }

    const { uniqueLangs, langToLocales } = buildLanguageGroups(source, locales);
    const translations = {};

    // Fill source-language locales with original texts
    for (const [locale, langCode] of Object.entries(LOCALE_MAP)) {
      if (langCode === source) {
        if (!locales || locales.includes(locale)) {
          translations[locale] = [...texts];
        }
      }
    }

    const totalLangs = uniqueLangs.size;
    const totalRequests = totalLangs * texts.length;
    console.log(`[Translate] Batch: ${totalLangs} languages × ${texts.length} texts = ${totalRequests} requests`);

    // Circuit breaker state
    let consecutiveFailures = 0;
    let circuitOpen = false;

    // Translate each unique target language sequentially with rate-limit delay
    let isFirst = true;
    for (const [, langCode] of uniqueLangs) {
      // Circuit breaker: stop if too many consecutive failures
      if (circuitOpen) {
        for (const locale of langToLocales.get(langCode)) {
          translations[locale] = { error: 'Skipped — translation service unavailable' };
        }
        continue;
      }

      if (!isFirst) {
        await sleep(REQUEST_DELAY_MS);
      }
      isFirst = false;

      try {
        const translated = [];
        for (let i = 0; i < texts.length; i++) {
          if (i > 0) await sleep(REQUEST_DELAY_MS);
          const result = await translateText(texts[i], source, langCode);
          translated.push(result);
        }

        // Fan out to all locales sharing this language code
        for (const locale of langToLocales.get(langCode)) {
          translations[locale] = [...translated];
        }
        consecutiveFailures = 0;
      } catch (langErr) {
        consecutiveFailures++;
        console.error(`[Translate] Failed ${langCode} (${consecutiveFailures}/${CIRCUIT_BREAKER_THRESHOLD}):`, langErr.message);

        for (const locale of langToLocales.get(langCode)) {
          translations[locale] = { error: langErr.message };
        }

        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitOpen = true;
          console.error(`[Translate] Circuit breaker tripped after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures`);
        }
      }
    }

    return c.json({ translations, quota: getQuotaStatus() });
  } catch (e) {
    console.error('Translate /batch error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /translate/quota - Return current daily translation quota usage.
 *
 * @returns {{ charsUsed: number, charsRemaining: number, limit: number, exhausted: boolean }}
 */
app.get('/translate/quota', (c) => {
  return c.json(getQuotaStatus());
});

/** @type {Hono} */
export default app;
