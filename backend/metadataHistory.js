// ==== METADATA HISTORY MODULE ====
// Hono sub-app for SQLite-based metadata version history.
// Stores snapshots of App Store metadata per app/locale for restore and audit.
// Mount on the main app via: app.route('/api', metadataHistoryApp)

import { Hono } from 'hono';
import { DatabaseSync as Database } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs';
import { promisify } from 'node:util';

const app = new Hono();

/** @type {Database|null} Cached database connection */
let db = null;

/**
 * Get or initialize the metadata history SQLite database.
 *
 * Creates the databases directory and metadata_history table on first call.
 * Subsequent calls return the cached connection. Uses WAL mode for concurrency.
 *
 * @returns {Database} SQLite DatabaseSync instance
 */
function getDb() {
  if (db) return db;

  try {
    promisify(mkdir)('./databases', { recursive: true }).catch(() => {});
  } catch {
    // directory may already exist
  }

  db = new Database('./databases/metadata_history.db');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA temp_store = memory');

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata_history (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      locale TEXT NOT NULL,
      metadata TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_metadata_history_app_id ON metadata_history(app_id)');

  return db;
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /metadata-history/:appId - List all metadata snapshots for an app.
 *
 * Returns up to 50 snapshots ordered by saved_at descending (newest first).
 *
 * @param {string} appId - App Store Connect app ID (URL param)
 * @returns {Array<{id: string, app_id: string, locale: string, metadata: string, saved_at: string}>}
 */
app.get('/metadata-history/:appId', (c) => {
  try {
    const { appId } = c.req.param();
    const database = getDb();

    const rows = database
      .prepare('SELECT * FROM metadata_history WHERE app_id = ? ORDER BY saved_at DESC LIMIT 50')
      .all(appId);

    return c.json(rows);
  } catch (e) {
    console.error('metadata-history list error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /metadata-history - Create a new metadata snapshot.
 *
 * Stores a JSON metadata snapshot for a given app and locale.
 * Auto-generates UUID and sets saved_at to current UTC time.
 *
 * @param {Object} body - Request body
 * @param {string} body.appId - App Store Connect app ID
 * @param {string} body.locale - Locale code (e.g. "en-US")
 * @param {Object} body.metadata - Metadata object to snapshot
 * @returns {{id: string, app_id: string, locale: string, metadata: string, saved_at: string}}
 */
app.post('/metadata-history', async (c) => {
  try {
    const { appId, locale, metadata } = await c.req.json();

    if (!appId || !locale || !metadata) {
      return c.json({ error: 'appId, locale, and metadata are required' }, 400);
    }

    const database = getDb();
    const id = randomUUID();
    const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

    database
      .prepare('INSERT INTO metadata_history (id, app_id, locale, metadata) VALUES (?, ?, ?, ?)')
      .run(id, appId, locale, metadataStr);

    // Retrieve the inserted row to get the auto-generated saved_at
    const row = database
      .prepare('SELECT * FROM metadata_history WHERE id = ?')
      .get(id);

    return c.json(row, 201);
  } catch (e) {
    console.error('metadata-history create error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /metadata-history/snapshot/:id - Get a single metadata snapshot by ID.
 *
 * Used to restore a previous metadata version.
 *
 * @param {string} id - Snapshot UUID (URL param)
 * @returns {{id: string, app_id: string, locale: string, metadata: string, saved_at: string}}
 */
app.get('/metadata-history/snapshot/:id', (c) => {
  try {
    const { id } = c.req.param();
    const database = getDb();

    const row = database
      .prepare('SELECT * FROM metadata_history WHERE id = ?')
      .get(id);

    if (!row) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    return c.json(row);
  } catch (e) {
    console.error('metadata-history get snapshot error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * DELETE /metadata-history/snapshot/:id - Delete a single metadata snapshot.
 *
 * Permanently removes a snapshot from the history.
 *
 * @param {string} id - Snapshot UUID (URL param)
 * @returns {{success: boolean}}
 */
app.delete('/metadata-history/snapshot/:id', (c) => {
  try {
    const { id } = c.req.param();
    const database = getDb();

    const result = database
      .prepare('DELETE FROM metadata_history WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    return c.json({ success: true });
  } catch (e) {
    console.error('metadata-history delete error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

/** @type {Hono} */
export default app;
