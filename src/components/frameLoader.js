/**
 * Lazy-loading image cache for device frame PNGs
 *
 * Loads frame images from public/frames/ on demand and caches them
 * in memory so subsequent requests for the same frame return instantly.
 *
 * @module frameLoader
 */

/** @type {Map<string, HTMLImageElement>} */
const frameCache = new Map();

/**
 * Load a device frame PNG, returning a cached Image element
 *
 * @param {string} modelSlug - Model key from FRAME_MODELS (e.g. 'iphone-16-pro')
 * @param {string} colorSlug - Color slug (e.g. 'black-titanium')
 * @param {'portrait'|'landscape'} [orientation='portrait'] - Frame orientation
 * @returns {Promise<HTMLImageElement>} Loaded and cached image element
 */
export async function loadFrame(modelSlug, colorSlug, orientation = 'portrait') {
  const key = `${modelSlug}/${colorSlug}-${orientation}`;
  if (frameCache.has(key)) return frameCache.get(key);

  const url = `/frames/${modelSlug}/${colorSlug}-${orientation}.png`;
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      frameCache.set(key, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load frame: ${url}`));
    img.src = url;
  });
}

/**
 * Preload a frame into the cache without blocking
 *
 * @param {string} modelSlug - Model key from FRAME_MODELS
 * @param {string} colorSlug - Color slug
 * @param {'portrait'|'landscape'} [orientation='portrait'] - Frame orientation
 */
export function preloadFrame(modelSlug, colorSlug, orientation = 'portrait') {
  loadFrame(modelSlug, colorSlug, orientation).catch(() => {});
}
