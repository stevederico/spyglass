/**
 * Custom hook managing an array of composition "slots" for the screenshot editor.
 *
 * Each slot holds all per-screenshot state (background, text, device frame, etc.).
 * Scalar fields persist to sessionStorage (debounced); image fields persist to
 * IndexedDB via the helpers from useSessionState.
 *
 * @module useSlots
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { readImageDB, writeImageDB, deleteImageDB } from './useSessionState.js';

/** Default values for a new composition slot */
export const DEFAULT_SLOT = {
  id: '',
  screenshotImage: null,
  bgImage: null,
  frameImage: null,
  bgTab: 'fill',
  bgColor: '#1a1a2e',
  isGradient: false,
  gradientStart: '#1a1a2e',
  gradientEnd: '#16213e',
  gradientDirection: 'top-bottom',
  textLine1: 'Track Your Fitness',
  textLine2: 'Reach Your Goals',
  textPosition: 'top',
  fontSize: 100,
  textColor: '#ffffff',
  textShadow: 8,
  fontWeight: 'Bold',
  autoFitText: true,
  selectedFont: '',
  device: 'iphone-69',
  showBezel: true,
  frameModel: 'iphone-17-pro-max',
  frameColor: 'silver',
  frameLayout: 'full',
  orientation: 'portrait',
  translations: {},
  previewLocale: 'en-US',
  layers: { background: true, device: true, headline: true, subheadline: false },
};

const STORAGE_KEY = 'spyglass:screenshots:slots';
const ACTIVE_KEY = 'spyglass:screenshots:activeSlot';
const IMAGE_FIELDS = ['screenshotImage', 'bgImage', 'frameImage'];
const DEBOUNCE_MS = 300;

/**
 * Create a new slot with a unique ID, merging defaults with overrides
 *
 * @param {Object} [overrides={}] - Field overrides applied on top of DEFAULT_SLOT
 * @returns {Object} A new slot object with a unique id
 */
function createSlot(overrides = {}) {
  return { ...DEFAULT_SLOT, id: crypto.randomUUID(), ...overrides };
}

/**
 * Strip image fields from a slot for JSON serialization
 *
 * @param {Object} slot - Slot object
 * @returns {Object} Slot with image fields set to null
 */
function stripImages(slot) {
  const clean = { ...slot };
  for (const f of IMAGE_FIELDS) {
    clean[f] = null;
  }
  return clean;
}

/**
 * Read and parse a value from sessionStorage
 *
 * @param {string} key - Full sessionStorage key
 * @param {*} fallback - Value returned when key is missing or unparseable
 * @returns {*} Parsed value or fallback
 */
function readSession(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Hook managing an array of composition slots with persistence.
 *
 * Provides the active slot's fields as top-level getters, individual setter
 * functions for every field, and slot management functions (add, remove,
 * duplicate, reorder).
 *
 * @returns {Object} Active slot fields, setters, slot array, and management functions
 */
export function useSlots() {
  const [slots, setSlots] = useState(() => {
    const stored = readSession(STORAGE_KEY, null);
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map((s) => createSlot({ ...s }));
    }
    return [createSlot()];
  });

  const [activeSlotIndex, setActiveSlotIndex] = useState(() => {
    const stored = readSession(ACTIVE_KEY, 0);
    return typeof stored === 'number' ? stored : 0;
  });

  const debounceRef = useRef(null);

  // Persist scalar fields to sessionStorage (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const serializable = slots.map(stripImages);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      } catch {
        // sessionStorage full or unavailable
      }

      // Persist image fields to IDB
      for (const slot of slots) {
        for (const field of IMAGE_FIELDS) {
          writeImageDB('slot:' + slot.id + ':' + field, slot[field]?.src || null);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slots]);

  // Persist active index to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSlotIndex));
    } catch {
      // sessionStorage unavailable
    }
  }, [activeSlotIndex]);

  // Hydrate images from IDB on mount
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        for (const field of IMAGE_FIELDS) {
          const src = await readImageDB('slot:' + slot.id + ':' + field);
          if (src && typeof src === 'string' && src.length > 0 && !cancelled) {
            const img = new Image();
            const slotId = slot.id;
            img.onload = () => {
              if (cancelled) return;
              setSlots((prev) =>
                prev.map((s) => (s.id === slotId ? { ...s, [field]: img } : s))
              );
            };
            img.src = src;
          }
        }
      }
    }

    hydrate();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  const activeSlot = useMemo(
    () => slots[activeSlotIndex] || slots[0],
    [slots, activeSlotIndex]
  );

  /**
   * Update a single field on the active slot.
   * Supports both direct values and function updaters: `set(val)` or `set(prev => next)`.
   *
   * @param {string} field - Field name to update
   * @param {*} valueOrFn - New value, or a function receiving the previous field value
   */
  const updateActiveSlot = useCallback(
    (field, valueOrFn) => {
      setSlots((prev) => {
        const next = [...prev];
        const idx = Math.min(activeSlotIndex, next.length - 1);
        const prevValue = next[idx][field];
        const resolved = typeof valueOrFn === 'function' ? valueOrFn(prevValue) : valueOrFn;
        next[idx] = { ...next[idx], [field]: resolved };
        return next;
      });
    },
    [activeSlotIndex]
  );

  // --- Scalar setters ---

  /** @param {string} v - Background tab value */
  const setBgTab = useCallback((v) => updateActiveSlot('bgTab', v), [updateActiveSlot]);

  /** @param {string} v - Background color hex */
  const setBgColor = useCallback((v) => updateActiveSlot('bgColor', v), [updateActiveSlot]);

  /** @param {boolean} v - Whether gradient is enabled */
  const setIsGradient = useCallback((v) => updateActiveSlot('isGradient', v), [updateActiveSlot]);

  /** @param {string} v - Gradient start color hex */
  const setGradientStart = useCallback((v) => updateActiveSlot('gradientStart', v), [updateActiveSlot]);

  /** @param {string} v - Gradient end color hex */
  const setGradientEnd = useCallback((v) => updateActiveSlot('gradientEnd', v), [updateActiveSlot]);

  /** @param {string} v - Gradient direction */
  const setGradientDirection = useCallback((v) => updateActiveSlot('gradientDirection', v), [updateActiveSlot]);

  /** @param {string} v - First text line */
  const setTextLine1 = useCallback((v) => updateActiveSlot('textLine1', v), [updateActiveSlot]);

  /** @param {string} v - Second text line */
  const setTextLine2 = useCallback((v) => updateActiveSlot('textLine2', v), [updateActiveSlot]);

  /** @param {string} v - Text position ('top' | 'bottom') */
  const setTextPosition = useCallback((v) => updateActiveSlot('textPosition', v), [updateActiveSlot]);

  /** @param {number} v - Font size in px */
  const setFontSize = useCallback((v) => updateActiveSlot('fontSize', v), [updateActiveSlot]);

  /** @param {string} v - Text color hex */
  const setTextColor = useCallback((v) => updateActiveSlot('textColor', v), [updateActiveSlot]);

  /** @param {number} v - Text shadow blur radius */
  const setTextShadow = useCallback((v) => updateActiveSlot('textShadow', v), [updateActiveSlot]);

  /** @param {string} v - Font weight label */
  const setFontWeight = useCallback((v) => updateActiveSlot('fontWeight', v), [updateActiveSlot]);

  /** @param {boolean} v - Whether to auto-fit text */
  const setAutoFitText = useCallback((v) => updateActiveSlot('autoFitText', v), [updateActiveSlot]);

  /** @param {string} v - Selected Google Font name */
  const setSelectedFont = useCallback((v) => updateActiveSlot('selectedFont', v), [updateActiveSlot]);

  /** @param {string} v - Device identifier */
  const setDevice = useCallback((v) => updateActiveSlot('device', v), [updateActiveSlot]);

  /** @param {boolean} v - Whether to show device bezel */
  const setShowBezel = useCallback((v) => updateActiveSlot('showBezel', v), [updateActiveSlot]);

  /** @param {string} v - Frame model identifier */
  const setFrameModel = useCallback((v) => updateActiveSlot('frameModel', v), [updateActiveSlot]);

  /** @param {string} v - Frame color variant */
  const setFrameColor = useCallback((v) => updateActiveSlot('frameColor', v), [updateActiveSlot]);

  /** @param {string} v - Frame layout mode */
  const setFrameLayout = useCallback((v) => updateActiveSlot('frameLayout', v), [updateActiveSlot]);

  /** @param {string} v - Orientation ('portrait' | 'landscape') */
  const setOrientation = useCallback((v) => updateActiveSlot('orientation', v), [updateActiveSlot]);

  /** @param {Object} v - Translation map keyed by locale */
  const setTranslations = useCallback((v) => updateActiveSlot('translations', v), [updateActiveSlot]);

  /** @param {string} v - Preview locale code */
  const setPreviewLocale = useCallback((v) => updateActiveSlot('previewLocale', v), [updateActiveSlot]);

  /** @param {Object} v - Layer visibility flags */
  const setLayers = useCallback((v) => updateActiveSlot('layers', v), [updateActiveSlot]);

  // --- Image setters (also persist to IDB) ---

  /**
   * Set the screenshot image for the active slot
   *
   * @param {HTMLImageElement|null} v - Image element or null to clear
   */
  const setScreenshotImage = useCallback(
    (v) => {
      updateActiveSlot('screenshotImage', v);
      const slotId = slots[activeSlotIndex]?.id;
      if (slotId) {
        writeImageDB('slot:' + slotId + ':screenshotImage', v?.src || null);
      }
    },
    [updateActiveSlot, slots, activeSlotIndex]
  );

  /**
   * Set the background image for the active slot
   *
   * @param {HTMLImageElement|null} v - Image element or null to clear
   */
  const setBgImage = useCallback(
    (v) => {
      updateActiveSlot('bgImage', v);
      const slotId = slots[activeSlotIndex]?.id;
      if (slotId) {
        writeImageDB('slot:' + slotId + ':bgImage', v?.src || null);
      }
    },
    [updateActiveSlot, slots, activeSlotIndex]
  );

  /**
   * Set the frame image for the active slot
   *
   * @param {HTMLImageElement|null} v - Image element or null to clear
   */
  const setFrameImage = useCallback(
    (v) => {
      updateActiveSlot('frameImage', v);
      const slotId = slots[activeSlotIndex]?.id;
      if (slotId) {
        writeImageDB('slot:' + slotId + ':frameImage', v?.src || null);
      }
    },
    [updateActiveSlot, slots, activeSlotIndex]
  );

  // --- Slot management ---

  /**
   * Add new slots from an array of screenshot images, inheriting the active slot's settings
   *
   * @param {HTMLImageElement[]} images - Array of loaded Image elements
   */
  const addSlots = useCallback(
    (images) => {
      const template = { ...activeSlot };
      delete template.id;
      for (const f of IMAGE_FIELDS) delete template[f];

      const newSlots = images.map((img) =>
        createSlot({ ...template, screenshotImage: img })
      );

      setSlots((prev) => {
        const insertIndex = prev.length;
        setActiveSlotIndex(insertIndex);
        return [...prev, ...newSlots];
      });

      // Persist images to IDB
      for (const slot of newSlots) {
        if (slot.screenshotImage?.src) {
          writeImageDB('slot:' + slot.id + ':screenshotImage', slot.screenshotImage.src);
        }
      }
    },
    [activeSlot]
  );

  /**
   * Add an empty slot inheriting the active slot's non-image settings
   */
  const addEmptySlot = useCallback(() => {
    const template = { ...activeSlot };
    delete template.id;
    for (const f of IMAGE_FIELDS) delete template[f];

    const slot = createSlot(template);

    setSlots((prev) => {
      setActiveSlotIndex(prev.length);
      return [...prev, slot];
    });
  }, [activeSlot]);

  /**
   * Remove a slot by index, cleaning up its IDB entries.
   * Never removes the last remaining slot.
   *
   * @param {number} index - Index of the slot to remove
   */
  const removeSlot = useCallback(
    (index) => {
      setSlots((prev) => {
        if (prev.length <= 1) return prev;

        const removed = prev[index];
        if (removed) {
          for (const f of IMAGE_FIELDS) {
            deleteImageDB('slot:' + removed.id + ':' + f);
          }
        }

        const next = prev.filter((_, i) => i !== index);

        setActiveSlotIndex((prevIdx) => {
          if (prevIdx >= next.length) return Math.max(0, next.length - 1);
          if (prevIdx > index) return prevIdx - 1;
          return prevIdx;
        });

        return next;
      });
    },
    []
  );

  /**
   * Duplicate a slot, inserting the clone immediately after the source
   *
   * @param {number} index - Index of the slot to duplicate
   */
  const duplicateSlot = useCallback(
    (index) => {
      setSlots((prev) => {
        const source = prev[index];
        if (!source) return prev;

        const clone = createSlot({ ...source, id: undefined });

        // Persist cloned images to IDB
        for (const f of IMAGE_FIELDS) {
          if (source[f]?.src) {
            writeImageDB('slot:' + clone.id + ':' + f, source[f].src);
          }
        }

        const next = [...prev];
        next.splice(index + 1, 0, clone);
        setActiveSlotIndex(index + 1);
        return next;
      });
    },
    []
  );

  /**
   * Reorder slots by moving one from fromIndex to toIndex
   *
   * @param {number} fromIndex - Current index of the slot to move
   * @param {number} toIndex - Destination index
   */
  const reorderSlots = useCallback(
    (fromIndex, toIndex) => {
      setSlots((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });

      setActiveSlotIndex((prev) => {
        if (prev === fromIndex) return toIndex;
        if (fromIndex < prev && toIndex >= prev) return prev - 1;
        if (fromIndex > prev && toIndex <= prev) return prev + 1;
        return prev;
      });
    },
    []
  );

  return {
    // Active slot getters (spread)
    ...activeSlot,
    // Scalar setters
    setBgTab,
    setBgColor,
    setIsGradient,
    setGradientStart,
    setGradientEnd,
    setGradientDirection,
    setBgImage,
    setTextLine1,
    setTextLine2,
    setTextPosition,
    setFontSize,
    setTextColor,
    setTextShadow,
    setFontWeight,
    setAutoFitText,
    setSelectedFont,
    setDevice,
    setShowBezel,
    setScreenshotImage,
    setFrameModel,
    setFrameColor,
    setFrameImage,
    setFrameLayout,
    setOrientation,
    setTranslations,
    setPreviewLocale,
    setLayers,
    // Slot management
    slots,
    activeSlotIndex,
    setActiveSlotIndex,
    addSlots,
    addEmptySlot,
    removeSlot,
    duplicateSlot,
    reorderSlots,
    // Active slot ref
    activeSlot,
  };
}
