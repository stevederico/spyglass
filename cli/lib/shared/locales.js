/**
 * @module locales
 * App Store Connect locale codes and their LibreTranslate language code
 * mappings. Used by the CLI to resolve translation targets and validate
 * locale arguments.
 */

/**
 * Maps ASC locale codes to LibreTranslate language codes.
 * Keys are the 28 supported App Store Connect locale identifiers;
 * values are the corresponding two-letter codes accepted by LibreTranslate.
 * @type {Object<string, string>}
 */
export const LOCALE_MAP = {
  'da-DK': 'da', 'de-DE': 'de', 'el-GR': 'el',
  'en-AU': 'en', 'en-CA': 'en', 'en-GB': 'en', 'en-US': 'en',
  'es-ES': 'es', 'es-MX': 'es', 'fi-FI': 'fi',
  'fr-CA': 'fr', 'fr-FR': 'fr', 'id-ID': 'id', 'it-IT': 'it',
  'ja-JP': 'ja', 'ko-KR': 'ko', 'ms-MY': 'ms', 'nl-NL': 'nl',
  'no-NO': 'nb', 'pt-BR': 'pt', 'pt-PT': 'pt', 'ru-RU': 'ru',
  'sv-SE': 'sv', 'th-TH': 'th', 'tr-TR': 'tr',
  'cmn-Hans': 'zh', 'cmn-Hant': 'zt', 'vi-VI': 'vi'
};

/**
 * All 28 supported App Store Connect locale codes.
 * @type {string[]}
 */
export const ALL_LOCALES = Object.keys(LOCALE_MAP);
