/**
 * @module scanner
 * iOS project scanner for extracting metadata from Xcode projects.
 *
 * Parses Info.plist files, PBXNativeTarget entries, SwiftUI views,
 * UIKit view controllers, storyboard identifiers, and Apple framework
 * imports. Uses `plutil` for plist conversion and native `fs` for
 * file scanning.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

/**
 * Known Apple frameworks to filter against when scanning imports.
 * @type {Set<string>}
 */
const APPLE_FRAMEWORKS = new Set([
  'Accelerate', 'Accessibility', 'AVFoundation', 'AVKit',
  'CallKit', 'CarPlay', 'ClockKit', 'CloudKit', 'Combine',
  'Contacts', 'ContactsUI', 'CoreBluetooth', 'CoreData',
  'CoreGraphics', 'CoreHaptics', 'CoreImage', 'CoreLocation',
  'CoreML', 'CoreMedia', 'CoreMotion', 'CoreNFC', 'CoreSpotlight',
  'CoreTelephony', 'CoreText', 'CryptoKit',
  'EventKit', 'EventKitUI',
  'Foundation', 'GameKit', 'GameplayKit',
  'HealthKit', 'HomeKit',
  'ImageIO', 'Intents', 'IntentsUI',
  'LinkPresentation', 'LocalAuthentication',
  'MapKit', 'MediaPlayer', 'MessageUI', 'Metal', 'MetalKit',
  'MultipeerConnectivity', 'MusicKit',
  'NaturalLanguage', 'NearbyInteraction', 'Network', 'NotificationCenter',
  'PassKit', 'PencilKit', 'Photos', 'PhotosUI', 'PushKit',
  'QuickLook', 'QuickLookThumbnailing',
  'RealityKit', 'ReplayKit',
  'SafariServices', 'SceneKit', 'Security', 'SiriKit',
  'Social', 'SoundAnalysis', 'Speech', 'SpriteKit', 'StoreKit',
  'SwiftData', 'SwiftUI', 'SystemConfiguration',
  'UIKit', 'UniformTypeIdentifiers', 'UserNotifications',
  'Vision', 'VisionKit',
  'WatchConnectivity', 'WatchKit', 'WebKit', 'WidgetKit'
]);

/**
 * Recursively walk a directory and return all file paths.
 *
 * @param {string} dir - Root directory to walk
 * @returns {Promise<string[]>} Array of absolute file paths
 */
async function walkDir(dir) {
  const files = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common non-project directories
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'Pods' || entry.name === 'build' || entry.name === 'DerivedData') {
        continue;
      }
      const nested = await walkDir(fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse an Xcode project's Info.plist to extract app metadata.
 *
 * Finds the Info.plist in the .xcodeproj parent directory, converts it
 * to JSON via `plutil`, and extracts the display name, bundle identifier,
 * and version string.
 *
 * @param {string} projectPath - Path to the .xcodeproj directory or its parent
 * @returns {Promise<{appName: string, bundleId: string, version: string}>}
 * @throws {Error} If Info.plist is not found or plutil fails
 */
export async function parseInfoPlist(projectPath) {
  const projectDir = projectPath.endsWith('.xcodeproj')
    ? path.dirname(projectPath)
    : projectPath;

  // Search for Info.plist
  const allFiles = await walkDir(projectDir);
  const plistPath = allFiles.find((f) => f.endsWith('Info.plist') && !f.includes('build/') && !f.includes('DerivedData'));

  if (!plistPath) {
    throw new Error(`Info.plist not found in ${projectDir}`);
  }

  const { stdout } = await execAsync(`plutil -convert json -o - "${plistPath}"`);
  const plist = JSON.parse(stdout);

  return {
    appName: plist.CFBundleDisplayName || plist.CFBundleName || '',
    bundleId: plist.CFBundleIdentifier || '',
    version: plist.CFBundleShortVersionString || ''
  };
}

/**
 * Parse PBXNativeTarget entries from a .pbxproj file.
 *
 * Reads the project.pbxproj file inside the .xcodeproj bundle and extracts
 * all native target names using regex.
 *
 * @param {string} projectPath - Path to the .xcodeproj directory
 * @returns {Promise<string[]>} Array of target names
 * @throws {Error} If the .pbxproj file cannot be read
 */
export async function parseTargets(projectPath) {
  const pbxprojPath = projectPath.endsWith('.xcodeproj')
    ? path.join(projectPath, 'project.pbxproj')
    : path.join(projectPath, `${path.basename(projectPath)}.xcodeproj`, 'project.pbxproj');

  let contents;
  try {
    contents = await readFile(pbxprojPath, 'utf-8');
  } catch (err) {
    // Try to find it by walking
    const dir = projectPath.endsWith('.xcodeproj') ? path.dirname(projectPath) : projectPath;
    const allFiles = await walkDir(dir);
    const found = allFiles.find((f) => f.endsWith('project.pbxproj'));
    if (!found) throw new Error(`project.pbxproj not found in ${projectPath}`);
    contents = await readFile(found, 'utf-8');
  }

  const targets = [];
  const regex = /\/\* Begin PBXNativeTarget section \*\/([\s\S]*?)\/\* End PBXNativeTarget section \*\//;
  const sectionMatch = contents.match(regex);

  if (sectionMatch) {
    const nameRegex = /name\s*=\s*"?([^";]+)"?\s*;/g;
    let match;
    while ((match = nameRegex.exec(sectionMatch[1])) !== null) {
      targets.push(match[1].trim());
    }
  }

  return targets;
}

/**
 * Scan Swift files for SwiftUI views and UIKit view controllers.
 *
 * Globs for `*.swift` files and uses regex to find `struct X: View`
 * (SwiftUI) and `class X: UIViewController` (UIKit) declarations.
 *
 * @param {string} projectDir - Root directory of the Xcode project
 * @returns {Promise<{swiftUIViews: string[], uikitControllers: string[]}>}
 */
export async function scanSwiftViews(projectDir) {
  const allFiles = await walkDir(projectDir);
  const swiftFiles = allFiles.filter((f) => f.endsWith('.swift'));

  const swiftUIViews = [];
  const uikitControllers = [];

  const viewRegex = /struct\s+(\w+)\s*.*:\s*View\b/g;
  const vcRegex = /class\s+(\w+)\s*.*(?:UI)?ViewController\b/g;

  for (const filePath of swiftFiles) {
    const source = await readFile(filePath, 'utf-8');

    let match;
    viewRegex.lastIndex = 0;
    while ((match = viewRegex.exec(source)) !== null) {
      swiftUIViews.push(match[1]);
    }

    vcRegex.lastIndex = 0;
    while ((match = vcRegex.exec(source)) !== null) {
      uikitControllers.push(match[1]);
    }
  }

  return { swiftUIViews, uikitControllers };
}

/**
 * Scan storyboard files for storyboard identifiers.
 *
 * Reads all `*.storyboard` files and extracts `storyboardIdentifier`
 * attribute values via regex.
 *
 * @param {string} projectDir - Root directory of the Xcode project
 * @returns {Promise<string[]>} Array of storyboard identifier strings
 */
export async function scanStoryboards(projectDir) {
  const allFiles = await walkDir(projectDir);
  const storyboards = allFiles.filter((f) => f.endsWith('.storyboard'));

  const identifiers = [];
  const regex = /storyboardIdentifier="([^"]+)"/g;

  for (const filePath of storyboards) {
    const source = await readFile(filePath, 'utf-8');
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(source)) !== null) {
      identifiers.push(match[1]);
    }
  }

  return identifiers;
}

/**
 * Scan Swift files for Apple framework imports.
 *
 * Collects unique `import X` statements from all `.swift` files and
 * filters to known Apple frameworks only.
 *
 * @param {string} projectDir - Root directory of the Xcode project
 * @returns {Promise<string[]>} Sorted array of unique Apple framework names
 */
export async function scanFrameworks(projectDir) {
  const allFiles = await walkDir(projectDir);
  const swiftFiles = allFiles.filter((f) => f.endsWith('.swift'));

  const found = new Set();
  const regex = /^import\s+(\w+)/gm;

  for (const filePath of swiftFiles) {
    const source = await readFile(filePath, 'utf-8');
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(source)) !== null) {
      const name = match[1];
      if (APPLE_FRAMEWORKS.has(name)) {
        found.add(name);
      }
    }
  }

  return [...found].sort();
}

/**
 * Orchestrate a full scan of an iOS project.
 *
 * Calls all individual scanner functions and returns a combined result
 * object with app metadata, targets, views, storyboards, and frameworks.
 *
 * @param {string} projectPath - Path to the .xcodeproj directory or project root
 * @returns {Promise<{appName: string, bundleId: string, version: string, targets: string[], swiftUIViews: string[], uikitControllers: string[], storyboardIds: string[], frameworks: string[]}>}
 */
export async function scanProject(projectPath) {
  const projectDir = projectPath.endsWith('.xcodeproj')
    ? path.dirname(projectPath)
    : projectPath;

  const [plistInfo, targets, views, storyboardIds, frameworks] = await Promise.all([
    parseInfoPlist(projectPath).catch(() => ({ appName: '', bundleId: '', version: '' })),
    parseTargets(projectPath).catch(() => []),
    scanSwiftViews(projectDir),
    scanStoryboards(projectDir),
    scanFrameworks(projectDir)
  ]);

  return {
    appName: plistInfo.appName,
    bundleId: plistInfo.bundleId,
    version: plistInfo.version,
    targets,
    swiftUIViews: views.swiftUIViews,
    uikitControllers: views.uikitControllers,
    storyboardIds,
    frameworks
  };
}
