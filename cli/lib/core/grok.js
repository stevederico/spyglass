/**
 * @module grok
 * x.ai Grok chat completions client extracted from the Spyglass web backend.
 *
 * Provides system prompt constants for ASO metadata generation and helper
 * functions for calling the Grok API, stripping code fences, and safely
 * parsing JSON responses. Uses native `fetch` only.
 */

const GROK_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-4.20-beta-latest-non-reasoning';

/**
 * System prompt templates for different ASO metadata generation tasks.
 * @type {Object<string, string>}
 */
export const SYSTEM_PROMPTS = {
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
export async function callGrok(systemPrompt, userPrompt) {
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
export function stripCodeFences(text) {
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
 * @throws {Error} If the text is not valid JSON (includes first 200 chars in message)
 */
export function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 200)}`);
  }
}
