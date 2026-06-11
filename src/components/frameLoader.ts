/**
 * Lazy-loading image cache for device frame PNGs
 *
 * Loads frame images from public/frames/ on demand and caches them
 * in memory so subsequent requests for the same frame return instantly.
 *
 * @module frameLoader
 */

/** In-memory cache of loaded frame images keyed by model/color/orientation. */
const frameCache = new Map<string, HTMLImageElement>();

/**
 * Load a device frame PNG, returning a cached Image element
 *
 * @param {string} modelSlug - Model key from FRAME_MODELS (e.g. 'iphone-16-pro')
 * @param {string} colorSlug - Color slug (e.g. 'black-titanium')
 * @param {'portrait'|'landscape'} [orientation='portrait'] - Frame orientation
 * @returns {Promise<HTMLImageElement>} Loaded and cached image element
 */
export async function loadFrame(modelSlug: string, colorSlug: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<HTMLImageElement> {
  const key = `${modelSlug}/${colorSlug}-${orientation}`;
  const cached = frameCache.get(key);
  if (cached) return cached;

  const url = `/frames/${modelSlug}/${colorSlug}-${orientation}.png`;
  const img = new Image();

  return new Promise<HTMLImageElement>((resolve, reject) => {
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
export function preloadFrame(modelSlug: string, colorSlug: string, orientation: 'portrait' | 'landscape' = 'portrait'): void {
  loadFrame(modelSlug, colorSlug, orientation).catch(() => {});
}
