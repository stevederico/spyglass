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
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Derive an HTTP status code from an ASC-related error message.
 *
 * @param {Error} error - The caught error
 * @returns {number} 503 for missing config, 502 for upstream failures, 500 otherwise
 */
function getASCErrorStatus(error) {
  if (error.message.includes('Missing ASC environment')) return 503;
  if (error.message.includes('ASC API')) return 502;
  return 500;
}

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
const TOKEN_EXPIRY = '20m';

/** Status bar pixel heights by device name, used for auto-cropping screenshots. */
const STATUS_BAR_HEIGHTS = {
  'iPhone 16': 62, 'iPhone 16 Plus': 62, 'iPhone 16 Pro': 62, 'iPhone 16 Pro Max': 62,
  'iPhone 15': 59, 'iPhone 15 Plus': 59, 'iPhone 15 Pro': 59, 'iPhone 15 Pro Max': 59,
  'iPhone 14': 54, 'iPhone 14 Plus': 54, 'iPhone 14 Pro': 54, 'iPhone 14 Pro Max': 54,
  'iPhone SE': 20, 'iPhone 8': 20, 'iPhone 8 Plus': 20
};

/** Default status bar height when device is not in the lookup map. */
const DEFAULT_STATUS_BAR_HEIGHT = 54;

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
    signal: AbortSignal.timeout(15000),
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
  }
});

/**
 * GET /asc/simulators - List available iOS simulators
 *
 * Queries Xcode CLI tools for all available simulator devices and returns
 * a flat array with name, UDID, state, and runtime for each device.
 *
 * Returns 501 when DISABLE_SIMULATOR=true (e.g. on Linux hosting).
 *
 * @returns {Object} { simulators: Array<{ name: string, udid: string, state: string, runtime: string }> }
 */
app.get('/asc/simulators', async (c) => {
  if (process.env.DISABLE_SIMULATOR === 'true') {
    return c.json({
      error: 'Simulator features are unavailable in this environment.'
    }, 501);
  }
  try {
    const { stdout } = await execAsync('xcrun simctl list devices available -j', { timeout: 30000 });
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return c.json({ error: 'Failed to parse simulator list' }, 500);
    }
    const simulators = [];

    for (const [runtime, deviceList] of Object.entries(parsed.devices)) {
      // Extract readable runtime name from key like "com.apple.CoreSimulator.SimRuntime.iOS-17-5"
      const runtimeName = runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').replace(/-/g, '.');

      for (const device of deviceList) {
        simulators.push({
          name: device.name,
          udid: device.udid,
          state: device.state,
          runtime: runtimeName
        });
      }
    }

    return c.json({ simulators });
  } catch (e) {
    console.error('ASC simulators error:', e.message);
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
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
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
  }
});

/**
 * Crop the status bar from a simulator screenshot using macOS sips.
 *
 * Reads the image dimensions, looks up the status bar height for the given
 * device name, then crops in-place.
 *
 * @param {string} screenshotPath - Absolute path to the PNG file
 * @param {string} simulatorName - Simulator device name (e.g. "iPhone 16 Pro")
 * @returns {Promise<void>}
 * @throws {Error} If sips commands fail
 */
async function cropStatusBar(screenshotPath, simulatorName) {
  const barHeight = STATUS_BAR_HEIGHTS[simulatorName] ?? DEFAULT_STATUS_BAR_HEIGHT;

  // Read image dimensions via sips
  const { stdout: dimOutput } = await execAsync(
    `sips -g pixelHeight -g pixelWidth "${screenshotPath}"`,
    { timeout: 30000 }
  );

  const heightMatch = dimOutput.match(/pixelHeight:\s*(\d+)/);
  const widthMatch = dimOutput.match(/pixelWidth:\s*(\d+)/);

  if (!heightMatch || !widthMatch) {
    throw new Error(`Could not read dimensions of ${screenshotPath}`);
  }

  const imgHeight = parseInt(heightMatch[1], 10);
  const imgWidth = parseInt(widthMatch[1], 10);
  const croppedHeight = imgHeight - barHeight;

  if (croppedHeight <= 0) return;

  await execAsync(
    `sips --cropOffset ${barHeight} 0 --resampleHeightWidth ${croppedHeight} ${imgWidth} "${screenshotPath}"`,
    { timeout: 30000 }
  );
}

/**
 * POST /asc/screenshots/capture - Capture screenshots from iOS simulators
 *
 * Requires macOS with Xcode CLI tools. Disabled when DISABLE_SIMULATOR=true
 * (e.g. on Railway or other Linux hosting).
 *
 * Boots each specified simulator, launches the app, captures one or more
 * screenshots, then saves them to backend/screenshots/<bundleId>/<simulator>/.
 *
 * Supports two modes:
 * - **Single capture** (default): captures one screenshot per simulator.
 *   Optionally accepts `name` for a custom filename.
 * - **Multi-step capture**: when `steps` array is provided, captures a
 *   screenshot for each step with a configurable delay between them.
 *
 * When `cropStatusBar` is true, the status bar is cropped from each screenshot
 * using the macOS `sips` tool and a device-specific pixel height lookup.
 *
 * @param {Object} body - JSON request body
 * @param {string} body.bundleId - iOS app bundle identifier
 * @param {string[]} body.simulators - Array of simulator device names
 * @param {string} [body.name] - Custom filename for single-capture mode
 * @param {boolean} [body.cropStatusBar] - Whether to crop the status bar
 * @param {Array<{ delay: number, name: string }>} [body.steps] - Multi-step capture sequence
 * @returns {Object} { screenshots: Array<{ simulator, path } | { simulator, paths } | { simulator, error }> }
 */
app.post('/asc/screenshots/capture', async (c) => {
  if (process.env.DISABLE_SIMULATOR === 'true') {
    return c.json({
      error: 'Simulator capture is unavailable in this environment. Upload screenshots manually via the Exports view.'
    }, 501);
  }
  try {
    const body = await c.req.json();
    const { bundleId, simulators, steps, name, cropStatusBar: shouldCrop } = body;

    if (!bundleId || !Array.isArray(simulators) || !simulators.length) {
      return c.json({ error: 'bundleId and simulators array are required' }, 400);
    }

    const screenshotsDir = path.resolve(__dirname, 'screenshots');
    const results = [];

    // Fetch device list once instead of per-simulator
    const { stdout: listOutput } = await execAsync(
      'xcrun simctl list devices available -j',
      { timeout: 30000 }
    );
    let devices;
    try {
      devices = JSON.parse(listOutput);
    } catch {
      return c.json({ error: 'Failed to parse simulator list' }, 500);
    }

    for (const simulator of simulators) {
      try {
        // Find the device UDID by name
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
          await execAsync(`xcrun simctl boot ${deviceUDID}`, { timeout: 30000 });
        } catch (bootErr) {
          if (bootErr.stderr && !bootErr.stderr.includes('Unable to boot device in current state')) {
            results.push({ simulator, error: `Failed to boot simulator: ${bootErr.message}` });
            continue;
          }
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

        if (Array.isArray(steps) && steps.length) {
          // Multi-step capture: take a screenshot for each step
          const paths = [];

          for (const step of steps) {
            // Wait the specified delay before capturing
            const delay = step.delay ?? 0;
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }

            const stepFileName = `${step.name ?? `step_${Date.now()}`}_${sanitizedName}.png`;
            const screenshotPath = path.join(outDir, stepFileName);
            await execAsync(`xcrun simctl io ${deviceUDID} screenshot "${screenshotPath}"`, { timeout: 30000 });

            if (shouldCrop) {
              await cropStatusBar(screenshotPath, simulator);
            }

            paths.push(screenshotPath);
          }

          results.push({ simulator, paths });
        } else {
          // Single capture mode
          const fileName = name
            ? `${name}_${sanitizedName}.png`
            : `screenshot_${Date.now()}.png`;
          const screenshotPath = path.join(outDir, fileName);
          await execAsync(`xcrun simctl io ${deviceUDID} screenshot "${screenshotPath}"`, { timeout: 30000 });

          if (shouldCrop) {
            await cropStatusBar(screenshotPath, simulator);
          }

          results.push({ simulator, path: screenshotPath });
        }
      } catch (simErr) {
        results.push({ simulator, error: simErr.message });
      }
    }

    return c.json({ screenshots: results });
  } catch (e) {
    console.error('ASC screenshot capture error:', e.message);
    const status = getASCErrorStatus(e);
    return c.json({ error: e.message }, status);
  }
});

/**
 * POST /asc/credentials - Save App Store Connect API credentials.
 *
 * Writes ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH to the .env file
 * so that generateASCToken() can read them on subsequent requests. The private
 * key content is written to a dedicated file under backend/keys/.
 *
 * @param {Object} body - JSON request body
 * @param {string} body.keyId - App Store Connect Key ID
 * @param {string} body.issuerId - App Store Connect Issuer ID
 * @param {string} body.privateKey - ES256 private key content (PEM)
 * @returns {{success: boolean}} 200 on success
 */
app.post('/asc/credentials', async (c) => {
  try {
    const { keyId, issuerId, privateKey } = await c.req.json();

    if (!keyId || !issuerId || !privateKey) {
      return c.json({ error: 'keyId, issuerId, and privateKey are required' }, 400);
    }

    // Write private key to a file
    const keysDir = path.resolve(__dirname, 'keys');
    await mkdir(keysDir, { recursive: true });
    const keyPath = path.join(keysDir, `AuthKey_${keyId}.p8`);
    await writeFile(keyPath, privateKey, 'utf-8');

    // Update .env file with credentials
    const envPath = path.resolve(__dirname, '..', '.env');
    let envContent = '';
    try {
      envContent = await readFile(envPath, 'utf-8');
    } catch {
      // .env may not exist yet
    }

    const envVars = {
      ASC_KEY_ID: keyId,
      ASC_ISSUER_ID: issuerId,
      ASC_PRIVATE_KEY_PATH: `./keys/AuthKey_${keyId}.p8`
    };

    for (const [key, value] of Object.entries(envVars)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `${envContent.endsWith('\n') || !envContent ? '' : '\n'}${key}=${value}\n`;
      }
      // Also set in current process so restart isn't required
      process.env[key] = value;
    }

    await writeFile(envPath, envContent, 'utf-8');

    return c.json({ success: true });
  } catch (e) {
    console.error('ASC credentials save error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ==== ANALYTICS ====

/**
 * Fetch analytics metrics for an app from App Store Connect.
 *
 * Returns impressions, page views, installs, and conversion rate
 * for the specified date range (defaults to last 30 days).
 *
 * @route GET /asc/analytics/metrics
 * @param {string} appId - App Store Connect app ID (required)
 * @param {string} [startDate] - Start date YYYY-MM-DD (default: 30 days ago)
 * @param {string} [endDate] - End date YYYY-MM-DD (default: today)
 * @returns {Object} { summary: { impressions, pageViews, installs, conversion }, daily: [], note? }
 * @throws {400} If appId is missing
 * @throws {500} On ASC API failure
 */
app.get('/asc/analytics/metrics', async (c) => {
  try {
    const appId = c.req.query('appId');
    if (!appId) return c.json({ error: "appId is required" }, 400);

    const endDate = c.req.query('endDate') || new Date().toISOString().split('T')[0];
    const startDate = c.req.query('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = ['impressionsTotal', 'pageViewCount', 'units', 'conversionRate'];
    const params = new URLSearchParams({
      'filter[frequency]': 'DAILY',
      'filter[measures]': metrics.join(','),
      'filter[startDate]': startDate,
      'filter[endDate]': endDate
    });

    try {
      const data = await ascFetch(`/v1/apps/${appId}/analyticsReportRequests?${params}`);
      return c.json(data);
    } catch {
      return c.json({
        summary: { impressions: 0, pageViews: 0, installs: 0, conversion: '0%' },
        daily: [],
        note: 'Analytics API requires App Store Connect reporting access'
      });
    }
  } catch (err) {
    console.error("Analytics metrics error:", err);
    return c.json({ error: "Failed to fetch metrics" }, 500);
  }
});

/** @type {Hono} */
export default app;
