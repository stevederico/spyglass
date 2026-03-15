// ==== AI METADATA GENERATION MODULE ====
// Hono sub-app for AI-powered App Store metadata generation using x.ai Grok API.
// Mount on the main app via: app.route('/api', aiApp)

import { Hono } from 'hono';

const GROK_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-4.20-beta-latest-non-reasoning';

const SYSTEM_PROMPTS = {
  metadata: `You are an expert App Store Optimization (ASO) specialist. Generate compelling, keyword-rich App Store metadata that maximizes discoverability and conversion. Follow Apple's guidelines strictly:
- App Name: max 30 characters
- Subtitle: max 30 characters
- Description: max 4000 characters, front-load key features in first 3 lines
- Keywords: max 100 characters, comma-separated, no spaces after commas, no duplicates of words in app name
- What's New: max 4000 characters, use bullet points

Respond ONLY with valid JSON matching the requested format. No markdown, no code fences.`,

  keywords: `You are an ASO keyword optimization expert. Generate comma-separated keywords for the Apple App Store. Rules:
- Max 100 characters total
- No spaces after commas
- Don't repeat words already in the app name
- Mix head terms (high volume) with long-tail terms (low competition)
- Include misspellings and synonyms that users actually search
- No trademarked terms

Respond with ONLY the comma-separated keyword string. Nothing else.`,

  whatsNew: `You are a mobile app copywriter. Write release notes for the App Store that are concise, user-friendly, and use bullet points. Keep it under 200 words. Focus on user benefits, not technical details.

Respond with ONLY the release notes text. No JSON, no code fences.`,

  improveText: `You are an expert App Store copywriter. Improve the given text to be more compelling, clear, and optimized for the App Store. Maintain the same approximate length. Focus on user benefits and emotional hooks.

Respond with ONLY the improved text. No JSON, no code fences.`,

  suggestKeywords: `You are an ASO keyword research expert. Analyze the app and suggest ranked keyword opportunities with estimated search volume. Rules:
- Suggest 10-15 keywords or short phrases
- Rank by relevance and search volume
- Label each as "high", "med", or "low" volume
- Don't repeat words already in the app name
- Include a mix of head terms and long-tail phrases
- No trademarked terms
- Consider the target locale for language-appropriate suggestions

Respond ONLY with valid JSON: { "suggestions": [{ "keyword": "...", "volume": "high|med|low" }, ...] }. No markdown, no code fences.`
};

const app = new Hono();

/**
 * Call the x.ai Grok chat completions API.
 *
 * Sends a system + user prompt pair to Grok and returns the assistant's
 * text response. Strips markdown code fences if present.
 *
 * @param {string} systemPrompt - Instructions for the model's behavior
 * @param {string} userPrompt - The user's request content
 * @returns {Promise<string>} The model's response text, cleaned of code fences
 * @throws {Error} If XAI_API_KEY is missing, the API returns an error, or rate limits are hit
 */
async function callGrok(systemPrompt, userPrompt) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable is not set');
  }

  const response = await fetch(GROK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (response.status === 429) {
    throw new Error('Rate limited by x.ai API. Please wait and try again.');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`x.ai API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from x.ai API');
  }

  return stripCodeFences(content);
}

/**
 * Strip markdown code fences from a string.
 *
 * Grok may wrap responses in ```json ... ``` or similar fences.
 * This removes the opening/closing fence lines and returns the inner content.
 *
 * @param {string} text - Raw text that may contain code fences
 * @returns {string} Text with code fences removed, trimmed
 */
function stripCodeFences(text) {
  const trimmed = text.trim();
  const fencePattern = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Safely parse a JSON string, throwing a descriptive error on failure.
 *
 * @param {string} text - JSON string to parse
 * @returns {Object} Parsed JSON object
 * @throws {Error} If the text is not valid JSON
 */
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 200)}`);
  }
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /ai/generate-metadata - Generate all metadata fields for an app.
 *
 * Expects JSON body with appName, appCategory, keyFeatures, targetAudience, and tone.
 * Returns name, subtitle, description, keywords, and whatsNew.
 */
app.post('/ai/generate-metadata', async (c) => {
  try {
    const { appName, appCategory, keyFeatures, targetAudience, tone } = await c.req.json();

    if (!appName) {
      return c.json({ error: 'appName is required' }, 400);
    }

    const userPrompt = `Generate complete App Store metadata for:
App Name: ${appName}
Category: ${appCategory || 'General'}
Key Features: ${keyFeatures || 'N/A'}
Target Audience: ${targetAudience || 'General'}
Tone: ${tone || 'Professional'}

Respond with JSON: { "name": "...", "subtitle": "...", "description": "...", "keywords": "...", "whatsNew": "..." }`;

    const raw = await callGrok(SYSTEM_PROMPTS.metadata, userPrompt);
    const result = safeParseJSON(raw);

    return c.json(result);
  } catch (e) {
    console.error('AI generate-metadata error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /ai/generate-description - Generate just the app description.
 *
 * Expects JSON body with appName and context.
 * Returns { description }.
 */
app.post('/ai/generate-description', async (c) => {
  try {
    const { appName, context } = await c.req.json();

    if (!appName) {
      return c.json({ error: 'appName is required' }, 400);
    }

    const userPrompt = `Write a compelling App Store description for "${appName}". Context: ${context || appName}. Max 4000 characters. Front-load the most important features in the first 3 lines.`;

    const description = await callGrok(SYSTEM_PROMPTS.metadata, userPrompt);

    return c.json({ description });
  } catch (e) {
    console.error('AI generate-description error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /ai/generate-keywords - Generate optimized App Store keywords.
 *
 * Expects JSON body with appName, description, and optional currentKeywords.
 * Returns { keywords } as a comma-separated string.
 */
app.post('/ai/generate-keywords', async (c) => {
  try {
    const { appName, description, currentKeywords } = await c.req.json();

    if (!appName) {
      return c.json({ error: 'appName is required' }, 400);
    }

    let userPrompt = `Generate optimized App Store keywords for "${appName}".`;
    if (description) userPrompt += ` App description: ${description}`;
    if (currentKeywords) userPrompt += ` Current keywords: ${currentKeywords}`;

    const keywords = await callGrok(SYSTEM_PROMPTS.keywords, userPrompt);

    return c.json({ keywords });
  } catch (e) {
    console.error('AI generate-keywords error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /ai/generate-whats-new - Generate release notes for the App Store.
 *
 * Expects JSON body with appName and changes (description of what changed).
 * Returns { whatsNew }.
 */
app.post('/ai/generate-whats-new', async (c) => {
  try {
    const { appName, changes } = await c.req.json();

    if (!appName || !changes) {
      return c.json({ error: 'appName and changes are required' }, 400);
    }

    const userPrompt = `Write App Store release notes for "${appName}". Changes in this version: ${changes}`;

    const whatsNew = await callGrok(SYSTEM_PROMPTS.whatsNew, userPrompt);

    return c.json({ whatsNew });
  } catch (e) {
    console.error('AI generate-whats-new error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /ai/improve-text - Improve or rewrite any text field.
 *
 * Expects JSON body with text, field (e.g. "description"), and optional instruction.
 * Returns { improved }.
 */
app.post('/ai/improve-text', async (c) => {
  try {
    const { text, field, instruction } = await c.req.json();

    if (!text) {
      return c.json({ error: 'text is required' }, 400);
    }

    let userPrompt = `Improve this App Store ${field || 'text'}:\n\n${text}`;
    if (instruction) userPrompt += `\n\nAdditional instruction: ${instruction}`;

    const improved = await callGrok(SYSTEM_PROMPTS.improveText, userPrompt);

    return c.json({ improved });
  } catch (e) {
    console.error('AI improve-text error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /ai/suggest-keywords - Get ranked keyword suggestions with volume estimates.
 *
 * Analyzes the app and returns keyword opportunities ranked by relevance
 * with estimated search volume labels (high/med/low).
 *
 * @param {Object} body - Request body
 * @param {string} body.appName - App name (required)
 * @param {string} [body.description] - App description for context
 * @param {string} [body.locale] - Target locale (e.g. "en-US")
 * @param {string} [body.currentKeywords] - Existing keywords to avoid duplicates
 * @returns {{ suggestions: Array<{ keyword: string, volume: "high"|"med"|"low" }> }}
 */
app.post('/ai/suggest-keywords', async (c) => {
  try {
    const { appName, description, locale, currentKeywords } = await c.req.json();

    if (!appName) {
      return c.json({ error: 'appName is required' }, 400);
    }

    let userPrompt = `Suggest keyword opportunities for the app "${appName}".`;
    if (description) userPrompt += ` Description: ${description}`;
    if (locale) userPrompt += ` Target locale: ${locale}`;
    if (currentKeywords) userPrompt += ` Current keywords (avoid duplicates): ${currentKeywords}`;

    const raw = await callGrok(SYSTEM_PROMPTS.suggestKeywords, userPrompt);
    const result = safeParseJSON(raw);

    return c.json(result);
  } catch (e) {
    console.error('AI suggest-keywords error:', e.message);
    const status = e.message.includes('XAI_API_KEY') ? 503 : 500;
    return c.json({ error: e.message }, status);
  }
});

/** @type {Hono} */
export default app;
