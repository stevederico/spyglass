/**
 * @module commands/scan
 * Scans an Xcode project and prints a structured summary of the app's
 * metadata, targets, views, controllers, storyboards, and frameworks.
 */

import { scanProject } from '../core/scanner.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Scan an Xcode project and print formatted results.
 *
 * Delegates to the core scanner module, then outputs a human-readable
 * summary including app name, bundle ID, version, targets, SwiftUI views,
 * UIKit controllers, storyboard identifiers, and linked frameworks.
 *
 * @param {Object} args - CLI arguments
 * @param {string} args.path - Path to the `.xcodeproj` directory
 * @returns {Promise<void>}
 */
export async function scan(args) {
  try {
    if (!args.path) {
      console.error(`${RED}Missing required argument: --path <path to .xcodeproj>${RESET}`);
      process.exitCode = 1;
      return;
    }

    console.log(`${CYAN}Scanning ${BOLD}${args.path}${RESET}${CYAN}...${RESET}\n`);

    const result = await scanProject(args.path);

    console.log(`${GREEN}${BOLD}Scan Results${RESET}`);
    console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);

    if (result.appName) {
      console.log(`${BOLD}App Name:${RESET}     ${result.appName}`);
    }
    if (result.bundleId) {
      console.log(`${BOLD}Bundle ID:${RESET}    ${result.bundleId}`);
    }
    if (result.version) {
      console.log(`${BOLD}Version:${RESET}      ${result.version}`);
    }

    if (result.targets?.length) {
      console.log(`\n${BOLD}Targets:${RESET}`);
      for (const target of result.targets) {
        console.log(`  ${CYAN}•${RESET} ${target}`);
      }
    }

    if (result.swiftUIViews?.length) {
      console.log(`\n${BOLD}SwiftUI Views:${RESET}`);
      for (const view of result.swiftUIViews) {
        console.log(`  ${CYAN}•${RESET} ${view}`);
      }
    }

    if (result.uikitControllers?.length) {
      console.log(`\n${BOLD}UIKit Controllers:${RESET}`);
      for (const controller of result.uikitControllers) {
        console.log(`  ${CYAN}•${RESET} ${controller}`);
      }
    }

    if (result.storyboardIds?.length) {
      console.log(`\n${BOLD}Storyboard IDs:${RESET}`);
      for (const id of result.storyboardIds) {
        console.log(`  ${CYAN}•${RESET} ${id}`);
      }
    }

    if (result.frameworks?.length) {
      console.log(`\n${BOLD}Frameworks:${RESET}`);
      for (const fw of result.frameworks) {
        console.log(`  ${CYAN}•${RESET} ${fw}`);
      }
    }

    console.log(`\n${CYAN}${'─'.repeat(50)}${RESET}`);
    console.log(`${CYAN}Full JSON:${RESET}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`${RED}Scan failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}
