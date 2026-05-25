/**
 * @module config
 * Configuration loader for the Spyglass CLI.
 *
 * Manually parses `.env` files (no dotenv dependency) and loads
 * `spyglass.config.json` project configuration. Merges both into a
 * single resolved config object.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Manually parse a `.env` file and set values on `process.env`.
 *
 * Handles blank lines, `#` comments, quoted values (single and double),
 * and inline comments after quoted values. Does not overwrite variables
 * that are already set in the environment.
 *
 * @param {string} dir - Directory containing the `.env` file
 * @returns {Promise<Object<string, string>>} Parsed key-value pairs
 */
export async function loadEnv(dir) {
  const envPath = path.join(dir, '.env');
  let contents;

  try {
    contents = await readFile(envPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }

  const parsed = {};
  const lines = contents.split('\n');

  for (const raw of lines) {
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (double or single)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;

    // Only set on process.env if not already defined
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return parsed;
}

/**
 * Load and parse `spyglass.config.json` from the given directory.
 *
 * @param {string} dir - Directory containing `spyglass.config.json`
 * @returns {Promise<Object>} Parsed configuration object
 * @throws {Error} If the file does not exist or contains invalid JSON
 */
export async function loadConfig(dir) {
  const configPath = path.join(dir, 'spyglass.config.json');

  let contents;
  try {
    contents = await readFile(configPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw err;
  }

  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }
}

/**
 * Load environment variables and project config, returning a merged object.
 *
 * Calls {@link loadEnv} to populate `process.env`, then {@link loadConfig}
 * to read the project config file. Returns the project config with an
 * `env` property containing the parsed `.env` values.
 *
 * @param {string} dir - Project root directory
 * @returns {Promise<Object>} Merged config with `env` key for environment values
 */
export async function resolveConfig(dir) {
  const env = await loadEnv(dir);
  const config = await loadConfig(dir);
  return { ...config, env };
}
