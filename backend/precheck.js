/**
 * Metadata Precheck sub-app
 *
 * Scans App Store metadata for common rejection triggers before submission.
 * Supports regex pattern matching and custom async check functions.
 *
 * Mount: app.route('/api', precheckApp)
 */
import { Hono } from 'hono';

const app = new Hono();

/**
 * Precheck rules for App Store metadata validation.
 * Each rule has an id, name, and either patterns (regex array) or a check function.
 *
 * @type {Array<{id: string, name: string, patterns?: RegExp[], message?: string, check?: Function}>}
 */
const PRECHECK_RULES = [
  {
    id: 'negative_apple',
    name: 'Negative Apple Sentiment',
    patterns: [
      /\bapple\s+(sucks|is\s+bad|is\s+terrible|is\s+awful|is\s+broken|fails|doesn'?t\s+work)/i,
      /\bhate\s+apple/i,
      /\bapple\s+reject/i
    ],
    message: 'Contains negative references to Apple — likely to trigger rejection'
  },
  {
    id: 'competitor_mention',
    name: 'Competitor Mention',
    patterns: [
      /\bandroid\b/i, /\bgoogle\s+play\b/i, /\bsamsung\b/i, /\bblackberry\b/i,
      /\bwindows\s+phone\b/i, /\bhuawei\b/i, /\bfire\s+os\b/i, /\btizen\b/i
    ],
    message: 'Mentions a competing platform — Apple may reject for competitor references'
  },
  {
    id: 'curse_words',
    name: 'Objectionable Language',
    patterns: [
      /\b(fuck|shit|ass|damn|bitch|bastard|crap|hell|dick|piss)\b/i
    ],
    message: 'Contains potentially objectionable language'
  },
  {
    id: 'future_functionality',
    name: 'Future Functionality',
    patterns: [
      /\bcoming\s+soon\b/i, /\bin\s+development\b/i, /\bplanned\s+feature\b/i,
      /\bfuture\s+update\b/i, /\bwill\s+be\s+added\b/i, /\bstay\s+tuned\b/i,
      /\bunder\s+construction\b/i, /\bcoming\s+in\s+v?\d/i, /\bnot\s+yet\s+available\b/i
    ],
    message: 'References unreleased features — Apple rejects apps that promise future functionality'
  },
  {
    id: 'test_words',
    name: 'Test/Debug Words',
    patterns: [
      /\btest\b/i, /\bdebug\b/i, /\bTODO\b/, /\bFIXME\b/, /\bHACK\b/,
      /\bdummy\b/i, /\bfake\b/i, /\bsample\s+data\b/i
    ],
    message: 'Contains test/debug language that should be removed before submission'
  },
  {
    id: 'placeholder_text',
    name: 'Placeholder Text',
    patterns: [
      /\blorem\s+ipsum\b/i, /\bdolor\s+sit\s+amet\b/i,
      /\bplaceholder\b/i, /\binsert\s+(text|description|name)\b/i,
      /\bXXX\b/, /\bTBD\b/
    ],
    message: 'Contains placeholder text'
  },
  {
    id: 'free_iap',
    name: 'Free In-App Purchase Claims',
    patterns: [
      /\bfree\b.*\bin-?app\s+purchase/i,
      /\bin-?app\s+purchase.*\bfree\b/i,
      /\bno\s+cost\b.*\bpurchase/i
    ],
    message: 'Claims in-app purchases are free — misleading and likely to be rejected'
  },
  {
    id: 'copyright_year',
    name: 'Outdated Copyright Year',
    check: (text) => {
      const currentYear = new Date().getFullYear();
      const yearMatch = text.match(/(?:©|\bcopyright\b)\s*(\d{4})/i);
      if (yearMatch && parseInt(yearMatch[1]) < currentYear) {
        return `Copyright year ${yearMatch[1]} doesn't match current year ${currentYear}`;
      }
      return null;
    }
  },
  {
    id: 'unreachable_url',
    name: 'Unreachable URLs',
    check: async (text) => {
      const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
      const urls = text.match(urlRegex);
      if (!urls) return null;

      const results = [];
      for (const url of urls.slice(0, 5)) {
        try {
          const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (!res.ok) results.push(`URL ${url} returned ${res.status}`);
        } catch {
          results.push(`URL ${url} is unreachable`);
        }
      }
      return results.length > 0 ? results.join('; ') : null;
    }
  },
  {
    id: 'price_mention',
    name: 'Price Mention in Description',
    patterns: [
      /\$\d+\.?\d*/,
      /\b\d+\.?\d*\s*(dollars?|USD|cents?)\b/i
    ],
    message: 'Contains specific pricing — prices may change and cause metadata to become inaccurate'
  }
];

/**
 * Run precheck rules against metadata text.
 *
 * Scans concatenated metadata fields against all precheck rules. Supports
 * both regex pattern matching and custom check functions (sync and async).
 *
 * @async
 * @param {string} text - Combined metadata text to scan
 * @returns {Promise<Array<{id: string, name: string, message: string}>>} Array of warnings
 */
async function runPrecheck(text) {
  const warnings = [];

  for (const rule of PRECHECK_RULES) {
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          warnings.push({ id: rule.id, name: rule.name, message: rule.message });
          break;
        }
      }
    }
    if (rule.check) {
      const result = await rule.check(text);
      if (result) {
        warnings.push({ id: rule.id, name: rule.name, message: result });
      }
    }
  }

  return warnings;
}

/**
 * Run precheck on App Store metadata fields.
 *
 * @route POST /precheck
 * @param {Object} body - Metadata fields
 * @param {string} [body.name] - App name
 * @param {string} [body.description] - App description
 * @param {string} [body.keywords] - Keywords
 * @param {string} [body.promotionalText] - Promotional text
 * @returns {Object} { warnings: Array, checked: number }
 * @throws {400} If neither name nor description provided
 * @throws {500} On processing failure
 */
app.post("/precheck", async (c) => {
  try {
    const { name, description, keywords, promotionalText } = await c.req.json();

    if (!description && !name) {
      return c.json({ error: "At least name or description is required" }, 400);
    }

    const combined = [name, description, keywords, promotionalText].filter(Boolean).join(' ');
    const warnings = await runPrecheck(combined);

    return c.json({ warnings, checked: combined.length });
  } catch (err) {
    console.error("Precheck error:", err);
    return c.json({ error: "Failed to run precheck" }, 500);
  }
});

export { PRECHECK_RULES, runPrecheck };
export default app;
