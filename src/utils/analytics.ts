/**
 * Analytics tracking utilities — dual-fires Umami + dottie in parallel.
 * Safely handles either tracker not being loaded and sanitizes data.
 * All tracking is disabled on localhost via isLocal() guard.
 */

/** Minimal tracker browser API surface used by this app (Umami & dottie share it). */
interface Tracker {
  track: (eventName?: string, data?: Record<string, unknown>) => void;
  identify: (userIdOrData: string | Record<string, unknown>, data?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    umami?: Tracker;
    dottie?: Tracker;
  }
}

/** @returns {boolean} True if running on localhost — skip all tracking */
const isLocal = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

/**
 * Sanitize event data for Umami
 * Ensures data is always a valid object with proper types
 *
 * @param data - Raw event data
 * @returns Sanitized event data
 */
const sanitizeEventData = (data: unknown): Record<string, unknown> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || typeof value === 'function') {
      continue;
    }

    if (typeof value === 'number') {
      sanitized[key] = Math.round(value * 10000) / 10000;
    } else if (typeof value === 'string') {
      sanitized[key] = value.substring(0, 500);
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = JSON.stringify(value).substring(0, 500);
    } else if (typeof value === 'object') {
      sanitized[key] = JSON.stringify(value).substring(0, 500);
    } else {
      sanitized[key] = String(value).substring(0, 500);
    }
  }

  return sanitized;
};

/**
 * Track an event with optional data
 *
 * @param {string} eventName - Name of the event (kebab-case)
 * @param {Object} data - Optional event data
 */
export const trackEvent = (eventName: string, data: Record<string, unknown> = {}) => {
  if (isLocal() || typeof window === 'undefined') return;
  try {
    const sanitizedData = sanitizeEventData(data);
    window.umami?.track?.(eventName, sanitizedData);
    window.dottie?.track?.(eventName, sanitizedData);
  } catch (error) {
    console.warn('Analytics tracking failed:', error);
  }
};

/**
 * Identify a user with optional metadata
 *
 * @param {string} userId - User ID
 * @param {Object} data - Optional user metadata
 */
export const identifyUser = (userId: string, data: Record<string, unknown> = {}) => {
  if (isLocal() || typeof window === 'undefined') return;
  try {
    if (userId) {
      window.umami?.identify?.(userId, data);
      window.dottie?.identify?.(userId, data);
    } else {
      window.umami?.identify?.(data);
      window.dottie?.identify?.(data);
    }
  } catch (error) {
    console.warn('User identification failed:', error);
  }
};

/**
 * Track a page view
 */
export const trackPageView = () => {
  if (isLocal() || typeof window === 'undefined') return;
  try {
    window.umami?.track?.();
    window.dottie?.track?.();
  } catch (error) {
    console.warn('Page view tracking failed:', error);
  }
};
