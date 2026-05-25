/**
 * @module asc-api
 * App Store Connect API authentication and fetch helpers.
 *
 * Extracted from the Spyglass web backend. Generates ES256 JWTs for
 * ASC authentication and provides convenience wrappers for single-page
 * and paginated API requests.
 */

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import path from 'node:path';

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';

/**
 * Encode a Buffer or string as a base64url string (RFC 7515).
 * @param {Buffer|string} buf - Data to encode
 * @returns {string} Base64url-encoded string
 */
function base64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generate a signed JWT for App Store Connect API authentication.
 *
 * Constructs an ES256 (ECDSA P-256 + SHA-256) JWT using native `node:crypto`,
 * eliminating the need for the `jsonwebtoken` package. Reads the private key
 * from the path specified in `ASC_PRIVATE_KEY_PATH`, resolved relative to cwd.
 *
 * Uses `dsaEncoding: 'ieee-p1363'` to produce the raw r||s signature format
 * required by the JWT specification (as opposed to the default DER encoding).
 *
 * @returns {string} Signed JWT token valid for 20 minutes
 * @throws {Error} If ASC_KEY_ID, ASC_ISSUER_ID, or ASC_PRIVATE_KEY_PATH are missing
 * @throws {Error} If the private key file cannot be read
 */
export function generateASCToken() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY_PATH) {
    throw new Error('Missing ASC environment variables (ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH)');
  }

  const privateKey = readFileSync(path.resolve(process.cwd(), ASC_PRIVATE_KEY_PATH));

  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1'
  };

  const segments = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));

  const sign = createSign('SHA256');
  sign.update(segments);
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

  return segments + '.' + base64url(signature);
}

/**
 * Make an authenticated request to the App Store Connect API.
 *
 * Generates a fresh JWT, sends the request with proper headers, and returns
 * the parsed JSON response. Returns `null` for 204 No Content responses.
 * Throws on non-OK status codes.
 *
 * @param {string} endpoint - API path relative to base URL (e.g. "/apps"), or a full URL
 * @param {Object} [options={}] - Fetch options (method, body, headers)
 * @returns {Promise<Object|null>} Parsed JSON response, or null for 204
 * @throws {Error} On HTTP errors with status code and response body
 */
export async function ascFetch(endpoint, options = {}) {
  const token = generateASCToken();
  const url = endpoint.startsWith('http') ? endpoint : `${ASC_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ASC API ${response.status}: ${body}`);
  }

  // 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

/**
 * Fetch all pages of a paginated App Store Connect API response.
 *
 * Follows `links.next` URLs until all pages are collected, then returns
 * the combined data array from all pages.
 *
 * @param {string} endpoint - Initial API endpoint path
 * @returns {Promise<Object[]>} Combined array of all data items across pages
 */
export async function ascFetchAllPages(endpoint) {
  const allData = [];
  let url = endpoint;

  while (url) {
    const result = await ascFetch(url);
    if (result.data) {
      allData.push(...result.data);
    }
    url = result.links?.next || null;
  }

  return allData;
}
