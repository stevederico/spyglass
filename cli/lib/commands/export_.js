/**
 * @module commands/export_
 * Packages composited screenshots into an App Store Connect-compatible
 * directory layout or a zip archive for distribution.
 */

import { readdir, readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Recursively walk a directory and return all file paths.
 *
 * @param {string} dir - Root directory to walk
 * @param {string} [prefix=""] - Relative prefix for nested paths
 * @returns {Promise<Array<{absolute: string, relative: string}>>} File entries
 */
async function walkDir(dir, prefix = '') {
  const results = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = prefix ? path.join(prefix, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const nested = await walkDir(absPath, relPath);
      results.push(...nested);
    } else {
      results.push({ absolute: absPath, relative: relPath });
    }
  }

  return results;
}

/**
 * Export composited screenshots as an ASC-compatible directory or zip archive.
 *
 * **ASC format** copies the input directory tree (expected structure:
 * `{locale}/screenshot-{device}-{position}.png`) to the output directory,
 * preserving folder structure and including any `metadata.json` files.
 *
 * **Zip format** uses the native `node:zlib`-based ZIP builder to bundle
 * all files into a single `export.zip` archive inside the output directory.
 *
 * @param {Object} args - CLI arguments
 * @param {string} args.input - Input directory containing composited screenshots
 * @param {string} [args.output="./export"] - Output directory path
 * @param {string} [args.format="asc"] - Export format: "asc" or "zip"
 * @returns {Promise<void>}
 */
export async function exportPackage(args) {
  try {
    if (!args.input) {
      console.error(`${RED}Missing required argument: --input <directory>${RESET}`);
      process.exitCode = 1;
      return;
    }

    const inputDir = path.resolve(args.input);
    const outputDir = path.resolve(args.output || './export');
    const format = (args.format || 'asc').toLowerCase();

    // Verify input exists
    try {
      await stat(inputDir);
    } catch {
      console.error(`${RED}Input directory not found: ${inputDir}${RESET}`);
      process.exitCode = 1;
      return;
    }

    const files = await walkDir(inputDir);

    if (files.length === 0) {
      console.error(`${RED}No files found in ${inputDir}${RESET}`);
      process.exitCode = 1;
      return;
    }

    console.log(`${CYAN}Found ${BOLD}${files.length}${RESET}${CYAN} file(s) to export${RESET}`);

    if (format === 'zip') {
      await exportAsZip(files, outputDir);
    } else {
      await exportAsAsc(files, inputDir, outputDir);
    }
  } catch (err) {
    console.error(`${RED}Export failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}

/**
 * Copy files to the output directory preserving the ASC folder structure.
 *
 * @param {Array<{absolute: string, relative: string}>} files - Files to copy
 * @param {string} inputDir - Source root directory
 * @param {string} outputDir - Destination root directory
 * @returns {Promise<void>}
 */
async function exportAsAsc(files, inputDir, outputDir) {
  await mkdir(outputDir, { recursive: true });

  let count = 0;
  for (const file of files) {
    const destPath = path.join(outputDir, file.relative);
    await mkdir(path.dirname(destPath), { recursive: true });
    await cp(file.absolute, destPath);
    count++;
  }

  console.log(`\n${GREEN}${BOLD}ASC export complete${RESET}`);
  console.log(`${GREEN}  Files: ${count}${RESET}`);
  console.log(`${CYAN}  Output: ${outputDir}${RESET}`);
}

/**
 * Bundle all files into a zip archive using native node:zlib.
 *
 * @param {Array<{absolute: string, relative: string}>} files - Files to archive
 * @param {string} outputDir - Directory to write the zip file into
 * @returns {Promise<void>}
 */
async function exportAsZip(files, outputDir) {
  const { createZip } = await import('../core/zip.js');

  const zipData = {};
  for (const file of files) {
    zipData[file.relative] = await readFile(file.absolute);
  }

  const zipped = createZip(zipData);

  await mkdir(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, 'export.zip');
  await writeFile(zipPath, zipped);

  console.log(`\n${GREEN}${BOLD}Zip export complete${RESET}`);
  console.log(`${GREEN}  Files: ${files.length}${RESET}`);
  console.log(`${CYAN}  Output: ${zipPath}${RESET}`);
}
