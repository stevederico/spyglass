#!/usr/bin/env node

/**
 * Spyglass CLI — iOS App Store screenshot automation tool.
 *
 * Parses command-line arguments using node:util parseArgs and dispatches
 * to the appropriate command module under lib/commands/.
 *
 * @module bin/spyglass
 */

import { parseArgs } from 'node:util';

const VERSION = '0.1.0';

const BANNER = `
   \x1b[36m___                  _
  / __|_ __ _  _  __ _| |__ _ ______
  \\__ \\ '_ \\ || |/ _\` | / _\` (_-<_-<
  |___/ .__/\\_, |\\__, |_\\__,_/__/__/
      |_|   |__/ |___/\x1b[0m
`;

const HELP_TEXT = `${BANNER}
  \x1b[1mSpyglass\x1b[0m v${VERSION} — iOS App Store screenshot automation

  \x1b[1mUSAGE\x1b[0m
    spyglass <command> [options]

  \x1b[1mCOMMANDS\x1b[0m
    \x1b[33minit\x1b[0m        Scaffold a spyglass.config.json in your project
    \x1b[33mscan\x1b[0m        Extract metadata from an Xcode project
    \x1b[33mcapture\x1b[0m     Take screenshots on iOS simulators
    \x1b[33mcompose\x1b[0m     Render App Store composites from screenshots + templates
    \x1b[33mmetadata\x1b[0m    Generate or translate App Store metadata with AI
    \x1b[33mexport\x1b[0m      Package composites for App Store Connect upload
    \x1b[33mupload\x1b[0m      Upload screenshots to App Store Connect
    \x1b[33mhelp\x1b[0m        Show this help message

  \x1b[1mEXAMPLES\x1b[0m
    spyglass init --path ./MyApp
    spyglass scan --path ./MyApp.xcodeproj
    spyglass capture --bundle-id com.example.app --devices "iPhone 16 Pro Max,iPhone 16"
    spyglass compose --screenshots ./captures --template default --locales en,ja
    spyglass metadata --path ./MyApp.xcodeproj --fields title,subtitle --tone professional
    spyglass export --input ./composites --output ./dist --format asc
    spyglass upload --input ./dist --app-id 1234567890

  \x1b[1mGLOBAL OPTIONS\x1b[0m
    -h, --help       Show this help message
    -v, --version    Print version number
`;

/** @type {import('node:util').ParseArgsConfig['options']} */
const options = {
  path: { type: 'string' },
  'bundle-id': { type: 'string' },
  devices: { type: 'string' },
  screens: { type: 'string' },
  'crop-status-bar': { type: 'boolean', default: false },
  screenshots: { type: 'string' },
  template: { type: 'string' },
  locales: { type: 'string' },
  output: { type: 'string' },
  input: { type: 'string' },
  format: { type: 'string' },
  'app-id': { type: 'string' },
  fields: { type: 'string' },
  tone: { type: 'string' },
  translations: { type: 'string' },
  line1: { type: 'string' },
  line2: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

/**
 * Print help text to stdout and exit.
 */
function showHelp() {
  console.log(HELP_TEXT);
  process.exit(0);
}

/**
 * Print version to stdout and exit.
 */
function showVersion() {
  console.log(`spyglass v${VERSION}`);
  process.exit(0);
}

/**
 * Dispatch a CLI command to its handler module.
 *
 * @param {string} command - The command name (first positional arg).
 * @param {Record<string, string | boolean | undefined>} flags - Parsed option values.
 */
async function dispatch(command, flags) {
  const commands = {
    init: async (f) => (await import('../lib/commands/init.js')).init(f),
    scan: async (f) => (await import('../lib/commands/scan.js')).scan(f),
    capture: async (f) => (await import('../lib/commands/capture.js')).capture(f),
    compose: async (f) => (await import('../lib/commands/compose.js')).compose(f),
    metadata: async (f) => (await import('../lib/commands/metadata.js')).metadata(f),
    export: async (f) => (await import('../lib/commands/export_.js')).exportPackage(f),
    upload: async (f) => (await import('../lib/commands/upload.js')).upload(f),
  };

  const handler = commands[command];
  if (!handler) {
    console.error(`\x1b[31mUnknown command: ${command}\x1b[0m\n`);
    showHelp();
  }

  await handler(flags);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options,
    allowPositionals: true,
    strict: false,
  });

  if (values.version) showVersion();

  const command = positionals[0];

  if (!command || command === 'help' || values.help) {
    showHelp();
  }

  await dispatch(command, values);
}

try {
  await main();
} catch (err) {
  console.error(`\n\x1b[31mError: ${err.message}\x1b[0m`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
