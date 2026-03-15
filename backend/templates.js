/**
 * Hono sub-app for template and custom font management
 *
 * Provides CRUD routes for screenshot composer templates and custom font
 * uploads. Templates store composer settings as JSON and are scoped per app.
 * Fonts are persisted to the backend/fonts/ directory.
 *
 * @module templates
 */

import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure databases directory exists
const dbDir = join(__dirname, 'databases');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database for templates
const dbPath = join(dbDir, 'templates.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    settings TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_fonts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = new Hono();

// Ensure fonts directory exists
const fontsDir = join(__dirname, 'fonts');
if (!existsSync(fontsDir)) {
  mkdirSync(fontsDir, { recursive: true });
}

// ============================================================
// Template Routes
// ============================================================

/**
 * List templates for an app, ordered by most recently updated
 *
 * @route GET /templates?appId=
 * @param {string} appId - App ID query parameter
 * @returns {Object[]} Array of template objects with parsed settings
 */
app.get('/templates', (c) => {
  try {
    const appId = c.req.query('appId');
    if (!appId) {
      return c.json({ error: 'appId query parameter required' }, 400);
    }

    const stmt = db.prepare('SELECT * FROM templates WHERE app_id = ? ORDER BY updated_at DESC');
    const rows = stmt.all(appId);

    const templates = rows.map((row) => {
      try {
        return { ...row, settings: JSON.parse(row.settings) };
      } catch {
        return { ...row, settings: {} };
      }
    });

    return c.json(templates);
  } catch (err) {
    console.error('Failed to list templates:', err);
    return c.json({ error: 'Failed to list templates' }, 500);
  }
});

/**
 * Create a new template
 *
 * @route POST /templates
 * @param {Object} body - Request body
 * @param {string} body.name - Template name
 * @param {string} body.appId - App ID to associate with
 * @param {Object} body.settings - Composer settings object
 * @returns {Object} Created template with parsed settings
 */
app.post('/templates', async (c) => {
  try {
    const { name, appId, settings } = await c.req.json();

    if (!name || !appId || !settings) {
      return c.json({ error: 'name, appId, and settings are required' }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    const stmt = db.prepare(
      'INSERT INTO templates (id, app_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, appId, name, settingsJson, now, now);

    return c.json({ id, app_id: appId, name, settings, created_at: now, updated_at: now }, 201);
  } catch (err) {
    console.error('Failed to create template:', err);
    return c.json({ error: 'Failed to create template' }, 500);
  }
});

/**
 * Update an existing template
 *
 * @route PATCH /templates/:id
 * @param {string} id - Template ID path parameter
 * @param {Object} body - Fields to update
 * @param {string} [body.name] - Updated template name
 * @param {Object} [body.settings] - Updated composer settings
 * @returns {Object} Updated template
 */
app.patch('/templates/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Template not found' }, 404);
    }

    const name = body.name ?? existing.name;
    const settings = body.settings ? JSON.stringify(body.settings) : existing.settings;
    const now = new Date().toISOString();

    db.prepare('UPDATE templates SET name = ?, settings = ?, updated_at = ? WHERE id = ?')
      .run(name, settings, now, id);

    return c.json({
      id,
      app_id: existing.app_id,
      name,
      settings: JSON.parse(settings),
      created_at: existing.created_at,
      updated_at: now
    });
  } catch (err) {
    console.error('Failed to update template:', err);
    return c.json({ error: 'Failed to update template' }, 500);
  }
});

/**
 * Delete a template
 *
 * @route DELETE /templates/:id
 * @param {string} id - Template ID path parameter
 * @returns {Object} Success confirmation
 */
app.delete('/templates/:id', (c) => {
  try {
    const { id } = c.req.param();

    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Template not found' }, 404);
    }

    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return c.json({ success: true });
  } catch (err) {
    console.error('Failed to delete template:', err);
    return c.json({ error: 'Failed to delete template' }, 500);
  }
});

/**
 * Duplicate an existing template with " (Copy)" appended to the name
 *
 * @route POST /templates/:id/duplicate
 * @param {string} id - Template ID of the source template
 * @returns {Object} Newly created duplicate template
 */
app.post('/templates/:id/duplicate', (c) => {
  try {
    const { id } = c.req.param();

    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Template not found' }, 404);
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newName = `${existing.name} (Copy)`;

    db.prepare(
      'INSERT INTO templates (id, app_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(newId, existing.app_id, newName, existing.settings, now, now);

    return c.json({
      id: newId,
      app_id: existing.app_id,
      name: newName,
      settings: JSON.parse(existing.settings),
      created_at: now,
      updated_at: now
    }, 201);
  } catch (err) {
    console.error('Failed to duplicate template:', err);
    return c.json({ error: 'Failed to duplicate template' }, 500);
  }
});

// ============================================================
// Font Routes
// ============================================================

/**
 * Upload a custom font file (TTF or OTF)
 *
 * @route POST /templates/fonts
 * @param {File} file - Font file from multipart form data
 * @returns {Object} Created font record with id, name, and filename
 */
app.post('/templates/fonts', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'Font file is required' }, 400);
    }

    const filename = file.name || 'font.ttf';
    const ext = filename.split('.').pop().toLowerCase();

    if (!['ttf', 'otf'].includes(ext)) {
      return c.json({ error: 'Only TTF and OTF files are supported' }, 400);
    }

    const id = crypto.randomUUID();
    const name = filename.replace(/\.(ttf|otf)$/i, '');
    const storedFilename = `${id}.${ext}`;
    const filePath = join(fontsDir, storedFilename);

    const arrayBuffer = await file.arrayBuffer();
    writeFileSync(filePath, Buffer.from(arrayBuffer));

    const now = new Date().toISOString();
    db.prepare('INSERT INTO custom_fonts (id, name, filename, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, storedFilename, now);

    return c.json({ id, name, filename: storedFilename, created_at: now }, 201);
  } catch (err) {
    console.error('Failed to upload font:', err);
    return c.json({ error: 'Failed to upload font' }, 500);
  }
});

/**
 * List all uploaded custom fonts
 *
 * @route GET /templates/fonts
 * @returns {Object[]} Array of font records
 */
app.get('/templates/fonts', (c) => {
  try {
    const rows = db.prepare('SELECT * FROM custom_fonts ORDER BY created_at DESC').all();
    return c.json(rows);
  } catch (err) {
    console.error('Failed to list fonts:', err);
    return c.json({ error: 'Failed to list fonts' }, 500);
  }
});

/**
 * Serve a font file for browser FontFace loading
 *
 * @route GET /templates/fonts/:id/file
 * @param {string} id - Font ID path parameter
 * @returns {Blob} Font file with appropriate content type
 */
app.get('/templates/fonts/:id/file', (c) => {
  try {
    const { id } = c.req.param();

    const existing = db.prepare('SELECT * FROM custom_fonts WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Font not found' }, 404);
    }

    const filePath = join(fontsDir, existing.filename);
    if (!existsSync(filePath)) {
      return c.json({ error: 'Font file missing' }, 404);
    }

    const ext = existing.filename.split('.').pop().toLowerCase();
    const contentType = ext === 'otf' ? 'font/otf' : 'font/ttf';
    const buffer = readFileSync(filePath);

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (err) {
    console.error('Failed to serve font file:', err);
    return c.json({ error: 'Failed to serve font file' }, 500);
  }
});

/**
 * Delete a custom font file and its database record
 *
 * @route DELETE /templates/fonts/:id
 * @param {string} id - Font ID path parameter
 * @returns {Object} Success confirmation
 */
app.delete('/templates/fonts/:id', (c) => {
  try {
    const { id } = c.req.param();

    const existing = db.prepare('SELECT * FROM custom_fonts WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Font not found' }, 404);
    }

    const filePath = join(fontsDir, existing.filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    db.prepare('DELETE FROM custom_fonts WHERE id = ?').run(id);
    return c.json({ success: true });
  } catch (err) {
    console.error('Failed to delete font:', err);
    return c.json({ error: 'Failed to delete font' }, 500);
  }
});

export default app;
