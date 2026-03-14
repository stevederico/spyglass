/**
 * Application entry point for Spyglass - App Store Connect Screenshot & Metadata Manager
 *
 * Configures routing and initializes app with skateboard-ui framework.
 * Routes map to views for managing apps, screenshots, metadata, and settings.
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import AppsView from './components/AppsView.jsx';
import ScreenshotsView from './components/ScreenshotsView.jsx';
import MetadataView from './components/MetadataView.jsx';
import SettingsView from './components/SettingsView.jsx';
import ComposerView from './components/ComposerView.jsx';
import LocalizationView from './components/LocalizationView.jsx';

/**
 * Application route configuration
 *
 * Maps route paths to view components for App Store Connect management.
 *
 * @type {Array<{path: string, element: JSX.Element}>}
 */
const appRoutes = [
  { path: 'home', element: <AppsView /> },
  { path: 'composer', element: <ComposerView /> },
  { path: 'localization', element: <LocalizationView /> },
  { path: 'screenshots', element: <ScreenshotsView /> },
  { path: 'metadata', element: <MetadataView /> },
  { path: 'settings', element: <SettingsView /> }
];

/**
 * Initialize and mount Skateboard app
 *
 * @param {Object} config - App configuration
 * @param {Object} config.constants - App constants from constants.json
 * @param {Array} config.appRoutes - Route configuration array
 * @param {string} config.defaultRoute - Initial route path
 */
createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
