/**
 * Application entry point for Spyglass - App Store Connect Screenshot & Metadata Manager
 *
 * Configures routing and initializes app with skateboard-ui framework.
 * Routes map to views for Studio and Exports. Settings override injects
 * ASC credentials into the built-in SettingsView.
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import StudioView from './components/StudioView.jsx';
import ExportsView from './components/ExportsView.jsx';
import SettingsView from './components/SettingsView.jsx';

/**
 * Application route configuration
 *
 * @type {Array<{path: string, element: JSX.Element}>}
 */
const appRoutes = [
  { path: 'home', element: <StudioView /> },
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
  overrides: {
    settings: SettingsView
  }
});
