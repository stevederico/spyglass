/**
 * Hono sub-app for export package management
 *
 * Provides routes to create, list, download, and delete export packages.
 * An export package bundles screenshots and metadata for an App Store
 * Connect app, organized by locale and device.
 *
 * @module exports
 */

import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure databases directory exists
const dbDir = join(__dirname, 'databases');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Ensure exports storage directory exists
const exportsDir = join(__dirname, 'exports');
if (!existsSync(exportsDir)) {
  mkdirSync(exportsDir, { recursive: true });
}

// Initialize SQLite database for export packages
const dbPath = join(dbDir, 'exports.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS export_packages (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    locales TEXT NOT NULL,
    devices TEXT NOT NULL,
    screenshot_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS export_files (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    device TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_export_packages_app_id ON export_packages(app_id);
  CREATE INDEX IF NOT EXISTS idx_export_files_package_id ON export_files(package_id);
`);

const app = new Hono();

/**
 * List export packages for an app, ordered by most recently created
 *
 * @route GET /exports?appId=
 * @param {string} appId - App ID query parameter
 * @returns {Object[]} Array of export package objects with parsed locales/devices
 */
app.get('/exports', (c) => {
  try {
    const appId = c.req.query('appId');
    if (!appId) {
      return c.json({ error: 'appId query parameter required' }, 400);
    }

    const rows = db.prepare('SELECT * FROM export_packages WHERE app_id = ? ORDER BY created_at DESC').all(appId);

    const packages = rows.map((row) => {
      let locales = [];
      let devices = [];
      let metadata = null;
      try { locales = JSON.parse(row.locales); } catch { /* skip corrupt */ }
      try { devices = JSON.parse(row.devices); } catch { /* skip corrupt */ }
      try { metadata = row.metadata ? JSON.parse(row.metadata) : null; } catch { /* skip corrupt */ }
      return { ...row, locales, devices, metadata };
    });

    return c.json(packages);
  } catch (err) {
    console.error('GET /exports failed:', err);
    return c.json({ error: 'Failed to list export packages' }, 500);
  }
});

/**
 * Create a new export package from multipart form data
 *
 * Accepts app info, locale/device arrays, optional metadata, and screenshot
 * files keyed as `file-{locale}-{device}`. Files are stored under
 * `backend/exports/{packageId}/{locale}/screenshot-{device}.png`.
 *
 * @route POST /exports
 * @param {string} appId - App ID
 * @param {string} appName - App display name
 * @param {string} locales - JSON string array of locale codes
 * @param {string} devices - JSON string array of device identifiers
 * @param {string} [metadata] - JSON string of metadata
 * @param {number} screenshotCount - Total number of screenshot files
 * @param {File} file-{locale}-{device} - Screenshot files
 * @returns {Object} Created export package (status 201)
 */
app.post('/exports', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });

    const { appId, appName, locales, devices, metadata, screenshotCount } = body;

    if (!appId || !appName || !locales || !devices) {
      return c.json({ error: 'appId, appName, locales, and devices are required' }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let parsedLocales;
    let parsedDevices;
    try {
      parsedLocales = JSON.parse(locales);
      parsedDevices = JSON.parse(devices);
    } catch {
      return c.json({ error: 'locales and devices must be valid JSON arrays' }, 400);
    }

    const packageDir = join(exportsDir, id);
    mkdirSync(packageDir, { recursive: true });

    // Process file uploads keyed as file-{locale}-{device}
    const insertFile = db.prepare(
      'INSERT INTO export_files (id, package_id, locale, device, filename, file_path) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const key of Object.keys(body)) {
      if (!key.startsWith('file-')) continue;

      const file = body[key];
      if (!file || typeof file === 'string') continue;

      // Parse locale and device from key: file-{locale}-{device}
      // Locale can contain hyphens (e.g., en-US), so split after first "file-"
      // then split the rest on the last hyphen-separated device segment
      const keyParts = key.slice(5); // remove "file-"
      // Find the locale by matching against parsed locales
      let fileLocale = '';
      let fileDevice = '';
      for (const loc of parsedLocales) {
        if (keyParts.startsWith(loc + '-')) {
          fileLocale = loc;
          fileDevice = keyParts.slice(loc.length + 1);
          break;
        }
      }

      if (!fileLocale || !fileDevice) continue;

      // Validate locale and device names to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(fileLocale) || !/^[a-zA-Z0-9_-]+$/.test(fileDevice)) continue;

      const localeDir = join(packageDir, fileLocale);
      if (!existsSync(localeDir)) {
        mkdirSync(localeDir, { recursive: true });
      }

      const filename = `screenshot-${fileDevice}.png`;
      const filePath = join(localeDir, filename);
      const arrayBuffer = await file.arrayBuffer();
      writeFileSync(filePath, Buffer.from(arrayBuffer));

      const fileId = crypto.randomUUID();
      insertFile.run(fileId, id, fileLocale, fileDevice, filename, filePath);
    }

    // Insert the package record
    const metadataJson = metadata || null;
    db.prepare(
      'INSERT INTO export_packages (id, app_id, app_name, locales, devices, screenshot_count, metadata, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, appId, appName, locales, devices, parseInt(screenshotCount) || 0, metadataJson, 'ready', now);

    let parsedMetadata = null;
    try { parsedMetadata = metadataJson ? JSON.parse(metadataJson) : null; } catch { /* skip corrupt */ }

    return c.json({
      id,
      app_id: appId,
      app_name: appName,
      locales: parsedLocales,
      devices: parsedDevices,
      screenshot_count: parseInt(screenshotCount) || 0,
      metadata: parsedMetadata,
      status: 'ready',
      created_at: now
    }, 201);
  } catch (err) {
    console.error('POST /exports failed:', err);
    return c.json({ error: 'Failed to create export package' }, 500);
  }
});

/**
 * Get a single export package with its associated files
 *
 * @route GET /exports/:id
 * @param {string} id - Package ID path parameter
 * @returns {Object} Object with `package` and `files` properties
 */
app.get('/exports/:id', (c) => {
  try {
    const { id } = c.req.param();

    const pkg = db.prepare('SELECT * FROM export_packages WHERE id = ?').get(id);
    if (!pkg) {
      return c.json({ error: 'Export package not found' }, 404);
    }

    const files = db.prepare('SELECT * FROM export_files WHERE package_id = ?').all(id);

    let locales = [];
    let devices = [];
    let metadata = null;
    try { locales = JSON.parse(pkg.locales); } catch { /* skip corrupt */ }
    try { devices = JSON.parse(pkg.devices); } catch { /* skip corrupt */ }
    try { metadata = pkg.metadata ? JSON.parse(pkg.metadata) : null; } catch { /* skip corrupt */ }

    return c.json({
      package: { ...pkg, locales, devices, metadata },
      files
    });
  } catch (err) {
    console.error('GET /exports/:id failed:', err);
    return c.json({ error: 'Failed to retrieve export package' }, 500);
  }
});

/**
 * Delete an export package, its files, and its storage directory
 *
 * @route DELETE /exports/:id
 * @param {string} id - Package ID path parameter
 * @returns {Object} Success confirmation
 */
app.delete('/exports/:id', (c) => {
  try {
    const { id } = c.req.param();

    const pkg = db.prepare('SELECT * FROM export_packages WHERE id = ?').get(id);
    if (!pkg) {
      return c.json({ error: 'Export package not found' }, 404);
    }

    db.prepare('DELETE FROM export_files WHERE package_id = ?').run(id);
    db.prepare('DELETE FROM export_packages WHERE id = ?').run(id);

    const packageDir = join(exportsDir, id);
    if (existsSync(packageDir)) {
      rmSync(packageDir, { recursive: true, force: true });
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /exports/:id failed:', err);
    return c.json({ error: 'Failed to delete export package' }, 500);
  }
});

/**
 * Download an export package as a zip archive
 *
 * Recursively reads all files from the package directory and bundles them
 * into a zip using fflate. The zip preserves the locale/filename structure.
 *
 * @route GET /exports/:id/download
 * @param {string} id - Package ID path parameter
 * @returns {Response} Zip file download with Content-Disposition header
 */
app.get('/exports/:id/download', (c) => {
  try {
    const { id } = c.req.param();

    const pkg = db.prepare('SELECT * FROM export_packages WHERE id = ?').get(id);
    if (!pkg) {
      return c.json({ error: 'Export package not found' }, 404);
    }

    const packageDir = join(exportsDir, id);
    if (!existsSync(packageDir)) {
      return c.json({ error: 'Export files not found' }, 404);
    }

    const zipData = {};
    const localeDirs = readdirSync(packageDir, { withFileTypes: true });

    for (const entry of localeDirs) {
      if (!entry.isDirectory()) continue;
      const localeDir = join(packageDir, entry.name);
      const files = readdirSync(localeDir);

      for (const filename of files) {
        const filePath = join(localeDir, filename);
        const fileBuffer = readFileSync(filePath);
        zipData[`${entry.name}/${filename}`] = new Uint8Array(fileBuffer);
      }
    }

    const zipped = zipSync(zipData);
    const appName = pkg.app_name.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new Response(Buffer.from(zipped), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${appName}-export.zip"`
      }
    });
  } catch (err) {
    console.error('GET /exports/:id/download failed:', err);
    return c.json({ error: 'Failed to generate export zip' }, 500);
  }
});

/**
 * Serve a single screenshot file for thumbnail preview
 *
 * @route GET /exports/:id/files/:fileId
 * @param {string} id - Package ID path parameter
 * @param {string} fileId - File ID path parameter
 * @returns {Response} PNG image with cache headers
 */
app.get('/exports/:id/files/:fileId', (c) => {
  try {
    const { fileId } = c.req.param();

    const file = db.prepare('SELECT * FROM export_files WHERE id = ?').get(fileId);
    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }

    if (!existsSync(file.file_path)) {
      return c.json({ error: 'File missing from disk' }, 404);
    }

    const buffer = readFileSync(file.file_path);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (err) {
    console.error('GET /exports/:id/files/:fileId failed:', err);
    return c.json({ error: 'Failed to read export file' }, 500);
  }
});

export default app;
