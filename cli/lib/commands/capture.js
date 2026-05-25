/**
 * @module commands/capture
 * Captures screenshots from iOS Simulator for one or more device types.
 * Boots simulators, launches the target app, waits for the UI to settle,
 * then saves PNGs organized by bundle ID and simulator name.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  listSimulators,
  bootSimulator,
  launchApp,
  captureScreenshot,
  cropStatusBar
} from '../core/simulator.js';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Capture screenshots from iOS Simulator for the given app and devices.
 *
 * For each device string in the comma-separated `--devices` list, finds a
 * matching simulator (fuzzy name match), boots it, launches the app by
 * bundle ID, waits for the UI, captures a screenshot, and optionally crops
 * the status bar. Failures on individual simulators are logged but do not
 * abort the entire run.
 *
 * Screenshots are saved to `./screenshots/{bundleId}/{simulator_name}/`.
 *
 * @param {Object} args - CLI arguments
 * @param {string} args.bundleId - Bundle identifier of the app to launch
 * @param {string} [args.devices="iPhone 16 Pro Max"] - Comma-separated device names to match
 * @param {string} [args.screens] - Comma-separated screen names (reserved for future use)
 * @param {boolean} [args.cropStatusBar=false] - Whether to crop the status bar from captures
 * @returns {Promise<void>}
 */
export async function capture(args) {
  try {
    if (!args.bundleId) {
      console.error(`${RED}Missing required argument: --bundleId${RESET}`);
      process.exitCode = 1;
      return;
    }

    const deviceFilters = (args.devices || 'iPhone 16 Pro Max')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const shouldCrop = args.cropStatusBar === true || args.cropStatusBar === 'true';

    console.log(`${CYAN}Listing available simulators...${RESET}`);
    const simulators = await listSimulators();

    // Fuzzy match: simulator name includes the filter string (case-insensitive)
    const matched = [];
    for (const filter of deviceFilters) {
      const lowerFilter = filter.toLowerCase();
      const sim = simulators.find((s) =>
        s.name.toLowerCase().includes(lowerFilter)
      );
      if (sim) {
        matched.push(sim);
      } else {
        console.log(`${RED}No simulator found matching "${filter}"${RESET}`);
      }
    }

    if (matched.length === 0) {
      console.error(`${RED}No matching simulators found. Available:${RESET}`);
      for (const s of simulators.slice(0, 10)) {
        console.error(`  ${CYAN}•${RESET} ${s.name} (${s.udid})`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(`${CYAN}Matched ${BOLD}${matched.length}${RESET}${CYAN} simulator(s)${RESET}\n`);

    const results = [];

    for (const sim of matched) {
      const simDir = sim.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const outDir = path.resolve('screenshots', args.bundleId, simDir);
      await mkdir(outDir, { recursive: true });

      try {
        console.log(`${CYAN}Booting ${BOLD}${sim.name}${RESET}${CYAN}...${RESET}`);
        await bootSimulator(sim.udid);

        console.log(`${CYAN}Launching ${BOLD}${args.bundleId}${RESET}${CYAN}...${RESET}`);
        await launchApp(sim.udid, args.bundleId);

        // Brief pause for UI to settle
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const timestamp = Date.now();
        const filename = `screenshot_${timestamp}.png`;
        const filepath = path.join(outDir, filename);

        console.log(`${CYAN}Capturing screenshot...${RESET}`);
        await captureScreenshot(sim.udid, filepath);

        if (shouldCrop) {
          console.log(`${CYAN}Cropping status bar...${RESET}`);
          await cropStatusBar(filepath, sim.name);
        }

        results.push({ simulator: sim.name, path: filepath, success: true });
        console.log(`${GREEN}  Saved: ${filepath}${RESET}\n`);
      } catch (err) {
        results.push({ simulator: sim.name, error: err.message, success: false });
        console.error(`${RED}  Failed on ${sim.name}: ${err.message}${RESET}\n`);
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);
    console.log(`${BOLD}Capture Summary${RESET}`);
    console.log(`${GREEN}  Succeeded: ${succeeded}${RESET}`);
    if (failed > 0) {
      console.log(`${RED}  Failed:    ${failed}${RESET}`);
    }
  } catch (err) {
    console.error(`${RED}Capture failed: ${err.message}${RESET}`);
    process.exitCode = 1;
  }
}
