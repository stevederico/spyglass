/**
 * @module devices
 * Device specifications, font weights, and starter templates extracted from the
 * Spyglass web app composer. Used by the CLI to resolve screenshot dimensions
 * and apply default design settings.
 */

/**
 * App Store Connect screenshot tier dimensions keyed by ASC size class.
 * Each entry defines the native pixel size, corner radius, and bezel width
 * used when compositing device frames.
 * @type {Object<string, {label: string, width: number, height: number, radius: number, bezelWidth: number}>}
 */
export const DEVICES = {
  'iphone-69':  { label: 'iPhone 6.9"', width: 1320, height: 2868, radius: 125, bezelWidth: 18 },
  'iphone-67':  { label: 'iPhone 6.7"', width: 1290, height: 2796, radius: 120, bezelWidth: 18 },
  'iphone-65':  { label: 'iPhone 6.3"', width: 1206, height: 2622, radius: 115, bezelWidth: 16 },
  'iphone-61':  { label: 'iPhone 6.1"', width: 1179, height: 2556, radius: 110, bezelWidth: 16 },
  'ipad-13':    { label: 'iPad 13"', width: 2064, height: 2752, radius: 50, bezelWidth: 22 },
  'ipad-129':   { label: 'iPad 12.9"', width: 2048, height: 2732, radius: 40, bezelWidth: 20 },
  'ipad-11':    { label: 'iPad 11"', width: 1668, height: 2388, radius: 40, bezelWidth: 18 },
  'ipad-105':   { label: 'iPad 10.5"', width: 1668, height: 2224, radius: 0, bezelWidth: 16 }
};

/**
 * CSS font-weight values mapped to human-readable weight names.
 * @type {Object<string, string>}
 */
export const FONT_WEIGHTS = {
  Light: '300',
  Regular: '400',
  Bold: '700'
};

/**
 * Built-in design templates that provide sensible starting points for
 * screenshot backgrounds, text styling, and gradient configuration.
 * @type {Array<{name: string, settings: Object}>}
 */
export const STARTER_TEMPLATES = [
  {
    name: 'Minimal',
    settings: {
      bgColor: '#ffffff', isGradient: false, gradientStart: '#ffffff', gradientEnd: '#f0f0f0', gradientDirection: 'top-bottom',
      textColor: '#000000', textShadow: 0, fontWeight: 'Regular', textPosition: 'top', fontSize: 100
    }
  },
  {
    name: 'Bold',
    settings: {
      bgColor: '#1a1a2e', isGradient: true, gradientStart: '#1a1a2e', gradientEnd: '#16213e', gradientDirection: 'top-bottom',
      textColor: '#ffffff', textShadow: 8, fontWeight: 'Bold', textPosition: 'top', fontSize: 100
    }
  },
  {
    name: 'Gradient',
    settings: {
      bgColor: '#ff6b6b', isGradient: true, gradientStart: '#ff6b6b', gradientEnd: '#ffa502', gradientDirection: 'diagonal',
      textColor: '#ffffff', textShadow: 8, fontWeight: 'Bold', textPosition: 'bottom', fontSize: 100
    }
  }
];
