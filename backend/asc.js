// ==== APP STORE CONNECT API MODULE ====
// Hono sub-app for App Store Connect API integration.
// Mount on the main app via: app.route('/api', ascApp)

import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

import { dirname } from 'node:path';

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const TOKEN_EXPIRY = '20m';

const app = new Hono();

// ============================================================
// JWT & API Helpers
// ============================================================

/**
 * Generate a signed JWT for App Store Connect API authentication.
 *
 * Reads the ES256 private key from the path specified in ASC_PRIVATE_KEY_PATH,
 * signs a token with the configured issuer and key ID, and returns the JWT string.
 *
 * @returns {string} Signed JWT token valid for 20 minutes
 * @throws {Error} If environment variables are missing or the key file cannot be read
 */
function generateASCToken() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY_PATH) {
    throw new Error('Missing ASC environment variables (ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH)');
  }

  const keyPath = path.resolve(__dirname, ASC_PRIVATE_KEY_PATH);
  const privateKey = readFileSync(keyPath);

  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: TOKEN_EXPIRY,
    issuer: ASC_ISSUER_ID,
    audience: 'appstoreconnect-v1',
    header: { kid: ASC_KEY_ID, typ: 'JWT' }
  });
}

/**
 * Make an authenticated request to the App Store Connect API.
 *
 * Generates a fresh JWT, sends the request with proper headers, and returns
 * the parsed JSON response. Throws on non-OK status codes.
 *
 * @param {string} endpoint - API path relative to base URL (e.g. '/apps')
 * @param {Object} [options={}] - Fetch options (method, body, headers)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} On HTTP errors with status code and response body
 */
async function ascFetch(endpoint, options = {}) {
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
async function ascFetchAllPages(endpoint) {
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

// ============================================================
// Routes
// ============================================================

/**
 * GET /asc/apps - List all apps in App Store Connect
 */
app.get('/asc/apps', async (c) => {
  try {
    const data = await ascFetchAllPages('/apps');
    return c.json({ data });
  } catch (e) {
    console.error('ASC /apps error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /asc/apps/:id - Get details for a specific app
 */
app.get('/asc/apps/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const result = await ascFetch(`/apps/${id}`);
    return c.json(result);
  } catch (e) {
    console.error(`ASC /apps/${c.req.param('id')} error:`, e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /asc/apps/:id/versions - Get all App Store versions for an app
 */
app.get('/asc/apps/:id/versions', async (c) => {
  try {
    const { id } = c.req.param();
    const data = await ascFetchAllPages(`/apps/${id}/appStoreVersions`);
    return c.json({ data });
  } catch (e) {
    console.error('ASC versions error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /asc/apps/:id/metadata - Get app info localizations (name, subtitle, etc.)
 */
app.get('/asc/apps/:id/metadata', async (c) => {
  try {
    const { id } = c.req.param();
    const data = await ascFetchAllPages(`/apps/${id}/appInfos`);

    // For each appInfo, fetch its localizations
    const enriched = [];
    for (const info of data) {
      const localizations = await ascFetchAllPages(
        `/appInfos/${info.id}/appInfoLocalizations`
      );
      enriched.push({ ...info, localizations });
    }

    return c.json({ data: enriched });
  } catch (e) {
    console.error('ASC metadata error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * PATCH /asc/apps/:id/metadata - Update app info localizations
 *
 * Expects JSON body: { localizationId, attributes: { name, subtitle, privacyPolicyUrl, ... } }
 */
app.patch('/asc/apps/:id/metadata', async (c) => {
  try {
    const body = await c.req.json();
    const { localizationId, attributes } = body;

    if (!localizationId || !attributes) {
      return c.json({ error: 'localizationId and attributes are required' }, 400);
    }

    const result = await ascFetch(`/appInfoLocalizations/${localizationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appInfoLocalizations',
          id: localizationId,
          attributes
        }
      })
    });

    return c.json(result);
  } catch (e) {
    console.error('ASC metadata update error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /asc/apps/:id/screenshots - Get screenshot sets and their screenshots
 *
 * Walks the version -> localization -> screenshot set -> screenshot chain
 * to return a complete picture of all screenshots for the latest version.
 */
app.get('/asc/apps/:id/screenshots', async (c) => {
  try {
    const { id } = c.req.param();

    // Get latest app store version
    const versions = await ascFetchAllPages(`/apps/${id}/appStoreVersions`);
    if (!versions.length) {
      return c.json({ data: [], message: 'No versions found' });
    }

    const latestVersion = versions[0];

    // Get localizations for this version
    const localizations = await ascFetchAllPages(
      `/appStoreVersions/${latestVersion.id}/appStoreVersionLocalizations`
    );

    const result = [];

    for (const loc of localizations) {
      // Get screenshot sets for this localization
      const sets = await ascFetchAllPages(
        `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`
      );

      const setsWithScreenshots = [];
      for (const set of sets) {
        const screenshots = await ascFetchAllPages(
          `/appScreenshotSets/${set.id}/appScreenshots`
        );
        setsWithScreenshots.push({
          ...set,
          screenshots
        });
      }

      result.push({
        locale: loc.attributes?.locale,
        localizationId: loc.id,
        screenshotSets: setsWithScreenshots
      });
    }

    return c.json({ data: result, versionId: latestVersion.id });
  } catch (e) {
    console.error('ASC screenshots error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /asc/apps/:id/screenshots - Upload a screenshot to App Store Connect
 *
 * This is a 3-step process:
 * 1. Reserve: POST /appScreenshots with fileName, fileSize, screenshotSetId
 * 2. Upload: PUT binary data to each uploadOperations URL
 * 3. Commit: PATCH /appScreenshots/:id with uploaded=true and checksum
 *
 * Expects JSON body: { screenshotSetId, filePath }
 */
app.post('/asc/apps/:id/screenshots', async (c) => {
  try {
    const body = await c.req.json();
    const { screenshotSetId, filePath } = body;

    if (!screenshotSetId || !filePath) {
      return c.json({ error: 'screenshotSetId and filePath are required' }, 400);
    }

    // Read the file
    const fileBuffer = await readFile(filePath);
    const fileName = path.basename(filePath);
    const fileSize = fileBuffer.length;

    // Step 1: Create screenshot reservation
    const reservation = await ascFetch('/appScreenshots', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appScreenshots',
          attributes: { fileName, fileSize },
          relationships: {
            appScreenshotSet: {
              data: { type: 'appScreenshotSets', id: screenshotSetId }
            }
          }
        }
      })
    });

    const screenshotId = reservation.data.id;
    const uploadOperations = reservation.data.attributes.uploadOperations;

    // Step 2: Upload binary to each upload operation
    for (const op of uploadOperations) {
      const { method, url, requestHeaders, offset, length } = op;
      const chunk = fileBuffer.subarray(offset, offset + length);

      const headers = {};
      for (const h of requestHeaders) {
        headers[h.name] = h.value;
      }

      const uploadResponse = await fetch(url, {
        method,
        headers,
        body: chunk
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload chunk failed: ${uploadResponse.status}`);
      }
    }

    // Step 3: Commit with checksum
    const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('base64');

    const commitResult = await ascFetch(`/appScreenshots/${screenshotId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appScreenshots',
          id: screenshotId,
          attributes: {
            uploaded: true,
            sourceFileChecksum: md5Hash
          }
        }
      })
    });

    return c.json(commitResult, 201);
  } catch (e) {
    console.error('ASC screenshot upload error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * DELETE /asc/screenshots/:id - Delete a screenshot from App Store Connect
 */
app.delete('/asc/screenshots/:id', async (c) => {
  try {
    const { id } = c.req.param();
    await ascFetch(`/appScreenshots/${id}`, { method: 'DELETE' });
    return c.json({ success: true });
  } catch (e) {
    console.error('ASC screenshot delete error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /asc/screenshots/capture - Capture screenshots from iOS simulators
 *
 * Boots each specified simulator, installs and launches the app, captures a
 * screenshot, then saves it to backend/screenshots/<bundleId>/<simulator>/.
 *
 * Expects JSON body: { bundleId: string, simulators: string[] }
 * @returns {Object} { screenshots: Array<{ simulator, path }> }
 */
app.post('/asc/screenshots/capture', async (c) => {
  try {
    const body = await c.req.json();
    const { bundleId, simulators } = body;

    if (!bundleId || !Array.isArray(simulators) || !simulators.length) {
      return c.json({ error: 'bundleId and simulators array are required' }, 400);
    }

    const screenshotsDir = path.resolve(__dirname, 'screenshots');
    const results = [];

    for (const simulator of simulators) {
      try {
        // Find the device UDID by name
        const { stdout: listOutput } = await execAsync(
          'xcrun simctl list devices available -j'
        );
        const devices = JSON.parse(listOutput);
        let deviceUDID = null;

        for (const runtime of Object.values(devices.devices)) {
          const device = runtime.find((d) => d.name === simulator);
          if (device) {
            deviceUDID = device.udid;
            break;
          }
        }

        if (!deviceUDID) {
          results.push({ simulator, error: `Simulator "${simulator}" not found` });
          continue;
        }

        // Boot the simulator (ignore error if already booted)
        try {
          await execAsync(`xcrun simctl boot ${deviceUDID}`);
        } catch {
          // Already booted — fine
        }

        // Wait a moment for boot to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Launch the app (install happens automatically if app is on simulator)
        try {
          await execAsync(`xcrun simctl launch ${deviceUDID} ${bundleId}`);
        } catch (launchErr) {
          results.push({ simulator, error: `Failed to launch ${bundleId}: ${launchErr.message}` });
          continue;
        }

        // Wait for app to settle
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Create output directory
        const sanitizedName = simulator.replace(/\s+/g, '_');
        const outDir = path.join(screenshotsDir, bundleId, sanitizedName);
        await mkdir(outDir, { recursive: true });

        // Capture screenshot
        const timestamp = Date.now();
        const screenshotPath = path.join(outDir, `screenshot_${timestamp}.png`);
        await execAsync(`xcrun simctl io ${deviceUDID} screenshot "${screenshotPath}"`);

        results.push({ simulator, path: screenshotPath });
      } catch (simErr) {
        results.push({ simulator, error: simErr.message });
      }
    }

    return c.json({ screenshots: results });
  } catch (e) {
    console.error('ASC screenshot capture error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/** @type {Hono} */
export default app;
