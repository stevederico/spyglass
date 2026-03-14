/**
 * Shared app context for managing the selected App Store Connect app
 *
 * Fetches apps from ASC on mount, persists the selected app to localStorage,
 * and provides selection state to all consuming components (Studio, Exports).
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
    if (parsed?.id && parsed?.name) return parsed;
  } catch {
    // Corrupt storage, ignore
  }
  return null;
}

/**
 * Context provider that manages app list and selection state
 *
 * Fetches apps from `/asc/apps` on mount. Exposes `apps`, `selectedApp`,
 * `isLoadingApps`, `isConnected`, `setSelectedApp`, and `addApp` via context.
 *
 * @component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Provider wrapping children
 */
export function AppProvider({ children }) {
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedAppState] = useState(restoreSelectedApp);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  /** Fetch app list from App Store Connect, seed local apps from localStorage */
  useEffect(() => {
    async function fetchApps() {
      setIsLoadingApps(true);

      // Seed with the persisted local app so it's immediately available
      const restored = restoreSelectedApp();
      if (restored?.id?.startsWith('local-')) {
        setApps([restored]);
      }

      try {
        const result = await apiRequest('/asc/apps');
        if (result?.data) {
          const ascApps = result.data;
          // Merge ASC apps with any local apps
          setApps((prev) => {
            const localApps = prev.filter((a) => a.id?.startsWith('local-'));
            return [...ascApps, ...localApps];
          });
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch {
        setIsConnected(false);
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
    isConnected,
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
 * @returns {{ apps: Array, selectedApp: Object|null, isLoadingApps: boolean, isConnected: boolean, setSelectedApp: Function, addApp: Function }}
 * @throws {Error} If used outside of AppProvider
 */
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
