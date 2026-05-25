/**
 * @module simulator
 * iOS Simulator interaction utilities extracted from the Spyglass web backend.
 *
 * Provides pure functions for listing, booting, launching apps, capturing
 * screenshots, and cropping status bars on macOS simulators via `xcrun simctl`
 * and `sips`. Requires Xcode CLI tools.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Status bar pixel heights by device name, used for auto-cropping screenshots. */
export const STATUS_BAR_HEIGHTS = {
  'iPhone 16': 62, 'iPhone 16 Plus': 62, 'iPhone 16 Pro': 62, 'iPhone 16 Pro Max': 62,
  'iPhone 15': 59, 'iPhone 15 Plus': 59, 'iPhone 15 Pro': 59, 'iPhone 15 Pro Max': 59,
  'iPhone 14': 54, 'iPhone 14 Plus': 54, 'iPhone 14 Pro': 54, 'iPhone 14 Pro Max': 54,
  'iPhone SE': 20, 'iPhone 8': 20, 'iPhone 8 Plus': 20
};

/** Default status bar height when device is not in the lookup map. */
export const DEFAULT_STATUS_BAR_HEIGHT = 54;

/**
 * List all available iOS simulators.
 *
 * Executes `xcrun simctl list devices available -j`, parses the JSON output,
 * and returns a flat array of device objects.
 *
 * @returns {Promise<Array<{name: string, udid: string, state: string, runtime: string}>>}
 *   Flat array of simulator devices with readable runtime names
 */
export async function listSimulators() {
  const { stdout } = await execAsync('xcrun simctl list devices available -j');
  const parsed = JSON.parse(stdout);
  const simulators = [];

  for (const [runtime, deviceList] of Object.entries(parsed.devices)) {
    const runtimeName = runtime
      .replace('com.apple.CoreSimulator.SimRuntime.', '')
      .replace(/-/g, '.');

    for (const device of deviceList) {
      simulators.push({
        name: device.name,
        udid: device.udid,
        state: device.state,
        runtime: runtimeName
      });
    }
  }

  return simulators;
}

/**
 * Boot a simulator by UDID.
 *
 * Ignores "already booted" errors and waits 2 seconds for the boot to settle.
 *
 * @param {string} udid - Simulator device UDID
 * @returns {Promise<void>}
 */
export async function bootSimulator(udid) {
  try {
    await execAsync(`xcrun simctl boot ${udid}`);
  } catch {
    // Already booted — fine
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

/**
 * Launch an app on a booted simulator.
 *
 * Executes `xcrun simctl launch` and waits 3 seconds for the app to settle.
 *
 * @param {string} udid - Simulator device UDID
 * @param {string} bundleId - iOS app bundle identifier
 * @returns {Promise<void>}
 * @throws {Error} If the launch command fails
 */
export async function launchApp(udid, bundleId) {
  await execAsync(`xcrun simctl launch ${udid} ${bundleId}`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/**
 * Capture a screenshot from a booted simulator.
 *
 * @param {string} udid - Simulator device UDID
 * @param {string} outputPath - Absolute path for the output PNG file
 * @returns {Promise<void>}
 * @throws {Error} If the screenshot command fails
 */
export async function captureScreenshot(udid, outputPath) {
  await execAsync(`xcrun simctl io ${udid} screenshot "${outputPath}"`);
}

/**
 * Crop the status bar from a simulator screenshot using macOS `sips`.
 *
 * Reads the image dimensions, looks up the status bar height for the given
 * device name, then crops in-place. Skips cropping if the resulting height
 * would be zero or negative.
 *
 * @param {string} screenshotPath - Absolute path to the PNG file
 * @param {string} simulatorName - Simulator device name (e.g. "iPhone 16 Pro")
 * @returns {Promise<void>}
 * @throws {Error} If sips commands fail or dimensions cannot be read
 */
export async function cropStatusBar(screenshotPath, simulatorName) {
  const barHeight = STATUS_BAR_HEIGHTS[simulatorName] ?? DEFAULT_STATUS_BAR_HEIGHT;

  const { stdout: dimOutput } = await execAsync(
    `sips -g pixelHeight -g pixelWidth "${screenshotPath}"`
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
    `sips --cropOffset ${barHeight} 0 --resampleHeightWidth ${croppedHeight} ${imgWidth} "${screenshotPath}"`
  );
}
