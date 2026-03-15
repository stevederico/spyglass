/**
 * Application entry point for Spyglass - App Store Connect Screenshot & Metadata Manager
 *
 * Configures routing and initializes app with skateboard-ui framework.
 * Routes map to views for Screenshots, Metadata, and Exports. Settings override injects
 * ASC credentials into the built-in SettingsView.
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import ScreenshotsView from './components/ScreenshotsView.jsx';
import ExportsView from './components/ExportsView.jsx';
import MetadataView from './components/MetadataView.jsx';
import SettingsView from './components/SettingsView.jsx';
import LandingView from './components/LandingView.jsx';
import { AppProvider } from './components/AppContext.jsx';

/**
 * Application route configuration
 *
 * @type {Array<{path: string, element: JSX.Element}>}
 */
const appRoutes = [
  { path: 'home', element: <ScreenshotsView /> },
  { path: 'metadata', element: <MetadataView /> },
  { path: 'exports', element: <ExportsView /> }
];

/**
 * Initialize and mount Skateboard app
 *
 * @param {Object} config - App configuration
 * @param {Object} config.constants - App constants from constants.json
 * @param {Array} config.appRoutes - Route configuration array
 * @param {string} config.defaultRoute - Initial route path
 * @param {Object} config.overrides - Component overrides for built-in views
 */
createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  landingPage: <LandingView />,
  wrapper: AppProvider,
  overrides: {
    settings: SettingsView
  }
});
