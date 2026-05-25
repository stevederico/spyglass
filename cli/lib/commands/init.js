/**
 * @module commands/init
 * Interactive project initialization command. Scans an Xcode project to detect
 * the app name and bundle ID, then writes a `spyglass.config.json` file with
 * sensible defaults for screenshot compositing.
 */

import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scanProject } from '../core/scanner.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Prompt the user with a question and return their answer.
 *
 * @param {import('node:readline').Interface} rl - Readline interface
 * @param {string} question - Text shown to the user
 * @returns {Promise<string>} The user's trimmed response
 */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Initialize a Spyglass project by scanning an Xcode project and writing
 * a default configuration file.
 *
 * Prompts for the `.xcodeproj` path if not provided via `args.path`, runs
 * the project scanner to extract app name and bundle ID, then writes
 * `spyglass.config.json` to the current working directory.
 *
 * @param {Object} args - CLI arguments
 * @param {string} [args.path] - Path to the `.xcodeproj` directory. Defaults to cwd.
 * @returns {Promise<void>}
 */
export async function init(args) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    let projectPath = args.path;

    if (!projectPath) {
      projectPath = await ask(rl, `${CYAN}Where is your .xcodeproj?${RESET} (default: ${process.cwd()}) `);
      if (!projectPath) projectPath = process.cwd();
    }

    rl.close();

    const resolvedPath = path.resolve(projectPath);
    const relativePath = path.relative(process.cwd(), resolvedPath);

    console.log(`${CYAN}Scanning project at ${BOLD}${resolvedPath}${RESET}${CYAN}...${RESET}`);

    let scanResult = { appName: '', bundleId: '' };
    try {
      scanResult = await scanProject(resolvedPath);
    } catch (err) {
      console.log(`${RED}Scanner warning: ${err.message}${RESET}`);
      console.log(`${CYAN}Continuing with placeholder values...${RESET}`);
    }

    const config = {
      project: relativePath || '.',
      bundleId: scanResult.bundleId || 'com.example.app',
      template: {
        bgColor: '#1a1a2e',
        isGradient: true,
        gradientStart: '#1a1a2e',
        gradientEnd: '#16213e',
        textColor: '#ffffff',
        fontWeight: 'Bold',
        fontSize: 100,
        textPosition: 'top',
        frameModel: 'iphone-17-pro-max',
        frameColor: 'silver',
        frameLayout: 'full'
      },
      screens: [],
      devices: ['iphone-69', 'iphone-67', 'ipad-13'],
      locales: ['en-US'],
      metadata: { tone: 'Professional', category: '' }
    };

    const configPath = path.join(process.cwd(), 'spyglass.config.json');
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    console.log(`\n${GREEN}${BOLD}spyglass.config.json${RESET}${GREEN} created at ${configPath}${RESET}`);
    if (scanResult.appName) {
      console.log(`${CYAN}  App name:  ${BOLD}${scanResult.appName}${RESET}`);
    }
    if (scanResult.bundleId) {
      console.log(`${CYAN}  Bundle ID: ${BOLD}${scanResult.bundleId}${RESET}`);
    }
    console.log(`\n${CYAN}Edit the config to add screens and customize your template.${RESET}`);
  } catch (err) {
    rl.close();
    console.error(`${RED}Init failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}
