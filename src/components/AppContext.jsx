/**
 * Shared app context for managing the selected App Store Connect app
 *
 * Fetches apps from ASC on mount, persists the selected app to localStorage,
 * and provides selection state to all consuming components (Screenshots, Metadata, Exports).
 *
 * @module AppContext
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';

const STORAGE_KEY = 'spyglass-selected-app';

const AppContext = createContext(null);

/**
 * Restore persisted selected app from localStorage
 *
 * @returns {Object|null} Stored app object with id and name, or null
 */
function restoreSelectedApp() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Clear entries where name is missing or is a raw ID
    if (!parsed?.id || !parsed?.name || parsed.name === parsed.id) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

/**
 * Context provider that manages app list and selection state
 *
 * Fetches apps from `/asc/apps` on mount. Exposes `apps`, `selectedApp`,
 * `isLoadingApps`, `setSelectedApp`, and `addApp` via context.
 *
 * @component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Provider wrapping children
 */
/**
 * Get initial apps list, seeding with any persisted local app
 *
 * @returns {Array} Initial apps array
 */
/** Default app created automatically so users can start working immediately */
const DEFAULT_APP = { id: 'local-default', name: 'My App' };

/**
 * Get initial apps list, seeding with persisted local app or default
 *
 * @returns {Array} Initial apps array
 */
function getInitialApps() {
  const restored = restoreSelectedApp();
  if (restored?.id?.startsWith('local-')) return [restored];
  return [DEFAULT_APP];
}

export function AppProvider({ children }) {
  const [apps, setApps] = useState(getInitialApps);
  const [selectedApp, setSelectedAppState] = useState(() => {
    const restored = restoreSelectedApp();
    if (restored) return restored;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_APP));
    return DEFAULT_APP;
  });
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  /** Fetch app list from App Store Connect, seed local apps from localStorage */
  useEffect(() => {
    async function fetchApps() {
      setIsLoadingApps(true);
      try {
        const result = await apiRequest('/asc/apps');
        if (result?.data) {
          const ascApps = result.data;
          // Merge ASC apps with any local apps
          setApps((prev) => {
            const localApps = prev.filter((a) => a.id?.startsWith('local-'));
            return [...ascApps, ...localApps];
          });
        }
      } catch {
        // ASC connection failed — local apps still available
      } finally {
        setIsLoadingApps(false);
      }
    }
    fetchApps();
  }, []);

  /**
   * Set the selected app and persist to localStorage
   *
   * @param {Object} app - App object with id and name
   */
  const setSelectedApp = useCallback((app) => {
    setSelectedAppState(app);
    if (app) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  /**
   * Add a new local app entry (for users not connected to ASC)
   *
   * @param {string} name - App name
   */
  const addApp = useCallback((name) => {
    const newApp = { id: `local-${crypto.randomUUID()}`, name };
    setApps((prev) => [...prev, newApp]);
    setSelectedApp(newApp);
  }, [setSelectedApp]);

  const value = {
    apps,
    selectedApp,
    isLoadingApps,
    setSelectedApp,
    addApp
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to access app context values
 *
 * @returns {{ apps: Array, selectedApp: Object|null, isLoadingApps: boolean, setSelectedApp: Function, addApp: Function }}
 * @throws {Error} If used outside of AppProvider
 */
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
