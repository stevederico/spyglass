/**
 * Custom hook that persists React state to sessionStorage
 *
 * Reads the initial value from sessionStorage on mount (falling back to
 * the provided default), and writes back on every change. Scoped by a
 * storage key so multiple instances can coexist.
 *
 * For image values (HTMLImageElement), uses IndexedDB for storage (no size
 * limits) and rehydrates into an Image object on mount. Works with data URLs
 * and relative URLs.
 *
 * @param {string} key - sessionStorage key
 * @param {*} defaultValue - Fallback when nothing is stored
 * @param {{ image?: boolean }} [options] - Set image:true to store/restore as HTMLImageElement via IndexedDB
 * @returns {[*, Function]} State value and setter, same API as useState
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_PREFIX = 'spyglass:screenshots:';
const IDB_NAME = 'spyglass-images';
const IDB_STORE = 'images';
const IDB_VERSION = 1;

/**
 * Open the IndexedDB database for image storage
 *
 * @returns {Promise<IDBDatabase>} Opened database
 */
function openImageDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read an image src from IndexedDB
 *
 * @param {string} key - Storage key
 * @returns {Promise<string|null>} Stored image src or null
 */
async function readImageDB(key) {
  try {
    const db = await openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const request = store.get(STORAGE_PREFIX + key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Write an image src to IndexedDB
 *
 * @param {string} key - Storage key
 * @param {string|null} value - Image src to store
 */
async function writeImageDB(key, value) {
  try {
    const db = await openImageDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    if (value) {
      store.put(value, STORAGE_PREFIX + key);
    } else {
      store.delete(STORAGE_PREFIX + key);
    }
  } catch {
    // IndexedDB unavailable — fail silently
  }
}

/**
 * Read a value from sessionStorage, returning undefined if missing or invalid
 *
 * @param {string} key - Storage key (without prefix)
 * @returns {*} Parsed value or undefined
 */
function readStorage(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Write a value to sessionStorage
 *
 * @param {string} key - Storage key (without prefix)
 * @param {*} value - Value to serialize and store
 */
function writeStorage(key, value) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // sessionStorage full or unavailable — fail silently
  }
}

export function useSessionState(key, defaultValue, options = {}) {
  const isImage = options.image || false;
  const initializedRef = useRef(false);

  const [value, setValueRaw] = useState(() => {
    if (isImage) {
      // Images load async from IndexedDB — start with null, hydrate via useEffect
      return defaultValue;
    }
    const stored = readStorage(key);
    if (stored === undefined) return defaultValue;
    return stored;
  });

  // Hydrate image state from IndexedDB on mount
  useEffect(() => {
    if (!isImage || initializedRef.current) return;
    initializedRef.current = true;

    readImageDB(key).then((src) => {
      if (src && typeof src === 'string' && src.length > 0) {
        const img = new Image();
        img.onload = () => setValueRaw(img);
        img.src = src;
      }
    });
  }, [key, isImage]);

  const setValue = useCallback((newValueOrFn) => {
    setValueRaw((prev) => {
      const next = typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn;

      if (isImage) {
        if (next && next.src) {
          writeImageDB(key, next.src);
        } else {
          writeImageDB(key, null);
        }
      } else {
        writeStorage(key, next);
      }

      return next;
    });
  }, [key, isImage]);

  return [value, setValue];
}

/**
 * Clear all spyglass screenshot session state (sessionStorage + IndexedDB)
 */
export async function clearScreenshotSession() {
  // Clear sessionStorage entries
  const keysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => sessionStorage.removeItem(k));

  // Clear IndexedDB image entries
  try {
    const db = await openImageDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
  } catch {
    // IndexedDB unavailable
  }
}
