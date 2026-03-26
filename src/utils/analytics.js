/**
 * Umami analytics tracking utilities
 * Safely handles umami not being loaded and sanitizes data
 * All tracking is disabled on localhost via isLocal() guard
 */

/** @returns {boolean} True if running on localhost — skip all tracking */
const isLocal = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

/**
 * Sanitize event data for Umami
 * Ensures data is always a valid object with proper types
 *
 * @param {Object} data - Raw event data
 * @returns {Object} Sanitized event data
 */
const sanitizeEventData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  const sanitized = {};

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
export const trackEvent = (eventName, data = {}) => {
  if (isLocal()) return;
  if (typeof window !== 'undefined' && window.umami) {
    try {
      const sanitizedData = sanitizeEventData(data);
      window.umami.track(eventName, sanitizedData);
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  }
};

/**
 * Identify a user with optional metadata
 *
 * @param {string} userId - User ID
 * @param {Object} data - Optional user metadata
 */
export const identifyUser = (userId, data = {}) => {
  if (isLocal()) return;
  if (typeof window !== 'undefined' && window.umami) {
    try {
      if (userId) {
        window.umami.identify(userId, data);
      } else {
        window.umami.identify(data);
      }
    } catch (error) {
      console.warn('User identification failed:', error);
    }
  }
};

/**
 * Track a page view
 */
export const trackPageView = () => {
  if (isLocal()) return;
  if (typeof window !== 'undefined' && window.umami) {
    try {
      window.umami.track();
    } catch (error) {
      console.warn('Page view tracking failed:', error);
    }
  }
};
