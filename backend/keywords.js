/**
 * Keyword Research sub-app
 *
 * Proxies the iTunes Search API to find apps by keyword.
 * Returns normalized search results with rankings.
 *
 * Mount: app.route('/api', keywordsApp)
 */
import { Hono } from 'hono';

const app = new Hono();

/** @type {number} Maximum searches per user per window */
const MAX_SEARCHES = 10;
/** @type {number} Rate limit window in milliseconds (15 minutes) */
const RATE_WINDOW = 15 * 60 * 1000;
/** @type {Map<string, {count: number, resetAt: number}>} Per-user rate limit store */
const rateLimits = new Map();

/** @type {number} Maximum rate limit entries before LRU eviction */
const MAX_ENTRIES = 1000;

/**
 * Check if a user has exceeded the keyword search rate limit.
 *
 * @param {string} userId - User identifier
 * @returns {boolean} True if rate limited
 */
function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    if (rateLimits.size >= MAX_ENTRIES) {
      const oldest = rateLimits.keys().next().value;
      rateLimits.delete(oldest);
    }
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > MAX_SEARCHES;
}

/** @type {number} Maximum retry attempts for iTunes API */
const MAX_RETRIES = 3;

/**
 * Fetch from iTunes API with exponential backoff.
 *
 * @param {string} url - iTunes API URL
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} After MAX_RETRIES failures
 */
async function fetchWithBackoff(url) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Search for apps by keyword via iTunes Search API.
 *
 * @route GET /keywords/search?term=<term>
 * @param {string} term - Search keyword
 * @returns {Array<Object>} Normalized search results with rank, name, developer, etc.
 * @throws {400} If term is missing
 * @throws {429} If rate limited
 * @throws {500} On iTunes API failure
 */
app.get("/keywords/search", async (c) => {
  try {
    const term = c.req.query('term');
    if (!term) return c.json({ error: "term query parameter is required" }, 400);

    const userId = c.get('userID') || 'anonymous';
    if (isRateLimited(userId)) {
      return c.json({ error: "Too many searches. Please wait a few minutes." }, 429);
    }

    const data = await fetchWithBackoff(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&limit=25`
    );

    const results = data.results.map((app, i) => ({
      rank: i + 1,
      name: app.trackName,
      developer: app.artistName,
      icon: app.artworkUrl60,
      rating: app.averageUserRating ? app.averageUserRating.toFixed(1) : 'N/A',
      reviews: app.userRatingCount || 0,
      price: app.formattedPrice || 'Free',
      bundleId: app.bundleId,
      url: app.trackViewUrl
    }));

    return c.json(results);
  } catch (err) {
    console.error("Keyword search error:", err);
    return c.json({ error: "Search temporarily unavailable. Please try again." }, 500);
  }
});

export default app;
